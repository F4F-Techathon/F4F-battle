// main.js — boot: shared catalog + film data + the generated agents, the three views,
// status pills.

import { api } from "./util.js";
import * as roster from "./roster.js";
import { icon } from "./icons.js";
import { LiveView } from "./console.js";
import { Library } from "./library.js";
import { SystemView } from "./system.js";
import { openSettings } from "./settings.js";

const status = { jev: {}, tts: {} };
const views = {};

async function boot() {
  const [cat, dialect, manifest, agents] = await Promise.all([
    fetch("/data/catalog.json").then((r) => r.json()),
    fetch("/film/tools/lines_dialect.json").then((r) => r.json()),
    fetch("/lab/manifest.json").then((r) => r.json()).catch(() => ({})),
    api("/api/agents").catch(() => ({ agents: [], me: null })),
  ]);
  Object.values(window.LIPSYNC).forEach((L) => L.gloss == null && delete L.gloss);
  roster.init(cat, agents);
  await poll();
  const settings = () => openSettings(status, views.live.engine, poll);
  document.getElementById("btn-settings").innerHTML = icon("gear");
  ["btn-settings", "pill-jev", "pill-llm", "pill-tts"].forEach((id) => document.getElementById(id).addEventListener("click", settings));
  views.live = new LiveView(document.getElementById("view-live"), cat, status, settings);
  window.__live = views.live; // automation handle
  const make = {
    library: () => {
      views.library = new Library(document.getElementById("view-library"), cat, dialect, manifest, () => views.live);
      views.library.overview();
    },
    system: () => (views.system = new SystemView(document.getElementById("view-system"), cat, status)),
  };
  const go = (id) => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === id));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + id));
    document.querySelectorAll(".drawer.open").forEach((d) => d.classList.remove("open"));
    if (!views[id] && make[id]) make[id]();
    if (id === "live") views.live.stage.fit();
    history.replaceState(null, "", "#" + id);
  };
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  const hash = location.hash.slice(1);
  if (make[hash]) go(hash);
  setInterval(poll, 3000);
}

async function poll() {
  try {
    Object.assign(status, await api("/api/status"));
  } catch (e) {
    status.tts = { state: "error", error: "服务器不可达" };
  }
  const pj = document.getElementById("pill-jev"), pt = document.getElementById("pill-tts"), pl = document.getElementById("pill-llm");
  const l = status.llm || {};
  pl.className = "pill btn " + (l.configured ? "ok" : "warn");
  pl.lastChild.textContent = l.configured ? "改写" : "改写未配置";
  pl.title = l.configured ? l.model : "设置方言改写模型";
  const j = status.jev || {}, t = status.tts || {};
  pj.className = "pill btn " + (j.configured ? "ok" : "warn");
  pj.lastChild.textContent = j.configured ? "Jev" : "Jev 未配置";
  pt.className = "pill btn " + (t.state === "ready" ? "ok" : t.state === "error" ? "bad" : "warn");
  pt.lastChild.textContent = t.state === "ready" ? "配音就绪" : t.state === "loading" ? "配音加载中" : t.state === "error" ? "配音不可用" : "配音";
  pt.title = t.error || t.device || "";
  if (views.system) views.system.renderStatus();
}

boot().catch((e) => {
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;inset:80px 20px auto;padding:16px;border-radius:12px;background:#2a1414;color:#f0a69d;border:1px solid #e06c5f">启动失败：${e.message}</pre>`);
  console.error(e);
});
