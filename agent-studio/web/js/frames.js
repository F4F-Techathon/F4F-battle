// frames.js — renders any rig state to an image frame.
// The film's rig is a pure function of time, so "every frame" of an asset is
// just Actor.state(t) sampled at 30 fps and serialised from the SVG. Templates and
// generated agents are rigkit characters on the same contract (roster.makeRig).

import * as roster from "./roster.js";

const FPS = 30;
const VIEW = {
  body: "-235 -720 470 740",
  head: "-180 -600 360 360",
  mouth: "-70 -340 140 96",
};
// head origin sits at y = -(214 + lext); the mouth group at head + mouthAt.y
const MOUTH_Y = { rong: -300, hua: -284, pierre: -298 };

const pools = {};

function pool(who) {
  if (pools[who]) return pools[who];
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-4000px;top:0;width:420px;height:640px;pointer-events:none;opacity:0";
  document.body.appendChild(box);
  const rig = roster.makeRig(box, who, "fr-" + who);
  rig.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  pools[who] = { box, rig };
  return pools[who];
}

// a regenerated agent gets a fresh offscreen rig
export function invalidate(who) {
  if (!pools[who]) return;
  pools[who].box.remove();
  delete pools[who];
}

// circular face icons: centred on each character's face (head origin + face cy)
const ICON_Y = { rong: -392, hua: -372, pierre: -392 };

// crops: the film's three are measured; rigkit characters from their own geometry
function geo(who) {
  if (ICON_Y[who]) return { icon: ICON_Y[who], mouth: MOUTH_Y[who], head: -420 };
  const k = pool(who).rig.kit;
  if (!k) return { icon: -385, mouth: -300, head: -420 };
  return { icon: k.headOrigin + k.sp.face.cy - 28, mouth: k.headOrigin + k.sp.mouthAt.y, head: k.headOrigin - 130 };
}

export function viewBox(who, kind) {
  if (kind === "icon") {
    const y = geo(who).icon;
    return `-150 ${y - 150} 300 300`;
  }
  if (kind === "mouth") {
    const y = geo(who).mouth;
    return `-75 ${y - 36} 150 90`;
  }
  if (kind === "head" && !ICON_Y[who]) return `-180 ${geo(who).head - 180} 360 360`;
  return VIEW[kind] || VIEW.body;
}

// fresh actor with blinks off so a frame sequence shows only the asset itself
export function actor(who, opts) {
  const { rig } = pool(who);
  const a = new window.RIG.Actor(rig, Object.assign({ seed: 0, expr: "idle" }, opts || {}));
  a.blinkAt = () => 0;
  return a;
}

export function snapshot(who, st, kind) {
  const { rig } = pool(who);
  rig.render(st);
  const svg = rig.svg;
  const vb0 = svg.getAttribute("viewBox");
  svg.setAttribute("viewBox", viewBox(who, kind));
  const s = new XMLSerializer().serializeToString(svg);
  svg.setAttribute("viewBox", vb0);
  return URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
}

// frames: array of {t, st}
export function sample(a, t0, t1, mutate) {
  const out = [];
  const n = Math.max(1, Math.round((t1 - t0) * FPS) + 1);
  for (let i = 0; i < n; i += 1) {
    const t = t0 + i / FPS;
    const st = a.state(t);
    if (mutate) mutate(st, t, i);
    out.push({ i, t: +(t - t0).toFixed(3), st });
  }
  return out;
}

/* ---------------------------------------------------------------- recipes
 * Each recipe returns {frames:[{i,t,st}], kind, loop} for one asset row. */
export const recipe = {
  expr(who, id) {
    const a = actor(who);
    a.e(1, id);
    return { kind: "head", frames: sample(a, 1, 1.4), note: "idle → " + id + "：0.22 s 混合 + 0.34 s 头部挤压回弹" };
  },
  pose(who, id) {
    const a = actor(who);
    if (id === "run") {
      a.run(1, 3, 3.2);
      return { kind: "body", frames: sample(a, 1.2, 1.2 + 1 / 3.2), note: "跑步循环 3.2 Hz，一个周期" };
    }
    const osc = { waveL: 1, waveR: 1, wagL: 1, wagR: 1, handsUp: 1 }[id];
    a.p(1, id, 0.3);
    const end = osc ? 1.3 + (id.startsWith("wag") ? 1 / 2.6 : id === "handsUp" ? 1 / 3 : 1 / 2.2) : 1.34;
    return { kind: "body", frames: sample(a, 1, end), note: "rest → " + id + "：0.3 s easeOutBack" + (osc ? " + 一个摆动周期" : "") };
  },
  act(who, id, dur) {
    const a = actor(who);
    if (id === "none") return { kind: "body", frames: sample(a, 1, 1), note: "无动作" };
    a.act(1, id, dur, id === "lean" ? 1 : 1);
    const pre = id === "hop" || id === "jump" ? 0.13 : 0;
    const post = id === "hop" || id === "jump" ? 0.2 : id === "lean" || id === "stepIn" ? 0.32 : 0.02;
    return { kind: "body", frames: sample(a, 1 - pre, 1 + dur + post), note: `时长 ${dur}s` + (pre ? " · 含起跳预备与落地回弹" : "") };
  },
  viseme(who, v) {
    const a = actor(who);
    const frames = [];
    for (let o = 0; o <= 9; o += 1) {
      const st = a.state(1);
      st.mouth = v;
      st.open = o / 9;
      frames.push({ i: o, t: o / 9, st, label: "开合 " + o });
    }
    return { kind: "mouth", frames, note: "开合度 0–9（来自音量包络）", static: true };
  },
  mouth(who, m) {
    const a = actor(who);
    const st = a.state(1);
    st.mouth = m;
    return { kind: "mouth", frames: [{ i: 0, t: 0, st }], static: true };
  },
  eye(who, mode) {
    const a = actor(who);
    if (mode === "blink") {
      a.blinkAt = window.RIG.Actor.prototype.blinkAt;
      const t0 = 0.9 + a.seed * 0.73;
      return { kind: "head", frames: sample(a, t0 - 0.02, t0 + 0.16), note: "眨眼 0.16 s" };
    }
    const st = a.state(1);
    st.eye = [mode, mode];
    if (mode === "n") st.lid = [0.12, 0.12];
    return { kind: "head", frames: [{ i: 0, t: 0, st }], static: true };
  },
  hand(who, hand) {
    const a = actor(who);
    a.p(0, "present", 0.01);
    const st = a.state(1);
    st.arms = [st.arms[0], [50, 30, hand, 0]];
    return { kind: "body", frames: [{ i: 0, t: 0, st }], static: true };
  },
  fx(who, id) {
    const a = actor(who);
    a.fx(0.5, id, 9);
    if (id === "excl") {
      // the "!" pops in on an expression change and leaves after 0.9 s
      a.e(1, "idle");
      return { kind: "head", frames: sample(a, 1, 1.3), note: "回弹弹出 0.25 s，0.9 s 后消失" };
    }
    const loop = { sweat: 40 / 26, steam: 1 / 0.9, anger: 0.4, sparkle: 1 / 1.8 }[id];
    if (!loop) return { kind: "head", frames: sample(a, 1.2, 1.2), static: true };
    return { kind: id === "steam" ? "body" : "head", frames: sample(a, 1.2, 1.2 + loop), note: `循环周期 ${loop.toFixed(2)} s` };
  },
  line(who, lineId) {
    const L = window.LIPSYNC[lineId];
    const a = actor(who);
    a.say(1, lineId);
    const frames = [];
    for (let f = 0; f < L.v.length; f += 1) {
      const t = 1 + (f + 0.5) / FPS;
      frames.push({ i: f, t: +(f / FPS).toFixed(3), st: a.state(t), label: "v" + L.v[f] + "·" + L.o[f] });
    }
    return { kind: "mouth", frames, note: `${L.v.length} 帧 · ${L.dur}s` };
  },
};

export const FRAME_FPS = FPS;
