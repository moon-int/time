// Standalone companion for the "Lokaler Relay" field in Design settings.
//
// Runs on the same machine/network as your trigger targets (Bitfocus
// Companion, a local C# app, anything on a private LAN) and exposes a single
// POST /api/relay endpoint that performs the actual outbound HTTP request
// from THIS machine — so cue sends always reach LAN-only targets even when
// the web UI itself (public/) is hosted somewhere else entirely.
//
// By default it also serves the web UI itself (public/), so it doubles as a
// fully self-hosted, single-machine setup. Pass --relay-only (or set
// RELAY_ONLY=1) to run it as a headless relay only, alongside a web UI
// that's hosted elsewhere and points at this machine's "Lokaler Relay" field.
//
// Usage:
//   node local-relay.js                 # serves the app + relay on :4100
//   node local-relay.js --relay-only     # relay endpoint only, no web UI
//   PORT=5000 node local-relay.js        # custom port
//   RELAY_TOKEN=xyz node local-relay.js  # fixed token instead of generated

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const PORT = process.env.PORT || 4100;
const RELAY_ONLY = process.env.RELAY_ONLY === "1" || process.argv.includes("--relay-only");
const PUBLIC_DIR = path.join(__dirname, "public");
const TOKEN_FILE = path.join(__dirname, ".relay-token");
const MAX_RELAY_BODY = 200 * 1024; // 200 KB request cap
const MAX_RESPONSE_SNIPPET = 4 * 1024; // 4 KB response snippet cap
const RELAY_TIMEOUT_MS = 8000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Persisted across restarts (unless RELAY_TOKEN is set) so a token pasted
// into the browser's settings once keeps working after this process restarts.
function loadOrCreateToken() {
  if (process.env.RELAY_TOKEN) return process.env.RELAY_TOKEN;
  try {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing) return existing;
  } catch {
    // no token file yet
  }
  const token = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, "utf8");
  return token;
}
const TOKEN = loadOrCreateToken();

function localAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const iface of entries || []) {
      if (iface.family === "IPv4" && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Relay-Token",
    // Chrome's Private Network Access check: a publicly hosted page (e.g. the
    // Vercel deployment) may only call this LAN/localhost relay if the
    // preflight explicitly opts in.
    "Access-Control-Allow-Private-Network": "true",
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() });
  res.end(JSON.stringify(data));
}

// Forwards a client-configured HTTP request from this machine. Node-to-node
// requests aren't subject to browser CORS, so this reaches targets (webhooks,
// Companion, local APIs) that don't set CORS headers of their own.
function relayRequest(payload, res) {
  const { method, url, headers, body } = payload || {};
  let target;
  try {
    target = new URL(String(url));
  } catch {
    sendJson(res, 400, { error: "Ungültige URL" });
    return;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    sendJson(res, 400, { error: "Nur http/https Ziele erlaubt" });
    return;
  }

  const lib = target.protocol === "https:" ? https : http;
  const outHeaders = {};
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key) outHeaders[key] = String(value);
    }
  }

  const outReq = lib.request(
    target,
    { method: (method || "GET").toUpperCase(), headers: outHeaders, timeout: RELAY_TIMEOUT_MS },
    (outRes) => {
      let snippet = "";
      outRes.on("data", (chunk) => {
        if (snippet.length < MAX_RESPONSE_SNIPPET) snippet += chunk.toString("utf8");
      });
      outRes.on("end", () => {
        sendJson(res, 200, {
          status: outRes.statusCode,
          statusText: outRes.statusMessage || "",
          bodySnippet: snippet.slice(0, MAX_RESPONSE_SNIPPET),
        });
      });
    }
  );

  outReq.on("timeout", () => outReq.destroy(new Error("Zeitüberschreitung")));
  outReq.on("error", (err) => sendJson(res, 502, { error: err.message }));

  const hasBody = body !== undefined && body !== null && body !== "" && method !== "GET" && method !== "HEAD";
  if (hasBody) outReq.write(typeof body === "string" ? body : JSON.stringify(body));
  outReq.end();
}

function handleRelayRoute(req, res) {
  if (req.headers["x-relay-token"] !== TOKEN) {
    sendJson(res, 401, { error: "Ungültiges oder fehlendes Relay-Token" });
    req.destroy();
    return;
  }

  let raw = "";
  let size = 0;
  let aborted = false;

  req.on("data", (chunk) => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_RELAY_BODY) {
      aborted = true;
      sendJson(res, 413, { error: "Anfrage zu groß" });
      req.destroy();
      return;
    }
    raw += chunk;
  });

  req.on("end", () => {
    if (aborted) return;
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: "Ungültiges JSON" });
      return;
    }
    relayRequest(payload, res);
  });
}

function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end("Server error");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
      res.end(content);
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/relay") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (req.method === "POST") {
      handleRelayRoute(req, res);
      return;
    }
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (RELAY_ONLY) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Relay-only-Modus: keine Web-App auf diesem Port, nur POST /api/relay.");
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log("");
  console.log(`mo-tion time — lokaler Relay ${RELAY_ONLY ? "(headless, keine Web-App)" : "+ Web-App"}`);
  console.log(`  Lokal:          http://localhost:${PORT}`);
  localAddresses().forEach((addr) => console.log(`  Im Netzwerk:    http://${addr}:${PORT}`));
  console.log(`  Relay-Endpunkt: POST /api/relay`);
  console.log(`  Token:          ${TOKEN}`);
  console.log("");
  console.log("  Im Panel unter Design > Lokaler Relay die obige URL + das Token eintragen.");
  console.log("");
});
