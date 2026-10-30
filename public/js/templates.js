// Starter snippets offered from the "Vorlage" dropdowns next to the custom
// CSS / mod-script textareas. Existing content is only replaced after a
// confirm — cancelling appends instead (see insertTemplate in panel.js).

export const CSS_TEMPLATES = {
  bigger: {
    labelKey: "cssTplBigger",
    code: `.time {
  font-size: clamp(3.2rem, 16vmin, 9rem);
  letter-spacing: 0.06em;
}`,
  },
  glow: {
    labelKey: "cssTplGlow",
    code: `.time,
.seconds {
  text-shadow: 0 0 45px var(--accent-soft), 0 0 90px var(--accent-soft);
}`,
  },
  sharp: {
    labelKey: "cssTplSharp",
    code: `.clock-face {
  border-radius: 12px;
}`,
  },
  pulse: {
    labelKey: "cssTplPulse",
    code: `.clock-face {
  animation: modPulseBorder 3s ease-in-out infinite;
}

@keyframes modPulseBorder {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 255, 255, 0); }
  50% { box-shadow: 0 0 40px var(--accent-soft); }
}`,
  },
};

export const JS_TEMPLATES = {
  console: {
    labelKey: "jsTplConsole",
    code: `console.log("mo-tion time mod läuft:", new Date().toLocaleTimeString());`,
  },
  rainbow: {
    labelKey: "jsTplRainbow",
    code: `// Läuft weiter, bis die Seite neu geladen wird.
let hue = 0;
setInterval(() => {
  hue = (hue + 1) % 360;
  document.documentElement.style.setProperty("--accent", \`hsl(\${hue}, 90%, 65%)\`);
}, 50);`,
  },
  tabTitle: {
    labelKey: "jsTplTabTitle",
    code: `// Zeigt die Uhrzeit zusätzlich im Browser-Tab-Titel.
setInterval(() => {
  document.title = new Date().toLocaleTimeString();
}, 1000);`,
  },
  notify: {
    labelKey: "jsTplNotify",
    code: `Notification.requestPermission().then((perm) => {
  if (perm === "granted") {
    new Notification("mo-tion time", { body: "Test-Benachrichtigung" });
  }
});`,
  },
};
