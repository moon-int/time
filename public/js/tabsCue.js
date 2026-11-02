import { state } from "./config.js";

// mo-tion tabs as a cue target, without writing urls and json by hand: pick an action ("go",
// "next song", "cue text" …), and the form gets method, url, headers and body. On jam.geyser.at
// (tabs next door, jam.json says where) the cues go to /tabs/api/control on the same host, signed in
// with tabs' cookie; elsewhere to the tabs address (and control key) given once, kept on this device.

const STORE = "time.tabsTarget";

// value · per language: name, the argument's name — body(arg) is what tabs' control api takes
const ACTIONS = [
  { id: "go", arg: "seconds", def: "4", body: (a) => ({ seconds: num(a, 4) }),
    l: { de: ["Los — Countdown, dann Play", "Sekunden"], en: ["Go — countdown, then play", "seconds"], fr: ["Go — décompte, puis lecture", "secondes"], es: ["Ya — cuenta atrás y play", "segundos"] } },
  { id: "play", l: { de: ["Play"], en: ["Play"], fr: ["Lecture"], es: ["Play"] } },
  { id: "pause", l: { de: ["Pause"], en: ["Pause"], fr: ["Pause"], es: ["Pausa"] } },
  { id: "stop", l: { de: ["Stopp"], en: ["Stop"], fr: ["Stop"], es: ["Stop"] } },
  { id: "next", l: { de: ["Nächster Song"], en: ["Next song"], fr: ["Morceau suivant"], es: ["Siguiente canción"] } },
  { id: "prev", l: { de: ["Voriger Song"], en: ["Previous song"], fr: ["Morceau précédent"], es: ["Canción anterior"] } },
  { id: "goto", arg: "index", def: "1", body: (a) => ({ index: num(a, 1) }),
    l: { de: ["Zu Song Nr. …", "Song Nr."], en: ["Go to song no. …", "song no."], fr: ["Aller au morceau n° …", "n°"], es: ["Ir a la canción n.º …", "n.º"] } },
  { id: "cue", arg: "text", def: "", body: (a) => ({ text: a, seconds: 0 }),
    l: { de: ["Hinweis an alle Bildschirme", "Text"], en: ["Cue text on every screen", "text"], fr: ["Message sur tous les écrans", "texte"], es: ["Aviso en todas las pantallas", "texto"] } },
  { id: "countdown", arg: "seconds", def: "60", body: (a, label) => ({ seconds: num(a, 60), label: label || undefined }),
    l: { de: ["Countdown anzeigen", "Sekunden"], en: ["Show a countdown", "seconds"], fr: ["Afficher un décompte", "secondes"], es: ["Mostrar cuenta atrás", "segundos"] } },
  { id: "show", action: "start", body: () => ({ action: "start" }),
    l: { de: ["Show-Uhr starten"], en: ["Start the show clock"], fr: ["Démarrer l'horloge du show"], es: ["Iniciar el reloj del show"] } },
  { id: "show", action: "reset", body: () => ({ action: "reset" }),
    l: { de: ["Show-Uhr zurücksetzen"], en: ["Reset the show clock"], fr: ["Réinitialiser l'horloge"], es: ["Reiniciar el reloj"] } },
  { id: "load", arg: "set", def: "", body: (a) => ({ set: a }),
    l: { de: ["Show laden", "Name der Show"], en: ["Load a show", "show name"], fr: ["Charger un show", "nom du show"], es: ["Cargar un show", "nombre del show"] } },
  { id: "groove", action: "on", body: () => ({ on: true }),
    l: { de: ["Groove an"], en: ["Groove on"], fr: ["Groove on"], es: ["Groove on"] } },
  { id: "groove", action: "off", body: () => ({ off: true }),
    l: { de: ["Groove aus"], en: ["Groove off"], fr: ["Groove off"], es: ["Groove off"] } },
];

const TEXT = {
  de: { title: "mo-tion tabs", none: "— eigene Anfrage —", base: "tabs-Adresse", key: "Control-Key (optional)", jam: "geht an tabs auf diesem Server" },
  en: { title: "mo-tion tabs", none: "— own request —", base: "tabs address", key: "control key (optional)", jam: "goes to tabs on this server" },
  fr: { title: "mo-tion tabs", none: "— requête libre —", base: "adresse de tabs", key: "clé de contrôle (optionnelle)", jam: "envoyé à tabs sur ce serveur" },
  es: { title: "mo-tion tabs", none: "— petición propia —", base: "dirección de tabs", key: "clave de control (opcional)", jam: "va a tabs en este servidor" },
};

const num = (v, fb) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : fb);
const lang = () => (TEXT[state.config.display.language] ? state.config.display.language : "de");
const words = (a) => a.l[lang()] || a.l.de;

let jamApi = null; // "/tabs/api" next to tabs, else null
const ready = fetch("jam.json", { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : {}))
  .then((j) => { jamApi = (j.api || "").replace(/\/+$/, "") || null; })
  .catch(() => {});

function target() {
  try { return { base: "", key: "", ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch { return { base: "", key: "" }; }
}

/** one action → method, url, headers, body as time sends them */
export function tabsRequest(index, arg, label) {
  const a = ACTIONS[index];
  const t = target();
  const base = jamApi ? jamApi : `${(t.base || "").trim().replace(/\/+$/, "")}/api`;
  const headers = ["Content-Type: application/json"];
  if (!jamApi && t.key) headers.push(`X-Tabs-Key: ${t.key}`);
  const body = a.body ? a.body(arg ?? "", label) : {};
  return { method: "POST", url: `${base}/control/${a.id}`, headers: headers.join("\n"), body: JSON.stringify(body) };
}

/**
 * Adds the picker to an "add cue" form (the settings' and the live view's). Picking an action fills
 * method, url, headers and body — and the label, unless one was typed.
 */
export function attachTabsBuilder(refs) {
  const row = document.createElement("div");
  row.className = "tabs-builder";
  row.innerHTML = `
    <div class="cue-form-row">
      <label class="field">
        <span class="tb-title"></span>
        <select class="tb-action"></select>
      </label>
      <label class="field field-grow tb-arg-field" hidden>
        <span class="tb-arg-label"></span>
        <input type="text" class="tb-arg" />
      </label>
    </div>
    <div class="cue-form-row tb-target" hidden>
      <label class="field field-grow"><span class="tb-base-label"></span><input type="text" class="tb-base" placeholder="https://jam.geyser.at/tabs" inputmode="url" /></label>
      <label class="field"><span class="tb-key-label"></span><input type="text" class="tb-key" autocomplete="off" /></label>
    </div>
    <p class="tb-hint" hidden></p>`;
  refs.form.prepend(row);
  const $ = (s) => row.querySelector(s);
  const select = $(".tb-action"), argField = $(".tb-arg-field"), arg = $(".tb-arg"), targetRow = $(".tb-target"), hint = $(".tb-hint");
  let autoLabel = "";

  const texts = () => {
    const tx = TEXT[lang()];
    $(".tb-title").textContent = tx.title;
    $(".tb-base-label").textContent = tx.base;
    $(".tb-key-label").textContent = tx.key;
    hint.textContent = jamApi ? `${tx.jam} (${jamApi}/control)` : "";
    const cur = select.value;
    select.innerHTML = `<option value="">${tx.none}</option>` + ACTIONS.map((a, i) => `<option value="${i}">${words(a)[0]}</option>`).join("");
    select.value = cur;
    const a = ACTIONS[Number(select.value)];
    if (a?.arg) $(".tb-arg-label").textContent = words(a)[1];
  };

  const fill = () => {
    if (select.value === "") return;
    const a = ACTIONS[Number(select.value)];
    const r = tabsRequest(Number(select.value), a.arg ? arg.value : "", refs.label.value.trim() !== autoLabel ? refs.label.value.trim() : "");
    refs.method.value = r.method;
    refs.url.value = r.url;
    if (refs.headers) refs.headers.value = r.headers;
    if (refs.body) refs.body.value = r.body;
    // a name of our own only while nobody typed one
    if (!refs.label.value.trim() || refs.label.value.trim() === autoLabel) {
      const name = words(a)[0].replace(/\s*…$/, "");
      autoLabel = a.arg && arg.value ? `tabs · ${name.split(" —")[0]} ${arg.value}`.trim() : `tabs · ${name}`;
      refs.label.value = autoLabel;
    }
  };

  const show = () => {
    const a = ACTIONS[Number(select.value)];
    const picked = select.value !== "";
    argField.hidden = !picked || !a?.arg;
    targetRow.hidden = !picked || !!jamApi;
    hint.hidden = !picked || !jamApi;
    if (picked && a?.arg && arg.dataset.for !== select.value) { arg.value = a.def || ""; arg.dataset.for = select.value; }
    texts();
  };

  // the form is reset after every cue — the address and key stay (they are the defaults)
  const t = target();
  $(".tb-base").value = $(".tb-base").defaultValue = t.base;
  $(".tb-key").value = $(".tb-key").defaultValue = t.key;
  const keep = () => {
    const base = $(".tb-base").value.trim(), key = $(".tb-key").value.trim();
    $(".tb-base").defaultValue = base;
    $(".tb-key").defaultValue = key;
    try { localStorage.setItem(STORE, JSON.stringify({ base, key })); } catch {}
    fill();
  };
  $(".tb-base").addEventListener("input", keep);
  $(".tb-key").addEventListener("input", keep);
  select.addEventListener("change", () => { show(); fill(); });
  select.addEventListener("focus", texts);
  arg.addEventListener("input", fill);
  refs.form.addEventListener("reset", () => setTimeout(() => { select.value = ""; autoLabel = ""; show(); }, 0));
  ready.then(() => { texts(); show(); });
  texts();
}
