import { state, saveConfig, ACCENTS } from "./config.js";
import { LOCALE_MAP } from "./i18n.js";
import { effectiveTimeZone, zonedParts } from "./time.js";
import { pad, lerpColor, shade } from "./utils.js";

const clockFrame = document.getElementById("clockFrame");
const hoursEl = document.getElementById("hours");
const minutesEl = document.getElementById("minutes");
const secondsWrap = document.getElementById("seconds");
const colonEl = document.getElementById("colon");
const meridiemEl = document.getElementById("meridiem");
const dateEl = document.getElementById("date");
const ringSvg = document.getElementById("ringSvg");
const ring = document.getElementById("ringProgress");
const colorDot = document.getElementById("colorDot");
const cityLabel = document.getElementById("cityLabel");

const RING_CIRCUMFERENCE = 2 * Math.PI * 140;
ring.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

const PALETTE = [
  [0, "#05070c", "#0a0e18", "#020304"],
  [5, "#12111f", "#241f33", "#08070d"],
  [7, "#2b2440", "#5a4a6b", "#140f22"],
  [9, "#274a6b", "#3f7a9e", "#0d1b28"],
  [12, "#1e5a7a", "#3fa0c9", "#0a222f"],
  [17, "#3a3f6b", "#6b4a7a", "#150f26"],
  [19, "#301f3a", "#5a2f4a", "#0f0812"],
  [21, "#131226", "#241f3d", "#050510"],
  [24, "#05070c", "#0a0e18", "#020304"],
];

export const FONT_STACKS = {
  orbitron: '"Orbitron", "Space Grotesk", monospace',
  grotesk: '"Space Grotesk", system-ui, sans-serif',
  mono: '"Courier New", monospace',
  system: "system-ui, sans-serif",
};

let modStyle = document.getElementById("mod-style");
if (!modStyle) {
  modStyle = document.createElement("style");
  modStyle.id = "mod-style";
  document.head.appendChild(modStyle);
}

export function updateCityLabel() {
  const tz = state.config.display.timezone;
  let label;
  if (tz && tz !== "local") {
    label = tz.split("/").pop().replace(/_/g, " ");
  } else {
    try {
      label = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop().replace(/_/g, " ");
    } catch {
      label = "";
    }
  }
  cityLabel.textContent = label || "";
}

// Applies everything the digital clock face itself needs after a config
// change (colors/font/visibility). Panel fields are synced separately.
export function applyClockDisplay() {
  const d = state.config.display;
  document.documentElement.style.setProperty("--accent", d.accent);
  document.documentElement.style.setProperty("--accent-soft", `${d.accent}40`);
  document.documentElement.style.setProperty("--font-time", FONT_STACKS[d.font] || FONT_STACKS.orbitron);

  secondsWrap.hidden = !d.showSeconds;
  dateEl.hidden = !d.showDate;
  ringSvg.classList.toggle("ring-off", !d.showRing);
  modStyle.textContent = d.customCss || "";

  updateCityLabel();
}

function updateBackground(hourFraction) {
  const d = state.config.display;
  if (d.backgroundMode === "solid") {
    document.documentElement.style.setProperty("--bg-2", d.backgroundSolid);
    document.documentElement.style.setProperty("--bg-1", shade(d.backgroundSolid, -15));
    document.documentElement.style.setProperty("--bg-3", shade(d.backgroundSolid, -40));
    return;
  }
  let lower = PALETTE[0];
  let upper = PALETTE[PALETTE.length - 1];
  for (let i = 0; i < PALETTE.length - 1; i++) {
    if (hourFraction >= PALETTE[i][0] && hourFraction <= PALETTE[i + 1][0]) {
      lower = PALETTE[i];
      upper = PALETTE[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  const tt = (hourFraction - lower[0]) / span;
  document.documentElement.style.setProperty("--bg-2", lerpColor(lower[1], upper[1], tt));
  document.documentElement.style.setProperty("--bg-1", lerpColor(lower[2], upper[2], tt));
  document.documentElement.style.setProperty("--bg-3", lerpColor(lower[3], upper[3], tt));
}

function tick() {
  const now = new Date();
  const d = state.config.display;
  const tz = effectiveTimeZone(d.timezone);
  const { h, m, s } = zonedParts(now, tz);
  const ms = now.getMilliseconds();

  if (d.format24h) {
    hoursEl.textContent = pad(h);
    meridiemEl.textContent = "";
  } else {
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    hoursEl.textContent = pad(h12);
    meridiemEl.textContent = suffix;
  }
  minutesEl.textContent = pad(m);
  secondsWrap.textContent = pad(s);
  colonEl.classList.toggle("dim", ms >= 500);

  const locale = LOCALE_MAP[d.language] || "de-DE";
  dateEl.textContent = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);

  const secondsProgress = (s + ms / 1000) / 60;
  ring.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - secondsProgress)}`;

  updateBackground(h + m / 60 + s / 3600);

  requestAnimationFrame(tick);
}

export function initClock() {
  applyClockDisplay();
  requestAnimationFrame(tick);

  colorDot.addEventListener("click", (e) => {
    e.stopPropagation();
    const idx = (ACCENTS.indexOf(state.config.display.accent) + 1) % ACCENTS.length;
    state.config.display.accent = ACCENTS[idx < 0 ? 0 : idx];
    saveConfig();
    applyClockDisplay();
    clockFrame.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }],
      { duration: 350, easing: "ease-out" }
    );
  });
}
