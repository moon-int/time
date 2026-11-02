const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
// under a path next to other apps (jam.geyser.at/time): BASE_PATH=/time, set by tabs' launcher — the path comes in unchanged
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/+$/, "").replace(/^(?=[^/])/, "/");
const JAM_API = (process.env.JAM_API || "").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let requestedPath = decodeURIComponent(req.url.split("?")[0]);
  if (BASE_PATH) {
    // the page uses relative paths, so it has to be opened as /time/ — not /time
    if (requestedPath === BASE_PATH) {
      const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      res.writeHead(301, { Location: `${BASE_PATH}/${query}` });
      res.end();
      return;
    }
    if (!requestedPath.startsWith(`${BASE_PATH}/`)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    requestedPath = requestedPath.slice(BASE_PATH.length) || "/";
  }
  // where the band's shows are saved: tabs next door (JAM_API=/tabs/api, set by tabs' launcher) — none without it
  if (requestedPath === "/jam.json") {
    res.writeHead(200, { "Content-Type": MIME_TYPES[".json"], "Cache-Control": "no-store" });
    res.end(JSON.stringify({ api: JAM_API || null }));
    return;
  }
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
});

server.listen(PORT, () => {
  console.log(`Clock running at http://localhost:${PORT}${BASE_PATH}/`);
});
