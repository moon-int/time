import { state, saveConfig } from "./config.js";
import { t, LOCALE_MAP } from "./i18n.js";
import { effectiveTimeZone, zonedParts, zonedDateKey, zonedWeekday } from "./time.js";
import { pad, escapeHtml, uid } from "./utils.js";

const autoSendGlobal = document.getElementById("autoSendGlobal");
const cueForm = document.getElementById("cueForm");
const cueTime = document.getElementById("cueTime");
const cueLabel = document.getElementById("cueLabel");
const cueMethod = document.getElementById("cueMethod");
const cueUrl = document.getElementById("cueUrl");
const cueHeaders = document.getElementById("cueHeaders");
const cueBody = document.getElementById("cueBody");
const cueAuto = document.getElementById("cueAuto");
const cueRepeat = document.getElementById("cueRepeat");
const cueDate = document.getElementById("cueDate");
const cueDateField = document.getElementById("cueDateField");
const cueWeekdaysField = document.getElementById("cueWeekdaysField");
const scheduleList = document.getElementById("scheduleList");
const logList = document.getElementById("logList");

function lang() {
  return state.config.display.language;
}

function parseHeaders(raw) {
  const out = {};
  (raw || "").split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) out[key] = val;
    }
  });
  return out;
}

function addLog(ok, item, detail, auto) {
  state.log.unshift({ ok, at: new Date(), label: item.label || item.url, detail, auto: !!auto });
  state.log = state.log.slice(0, 20);
  renderLog();
}

export function renderLog() {
  if (state.log.length === 0) {
    logList.innerHTML = `<li class="empty">${escapeHtml(t(lang(), "emptyLog"))}</li>`;
    return;
  }
  const locale = LOCALE_MAP[lang()] || "de-DE";
  logList.innerHTML = state.log
    .map(
      (entry) =>
        `<li class="${entry.ok ? "ok" : "err"}">${entry.at.toLocaleTimeString(locale)} · ${escapeHtml(entry.label)} — ${escapeHtml(entry.detail)}${entry.auto ? ` (${escapeHtml(t(lang(), "auto"))})` : ""}</li>`
    )
    .join("");
}

export async function sendCue(id, opts = {}) {
  const item = state.config.schedule.find((i) => i.id === id);
  if (!item) return;
  const btns = document.querySelectorAll(`.btn-send[data-id="${id}"]`);
  btns.forEach((btn) => {
    btn.disabled = true;
    btn.textContent = "…";
  });
  try {
    const method = (item.method || "GET").toUpperCase();
    const headers = parseHeaders(item.headers);
    const hasBody = !!item.body && method !== "GET" && method !== "HEAD";
    const relayUrl = (state.config.display.relayUrl || "").trim();

    let statusLine;
    if (relayUrl) {
      // Routed through a locally running relay (see local-relay.js) so the
      // outbound request always originates from that machine/network, even
      // when this page itself is hosted elsewhere.
      const resp = await fetch(`${relayUrl.replace(/\/+$/, "")}/api/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Relay-Token": state.config.display.relayToken || "" },
        body: JSON.stringify({ method, url: item.url, headers, body: hasBody ? item.body : undefined }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || String(resp.status));
      statusLine = `${data.status} ${data.statusText || ""}`.trim();
    } else {
      // Sent directly from this browser/machine — targets without CORS
      // headers may reject the cross-origin request outright.
      const fetchOpts = { method, headers };
      if (hasBody) fetchOpts.body = item.body;
      const resp = await fetch(item.url, fetchOpts);
      if (!resp.ok) throw new Error(String(resp.status));
      statusLine = `${resp.status} ${resp.statusText || ""}`.trim();
    }
    item.lastResult = { ok: true, text: statusLine };
    addLog(true, item, statusLine, opts.auto);
  } catch (err) {
    item.lastResult = { ok: false, text: `${t(lang(), "error")}: ${err.message}` };
    addLog(false, item, err.message, opts.auto);
  }
  saveConfig();
  renderSchedule();
}

function deleteCue(id) {
  state.config.schedule = state.config.schedule.filter((i) => i.id !== id);
  saveConfig();
  renderSchedule();
}

function currentTimeStr() {
  const { h, m } = zonedParts(new Date(), effectiveTimeZone(state.config.display.timezone));
  return `${pad(h)}:${pad(m)}`;
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Whether a cue is scheduled to run at all "today" (its date, for a one-off;
// its weekday, for a weekly repeat; always, for daily). Gates both the
// auto-send timer and the live-view's "today's rundown" filtering — a manual
// "Senden" click always bypasses this and fires regardless.
export function isDueToday(item, now = new Date(), tz = effectiveTimeZone(state.config.display.timezone)) {
  if (item.repeat === "once") {
    return !!item.date && item.date === zonedDateKey(now, tz);
  }
  if (item.repeat === "weekly") {
    return Array.isArray(item.weekdays) && item.weekdays.includes(zonedWeekday(now, tz));
  }
  return true;
}

function repeatDescription(item) {
  const l = lang();
  if (item.repeat === "once") {
    return `${t(l, "repeatOnce")}${item.date ? ` · ${item.date}` : ""}`;
  }
  if (item.repeat === "weekly") {
    const names = WEEKDAY_ORDER.filter((d) => (item.weekdays || []).includes(d)).map((d) => t(l, `wd${d}`));
    return `${t(l, "repeatWeekly")}${names.length ? ` · ${names.join(", ")}` : ""}`;
  }
  return t(l, "repeatDaily");
}

// Renders the schedule as a connected vertical timeline (time | dot+line |
// card) so scrolling through a long run-of-show reads as one continuous
// sequence rather than a flat stack of disconnected cards.
export function renderSchedule() {
  const items = [...state.config.schedule].sort((a, b) => a.time.localeCompare(b.time));
  if (items.length === 0) {
    scheduleList.innerHTML = `<li class="empty">${escapeHtml(t(lang(), "emptySchedule"))}</li>`;
    return;
  }
  const nowStr = currentTimeStr();
  scheduleList.innerHTML = items
    .map((item) => {
      const due = item.time <= nowStr;
      return `
      <li class="timeline-item${due ? " due" : ""}" data-time="${item.time}" data-id="${item.id}">
        <div class="timeline-time">${item.time}</div>
        <div class="timeline-track"><span class="timeline-dot"></span></div>
        <div class="timeline-card">
          <div class="cue-info">
            <div class="cue-label">${escapeHtml(item.label || "—")}${item.auto ? `<span class="cue-badge">${escapeHtml(t(lang(), "autoBadge"))}</span>` : ""}</div>
            <div class="cue-meta">${item.method} · ${escapeHtml(item.url)}</div>
            <div class="cue-meta">${escapeHtml(repeatDescription(item))}</div>
            ${item.lastResult ? `<div class="cue-result ${item.lastResult.ok ? "ok" : "err"}">${escapeHtml(item.lastResult.text)}</div>` : ""}
          </div>
          <div class="cue-actions">
            <button class="btn-send" data-id="${item.id}" type="button">${escapeHtml(t(lang(), "sendBtn"))}</button>
            <button class="btn-del" data-id="${item.id}" type="button" aria-label="${escapeHtml(t(lang(), "deleteBtn"))}">✕</button>
          </div>
        </div>
      </li>`;
    })
    .join("");
}

function readWeekdays(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll("input[type=checkbox]:checked")).map((cb) => Number(cb.value));
}

function updateRepeatVisibility(refs) {
  if (!refs.repeat) return;
  const val = refs.repeat.value;
  if (refs.dateField) refs.dateField.hidden = val !== "once";
  if (refs.weekdaysField) refs.weekdaysField.hidden = val !== "weekly";
}

function resetCueForm(refs) {
  refs.form.reset();
  refs.method.value = "POST";
  if (refs.repeat) {
    refs.repeat.value = "daily";
    updateRepeatVisibility(refs);
  }
}

// Wires up an "add cue" form. Takes a refs object of DOM elements rather than
// fixed IDs so the same logic can drive both the settings-panel form and the
// compact one in the live view.
export function initCueForm(refs) {
  updateRepeatVisibility(refs);
  refs.repeat?.addEventListener("change", () => updateRepeatVisibility(refs));

  refs.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!refs.time.value || !refs.url.value) return;
    const repeat = refs.repeat ? refs.repeat.value : "daily";
    state.config.schedule.push({
      id: uid(),
      time: refs.time.value,
      label: refs.label.value.trim(),
      method: refs.method.value,
      url: refs.url.value.trim(),
      headers: refs.headers ? refs.headers.value : "",
      body: refs.body ? refs.body.value : "",
      auto: refs.auto.checked,
      repeat,
      date: repeat === "once" ? refs.date?.value || null : null,
      weekdays: repeat === "weekly" ? readWeekdays(refs.weekdaysField) : [],
      lastAutoDate: null,
      lastResult: null,
    });
    saveConfig();
    renderSchedule();
    refs.onAdd?.();
    resetCueForm(refs);
  });
}

export function initSchedule() {
  autoSendGlobal.addEventListener("change", () => {
    state.config.display.autoSendEnabled = autoSendGlobal.checked;
    saveConfig();
  });

  scheduleList.addEventListener("click", (e) => {
    const sendBtnEl = e.target.closest(".btn-send");
    const delBtn = e.target.closest(".btn-del");
    if (sendBtnEl) sendCue(sendBtnEl.dataset.id);
    if (delBtn) deleteCue(delBtn.dataset.id);
  });

  initCueForm({
    form: cueForm,
    time: cueTime,
    label: cueLabel,
    method: cueMethod,
    url: cueUrl,
    headers: cueHeaders,
    body: cueBody,
    auto: cueAuto,
    repeat: cueRepeat,
    date: cueDate,
    dateField: cueDateField,
    weekdaysField: cueWeekdaysField,
  });

  // Per-second: refresh "due" highlighting, and fire armed auto-cues at most
  // once per day, only on days they're actually scheduled for (isDueToday).
  // Nothing here ever sends unless autoSendEnabled AND the individual cue's
  // own "auto" flag are both explicitly turned on.
  setInterval(() => {
    const tz = effectiveTimeZone(state.config.display.timezone);
    const now = new Date();
    const { h, m } = zonedParts(now, tz);
    const nowStr = `${pad(h)}:${pad(m)}`;
    scheduleList.querySelectorAll(".timeline-item").forEach((li) => {
      li.classList.toggle("due", li.dataset.time <= nowStr);
    });

    if (!state.config.display.autoSendEnabled) return;
    const todayKey = zonedDateKey(now, tz);
    state.config.schedule.forEach((item) => {
      if (item.auto && item.time <= nowStr && item.lastAutoDate !== todayKey && isDueToday(item, now, tz)) {
        item.lastAutoDate = todayKey;
        saveConfig();
        sendCue(item.id, { auto: true });
      }
    });
  }, 1000);

  autoSendGlobal.checked = state.config.display.autoSendEnabled;
  renderSchedule();
  renderLog();
}
