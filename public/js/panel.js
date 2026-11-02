import { state, saveConfig, DEFAULTS, mergeConfig } from "./config.js";
import { t, applyI18n } from "./i18n.js";
import { applyClockDisplay, updateCityLabel } from "./clock.js";
import { renderSchedule, renderLog } from "./schedule.js";
import { CSS_TEMPLATES, JS_TEMPLATES } from "./templates.js";
import { initShows } from "./shows.js";
import { initShowStart } from "./showstart.js";
import { renderLiveView } from "./liveView.js";

const gearBtn = document.getElementById("gearBtn");
const panelOverlay = document.getElementById("panelOverlay");
const settingsPanel = document.getElementById("settingsPanel");
const closePanelBtn = document.getElementById("closePanel");
const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");

const languageSelect = document.getElementById("languageSelect");
const timezoneSelect = document.getElementById("timezoneSelect");
const accentPicker = document.getElementById("accentPicker");
const formatSelect = document.getElementById("formatSelect");
const fontSelect = document.getElementById("fontSelect");
const bgModeSelect = document.getElementById("bgModeSelect");
const bgSolidField = document.getElementById("bgSolidField");
const bgSolidPicker = document.getElementById("bgSolidPicker");
const toggleSeconds = document.getElementById("toggleSeconds");
const toggleDate = document.getElementById("toggleDate");
const toggleRing = document.getElementById("toggleRing");
const customCssInput = document.getElementById("customCssInput");
const customJsInput = document.getElementById("customJsInput");
const relayUrlInput = document.getElementById("relayUrlInput");
const relayTokenInput = document.getElementById("relayTokenInput");
const instanceOrigin = document.getElementById("instanceOrigin");
const cssTemplateSelect = document.getElementById("cssTemplateSelect");
const jsTemplateSelect = document.getElementById("jsTemplateSelect");
const runModJsBtn = document.getElementById("runModJs");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const resetBtn = document.getElementById("resetBtn");

function lang() {
  return state.config.display.language;
}

// Picking a template replaces whatever's already in the textarea; if there's
// existing content, confirm first (Cancel appends instead, so nothing the
// user wrote is ever lost silently) — then reuses the textarea's own "input"
// listener (via a dispatched event) to save and apply it.
function insertTemplate(textarea, snippet) {
  const existing = textarea.value.trim();
  if (existing && existing !== snippet.trim() && !confirm(t(lang(), "tplReplaceConfirm"))) {
    textarea.value = `${existing}\n\n${snippet}`;
  } else {
    textarea.value = snippet;
  }
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function filenameStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}

function openPanel() {
  panelOverlay.classList.add("open");
  settingsPanel.classList.add("open");
}
function closePanel() {
  panelOverlay.classList.remove("open");
  settingsPanel.classList.remove("open");
}

// Pushes state.config.display into every field's current value — called on
// load, and whenever config changes from outside the field itself (import,
// reset, language switch that re-syncs everything).
function syncPanelFields() {
  const d = state.config.display;
  languageSelect.value = d.language;
  timezoneSelect.value = d.timezone;
  accentPicker.value = d.accent;
  formatSelect.value = d.format24h ? "24" : "12";
  fontSelect.value = d.font;
  bgModeSelect.value = d.backgroundMode;
  bgSolidPicker.value = d.backgroundSolid;
  bgSolidField.hidden = d.backgroundMode !== "solid";
  toggleSeconds.checked = d.showSeconds;
  toggleDate.checked = d.showDate;
  toggleRing.checked = d.showRing;
  customCssInput.value = d.customCss;
  customJsInput.value = d.customJs;
  relayUrlInput.value = d.relayUrl;
  relayTokenInput.value = d.relayToken;
  // Config lives in localStorage, which is per-origin — showing the current
  // origin makes it obvious which deployment (global vs. local) this tab's
  // settings/schedule actually belong to.
  instanceOrigin.textContent = `${t(lang(), "instanceOriginLabel")}: ${window.location.origin}`;
}

function refreshAll() {
  applyClockDisplay();
  syncPanelFields();
  applyI18n(lang());
  renderSchedule();
  renderLog();
}

export function initPanel() {
  gearBtn.addEventListener("click", openPanel);
  closePanelBtn.addEventListener("click", closePanel);
  panelOverlay.addEventListener("click", closePanel);

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((tb) => tb.classList.remove("active"));
      tab.classList.add("active");
      const name = tab.dataset.tab;
      tabPanels.forEach((p) => {
        p.hidden = p.dataset.tabPanel !== name;
      });
    });
  });

  languageSelect.addEventListener("change", () => {
    state.config.display.language = languageSelect.value;
    saveConfig();
    applyI18n(lang());
    renderSchedule();
    renderLog();
  });
  timezoneSelect.addEventListener("change", () => {
    state.config.display.timezone = timezoneSelect.value;
    saveConfig();
    updateCityLabel();
    renderSchedule();
  });
  accentPicker.addEventListener("input", () => {
    state.config.display.accent = accentPicker.value;
    saveConfig();
    applyClockDisplay();
  });
  formatSelect.addEventListener("change", () => {
    state.config.display.format24h = formatSelect.value === "24";
    saveConfig();
  });
  fontSelect.addEventListener("change", () => {
    state.config.display.font = fontSelect.value;
    saveConfig();
    applyClockDisplay();
  });
  bgModeSelect.addEventListener("change", () => {
    state.config.display.backgroundMode = bgModeSelect.value;
    bgSolidField.hidden = bgModeSelect.value !== "solid";
    saveConfig();
  });
  bgSolidPicker.addEventListener("input", () => {
    state.config.display.backgroundSolid = bgSolidPicker.value;
    saveConfig();
  });
  toggleSeconds.addEventListener("change", () => {
    state.config.display.showSeconds = toggleSeconds.checked;
    saveConfig();
    applyClockDisplay();
  });
  toggleDate.addEventListener("change", () => {
    state.config.display.showDate = toggleDate.checked;
    saveConfig();
    applyClockDisplay();
  });
  toggleRing.addEventListener("change", () => {
    state.config.display.showRing = toggleRing.checked;
    saveConfig();
    applyClockDisplay();
  });
  customCssInput.addEventListener("input", () => {
    state.config.display.customCss = customCssInput.value;
    saveConfig();
    applyClockDisplay();
  });
  customJsInput.addEventListener("input", () => {
    state.config.display.customJs = customJsInput.value;
    saveConfig();
  });
  relayUrlInput.addEventListener("input", () => {
    state.config.display.relayUrl = relayUrlInput.value.trim();
    saveConfig();
  });
  relayTokenInput.addEventListener("input", () => {
    state.config.display.relayToken = relayTokenInput.value.trim();
    saveConfig();
  });
  cssTemplateSelect.addEventListener("change", () => {
    const key = cssTemplateSelect.value;
    if (!key) return;
    insertTemplate(customCssInput, CSS_TEMPLATES[key].code);
    cssTemplateSelect.value = "";
  });
  jsTemplateSelect.addEventListener("change", () => {
    const key = jsTemplateSelect.value;
    if (!key) return;
    insertTemplate(customJsInput, JS_TEMPLATES[key].code);
    jsTemplateSelect.value = "";
  });
  runModJsBtn.addEventListener("click", () => {
    try {
      // eslint-disable-next-line no-new-func
      new Function(state.config.display.customJs || "")();
    } catch (err) {
      alert(`${t(lang(), "modScriptError")}: ${err.message}`);
    }
  });

  exportBtn.addEventListener("click", () => {
    const now = new Date();
    const payload = {
      app: "mo-tion time",
      exportVersion: 1,
      exportedAt: now.toISOString(),
      display: state.config.display,
      schedule: state.config.schedule,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mo-tion-time-config-${filenameStamp(now)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        state.config = mergeConfig(parsed);
        saveConfig();
        refreshAll();
      } catch {
        alert(t(lang(), "importError"));
      }
    };
    reader.readAsText(file);
    importInput.value = "";
  });

  resetBtn.addEventListener("click", () => {
    if (!confirm(t(lang(), "resetConfirm"))) return;
    state.config = DEFAULTS();
    saveConfig();
    refreshAll();
  });

  syncPanelFields();
  initShows({ onLoaded: refreshAll });
  // a dynamic start: moving it moves every cue that hangs on it — the schedule and the live view follow
  initShowStart({ onChange: () => { renderSchedule(); renderLiveView(); } });
}
