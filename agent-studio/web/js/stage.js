// stage.js — the live stage. Actors are the film's rig (pure function of time) or a
// rigkit character on the same contract; bubbles, spotlights and meters are driven by
// the live engine every frame. The cast is dynamic: an agent can join mid-show — it
// first stands as a silhouette while it is generated, then steps forward.

import { h, clamp, lerp, seg, easeOutBack } from "./util.js";
import { STAGE, X } from "./plan.js";
import * as roster from "./roster.js";

const FEET_Y = 905;
const PX = 0.98; // px per rig unit at full size (the film's rig box: 420 × 640 units)
// the film's rigs: viewBox top −610 / height 640; head tops as measured on its stage
const FILM_HEAD = { rong: -572.4, hua: -477.6, pierre: -602.0 };
const STEP_ZH = { look: "形象", accent: "口音", assets: "组件", voice: "声音" };

export class Stage {
  constructor(host, cat) {
    this.cat = cat;
    this.host = host;
    this.root = h("div", { class: "stage" });
    host.appendChild(this.root);
    this.bubbles = new Map();
    this.focus = null;
    this.focusV = {};
    this.melon = 0.08;
    this.melonV = 0.08;
    this.hearts = {};
    this.heartsV = {};
    this.orbLevel = 0;
    this.orbOn = false;
    this.ag = {}; // id → { box, rig, beam, pool, plate, heart, ppu, head, pending, tag }
    this.pending = []; // ids being generated (silhouettes, not yet in STAGE)
    this.actors = {};
    this._build();
    this.reset();
    new ResizeObserver(() => this.fit()).observe(host);
    this.fit();
  }

  fit() {
    const w = this.host.clientWidth || 960;
    this.root.style.transform = `scale(${w / 1920})`;
    this.host.style.height = (1080 * w) / 1920 + "px";
  }

  ids() {
    return [...STAGE, ...this.pending.filter((w) => !STAGE.includes(w))];
  }

  _build() {
    const r = this.root, C = this.cat.characters;
    r.append(h("div", { class: "st-bg" }), h("div", { class: "st-panels" }), h("div", { class: "st-key" }));
    this.beamLayer = r.appendChild(h("div", { class: "st-layer" }));
    r.appendChild(h("div", { class: "st-floor" }));
    this.poolLayer = r.appendChild(h("div", { class: "st-layer" }));
    this.rigLayer = r.appendChild(h("div", { class: "st-layer" }));
    this.plateLayer = r.appendChild(h("div", { class: "st-layer" }));
    this.orb = h("div", { class: "orb" }, h("div", { class: "orb-ring r2" }), h("div", { class: "orb-ring" }), h("div", { class: "orb-core" }), h("div", { class: "orb-name" }, C.orb.name));
    r.appendChild(this.orb);
    this.melonEl = h("div", { class: "hud-card" }, h("small", null, "吃瓜值"), h("b", null, "8%"), h("div", { class: "bar" }, h("i")));
    r.appendChild(h("div", { class: "hud" }, this.melonEl));
    this.lower = h("div", { class: "lower" }, h("span", { class: "lab" }, "心动指数"));
    r.appendChild(this.lower);
    r.appendChild(h("div", { class: "st-vignette" }));
    this.bubLayer = h("div", { class: "bub-layer" });
    r.appendChild(this.bubLayer);
    STAGE.forEach((w) => this._make(w));
    this.relayout(false);
  }

  // the set pieces one owner needs: beam, pool, rig, name plate, heart meter
  _make(w, look) {
    if (this.ag[w]) return this.ag[w];
    const C = roster.info(w);
    const c = roster.edge(w);
    const a = { w };
    a.beam = this.beamLayer.appendChild(h("div", { class: "beam" }));
    a.pool = this.poolLayer.appendChild(h("div", { class: "pool" }));
    a.box = this.rigLayer.appendChild(h("div", { class: "rigbox", style: { "--c": c } }));
    a.rig = roster.makeRig(a.box, w, "st-" + w);
    a.plate = this.plateLayer.appendChild(h("div", { class: "plate", style: { "--c": c } }, h("i"), h("b", null, C.name), h("span", null, C.plate)));
    a.heart = h("div", { class: "it", style: { "--c": c } }, h("i"), h("span", null, C.restaurant), h("b", null, "60.0"), h("span", { class: "up" }, "▲"));
    this.lower.appendChild(a.heart);
    const k = a.rig.kit;
    a.geo = k ? { top: k.vbTop, vbH: k.vbH, head: k.headTop, k: k.scale || 1 } : { top: -610, vbH: 640, head: FILM_HEAD[w] || -560, k: 1 };
    this.ag[w] = a;
    if (this.focusV[w] == null) this.focusV[w] = 0.8;
    if (this.hearts[w] == null) {
      this.hearts[w] = { rong: 62, hua: 60.5, pierre: 58.8 }[w] || 56 + (w.charCodeAt(w.length - 1) % 5);
      this.heartsV[w] = this.hearts[w];
    }
    return a;
  }

  _drop(w) {
    const a = this.ag[w];
    if (!a) return;
    [a.beam, a.pool, a.box, a.plate, a.heart, a.tag].forEach((el) => el && el.remove());
    delete this.ag[w];
    delete this.actors[w];
  }

  // positions and sizes for the current cast; boxes glide there (CSS transitions)
  relayout(animate) {
    const ids = this.ids();
    roster.layout(ids);
    const n = ids.length;
    const sc = roster.scaleFor(n);
    const spacing = n > 1 ? X[ids[1]] - X[ids[0]] : 960;
    this.root.classList.toggle("crowd", n >= 4);
    this.root.classList.toggle("packed", n >= 6);
    this.root.style.setProperty("--pk", n <= 3 ? 1 : n === 4 ? 0.9 : n === 5 ? 0.82 : 0.74);
    this.root.classList.toggle("still", !animate);
    ids.forEach((w) => {
      const a = this.ag[w];
      if (!a) return;
      const x = X[w];
      const ppu = PX * sc * a.geo.k;
      a.ppu = ppu;
      a.headY = FEET_Y + a.geo.head * ppu;
      Object.assign(a.box.style, { width: 420 * ppu + "px", height: a.geo.vbH * ppu + "px", left: x - 210 * ppu + "px", top: FEET_Y + a.geo.top * ppu + "px" });
      const bw = Math.min(640, spacing * 1.25);
      Object.assign(a.beam.style, { left: x + "px", width: bw + "px", marginLeft: -bw / 2 + "px" });
      Object.assign(a.pool.style, { left: x + "px", width: 520 * sc + "px", marginLeft: (-520 * sc) / 2 + "px" });
      a.plate.style.left = x + "px";
      if (a.tag) Object.assign(a.tag.style, { left: x + "px", top: a.headY - 70 + "px" });
    });
    if (!animate) requestAnimationFrame(() => this.root.classList.remove("still"));
  }

  /* ------------------------------------------------------------ the cast */
  // an agent is being generated: its silhouette takes a place on the floor
  pendingAgent(id) {
    if (!this.pending.includes(id)) this.pending.push(id);
    this._drop(id);
    const a = this._make(id);
    a.pending = true;
    a.box.classList.add("pending");
    a.plate.classList.add("pending");
    a.heart.classList.add("hidden");
    a.tag = this.root.appendChild(h("div", { class: "gen-tag" }, Object.keys(STEP_ZH).map((s) => h("span", { "data-s": s }, STEP_ZH[s]))));
    const actor = new window.RIG.Actor(a.rig, { seed: 7, expr: "idle" });
    actor.look(0, 0, 0.15);
    this.actors[id] = actor;
    this.relayout(true);
    return a;
  }
  pendingStep(id, step, state) {
    const a = this.ag[id];
    if (!a || !a.tag) return;
    const el = a.tag.querySelector(`[data-s="${step}"]`);
    if (el) el.className = state;
    a.box.dataset.step = step + "-" + state;
  }
  // generation finished (STAGE already has it): light it up and let it step forward
  finalizeAgent(id, t) {
    this.pending = this.pending.filter((w) => w !== id);
    const C = roster.info(id);
    let a = this.ag[id];
    if (!a) a = this._make(id);
    a.pending = false;
    a.box.classList.remove("pending");
    a.box.classList.add("arrive");
    a.plate.classList.remove("pending");
    a.plate.querySelector("b").textContent = C.name;
    a.plate.querySelector("span").textContent = C.plate;
    a.heart.querySelector("span").textContent = C.restaurant;
    a.heart.classList.remove("hidden");
    if (a.tag) {
      a.tag.classList.add("done");
      setTimeout(() => a.tag && a.tag.remove(), 1600);
      a.tag = null;
    }
    const actor = this.actors[id] || new window.RIG.Actor(a.rig, { seed: 7, expr: "idle" });
    this.actors[id] = actor;
    actor.act(t, "jump", 0.55, 1).e(t, "star").p(t + 0.05, "waveR", 0.3).e(t + 1.5, "idle").p(t + 1.6, "rest", 0.4);
    this.relayout(true);
    setTimeout(() => a.box.classList.remove("arrive"), 1400);
  }
  cancelPending(id) {
    this.pending = this.pending.filter((w) => w !== id);
    if (!STAGE.includes(id)) this._drop(id);
    this.relayout(true);
  }
  // a stage agent was deleted
  removeAgent(id) {
    this._drop(id);
    delete this.hearts[id];
    this.relayout(true);
  }
  // add an agent that is already in STAGE (e.g. after a reload of the roster)
  addAgent(id, t) {
    if (this.ag[id]) return;
    this._make(id);
    const actor = new window.RIG.Actor(this.ag[id].rig, { seed: 7, expr: "idle" });
    actor.look(0, 0, 0.15);
    this.actors[id] = actor;
    this.relayout(true);
    if (t != null) actor.act(t, "hop", 0.35, 1);
  }

  // fresh actors (a new session); rigs and set are reused
  reset() {
    this.actors = {};
    this.ids().forEach((w, i) => {
      const a = new window.RIG.Actor(this.ag[w].rig, { seed: i * 2 + 1, expr: "idle" });
      a.look(0, 0, 0.15);
      this.actors[w] = a;
    });
    this.bubbles.forEach((b) => b.el.remove());
    this.bubbles.clear();
  }

  /* ------------------------------------------------------------ bubbles */
  openBubble(turn, t) {
    this.closeAll(t, turn.id);
    const who = turn.who;
    const C = roster.info(who);
    const kind = who === "orb" ? " orbbub" : who === "me" ? " mebub" : "";
    const el = h("div", { class: "bub" + kind, style: { "--edge": roster.edge(who), "--edge-d": roster.edgeDark(who) } });
    if (who === "orb") {
      el.style.top = "96px";
      el.style.transformOrigin = "0 30%";
    } else if (who === "me") {
      el.style.bottom = "92px";
      el.style.transformOrigin = "50% 100%";
    } else {
      const a = this.ag[who];
      el.style.bottom = 1080 - (a ? a.headY : 360) + 30 + "px";
    }
    const inner = h("div", { class: "bub-in" });
    const body = h("div", { class: "bub-body" });
    body.appendChild(h("div", { class: "bub-name" }, h("i"), C.name, who === "me" ? h("small", null, "台下") : null));
    const qs = (turn.quotes || (turn.quote ? [turn.quote] : [])).filter((q) => q && q.text);
    qs.slice(0, 3).forEach((q) => body.appendChild(h("div", { class: "bub-quote", style: { "--q": roster.edge(q.who) } }, h("b", null, roster.info(q.who).name), q.text)));
    if (qs.length > 3) body.appendChild(h("div", { class: "bub-more" }, `+${qs.length - 3} 条`));
    const dots = h("div", { class: "bub-dots" }, h("i"), h("i"), h("i"));
    const text = h("div", { class: "bub-text" });
    text.style.display = "none";
    body.append(dots, text);
    const tail = h("div", { class: "bub-tail" });
    inner.append(body, tail);
    el.appendChild(inner);
    this.bubLayer.appendChild(el);
    const tilt = who === "me" || who === "orb" ? 0 : clamp((960 - (X[who] || 960)) / 65, -8, 8);
    const b = { turn, el, inner, body, dots, text, tail, spans: [], gloss: null, tIn: t, tSpeak: null, tOut: null, L: null, last: -1, tilt, style: "normal" };
    this._fitBubble(b, (turn.src || turn.text).length > 22 || qs.length > 1);
    this.bubbles.set(turn.id, b);
    return b;
  }
  // width / position from the text that will be shown
  _fitBubble(b, wide) {
    const who = b.turn.who;
    const bw = wide ? 720 : 600;
    const ax = who === "me" ? 960 : X[who] || 960;
    const cx = who === "orb" ? 1050 + bw / 2 : clamp(ax, bw / 2 + 24, 1920 - bw / 2 - 24);
    b.el.style.width = bw + "px";
    b.el.style.left = cx - bw / 2 + "px";
    if (who !== "orb") b.tail.style.left = clamp(bw / 2 - 16 + (ax - cx), 40, bw - 80) + "px";
  }
  styleBubble(turnId, style) {
    const b = this.bubbles.get(turnId);
    if (!b) return;
    b.style = style || "normal";
    b.el.classList.toggle("shout", b.style === "shout");
  }
  // the voice starts: lay out the spoken (rewritten) text for the typewriter
  speakBubble(turnId, T, L) {
    const b = this.bubbles.get(turnId);
    if (!b) return;
    const turn = b.turn;
    const text = L.text || turn.text;
    b.text.innerHTML = "";
    b.text.className = "bub-text" + (text.length > 30 ? " long" : "");
    const hl = highlights({ text, quotes: turn.quotes || (turn.quote ? [turn.quote] : []) });
    b.spans = [];
    for (let i = 0; i < text.length; i += 1) {
      const s = h("span", hl[i] ? { class: "h" } : null, text.charAt(i));
      s.style.opacity = "0";
      b.text.appendChild(s);
      b.spans.push(s);
    }
    if (turn.gloss) {
      b.gloss = h("div", { class: "bub-gloss" }, turn.gloss);
      b.gloss.style.opacity = "0";
      b.body.appendChild(b.gloss);
    }
    this._fitBubble(b, !!turn.gloss || text.length > 22 || (turn.quotes || []).length > 1);
    b.last = -1;
    b.tSpeak = T;
    b.L = L;
  }
  closeBubble(turnId, t) {
    const b = this.bubbles.get(turnId);
    if (b && (b.tOut == null || b.tOut > t)) b.tOut = t;
  }
  closeAll(t, except) {
    this.bubbles.forEach((b, id) => id !== except && this.closeBubble(id, t));
  }

  /* ------------------------------------------------------------ render */
  render(t, dt) {
    const k = 1 - Math.exp(-(dt || 0.016) * 6);
    const ids = this.ids();
    ids.forEach((w) => this.actors[w] && this.actors[w].render(t));
    // spotlights follow the speaker; when the customer talks every owner stays lit
    ids.forEach((w) => {
      const a = this.ag[w];
      if (!a) return;
      const f = this.focus;
      const target = a.pending ? 0.5 : f ? (f === w ? 1 : f === "orb" ? 0.6 : f === "me" ? 0.74 : 0.42) : 0.8;
      const v = (this.focusV[w] = lerp(this.focusV[w] == null ? 0.8 : this.focusV[w], target, k));
      a.beam.style.opacity = v.toFixed(3);
      a.pool.style.opacity = v.toFixed(3);
      if (!a.pending) a.box.style.filter = `brightness(${(0.7 + 0.3 * v).toFixed(3)})`;
    });
    // host orb breathes, pulses with its voice
    const pulse = this.orbOn ? this.orbLevel : 0;
    this.orb.style.opacity = this.orbOn ? "1" : "0.38";
    this.orb.lastChild.style.opacity = this.orbOn ? "1" : "0";
    this.orb.children[2].style.transform = `scale(${(1 + 0.035 * Math.sin(t * 2.1) + 0.2 * pulse).toFixed(3)})`;
    this.orb.children[1].style.transform = `scale(${(1.04 + 0.28 * pulse + 0.03 * Math.sin(t * 2.6)).toFixed(3)})`;
    this.orb.children[0].style.transform = `scale(${(1 + 0.05 * Math.sin(t * 1.3) + 0.12 * pulse).toFixed(3)})`;
    // meters ease toward their targets
    this.melonV = lerp(this.melonV, this.melon, k);
    this.melonEl.querySelector("b").textContent = Math.round(clamp(this.melonV, 0, 1) * 100) + "%";
    this.melonEl.querySelector(".bar i").style.transform = `scaleX(${clamp(this.melonV, 0, 1).toFixed(3)})`;
    STAGE.forEach((w) => {
      const a = this.ag[w];
      if (!a || this.hearts[w] == null) return;
      const prev = this.heartsV[w] == null ? this.hearts[w] : this.heartsV[w];
      this.heartsV[w] = lerp(prev, this.hearts[w], k);
      const el = a.heart;
      el.children[2].textContent = this.heartsV[w].toFixed(1);
      const d = this.hearts[w] - this.heartsV[w];
      if (Math.abs(d) > 0.05) {
        el.children[3].textContent = d > 0 ? "▲" : "▼";
        el.children[3].className = d > 0 ? "up" : "dn";
      }
    });
    // bubbles
    this.bubbles.forEach((b, id) => {
      if (b.tOut != null && t > b.tOut + 0.3) {
        b.el.remove();
        this.bubbles.delete(id);
        return;
      }
      const inK = seg(t, b.tIn, b.tIn + 0.45);
      const outK = b.tOut != null ? seg(t, b.tOut, b.tOut + 0.25) : 0;
      const ki = easeOutBack(inK);
      const sc = lerp(0.6, 1, ki) * lerp(1, 0.94, outK);
      const rx = lerp(-40, 4, ki), ry = lerp(b.tilt * 1.6, b.tilt * 0.6, ki);
      const y = lerp(36, 0, ki) - 28 * outK;
      b.el.style.transform = `perspective(1000px) translateY(${y.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      b.el.style.opacity = (Math.min(1, inK * 2.2) * (1 - outK)).toFixed(3);
      const fy = Math.sin((t - b.tIn) * 2.2) * 4;
      const fx = b.style === "shaky" ? Math.sin(t * 58) * 2.4 : 0;
      b.inner.style.transform = `translate(${fx.toFixed(2)}px,${fy.toFixed(2)}px)`;
      const speaking = b.tSpeak != null && t >= b.tSpeak - 0.05;
      b.dots.style.display = speaking ? "none" : "";
      b.text.style.display = speaking ? "" : "none";
      if (!speaking) {
        const ph = t * 5;
        [...b.dots.children].forEach((d, i) => (d.style.opacity = (0.35 + 0.65 * Math.max(0, Math.sin(ph - i * 0.9))).toFixed(2)));
        return;
      }
      if (b.gloss) b.gloss.style.opacity = seg(t, b.tSpeak + 0.2, b.tSpeak + 0.5).toFixed(2);
      const ct = b.L ? b.L.ct : [];
      let n = 0;
      for (let j = 0; j < b.spans.length; j += 1) {
        const c = ct[j];
        if (c != null && t >= b.tSpeak + c - 0.06) n = j + 1;
        else break;
      }
      if (n !== b.last) {
        b.last = n;
        b.spans.forEach((s, q) => (s.style.opacity = q < n ? "1" : "0"));
      }
    });
  }
}

// prices / numbers, and the words a reply shares with any line it answers
function highlights(turn) {
  const marks = new Array(turn.text.length).fill(false);
  const words = [];
  (turn.text.match(/(人均)?[0-9一二三四五六七八九十百千两]+[块元个道分公里钟]*/g) || []).forEach((n) => n.length >= 2 && words.push(n));
  (turn.quotes || []).forEach((q) => {
    if (!q || !q.text) return;
    for (let i = 0; i + 1 < turn.text.length; i += 1) {
      const bi = turn.text.substr(i, 2);
      if (/[一-鿿]{2}/.test(bi) && q.text.includes(bi) && !/[我你他她的了是]/.test(bi)) words.push(bi);
    }
  });
  words.forEach((w) => {
    let i = turn.text.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k += 1) marks[k] = true;
      i = turn.text.indexOf(w, i + w.length);
    }
  });
  return marks;
}
