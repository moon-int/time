import { state } from "./config.js";
import { t, tf } from "./i18n.js";
import { effectiveTimeZone, zonedParts } from "./time.js";
import { pad, escapeHtml } from "./utils.js";
import { sendCue, initCueForm, isDueToday } from "./schedule.js";

const scrollCue = document.getElementById("scrollCue");
const liveViewClock = document.getElementById("liveViewClock");
const liveProgressText = document.getElementById("liveProgressText");
const liveDayStrip = document.getElementById("liveDayStrip");
const liveHero = document.getElementById("liveHero");
const liveNowCard = document.getElementById("liveNowCard");
const liveNowName = document.getElementById("liveNowName");
const liveNowMeta = document.getElementById("liveNowMeta");
const liveNextCard = document.getElementById("liveNextCard");
const liveNextTime = document.getElementById("liveNextTime");
const liveNextName = document.getElementById("liveNextName");
const liveNextCountdown = document.getElementById("liveNextCountdown");
const liveNextBarWrap = document.getElementById("liveNextBarWrap");
const liveNextBar = document.getElementById("liveNextBar");
const liveGoBtn = document.getElementById("liveGoBtn");
const liveEmpty = document.getElementById("liveEmpty");
const liveAllDone = document.getElementById("liveAllDone");
const liveList = document.getElementById("liveList");
const liveAddToggle = document.getElementById("liveAddToggle");
const liveCueForm = document.getElementById("liveCueForm");
const liveCueTime = document.getElementById("liveCueTime");
const liveCueLabel = document.getElementById("liveCueLabel");
const liveCueMethod = document.getElementById("liveCueMethod");
const liveCueUrl = document.getElementById("liveCueUrl");
const liveCueHeaders = document.getElementById("liveCueHeaders");
const liveCueBody = document.getElementById("liveCueBody");
const liveCueAuto = document.getElementById("liveCueAuto");
const liveCueRepeat = document.getElementById("liveCueRepeat");
const liveCueDate = document.getElementById("liveCueDate");
const liveCueDateField = document.getElementById("liveCueDateField");
const liveCueWeekdaysField = document.getElementById("liveCueWeekdaysField");

const SOON_SECONDS = 60;
const IMMINENT_SECONDS = 10;

// Cue ids currently being sent from this view — keeps their buttons in the
// "…" state across re-renders until the request settles.
const sending = new Set();
let listSignature = "";

function lang() {
  return state.config.display.language;
}

function timeToSeconds(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 3600 + mm * 60;
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Tighter variant for the narrow time column of the list.
function formatDurationShort(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h}h ${pad(m)}`;
}

function relativeText(diffSeconds) {
  if (Math.abs(diffSeconds) < 60) return t(lang(), "relNow");
  if (diffSeconds > 0) return tf(lang(), "relIn", { t: formatDurationShort(Math.ceil(diffSeconds / 60)) });
  return tf(lang(), "relAgo", { t: formatDurationShort(Math.floor(-diffSeconds / 60)) });
}

function targetHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function resultIcon(item) {
  if (!item.lastResult) return "";
  const ok = item.lastResult.ok;
  const title = `${t(lang(), ok ? "liveResultOk" : "liveResultErr")}: ${item.lastResult.text}`;
  return `<span class="live-result live-result--${ok ? "ok" : "err"}" title="${escapeHtml(title)}">${ok ? "✓" : "!"}</span>`;
}

function renderList(items, statuses) {
  liveDayStrip.innerHTML = statuses.map((s) => `<span class="live-day-seg live-day-seg--${s}"></span>`).join("");

  liveList.innerHTML = items
    .map((item, idx) => {
      const status = statuses[idx];
      const busy = sending.has(item.id);
      return `
      <li class="live-item live-item--${status}" data-id="${item.id}">
        <div class="live-item-time">
          <span class="live-item-clock">${item.time}</span>
          ${status === "done" ? "" : `<span class="live-item-rel" data-time="${item.time}"></span>`}
        </div>
        <div class="live-item-marker"><span class="live-item-dot"></span></div>
        <div class="live-item-card">
          <div class="live-item-body">
            <div class="live-item-label">${status === "live" ? `<span class="live-badge">${escapeHtml(t(lang(), "liveBadge"))}</span>` : ""}<span class="live-item-name">${escapeHtml(item.label || "—")}</span></div>
            <div class="live-item-meta">
              <span>${escapeHtml(item.method)} · ${escapeHtml(targetHost(item.url))}</span>
              ${item.auto ? `<span class="cue-badge">${escapeHtml(t(lang(), "autoBadge"))}</span>` : ""}
            </div>
          </div>
          <div class="live-item-status">
            ${resultIcon(item)}
            <button class="btn-send live-send" data-id="${item.id}" type="button" ${busy ? "disabled" : ""} aria-label="${escapeHtml(t(lang(), "sendBtn"))}" title="${escapeHtml(t(lang(), "sendBtn"))}">${busy ? "…" : "▶"}</button>
          </div>
          ${item.lastResult && !item.lastResult.ok ? `<div class="live-item-error">${escapeHtml(item.lastResult.text)}</div>` : ""}
        </div>
      </li>`;
    })
    .join("");
}

// The daily rundown has no dates, only HH:MM times, so "current" is derived
// purely from where now falls among today's cue times: everything at or
// before now is past, the last of those is "live", the first one after now
// is "next" and gets the countdown hero card. Cues not scheduled for today
// (a one-off for another date, or a weekly repeat on a different weekday)
// are left out entirely — this view is "today's rundown", not the full plan.
//
// Called every second: cheap per-second parts (clock, countdown, relative
// times, progress bar) are patched in place, while the list itself is only
// rebuilt when its content actually changes — rebuilding it every tick would
// swap out buttons mid-click and swallow presses.
export function renderLiveView() {
  const tz = effectiveTimeZone(state.config.display.timezone);
  const now = new Date();
  const nowP = zonedParts(now, tz);
  const nowStr = `${pad(nowP.h)}:${pad(nowP.m)}`;
  const nowSec = nowP.h * 3600 + nowP.m * 60 + nowP.s;

  liveViewClock.textContent = `${pad(nowP.h)}:${pad(nowP.m)}:${pad(nowP.s)}`;

  const items = state.config.schedule
    .filter((item) => isDueToday(item, now, tz))
    .sort((a, b) => a.time.localeCompare(b.time));

  liveEmpty.hidden = items.length > 0;
  if (items.length === 0) {
    liveHero.hidden = true;
    liveAllDone.hidden = true;
    liveProgressText.textContent = "";
    if (listSignature !== "empty") {
      liveList.innerHTML = "";
      liveDayStrip.innerHTML = "";
      listSignature = "empty";
    }
    return;
  }

  let lastDueIdx = -1;
  items.forEach((item, idx) => {
    if (item.time <= nowStr) lastDueIdx = idx;
  });
  const statuses = items.map((_, idx) => (idx < lastDueIdx ? "done" : idx === lastDueIdx ? "live" : "upcoming"));
  const liveItem = items[lastDueIdx];
  const nextItem = items[lastDueIdx + 1];

  liveProgressText.textContent = tf(lang(), "liveProgress", { done: lastDueIdx + 1, total: items.length });

  const signature = JSON.stringify([
    lang(),
    statuses,
    [...sending],
    items.map((i) => [i.id, i.time, i.label, i.method, i.url, i.auto, i.lastResult]),
  ]);
  if (signature !== listSignature) {
    listSignature = signature;
    renderList(items, statuses);
  }
  liveList.querySelectorAll(".live-item-rel").forEach((el) => {
    el.textContent = relativeText(timeToSeconds(el.dataset.time) - nowSec);
  });

  liveHero.hidden = false;
  liveAllDone.hidden = !!nextItem;

  liveNowCard.classList.toggle("is-idle", !liveItem);
  if (liveItem) {
    liveNowName.textContent = liveItem.label || targetHost(liveItem.url);
    liveNowMeta.textContent = `${liveItem.time} · ${tf(lang(), "liveSince", { t: formatDuration(Math.floor((nowSec - timeToSeconds(liveItem.time)) / 60)) })}`;
  } else {
    liveNowName.textContent = t(lang(), "liveNotStarted");
    liveNowMeta.textContent = "";
  }

  liveNextCard.hidden = !nextItem;
  if (nextItem) {
    const nextSec = timeToSeconds(nextItem.time);
    const remaining = nextSec - nowSec;
    liveNextTime.textContent = nextItem.time;
    liveNextName.textContent = nextItem.label || targetHost(nextItem.url);
    liveNextCountdown.textContent = formatCountdown(remaining);
    liveNextCard.classList.toggle("is-soon", remaining <= SOON_SECONDS && remaining > IMMINENT_SECONDS);
    liveNextCard.classList.toggle("is-imminent", remaining <= IMMINENT_SECONDS);

    // Progress runs from the live cue's start to the next one; before the
    // first cue of the day there's no meaningful start, so the bar hides.
    liveNextBarWrap.hidden = !liveItem;
    if (liveItem) {
      const startSec = timeToSeconds(liveItem.time);
      const fraction = (nowSec - startSec) / Math.max(1, nextSec - startSec);
      liveNextBar.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
    }

    const goBusy = sending.has(nextItem.id);
    liveGoBtn.dataset.id = nextItem.id;
    liveGoBtn.disabled = goBusy;
    liveGoBtn.textContent = goBusy ? "…" : t(lang(), "liveSendNow");
  }
}

async function fireFromLiveView(id) {
  if (!id || sending.has(id)) return;
  sending.add(id);
  renderLiveView();
  try {
    await sendCue(id);
  } finally {
    sending.delete(id);
    renderLiveView();
  }
}

// Ticks itself against the actual clock (recomputing the delay to the next
// second boundary every time) instead of a plain setInterval(1000), whose
// fixed period starts counting from whenever this module happened to load —
// that leaves it up to ~999ms out of phase with the main clock's display,
// which repaints every animation frame and is always exactly right.
function scheduleTick() {
  renderLiveView();
  const driftMs = new Date().getMilliseconds();
  setTimeout(scheduleTick, 1000 - driftMs);
}

function setFormOpen(open) {
  liveCueForm.hidden = !open;
  liveAddToggle.classList.toggle("is-open", open);
  liveAddToggle.setAttribute("aria-expanded", String(open));
  if (open) liveCueTime.focus();
}

export function initLiveView() {
  liveList.addEventListener("click", (e) => {
    const btn = e.target.closest(".live-send");
    if (btn) fireFromLiveView(btn.dataset.id);
  });
  liveGoBtn.addEventListener("click", () => fireFromLiveView(liveGoBtn.dataset.id));

  liveAddToggle.addEventListener("click", () => setFormOpen(liveCueForm.hidden));

  initCueForm({
    form: liveCueForm,
    time: liveCueTime,
    label: liveCueLabel,
    method: liveCueMethod,
    url: liveCueUrl,
    headers: liveCueHeaders,
    body: liveCueBody,
    auto: liveCueAuto,
    repeat: liveCueRepeat,
    date: liveCueDate,
    dateField: liveCueDateField,
    weekdaysField: liveCueWeekdaysField,
    onAdd: () => {
      setFormOpen(false);
      renderLiveView();
    },
  });

  window.addEventListener(
    "scroll",
    () => {
      scrollCue.classList.toggle("is-hidden", window.scrollY > 40);
    },
    { passive: true }
  );

  scheduleTick();
}
