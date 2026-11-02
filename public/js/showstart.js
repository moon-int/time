import { state, saveConfig } from "./config.js";
import { t, tf } from "./i18n.js";

// A dynamic start: cues can hang on the show's start instead of a fixed time of day — "T−30" for doors,
// "T+11" for the third song. Move the start (−5 / +5 / now, or type a time) and every such cue moves
// with it. Cues without an offset keep their time. The start travels with the show (display.showStart),
// so a show saved for the band — and the band's overview on jam.geyser.at — know it too.

const listeners = new Set();
const lang = () => state.config.display.language;
const DAY = 24 * 60;

export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const fmt = (min) => {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const offsetLabel = (offset) => (offset === 0 ? "T" : `T${offset < 0 ? "−" : "+"}${Math.abs(offset)}`);

export const showStart = () => state.config.display.showStart || null;
export const boundCount = () => state.config.schedule.filter((i) => Number.isFinite(i.offset)).length;

/** everyone who wants to know (the shows section syncs it with the band; the views redraw) */
export function onStartChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** sets the start and moves every cue that hangs on it; `from` says who changed it (no echo back) */
export function setStart(hhmm, from = "local") {
  const start = toMin(hhmm);
  if (start === null) return;
  state.config.display.showStart = fmt(start);
  for (const item of state.config.schedule) {
    if (Number.isFinite(item.offset)) item.time = fmt(start + item.offset);
  }
  saveConfig();
  render();
  for (const fn of listeners) fn(state.config.display.showStart, from);
}

/** hangs every cue on the start as it is now: its offset is how far it is from the start */
function bindAll() {
  const start = toMin(showStart()) ?? toMin(fmt(nowMin()));
  if (!showStart()) state.config.display.showStart = fmt(start);
  for (const item of state.config.schedule) {
    const t0 = toMin(item.time);
    if (t0 === null) continue;
    let off = t0 - start;
    if (off > DAY / 2) off -= DAY;
    if (off < -DAY / 2) off += DAY;
    item.offset = off;
  }
  saveConfig();
  render();
  for (const fn of listeners) fn(state.config.display.showStart, "local");
}

function unbindAll() {
  for (const item of state.config.schedule) delete item.offset;
  saveConfig();
  render();
  for (const fn of listeners) fn(state.config.display.showStart, "local");
}

const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

// ---- the bar (in the schedule tab and in the live view) ------------------------------------

const bars = [];

function build(mount, compact) {
  if (!mount) return;
  const bar = document.createElement("div");
  bar.className = `start-bar${compact ? " compact" : ""}`;
  bar.innerHTML = `
    <span class="start-label"></span>
    <input type="time" class="start-input" />
    <div class="start-buttons">
      <button type="button" class="btn btn-small" data-shift="-5">−5</button>
      <button type="button" class="btn btn-small" data-shift="5">+5</button>
      <button type="button" class="btn btn-small btn-accent start-now"></button>
    </div>
    <span class="start-hint"></span>
    ${compact ? "" : '<button type="button" class="btn btn-small start-bind"></button>'}`;
  const input = bar.querySelector(".start-input");
  input.addEventListener("change", () => input.value && setStart(input.value));
  bar.querySelectorAll("[data-shift]").forEach((b) =>
    b.addEventListener("click", () => setStart(fmt((toMin(showStart()) ?? nowMin()) + Number(b.dataset.shift))))
  );
  bar.querySelector(".start-now").addEventListener("click", () => setStart(fmt(nowMin())));
  bar.querySelector(".start-bind")?.addEventListener("click", () => {
    if (boundCount()) {
      if (confirm(t(lang(), "startUnbindConfirm"))) unbindAll();
    } else bindAll();
  });
  mount.append(bar);
  bars.push({ bar, compact });
}

export function render() {
  const l = lang();
  const start = showStart();
  const n = boundCount();
  for (const { bar, compact } of bars) {
    // in the live view only for a show that has a start — the panel always offers it
    bar.hidden = compact && !n;
    bar.querySelector(".start-label").textContent = t(l, "startLabel");
    const input = bar.querySelector(".start-input");
    if (document.activeElement !== input) input.value = start || "";
    bar.querySelector(".start-now").textContent = t(l, "startNow");
    bar.querySelector(".start-now").title = t(l, "startNowHint");
    bar.querySelector(".start-hint").textContent = n ? tf(l, "startBound", { n }) : compact ? "" : t(l, "startUnbound");
    const bind = bar.querySelector(".start-bind");
    if (bind) bind.textContent = n ? t(l, "startUnbind") : t(l, "startBind");
  }
}

export function initShowStart({ onChange }) {
  build(document.getElementById("startBarPanel"), false);
  build(document.getElementById("startBarLive"), true);
  onStartChange(() => onChange?.());
  // the language switches by <html lang>; the labels follow
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  render();
}
