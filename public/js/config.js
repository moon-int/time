import { I18N } from "./i18n.js";

export const ACCENTS = ["#5ee7ff", "#ff9d5e", "#c98bff", "#7dffb3", "#ff6b8b", "#ffe066"];

const STORAGE_KEY = "clock-config-v2";
const LEGACY_ACCENT_KEY = "clock-accent";

function detectLanguage() {
  const lang = (navigator.language || "de").slice(0, 2).toLowerCase();
  return lang in I18N ? lang : "de";
}

export function DEFAULTS() {
  return {
    display: {
      language: detectLanguage(),
      timezone: "local",
      format24h: true,
      showSeconds: true,
      showDate: true,
      showRing: true,
      font: "orbitron",
      accent: "#5ee7ff",
      backgroundMode: "auto",
      backgroundSolid: "#0a0e14",
      customCss: "",
      customJs: "",
      autoSendEnabled: false,
      relayUrl: "",
      relayToken: "",
    },
    schedule: [],
  };
}

// Cues saved before recurrence existed have no repeat/date/weekdays fields —
// defaulting them to "daily" preserves their old behavior (fire every day).
function normalizeSchedule(schedule) {
  if (!Array.isArray(schedule)) return [];
  return schedule.map((item) => ({ repeat: "daily", date: null, weekdays: [], ...item }));
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const d = DEFAULTS();
      return {
        display: { ...d.display, ...(parsed.display || {}) },
        schedule: normalizeSchedule(parsed.schedule),
      };
    }
    const legacyIndex = Number(localStorage.getItem(LEGACY_ACCENT_KEY));
    const d = DEFAULTS();
    if (!Number.isNaN(legacyIndex) && ACCENTS[legacyIndex]) {
      d.display.accent = ACCENTS[legacyIndex];
    }
    return d;
  } catch {
    return DEFAULTS();
  }
}

export function mergeConfig(parsed) {
  const d = DEFAULTS();
  return {
    display: { ...d.display, ...(parsed.display || {}) },
    schedule: normalizeSchedule(parsed.schedule),
  };
}

export const state = {
  config: loadConfig(),
  log: [],
};

export function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}
