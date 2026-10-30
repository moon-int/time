import { state } from "./config.js";
import { applyI18n } from "./i18n.js";
import { initClock } from "./clock.js";
import { initPanel } from "./panel.js";
import { initSchedule } from "./schedule.js";
import { initLiveView } from "./liveView.js";

const stage = document.getElementById("stage");

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

let hintTimeout;
function flashHint() {
  stage.classList.add("show-hint");
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => stage.classList.remove("show-hint"), 2500);
}

stage.addEventListener("click", () => {
  toggleFullscreen();
  flashHint();
});

initClock();
initSchedule();
initPanel();
initLiveView();
applyI18n(state.config.display.language);
flashHint();
