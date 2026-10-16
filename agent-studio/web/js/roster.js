// roster.js — who is on the show: the film's three owners, restaurant agents generated
// from a shop's info + logo, the host (小选) and 我 (the customer in the audience).
// STAGE / X / EDGE live in plan.js and are mutated in place here, so every module that
// imported them sees a new agent without re-importing anything.

import { STAGE, X, EDGE } from "./plan.js";
import { bus } from "./util.js";
import { createKitRig, BODIES, shade } from "./rigkit.js";

export const FILM = ["rong", "hua", "pierre"];
export const MAX_STAGE = 8;
// generic templates (資产 → 通用模板): one neutral look per body, ids "body:<id>"
export const TEMPLATE_LOOKS = {
  f_petite: { hair: "ponytail", outfit: "shirt", hat: "none", age: "young" },
  f_regular: { hair: "bun", outfit: "jacket", hat: "none", age: "middle" },
  f_tall: { hair: "long", outfit: "chef", hat: "none", age: "young" },
  m_round: { hair: "side", outfit: "tang", hat: "none", age: "middle" },
  m_regular: { hair: "crew", outfit: "shirt", hat: "cap", age: "young" },
  m_tall: { hair: "curly", outfit: "chef", hat: "toque", age: "middle" },
};
const TEMPLATE_THEME = "#7D86A0";

let CAT = null;

export function init(cat, data) {
  CAT = cat;
  if (data && data.me) cat.characters.me = data.me;
  EDGE.me = (cat.characters.me && cat.characters.me.edge) || EDGE.me;
  ((data && data.agents) || []).forEach((a) => add(a, true));
  layout(STAGE);
}

export function kind(id) {
  if (FILM.includes(id)) return "film";
  if (id === "orb") return "host";
  if (id === "me") return "user";
  if (String(id).startsWith("body:")) return "template";
  return "agent";
}

// a catalog character, or a stand-in for an id that no longer exists (old sessions)
export function info(id) {
  if (CAT && CAT.characters[id]) return CAT.characters[id];
  if (kind(id) === "template") {
    const b = BODIES.find((x) => "body:" + x.id === id) || BODIES[1];
    return { name: b.zh, fullName: "通用模板 · " + b.zh, restaurant: "通用模板", plate: b.zh, persona: "", defaults: { expr: "pitch", gesture: "present", act: "stepIn", reaction: "listen" }, language: "zh" };
  }
  return { name: "已删除", fullName: "已删除的 agent", restaurant: "—", plate: "—", persona: "", defaults: { expr: "idle", gesture: "rest", act: "none", reaction: "listen" }, language: "zh", missing: true };
}

export function edge(id) {
  return EDGE[id] || "#8A93A6";
}
export function edgeDark(id) {
  return { rong: "#B9472F", hua: "#21785F", pierre: "#6B53B8", orb: "#7A5FB4", me: "#8A6A3A" }[id] || shade(edge(id), -0.38);
}

// dock / composer order: the customer first, the owners left to right, the host last
export function order() {
  return ["me", ...STAGE, "orb"];
}
export function agents() {
  return CAT ? Object.values(CAT.characters).filter((c) => c.kind === "agent" && !c.pending) : [];
}

// while an agent is being generated it has a catalog entry (for its rig) but no place
// in STAGE: Jev and the composer only see it once it is done
export function provisional(c) {
  CAT.characters[c.id] = { kind: "agent", pending: true, persona: "", language: "zh", defaults: { expr: "idle", gesture: "rest", act: "none", reaction: "listen" }, ...c };
  EDGE[c.id] = c.edge || "#8A93A6";
}
export function dropProvisional(id) {
  if (CAT.characters[id] && CAT.characters[id].pending) delete CAT.characters[id];
}

export function add(c, quiet) {
  CAT.characters[c.id] = c;
  EDGE[c.id] = c.edge;
  if (!STAGE.includes(c.id) && STAGE.length < MAX_STAGE) STAGE.push(c.id);
  layout(STAGE);
  if (!quiet) bus.emit("roster.change", { op: "add", id: c.id });
}

export function remove(id) {
  const i = STAGE.indexOf(id);
  if (i >= 0 && !FILM.includes(id)) STAGE.splice(i, 1);
  if (CAT.characters[id] && CAT.characters[id].kind === "agent") delete CAT.characters[id];
  layout(STAGE);
  bus.emit("roster.change", { op: "remove", id });
}

export function setMe(me) {
  CAT.characters.me = me;
  bus.emit("roster.change", { op: "me", id: "me" });
}

/* ------------------------------------------------------------- layout */
const MARGIN = { 1: 960, 2: 640, 3: 440, 4: 330, 5: 250, 6: 215, 7: 190, 8: 170 };
const SCALE = { 1: 1, 2: 1, 3: 1, 4: 0.9, 5: 0.8, 6: 0.72, 7: 0.65, 8: 0.6 };

// x for each id, evenly across the floor (3 owners land on the film's 440 / 960 / 1480)
export function layout(ids) {
  const n = ids.length;
  const m = MARGIN[Math.min(8, Math.max(1, n))];
  ids.forEach((w, i) => (X[w] = n === 1 ? 960 : m + ((1920 - 2 * m) * i) / (n - 1)));
}
export function scaleFor(n) {
  return SCALE[Math.min(8, Math.max(1, n))];
}

/* ------------------------------------------------------------- rigs */
export function lookOf(id) {
  if (kind(id) === "template") {
    const bid = id.slice(5);
    const b = BODIES.find((x) => x.id === bid) || BODIES[1];
    return { id, body: b.id, gender: b.gender, theme: TEMPLATE_THEME, badgeText: "店", ...TEMPLATE_LOOKS[b.id] };
  }
  const c = CAT && CAT.characters[id];
  if (!c || !c.rig) return null;
  return { ...c.rig, id, logo: c.logo || null };
}

// the film's own rig for its three owners; a rigkit character (same DOM contract,
// same prototype, same RIG.Actor) for templates and generated agents
export function makeRig(container, who, rid) {
  const safe = String(rid).replace(/[^A-Za-z0-9_-]/g, "_");
  if (kind(who) === "film") return window.RIG.create(container, who, safe);
  const look = lookOf(who);
  if (!look) throw new Error("no rig for " + who);
  return createKitRig(container, look, safe);
}
export function hasRig(who) {
  const k = kind(who);
  return k === "film" || k === "template" || (k === "agent" && !!lookOf(who));
}
