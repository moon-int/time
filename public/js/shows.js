import { state, saveConfig, mergeConfig } from "./config.js";
import { t, tf } from "./i18n.js";
import { onStartChange, setStart, showStart, render as renderStart } from "./showstart.js";

// The band's shows: next to tabs on one host (jam.geyser.at/time), time saves its display and
// run-of-show through tabs — signed in with havoc there, a copy kept in havoc. The server says where
// tabs is (jam.json, from JAM_API); without it (time.mo-tion.at) the section stays hidden.

const section = document.getElementById("showsSection");
const signin = document.getElementById("showsSignin");
const signinBtn = document.getElementById("showsSigninBtn");
const body = document.getElementById("showsBody");
const who = document.getElementById("showsWho");
const form = document.getElementById("showsForm");
const nameInput = document.getElementById("showsName");
const saveBtn = document.getElementById("showsSaveBtn");
const status = document.getElementById("showsStatus");
const list = document.getElementById("showsList");

let api = null;
let me = null;
let items = null;
let loadedId = null;
let busy = false;
// the loaded show stays linked: its start is shared with the band (and the overview on jam.geyser.at)
const LINK_KEY = "time.jam.loaded";
let link = null; // { id, editable, seen } — seen: the show's updatedAt we last know
try { link = JSON.parse(localStorage.getItem(LINK_KEY) || "null"); } catch {}
loadedId = link?.id ?? null;
const keepLink = (next) => {
  link = next;
  loadedId = next?.id ?? null;
  try { next ? localStorage.setItem(LINK_KEY, JSON.stringify(next)) : localStorage.removeItem(LINK_KEY); } catch {}
};

const lang = () => state.config.display.language;
// what stays on this machine: the relay belongs to this network, the language to this person
const LOCAL_ONLY = ["relayUrl", "relayToken", "language"];

async function call(method, path, payload) {
  const res = await fetch(`${api}${path}`, {
    method,
    credentials: "same-origin",
    headers: payload === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error === "sign_in_required" ? t(lang(), "showsSignInFirst") : data.error || `HTTP ${res.status}`);
  return data;
}

function current() {
  const display = { ...state.config.display };
  for (const k of LOCAL_ONLY) delete display[k];
  return { app: "mo-tion time", exportVersion: 1, display, schedule: state.config.schedule };
}

function say(text, warn = false) {
  status.textContent = text || "";
  status.hidden = !text;
  status.classList.toggle("warn", warn);
}

function when(ms) {
  return new Date(ms).toLocaleDateString(lang(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function render() {
  const l = lang();
  const signedOut = me && me.auth && !me.user;
  signin.hidden = !signedOut;
  body.hidden = !!signedOut;
  who.textContent = me?.user ? tf(l, "showsSignedInAs", { name: me.user.name }) : "";
  who.hidden = !me?.user;
  saveBtn.disabled = busy || !nameInput.value.trim();
  list.replaceChildren();
  if (!items) return;
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "shows-empty";
    li.textContent = t(l, "showsEmpty");
    list.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.className = `shows-item${item.id === loadedId ? " current" : ""}`;
    const main = document.createElement("button");
    main.type = "button";
    main.className = "shows-main";
    main.disabled = busy;
    main.title = t(l, "showsLoad");
    const name = document.createElement("span");
    name.className = "shows-name";
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "shows-meta";
    meta.textContent = `${tf(l, "showsCues", { n: item.cues })} · ${item.mine ? t(l, "showsYou") : item.ownerName || "—"} · ${when(item.updatedAt)}`;
    main.append(name, meta);
    main.addEventListener("click", () => load(item));
    li.append(main);
    if (item.editable) {
      const update = document.createElement("button");
      update.type = "button";
      update.className = "btn btn-small";
      update.textContent = t(l, "showsUpdate");
      update.title = t(l, "showsUpdateHint");
      update.disabled = busy;
      update.addEventListener("click", () => overwrite(item));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-small btn-danger";
      del.textContent = "✕";
      del.setAttribute("aria-label", `${t(l, "showsDelete")} ${item.name}`);
      del.disabled = busy;
      del.addEventListener("click", () => remove(item));
      li.append(update, del);
    }
    list.append(li);
  }
}

async function run(fn) {
  busy = true;
  render();
  try {
    await fn();
  } catch (err) {
    say(err.message, true);
  } finally {
    busy = false;
    render();
  }
}

async function refresh() {
  me = await call("GET", "/auth/me");
  items = me.auth && !me.user ? null : (await call("GET", "/store/clocks")).items;
}

function load(item) {
  run(async () => {
    const full = await call("GET", `/store/clocks/${encodeURIComponent(item.id)}`);
    const keep = {};
    for (const k of LOCAL_ONLY) keep[k] = state.config.display[k];
    const next = mergeConfig(full.data);
    next.display = { ...next.display, ...keep };
    state.config = next;
    saveConfig();
    keepLink({ id: item.id, editable: !!full.editable, seen: full.updatedAt });
    renderStart();
    section.dispatchEvent(new CustomEvent("shows:loaded", { bubbles: true }));
    say(tf(lang(), "showsLoaded", { name: full.name }));
  });
}

function overwrite(item) {
  run(async () => {
    const saved = await call("PUT", `/store/clocks/${encodeURIComponent(item.id)}`, { data: current() });
    if (link?.id === item.id) keepLink({ ...link, seen: saved.updatedAt });
    await refresh();
    say(tf(lang(), "showsSaved", { name: item.name }));
  });
}

function remove(item) {
  if (!confirm(tf(lang(), "showsDeleteConfirm", { name: item.name }))) return;
  run(async () => {
    await call("DELETE", `/store/clocks/${encodeURIComponent(item.id)}`);
    if (loadedId === item.id) keepLink(null);
    await refresh();
    say("");
  });
}

// ---- the start, shared: a move here goes to the band's copy; one from elsewhere comes here ----------

let pushTimer;
function pushStart(start) {
  if (!api || !link) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (!link.editable) { say(tf(lang(), "showsStartLocal", { t: start }), true); return; }
    try {
      const saved = await call("PUT", `/store/clocks/${encodeURIComponent(link.id)}`, { data: current() });
      keepLink({ ...link, seen: saved.updatedAt });
      say(tf(lang(), "showsStartSynced", { t: start }));
    } catch {
      say(tf(lang(), "showsStartLocal", { t: start }), true);
    }
  }, 1200);
}

async function pullStart() {
  if (!api || !link || document.hidden) return;
  try {
    const remote = await call("GET", `/store/clocks/${encodeURIComponent(link.id)}`);
    if (remote.updatedAt === link.seen) return;
    keepLink({ ...link, seen: remote.updatedAt, editable: !!remote.editable });
    const start = remote.data?.display?.showStart;
    if (start && start !== showStart()) {
      setStart(start, "remote");
      say(tf(lang(), "showsStartSynced", { t: start }));
    }
  } catch (err) {
    if (/not found/.test(err.message)) keepLink(null);
  }
}

export async function initShows({ onLoaded }) {
  try {
    const res = await fetch("jam.json", { cache: "no-store" });
    if (res.ok) api = ((await res.json()).api || "").replace(/\/+$/, "") || null;
  } catch {}
  if (!api) return;
  section.hidden = false;
  section.addEventListener("shows:loaded", onLoaded);

  signinBtn.addEventListener("click", () => {
    window.location.href = `${api}/auth/login?next=${encodeURIComponent(window.location.pathname)}`;
  });
  nameInput.addEventListener("input", render);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    run(async () => {
      const saved = await call("POST", "/store/clocks", { name, data: current() });
      keepLink({ id: saved.id, editable: true, seen: saved.updatedAt });
      nameInput.value = "";
      await refresh();
      say(tf(lang(), "showsSaved", { name: saved.name }));
    });
  });
  // the panel switches languages by setting <html lang>; the list follows
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  await run(refresh);
  onStartChange((start, from) => { if (from === "local") pushStart(start); });
  setInterval(pullStart, 15000);
  pullStart();
  // a link from the band's overview (jam.geyser.at): ?show=<id> loads that show
  const wanted = new URLSearchParams(window.location.search).get("show");
  if (wanted) {
    history.replaceState(null, "", window.location.pathname);
    const item = items?.find((x) => x.id === wanted);
    if (item) load(item);
    else say(t(lang(), "showsSignInFirst"), true);
  }
}
