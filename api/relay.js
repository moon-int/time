// Vercel serverless counterpart of local-relay.js's POST /api/relay.
//
// Lets the hosted web UI send cues to public targets (webhooks, cloud APIs)
// that don't set CORS headers, by performing the request server-side. It can
// NOT reach LAN-only targets (Companion etc. on a private network) — for those,
// run local-relay.js on a machine inside that network instead.
//
// Disabled unless the RELAY_TOKEN environment variable is set in the Vercel
// project, so a fresh deployment never acts as an open proxy. In the panel,
// set "Relay-URL" to this deployment's own URL and "Relay-Token" to that value.

const crypto = require("node:crypto");

const MAX_RELAY_BODY = 200 * 1024; // 200 KB request cap
const MAX_RESPONSE_SNIPPET = 4 * 1024; // 4 KB response snippet cap
const RELAY_TIMEOUT_MS = 8000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Relay-Token");
}

function tokenMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readPayload(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_RELAY_BODY) throw Object.assign(new Error("Anfrage zu groß"), { status: 413 });
  }
  return JSON.parse(raw || "{}");
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expected = process.env.RELAY_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Relay auf diesem Deployment deaktiviert (RELAY_TOKEN nicht gesetzt)" });
    return;
  }
  if (!tokenMatches(req.headers["x-relay-token"], expected)) {
    res.status(401).json({ error: "Ungültiges oder fehlendes Relay-Token" });
    return;
  }

  let payload;
  try {
    payload = await readPayload(req);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.status ? err.message : "Ungültiges JSON" });
    return;
  }
  if (JSON.stringify(payload).length > MAX_RELAY_BODY) {
    res.status(413).json({ error: "Anfrage zu groß" });
    return;
  }

  const { method, url, headers, body } = payload || {};
  let target;
  try {
    target = new URL(String(url));
  } catch {
    res.status(400).json({ error: "Ungültige URL" });
    return;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    res.status(400).json({ error: "Nur http/https Ziele erlaubt" });
    return;
  }

  const outMethod = (method || "GET").toUpperCase();
  const outHeaders = {};
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key) outHeaders[key] = String(value);
    }
  }
  const hasBody = body !== undefined && body !== null && body !== "" && outMethod !== "GET" && outMethod !== "HEAD";

  try {
    const outRes = await fetch(target, {
      method: outMethod,
      headers: outHeaders,
      body: hasBody ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    const text = await outRes.text();
    res.status(200).json({
      status: outRes.status,
      statusText: outRes.statusText || "",
      bodySnippet: text.slice(0, MAX_RESPONSE_SNIPPET),
    });
  } catch (err) {
    // undici wraps network errors as "fetch failed" — the cause has the useful part.
    const message = err.name === "TimeoutError" ? "Zeitüberschreitung" : err.cause?.code || err.cause?.message || err.message;
    res.status(502).json({ error: message });
  }
};
