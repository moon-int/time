export function pad(n) {
  return String(n).padStart(2, "0");
}

export function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToCss([r, g, b]) {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToCss([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}

export function shade(hex, percent) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 + percent / 100;
  return rgbToCss([Math.max(0, Math.min(255, r * f)), Math.max(0, Math.min(255, g * f)), Math.max(0, Math.min(255, b * f))]);
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// crypto.randomUUID only exists in secure contexts (https/localhost) — when
// the app is opened via a LAN IP over plain http (e.g. local-relay.js serving
// it to other devices) it's undefined, so fall back to getRandomValues.
export function uid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
