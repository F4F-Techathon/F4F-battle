// library.js — the asset library. The landing page shows the generic templates first
// (six bodies by gender × height, eight voice timbres that speak every accent), then
// the film's three owners, then the agents generated from shops. Every one of them
// opens into the same asset categories — expressions, gestures, acts, mouths, eyes and
// hands, fx, voice — as specimen cards that play themselves; a card opens a drawer
// with a large live rig, play / pause / speed and its parameters.

import { h, api, bus, download, toCSV } from "./util.js";
import { icon, iconEl, faceEl } from "./icons.js";
import * as frames from "./frames.js";
import { GROUP } from "./plan.js";
import * as roster from "./roster.js";
import { BODIES, HAIRS, OUTFITS, HATS, SKINS, createKitRig } from "./rigkit.js";
import { drawVisemes } from "./visemes.js";

const FILM = ["rong", "hua", "pierre"];
const CONCEPT = { rong: "02-sichuan-turnaround-v02.png", hua: "03-cantonese-turnaround-v01.png", pierre: "04-french-turnaround-v01.png" };
const REF = { rong: "sichuan-front.png", hua: "cantonese-front.png", pierre: "french-front.png" };
const SHARED = [["expr", "表情"], ["pose", "手势"], ["act", "动作"], ["mouth", "口型"], ["eye", "眼睛与手型"], ["fx", "特效"]];
const CATS = {
  film: [["profile", "角色"], ...SHARED, ["voice", "声音"], ["lines", "台词"], ["3d", "3D"]],
  template: [["parts", "部件"], ...SHARED, ["voice", "音色"]],
  agent: [["dossier", "档案"], ...SHARED, ["voice", "声音"]],
};
const SAMPLE = "您好，欢迎光临！今天的招牌菜特别新鲜，快坐下来尝一尝吧。";
const STEP_ZH = { look: "形象", accent: "口音", assets: "组件", voice: "声音" };
const PART_ZH = Object.fromEntries([...HAIRS.female, ...HAIRS.male, ...OUTFITS, ...HATS]);

/* one 30 fps clock for every visible card */
class Animator {
  constructor() {
    this.items = new Set();
    setInterval(() => this.items.forEach((it) => it.step()), 1000 / 30);
  }
}
const animator = new Animator();

// frames → a looping image; transitions ping-pong with holds, cycles loop
function player(img, urls, mode) {
  let i = 0;
  const n = urls.length;
  const seq = [];
  if (n <= 1) seq.push(0);
  else if (mode === "loop") for (let k = 0; k < n; k += 1) seq.push(k);
  else {
    for (let k = 0; k < 8; k += 1) seq.push(0);
    for (let k = 0; k < n; k += 1) seq.push(k);
    for (let k = 0; k < 26; k += 1) seq.push(n - 1);
    for (let k = n - 1; k >= 0; k -= 1) seq.push(k);
  }
  let last = -1;
  return {
    step() {
      const f = seq[i % seq.length];
      i += 1;
      if (f !== last) {
        img.src = urls[f];
        last = f;
      }
    },
  };
}

// a one-off look (a part variant) rendered once to an image
function renderLook(look, kind, expr, pose) {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-4000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none";
  document.body.appendChild(box);
  const rig = createKitRig(box, look, "pv" + Math.random().toString(36).slice(2, 8));
  rig.svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const a = new window.RIG.Actor(rig, { seed: 0, expr: "idle" });
  a.blinkAt = () => 0;
  a.e(0.2, expr || "pitch");
  if (pose) a.p(0.2, pose, 0.2);
  rig.render(a.state(2));
  const k = rig.kit;
  const vb = kind === "head" ? `-180 ${k.headOrigin - 310} 360 360` : `-235 -720 470 740`;
  rig.svg.setAttribute("viewBox", vb);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(rig.svg)], { type: "image/svg+xml" }));
  box.remove();
  return url;
}

export class Library {
  constructor(root, cat, dialect, manifest, live) {
    this.cat = cat;
    this.dialect = dialect;
    this.manifest = manifest;
    this.live = live;
    this.who = null;
    this.catId = null;
    this.urls = [];
    this.queue = [];
    this.timbres = null;
    this.io = new IntersectionObserver((es) => es.forEach((e) => this._vis(e.target, e.isIntersecting)), { rootMargin: "200px" });
    this.rail = h("aside", { class: "rail" });
    this.main = h("div", { class: "lib-main" });
    root.append(this.rail, this.main);
    this._drawer();
    bus.on((ev) => ev.type === "roster.change" && this._rosterChanged(ev.payload));
  }

  _rosterChanged(p) {
    if (p.op === "remove" && this.who === p.id) return this.overview();
    if (this.catId === "overview") return this.overview();
    this._rail();
  }

  /* ------------------------------------------------------------ rail */
  _rail() {
    const r = this.rail;
    r.innerHTML = "";
    const ent = (w, sub) => {
      const C = roster.info(w);
      return h("button", { class: this.who === w ? "on" : "", style: { "--c": roster.edge(w) }, onclick: () => this.show(w) },
        faceEl(w, C.defaults ? C.defaults.expr : "idle", 34), h("span", null, h("b", null, C.name), h("small", null, sub || C.restaurant)));
    };
    r.appendChild(h("button", { class: "ovbtn" + (this.catId === "overview" ? " on" : ""), onclick: () => this.overview() }, iconEl("grid"), "总览"));
    r.appendChild(h("div", null, h("h4", null, "通用模板"), h("div", { class: "chars" }, BODIES.map((b) => ent("body:" + b.id, b.gender === "female" ? "女 · 形象模板" : "男 · 形象模板")))));
    r.appendChild(h("div", null, h("h4", null, "原片角色"), h("div", { class: "chars" }, FILM.map((w) => ent(w)))));
    const ags = roster.agents();
    r.appendChild(h("div", null, h("h4", null, `生成的 agent · ${ags.length}`), ags.length ? h("div", { class: "chars" }, ags.map((a) => ent(a.id))) : h("div", { class: "dim rail-empty" }, "在演播页点「+」添加店铺")));
    if (this.who) {
      this.catBtns = {};
      const cats = h("div", { class: "cats" });
      CATS[this._kind()].forEach(([id, zh]) => {
        const b = h("button", { class: id === this.catId ? "on" : "", onclick: () => this.show(this.who, id) }, zh, h("span", { class: "n" }));
        this.catBtns[id] = b;
        cats.appendChild(b);
      });
      r.appendChild(h("div", null, h("h4", null, "资产"), cats));
      r.appendChild(h("div", { class: "exp" },
        h("button", { class: "btn sm ghost", onclick: () => this.exportJSON() }, iconEl("download"), "JSON"),
        h("button", { class: "btn sm ghost", onclick: () => this.exportCSV() }, iconEl("download"), "CSV")));
      this._counts();
    }
  }
  _kind() {
    return roster.kind(this.who) === "film" ? "film" : roster.kind(this.who) === "template" ? "template" : "agent";
  }
  _counts() {
    const c = this.cat;
    const L = Object.entries(window.LIPSYNC).filter(([id, x]) => x.who === this.who && /^[A-Z]\d/.test(id)).length;
    const n = { profile: "", parts: "", dossier: "", expr: c.expressions.length, pose: c.poses.length, act: c.acts.length - 1, mouth: c.visemes.length + c.mouths.length,
      eye: c.eyes.length + 1 + c.hands.length, fx: c.fx.length, voice: this._kind() === "template" ? 4 : this._kind() === "film" ? 3 : 1, lines: L, "3d": 1 };
    Object.entries(this.catBtns || {}).forEach(([id, b]) => (b.querySelector(".n").textContent = n[id]));
  }

  _reset() {
    this.io.disconnect();
    animator.items.clear();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    this.queue = [];
    this.main.innerHTML = "";
    this.main.scrollTop = 0;
    this.closeDrawer();
  }

  /* ------------------------------------------------------------ overview */
  overview() {
    this._reset();
    this.who = null;
    this.catId = "overview";
    this._rail();
    const m = this.main;
    m.appendChild(h("div", { class: "lib-h" }, h("h1", null, "资产")));
    // 1 · generic look templates: by gender, short → tall
    const tpl = h("section", { class: "lib-sec" }, h("h2", null, "通用模板 · 形象", h("small", null, "6 种体型 · 4 发型 · 4 服装 · 4 帽子 · 配饰 · 胸牌 logo · 主题色 —— 表情、手势、动作、口型、特效沿用原片 rig")));
    ["female", "male"].forEach((g) => {
      const row = h("div", { class: "tpl-row" }, h("div", { class: "tpl-g" }, g === "female" ? "女" : "男"));
      BODIES.filter((b) => b.gender === g).forEach((b) => {
        const id = "body:" + b.id;
        this._card(row, { who: id, type: "showcase", id: b.id, zh: b.zh, kind: "body", sub: { short: "矮 / 娇小", regular: "标准", tall: "高" }[b.height] + " · 腿长 " + b.lext,
          mode: "pingpong", recipe: () => showcase(id), onclick: () => this.show(id, "parts") });
      });
      tpl.appendChild(row);
    });
    m.appendChild(tpl);
    // 2 · voice timbres × every accent
    const vs = h("div", { class: "voice-grid" }, h("div", { class: "dim" }, "载入音色…"));
    m.appendChild(h("section", { class: "lib-sec" }, h("h2", null, "通用模板 · 音色", h("small", null, "8 种音色 × 27 种口音：方言用 CosyVoice3 指令，外国口音先让音色说一句该国语言再作提示音")), vs));
    this._voiceTemplates(vs, null);
    // 3 · the film's owners
    const film = h("div", { class: "agent-grid" });
    FILM.forEach((w) => film.appendChild(this._entityCard(w)));
    m.appendChild(h("section", { class: "lib-sec" }, h("h2", null, "原片角色", h("small", null, "手绘 rig · 原片配音参考")), film));
    // 4 · generated agents
    const ags = roster.agents();
    const gen = h("div", { class: "agent-grid" });
    ags.forEach((a) => gen.appendChild(this._entityCard(a.id)));
    if (!ags.length) gen.appendChild(h("div", { class: "empty-card" }, iconEl("plus"), h("b", null, "还没有生成的 agent"), h("span", null, "在演播页点「+ 添加店铺」，输入店铺信息和 logo")));
    m.appendChild(h("section", { class: "lib-sec" }, h("h2", null, `生成的 agent · ${ags.length}`, h("small", null, "店铺信息 + logo → Jev 决定形象 → 口音 → 组件 → 声音")), gen));
  }

  _entityCard(w) {
    const C = roster.info(w);
    const lang = this.cat.languages.find((l) => l.id === C.language);
    const v = C.voice || {};
    return h("button", { class: "ent-card", style: { "--c": roster.edge(w) }, onclick: () => this.show(w) },
      h("div", { class: "ent-av" }, faceEl(w, (C.defaults || {}).expr || "idle", 64, C.name), C.logo ? h("img", { class: "badge-logo", src: C.logo, alt: "" }) : null),
      h("div", { class: "ent-meta" }, h("b", null, C.name), h("small", null, C.restaurant + (C.plate ? " · " + C.plate.split(" · ").slice(0, 1).join("") : "")),
        h("div", { class: "tags" }, lang ? h("span", null, lang.zh) : null, v.timbre ? h("span", null, (this.timbres || []).find((t) => t.id === v.timbre)?.zh || v.timbre) : C.voiceDesc ? h("span", null, C.voiceDesc.split(" · ").slice(-1)[0]) : null)));
  }

  async _timbres() {
    if (!this.timbres) {
      try {
        this.timbres = (await api("/api/voices")).timbres;
      } catch (e) {
        this.timbres = [];
      }
    }
    return this.timbres;
  }
  // timbre cards: the template clip, and any accent synthesised on demand
  async _voiceTemplates(host, gender) {
    const list = (await this._timbres()).filter((t) => !gender || t.gender === gender);
    host.innerHTML = "";
    const langs = this.cat.languages.filter((l) => l.id !== "fr");
    const audio = this._audio || (this._audio = new Audio());
    list.forEach((t) => {
      const sel = h("select", null, langs.map((l) => h("option", { value: l.id }, l.zh)));
      const out = h("div", { class: "vc-out dim" }, t.ready ? "模板已就绪" : "模板生成中");
      const play = (url, label) => {
        audio.src = url;
        audio.play().catch(() => {});
        out.textContent = label;
      };
      const go = h("button", { class: "btn sm", onclick: async () => {
        go.disabled = true;
        const l = sel.value;
        const lz = langs.find((x) => x.id === l);
        out.textContent = lz.cosy.accent ? `合成中…（首次用 ${lz.langName || lz.cosy.accent} 口音要先生成提示音）` : "合成中…";
        try {
          const r = await api("/api/tts", { who: "tpl:" + t.id, text: SAMPLE, lang: l });
          play(r.url, `${lz.zh} · ${r.lipsync.dur}s · ${r.cached ? "缓存" : r.gen_secs + "s 生成"}`);
        } catch (e) {
          out.textContent = e.message;
        }
        go.disabled = false;
      } }, iconEl("mic"), "试听口音");
      host.appendChild(h("div", { class: "vcard tvc", style: { "--c": t.gender === "female" ? "#E58BA6" : "#6FA8DC" } },
        h("div", { class: "vc-h" }, h("button", { class: "iconbtn", title: "播放音色模板", html: icon("play"), onclick: () => play(t.url, "音色模板 · 普通话") }),
          h("div", null, h("b", null, t.zh), h("small", { class: "mono" }, "tpl:" + t.id))),
        h("div", { class: "keyrow" }, sel, go), out));
    });
  }

  /* ------------------------------------------------------------ an entity */
  show(who, catId) {
    this._reset();
    this.who = who;
    const kind = this._kind();
    this.catId = catId && CATS[kind].some((c) => c[0] === catId) ? catId : CATS[kind][0][0];
    this._rail();
    const C = roster.info(who);
    const title = CATS[kind].find((c) => c[0] === this.catId)[1];
    this.main.appendChild(h("div", { class: "lib-h" }, h("h1", null, title), h("span", { class: "who-chip", style: { "--c": roster.edge(who) } }, faceEl(who, "idle", 22), C.fullName || C.name)));
    ({ profile: this._profile, parts: this._parts, dossier: this._dossier, expr: this._expr, pose: this._pose, act: this._act, mouth: this._mouth, eye: this._eye, fx: this._fx, voice: this._voice, lines: this._lines, "3d": this._3d })[this.catId].call(this);
  }

  /* ------------------------------------------------------------ cards */
  _grid(title) {
    const g = h("div", { class: "grid" });
    this.main.appendChild(title ? h("section", { class: "lib-sec" }, h("h2", null, title), g) : g);
    return g;
  }
  _card(grid, o) {
    const img = h("img", { alt: o.zh });
    const vis = h("div", { class: "vis " + o.kind }, o.badge ? h("span", { class: "badge" }, o.badge) : null, img);
    const card = h("div", { class: "spec-card" + (o.type === "showcase" ? " showcase" : ""), onclick: () => (o.onclick ? o.onclick() : this.detail(o, card)) },
      vis, h("div", { class: "ft" }, h("b", null, o.group ? h("i", { class: "dot", style: { background: GROUP[o.group] || "#8A93A6" } }) : null, o.zh), h("code", null, o.sub || o.id)));
    card._o = o;
    card._img = img;
    grid.appendChild(card);
    this.io.observe(card);
    return card;
  }
  _vis(card, on) {
    if (!on) {
      if (card._play) animator.items.delete(card._play);
      return;
    }
    if (card._play) return animator.items.add(card._play);
    if (card._queued) return;
    card._queued = true;
    this.queue.push(card);
    this._drain();
  }
  // render frames a few cards at a time so scrolling stays smooth
  _drain() {
    if (this._draining) return;
    this._draining = true;
    const run = () => {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < 24) {
        const card = this.queue.shift();
        if (!card.isConnected) continue;
        const o = card._o;
        if (o.static) {
          const u = typeof o.static === "function" ? o.static() : o.static;
          this.urls.push(u);
          card._img.src = u;
          continue;
        }
        const r = o.recipe();
        const who = o.who || this.who;
        const urls = r.frames.map((f) => {
          const u = frames.snapshot(who, f.st, r.kind);
          this.urls.push(u);
          return u;
        });
        card._img.src = urls[urls.length - 1];
        card._play = player(card._img, urls, o.mode || "pingpong");
        animator.items.add(card._play);
      }
      if (this.queue.length) requestAnimationFrame(run);
      else this._draining = false;
    };
    requestAnimationFrame(run);
  }

  _expr() {
    const g = this._grid();
    this.cat.expressions.forEach((e) => this._card(g, { type: "expr", id: e.id, zh: e.zh, group: e.group, kind: "head", src: e, recipe: () => frames.recipe.expr(this.who, e.id) }));
  }
  _pose() {
    const osc = { waveL: 1, waveR: 1, wagL: 1, wagR: 1, handsUp: 1, run: 1 };
    const g = this._grid();
    this.cat.poses.forEach((p) => this._card(g, { type: "pose", id: p.id, zh: p.zh, kind: "body", src: p, mode: osc[p.id] && p.id === "run" ? "loop" : "pingpong", recipe: () => frames.recipe.pose(this.who, p.id) }));
  }
  _act() {
    const g = this._grid();
    this.cat.acts.filter((a) => a.id !== "none").forEach((a) => this._card(g, { type: "act", id: a.id, zh: a.zh, kind: "body", badge: a.dur + "s", src: a, mode: "loop", recipe: () => frames.recipe.act(this.who, a.id, a.dur) }));
  }
  _mouth() {
    const g1 = this._grid("说话口型");
    this.cat.visemes.forEach((v) => this._card(g1, { type: "viseme", id: v.id, zh: v.zh, kind: "mouth", src: v, recipe: () => frames.recipe.viseme(this.who, v.id) }));
    const g2 = this._grid("静态嘴形");
    this.cat.mouths.forEach((m) => this._card(g2, { type: "mouth", id: m.id, zh: m.zh, kind: "mouth", src: m, recipe: () => frames.recipe.mouth(this.who, m.id) }));
  }
  _eye() {
    const g1 = this._grid("眼睛");
    [...this.cat.eyes, { id: "blink", zh: "眨眼", desc: "固定节奏眨眼，上眼皮 0.16 s 合上再睁开。", expr: ["常态眼时自动"] }].forEach((e) =>
      this._card(g1, { type: "eye", id: e.id, zh: e.zh, kind: "head", src: e, mode: "loop", recipe: () => frames.recipe.eye(this.who, e.id) }));
    const g2 = this._grid("手型");
    this.cat.hands.forEach((x) => this._card(g2, { type: "hand", id: x.id, zh: x.zh, kind: "body", src: x, recipe: () => frames.recipe.hand(this.who, x.id) }));
  }
  _fx() {
    const g = this._grid();
    this.cat.fx.forEach((x) => this._card(g, { type: "fx", id: x.id, zh: x.zh, kind: x.id === "steam" ? "body" : "head", src: x, mode: "loop", recipe: () => frames.recipe.fx(this.who, x.id) }));
  }

  // a large live rig cycling a few faces and poses
  _stagelet(who, seq) {
    const box = h("div", { class: "rbox" });
    const stagelet = h("div", { class: "stagelet" }, box);
    const rig = roster.makeRig(box, who, "prof-" + who);
    const a = new window.RIG.Actor(rig, { seed: 1, expr: "idle" });
    seq.forEach(([e, p], i) => a.e(0.6 + i * 1.7, e).p(0.6 + i * 1.7, p, 0.3));
    const period = 0.6 + seq.length * 1.7;
    const t0 = performance.now();
    const loop = () => {
      if (!box.isConnected) return;
      a.render(((performance.now() - t0) / 1000) % period);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return { stagelet, rig };
  }

  _profile() {
    const C = this.cat.characters[this.who], sp = window.RIG.SPECS[this.who];
    const { stagelet } = this._stagelet(this.who, [[C.defaults.expr, "hipR"], ["listen", "rest"], ["laugh", "belly"], ["shock", "rest"], ["smug", "hip"], ["idle", "rest"]]);
    const colors = Object.entries(sp).filter(([, v]) => typeof v === "string" && v.startsWith("#"));
    const fact = (k, v) => h("div", { class: "fact" }, h("small", null, k), h("div", null, v));
    this.main.appendChild(h("div", { class: "profile" }, stagelet,
      h("div", { class: "facts" },
        fact("餐馆", C.fullName + " · " + C.plate), fact("人设", C.persona), fact("造型", C.look), fact("招牌动作", C.signature),
        fact("声音", C.voiceDesc), fact("3D 编号", C.actorId),
        h("div", { class: "fact", style: { gridColumn: "1 / -1" } }, h("small", null, "色板"), h("div", { class: "swatches" }, colors.map(([k, v]) => h("span", { class: "sw", title: k }, h("i", { style: { background: v } }), v)))))));
    this.main.appendChild(h("div", { class: "refs" },
      h("figure", null, h("img", { src: "/docs-assets/concepts/" + CONCEPT[this.who], loading: "lazy" }), h("figcaption", null, "设定图")),
      h("figure", null, h("img", { src: "/lab/references/" + REF[this.who], loading: "lazy" }), h("figcaption", null, "建模参考"))));
  }

  // a template's interchangeable parts, each drawn on this body
  _parts() {
    const look = roster.lookOf(this.who);
    const b = BODIES.find((x) => x.id === look.body);
    const { stagelet } = this._stagelet(this.who, [["pitch", "thumbR"], ["listen", "rest"], ["laugh", "belly"], ["shock", "rest"], ["proud", "present"], ["idle", "rest"]]);
    const fact = (k, v) => h("div", { class: "fact" }, h("small", null, k), h("div", null, v));
    this.main.appendChild(h("div", { class: "profile" }, stagelet, h("div", { class: "facts" },
      fact("体型", `${b.zh} · ${b.gender === "female" ? "女" : "男"} · ${{ short: "矮", regular: "标准", tall: "高" }[b.height]}`),
      fact("骨架参数", `腿长 lext ${b.lext} · 躯干宽 W ${b.W} · 肩宽 ${b.shoulder} · 腿粗 ${b.legW} · 舞台缩放 ${b.scale}${b.round ? " · 圆身" : ""}`),
      fact("可换部件", `发型 ${HAIRS[b.gender].length} · 服装 ${OUTFITS.length} · 帽子 ${HATS.length} · 配饰 ${b.gender === "female" ? "眼镜 / 耳环" : "眼镜 / 小胡子"} · 肤色 ${SKINS.length}`),
      fact("由店铺决定", "主题色（logo 主色，或 Jev 从色板里选）、胸牌（直接印店铺 logo）、发色、年龄（老年自动灰发、皱纹）"),
      fact("沿用原片", `${this.cat.expressions.length} 表情 · ${this.cat.poses.length} 姿势 · ${this.cat.acts.length - 1} 动作 · ${this.cat.visemes.length} 口型 · ${this.cat.fx.length} 特效：同一个 RIG.Actor 驱动`))));
    const variant = (title, items, kind) => {
      const g = this._grid(title);
      items.forEach(([zh, lk, sub]) => this._card(g, { type: "part", id: zh, zh, sub, kind, static: () => renderLook({ ...look, ...lk }, kind, "pitch"), onclick: () => {} }));
    };
    variant("发型", HAIRS[b.gender].map(([id, zh]) => [zh, { hair: id, hat: "none" }, id]), "head");
    variant("服装", OUTFITS.map(([id, zh]) => [zh.split(" + ")[0], { outfit: id }, id]), "body");
    variant("帽子", HATS.map(([id, zh]) => [zh, { hat: id }, id]), "head");
    variant("配饰 · 年龄", [["眼镜", { accessories: ["glasses"] }, "glasses"], b.gender === "female" ? ["耳环", { accessories: ["earrings"] }, "earrings"] : ["小胡子", { accessories: ["mustache"] }, "mustache"],
      ["老年", { age: "old" }, "age: old"], ["胸牌印 logo", { badgeText: "湘", theme: "#C9483E" }, "badge"]], "head");
    variant("主题色", [["中国红", "#C9483E"], ["玉石绿", "#2F6E62"], ["藏青", "#2D3E6B"], ["姜黄", "#D8A93B"], ["梅子紫", "#7A5A9E"], ["橙", "#D9822B"]].map(([zh, c]) => [zh, { theme: c }, c]), "body");
  }

  // a generated agent: its rig, the shop it came from, and every Jev decision behind it
  _dossier() {
    const C = roster.info(this.who);
    const d = C.defaults || {};
    const { stagelet } = this._stagelet(this.who, [[d.expr || "pitch", "thumbR"], ["listen", "rest"], [C.punch || "laugh", "present"], [d.reaction || "smug", "hip"], ["idle", "rest"]]);
    const fact = (k, v, wide) => h("div", { class: "fact", style: wide ? { gridColumn: "1 / -1" } : null }, h("small", null, k), h("div", null, v));
    const lang = this.cat.languages.find((l) => l.id === C.language) || {};
    const greet = h("button", { class: "btn sm", onclick: async () => {
      greet.disabled = true;
      try {
        const r = await api("/api/tts", { who: this.who, text: C.greeting, lang: C.language });
        const au = this._audio || (this._audio = new Audio());
        au.src = r.url;
        au.play().catch(() => {});
      } catch (e) {
        greet.textContent = e.message;
      }
      greet.disabled = false;
    } }, iconEl("play"), "听开场白");
    const del = h("button", { class: "btn sm ghost danger", onclick: async () => {
      if (!del.classList.contains("armed")) {
        del.classList.add("armed");
        del.lastChild.textContent = "再点一次删除";
        return;
      }
      try {
        await api("/api/agents/" + this.who, null, "DELETE");
        roster.remove(this.who);
      } catch (e) {
        del.lastChild.textContent = e.message;
      }
    } }, iconEl("trash"), h("span", null, "删除 agent"));
    const shop = C.shop || {};
    this.main.appendChild(h("div", { class: "profile" }, h("div", null, stagelet, C.logo ? h("div", { class: "logo-strip" }, h("img", { src: C.logo, alt: "logo" }), h("span", null, "胸牌 logo"), h("i", { style: { background: (C.rig || {}).theme } })) : null),
      h("div", { class: "facts" },
        fact("店铺", [C.restaurant, C.plate].filter(Boolean).join(" · ")),
        fact("人设", C.persona), fact("造型", C.look), fact("招牌", C.signature),
        fact("口音", `${lang.zh || C.language} · ${lang.region || ""}`), fact("声音", `${C.voiceDesc} · 语速 ${(C.voice || {}).speed}×`),
        fact("开场白", h("span", null, C.greeting, " ", greet), true),
        fact("店铺原文", Object.entries(shop).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}: ${v}`).join("\n"), true),
        h("div", { class: "fact-actions" }, del))));
    // the four Jev steps
    const sec = h("section", { class: "lib-sec" }, h("h2", null, "生成决策", h("small", null, "每一步一次 Jev 请求，状态里带着前几步的结果")));
    const grid = h("div", { class: "dec-grid" });
    Object.entries(C.decisions || {}).forEach(([step, D]) => {
      const card = h("div", { class: "dec-card" }, h("div", { class: "dc-h" }, h("b", null, STEP_ZH[step] || step), h("span", { class: "srcbadge " + (D.source === "jev" ? "jev" : "baseline") }, D.source === "jev" ? "Jev" : "规则"),
        h("span", { class: "dim mono" }, (D.ms != null ? D.ms + " ms" : "") + (D.model ? " · " + D.model : ""))));
      if (D.note) card.appendChild(h("div", { class: "note" }, D.note));
      Object.entries(D.answers || {}).forEach(([k, a]) => {
        const row = h("div", { class: "dc-q" }, h("span", { class: "lab" }, k));
        if (a.type === "noul") row.append(h("span", { class: "val" }, (a.noul >= 0.5 ? "是" : "否") + " · " + Math.round(a.noul * 100) + "%"));
        else if (a.type === "score") row.append(h("span", { class: "val" }, a.score != null ? a.score.toFixed(2) : "—"));
        else {
          const ps = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 3);
          row.append(h("span", { class: "val" }, ps.map(([id, p], i) => h("span", { class: i ? "alt" : "" }, `${PART_ZH[id] ? PART_ZH[id].split(" + ")[0].split("：")[0] : id} ${Math.round(p * 100)}%`))));
        }
        card.appendChild(row);
      });
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    this.main.appendChild(sec);
  }

  _voice() {
    const kind = this._kind();
    if (kind === "template") {
      const b = BODIES.find((x) => "body:" + x.id === this.who);
      const host = h("div", { class: "voice-grid" });
      this.main.appendChild(h("p", { class: "lib-sub" }, "同性别的 4 种音色模板。选一种口音试听：方言走 CosyVoice3 指令，外国口音用该音色先说一句外语作提示音。"));
      this.main.appendChild(host);
      return this._voiceTemplates(host, b.gender);
    }
    if (kind === "agent") return this._agentVoice();
    const C = this.cat.characters[this.who], V = this.dialect.voices[this.who];
    const lang = this.cat.languages.find((l) => l.id === C.language);
    const dl = (o) => h("dl", null, Object.entries(o).flatMap(([k, v]) => [h("dt", null, k), h("dd", null, String(v))]));
    const { box, txt } = this._synthBox(this.who, C.language);
    this.main.appendChild(h("div", { class: "voices" },
      h("div", { class: "vcard hl" }, h("h3", null, "Fun-CosyVoice3-0.5B", h("span", { class: "lic" }, "Apache-2.0 · 本机")),
        dl({ 方式: lang ? lang.cosy.mode : "", 指令: (lang && lang.cosy.instruct) || "—", 语速: V.cosy.speed, 参考音色: "ref_" + this.who + ".wav" }),
        h("audio", { controls: true, preload: "none", src: "/film/renders/voice-test/omni/ref_" + this.who + ".wav" }), box),
      h("div", { class: "vcard" }, h("h3", null, "OmniVoice", h("span", { class: "lic" }, "CC-BY-NC")), dl(V.omni)),
      h("div", { class: "vcard" }, h("h3", null, "Qwen3-TTS-Flash", h("span", { class: "lic" }, "云服务")), dl(V.qwen))));
    txt.value = "";
  }
  async _agentVoice() {
    const C = roster.info(this.who), v = C.voice || {};
    const lang = this.cat.languages.find((l) => l.id === C.language) || {};
    const t = (await this._timbres()).find((x) => x.id === v.timbre) || {};
    const dl = (o) => h("dl", null, Object.entries(o).flatMap(([k, val]) => [h("dt", null, k), h("dd", null, String(val))]));
    const { box, txt } = this._synthBox(this.who, C.language);
    txt.value = C.greeting || "";
    this.main.appendChild(h("div", { class: "voices" },
      h("div", { class: "vcard hl" }, h("h3", null, "Fun-CosyVoice3-0.5B", h("span", { class: "lic" }, "本机")),
        dl({ 音色模板: `${t.zh || v.timbre}（tpl:${v.timbre}）`, 口音: lang.zh, 方式: lang.cosy ? lang.cosy.mode + (lang.cosy.accent ? " · " + lang.cosy.accent + " 提示音" : "") : "", 指令: (lang.cosy && lang.cosy.instruct) || "—", 语速: v.speed }),
        t.url ? h("audio", { controls: true, preload: "none", src: t.url }) : null, box)));
  }
  _synthBox(who, lang) {
    const out = h("div", { class: "muted" });
    const txt = h("input", { placeholder: "输入一句话，用这个声音合成" });
    const go = h("button", { class: "btn sm primary", onclick: async () => {
      if (!txt.value.trim()) return txt.focus();
      go.disabled = true;
      out.textContent = "合成中…";
      try {
        const r = await api("/api/tts", { who, text: txt.value.trim(), lang });
        out.innerHTML = "";
        out.append(h("audio", { controls: true, autoplay: true, src: r.url }), h("span", { class: "mono" }, ` ${r.lipsync.dur}s · ${r.cached ? "缓存" : r.gen_secs + "s 生成"}`));
      } catch (e) {
        out.textContent = e.message;
      }
      go.disabled = false;
    } }, iconEl("mic"), "合成");
    return { box: h("div", null, h("div", { class: "keyrow" }, txt, go), out), txt };
  }

  _lines() {
    const list = h("div", { class: "lines" });
    Object.entries(window.LIPSYNC).filter(([id, L]) => L.who === this.who && /^[A-Z]\d/.test(id)).forEach(([id, L]) => {
      const cv = h("canvas", { width: Math.round(L.v.length * 3), height: 26 });
      drawVisemes(cv, L);
      const row = h("div", { class: "line", onclick: () => this.detail({ type: "line", id, zh: id, kind: "head", src: L }, row) },
        h("button", { class: "iconbtn sm", title: "播放", html: icon("play") }), h("span", { class: "id" }, id),
        h("div", { class: "tx" }, L.text, L.gloss ? h("small", null, L.gloss) : null), cv, h("span", { class: "du" }, L.dur.toFixed(2) + "s"));
      list.appendChild(row);
    });
    this.main.appendChild(list);
  }

  _3d() {
    const C = this.cat.characters[this.who];
    const A = (this.manifest.actors || []).find((x) => x.id === C.actorId) || {};
    const m = A.measured || {};
    const mv = document.createElement("model-viewer");
    mv.setAttribute("src", "/lab/models/" + C.actorId + ".glb");
    ["camera-controls", "autoplay"].forEach((k) => mv.setAttribute(k, ""));
    mv.setAttribute("interaction-prompt", "none");
    mv.setAttribute("shadow-intensity", "0.9");
    mv.setAttribute("exposure", "1.1");
    mv.setAttribute("environment-image", "neutral");
    mv.className = "mv";
    const clips = h("div", { class: "clips" });
    const info = h("div", { class: "muted mono", style: { fontSize: "11.5px", marginTop: "8px" } });
    mv.addEventListener("load", () => {
      (mv.availableAnimations || []).forEach((n) => {
        const b = h("button", { onclick: () => {
          clips.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
          mv.animationName = n;
          mv.play();
          setTimeout(() => (info.textContent = `${n} · ${(mv.duration || 0).toFixed(2)}s`), 300);
        } }, n);
        clips.appendChild(b);
      });
    });
    const fact = (k, v) => h("div", { class: "fact" }, h("small", null, k), h("div", { class: "mono" }, v == null ? "—" : String(v)));
    this.main.appendChild(h("div", { class: "three" }, h("div", null, mv, clips, info),
      h("div", { class: "facts", style: { gridTemplateColumns: "1fr" } },
        fact("文件", `${C.actorId}.glb · ${((m.bytes || 0) / 1048576).toFixed(2)} MB`), fact("三角形", m.triangles), fact("骨骼", m.skinJoints),
        fact("动作片段", m.clipCount), fact("形变键", "MouthOpen Smile Frown BrowUp BrowDown BlinkL BlinkR"), fact("Blender 源", A.blendSource))));
  }

  /* ------------------------------------------------------------ detail */
  _drawer() {
    this.dTitle = h("h2");
    this.dBody = h("div", { class: "drawer-b adetail" });
    this.drawerEl = h("div", { class: "drawer" }, h("div", { class: "drawer-h" }, this.dTitle, h("span", { class: "sp" }), h("button", { class: "iconbtn sm", title: "关闭", html: icon("close"), onclick: () => this.closeDrawer() })), this.dBody);
    document.body.appendChild(this.drawerEl);
  }
  closeDrawer() {
    this.drawerEl.classList.remove("open");
    this.playing = null;
    if (this.audio) this.audio.pause();
    if (this.selCard) this.selCard.classList.remove("on");
  }

  detail(o, card) {
    if (this.selCard) this.selCard.classList.remove("on");
    this.selCard = card;
    card.classList.add("on");
    const who = this.who, cat = this.cat;
    this.dTitle.textContent = o.zh;
    const b = this.dBody;
    b.innerHTML = "";
    // live player
    const box = h("div", { class: "rbox" });
    const pl = h("div", { class: "player" }, box);
    b.appendChild(pl);
    const rig = roster.makeRig(box, who, "det-" + who + "-" + Math.random().toString(36).slice(2, 6));
    rig.svg.setAttribute("viewBox", frames.viewBox(who, o.kind === "mouth" ? "mouth" : o.kind));
    const a = new window.RIG.Actor(rig, { seed: 1, expr: "idle" });
    let period = 3.2;
    let mutate = null;
    if (o.type === "expr") {
      a.e(0.4, o.id).e(2.3, "idle");
    } else if (o.type === "pose") {
      if (o.id === "run") a.run(0, 999, 3.2);
      else a.p(0.4, o.id, 0.3).p(2.4, "rest", 0.3);
    } else if (o.type === "act") {
      a.act(0.5, o.id, o.src.dur, 1);
      period = o.src.dur + 1.6;
    } else if (o.type === "viseme") {
      mutate = (st, t) => {
        st.mouth = o.id;
        st.open = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.4);
      };
    } else if (o.type === "mouth") {
      mutate = (st) => (st.mouth = o.id);
    } else if (o.type === "eye") {
      if (o.id === "blink") {
        a.blinkAt = window.RIG.Actor.prototype.blinkAt;
        period = 4;
      } else mutate = (st) => (st.eye = [o.id, o.id]);
    } else if (o.type === "hand") {
      a.p(0, "present", 0.01);
      mutate = (st) => (st.arms = [st.arms[0], [50, 30, o.id, 0]]);
    } else if (o.type === "fx") {
      a.fx(0, o.id, 9999);
      if (o.id === "excl") {
        a.e(0.3, "idle");
        period = 1.6;
      }
    } else if (o.type === "line") {
      a.say(0, o.id);
      period = o.src.dur + 0.8;
      if (!this.audio) this.audio = new Audio();
      this.audio.src = "/film/assets/voice/" + o.id + ".wav";
      this.audio.play().catch(() => {});
    }
    if (o.type !== "blink" && a.blinkAt === window.RIG.Actor.prototype.blinkAt && o.id !== "blink") a.blinkAt = () => 0;
    const prog = h("i");
    let speed = 1, paused = false, t = 0, last = performance.now();
    const playBtn = h("button", { class: "iconbtn sm", title: "暂停", html: icon("pause") });
    playBtn.addEventListener("click", () => {
      paused = !paused;
      playBtn.innerHTML = icon(paused ? "play" : "pause");
      if (o.type === "line" && this.audio) paused ? this.audio.pause() : this.audio.play();
    });
    const segEl = h("div", { class: "seg" });
    [0.5, 1].forEach((v) => {
      const sb = h("button", { class: v === 1 ? "on" : "" }, v + "×");
      sb.addEventListener("click", () => {
        speed = v;
        [...segEl.children].forEach((x) => x.classList.toggle("on", x === sb));
        if (this.audio && o.type === "line") this.audio.playbackRate = v;
      });
      segEl.appendChild(sb);
    });
    b.append(h("div", { class: "ctl" }, playBtn, segEl, h("span", { class: "sp" }), h("span", { class: "dim mono" }, o.id)), h("div", { class: "prog" }, prog));
    const token = {};
    this.playing = token;
    const loop = (now) => {
      if (this.playing !== token) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!paused) t = o.type === "line" && this.audio && !this.audio.paused ? this.audio.currentTime : (t + dt * speed) % period;
      const st = a.state(t);
      if (mutate) mutate(st, t);
      rig.render(st);
      prog.style.transform = `scaleX(${(t / period).toFixed(3)})`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // facts
    const s = o.src || {};
    const sec = (title, ...kids) => h("div", { class: "isec" }, h("h4", null, title), ...kids);
    if (s.desc) b.appendChild(sec("设计", h("div", null, s.desc), s.use ? h("div", { class: "muted", style: { marginTop: "4px" } }, "适用：" + s.use) : null));
    if (s.sound) b.appendChild(sec("发音", h("div", null, s.sound)));
    const params = o.type === "expr" ? window.RIG.EXPR[o.id] : o.type === "pose" ? window.RIG.POSES[o.id] : null;
    if (params) b.appendChild(sec("参数", h("div", { class: "params" }, Object.entries(params).map(([k, v]) => h("span", null, h("i", null, k), typeof v === "object" ? JSON.stringify(v) : String(v))))));
    if (o.type === "pose" && s.gesture) {
      const g = cat.gestures.find((x) => x.id === s.gesture);
      if (g) b.appendChild(sec("手势语义", h("div", null, g.zh + " · " + g.desc), h("div", { class: "muted", style: { marginTop: "4px" } }, "适用：" + g.use)));
    }
    if (s.expr && s.expr.length) b.appendChild(sec("用于表情", h("div", { class: "params" }, s.expr.map((x) => h("span", null, x)))));
    if (o.type === "line") b.appendChild(sec("台词", h("div", null, s.text), s.gloss ? h("div", { class: "muted" }, s.gloss) : null, h("div", { class: "params", style: { marginTop: "6px" } }, h("span", null, h("i", null, "时长"), s.dur + "s"), h("span", null, h("i", null, "帧"), String(s.v.length)))));
    if (s.film && s.film.length && roster.kind(who) === "film") b.appendChild(sec("片中", h("ul", { class: "film" }, s.film.map((x) => h("li", null, x)))));
    b.appendChild(h("button", { class: "btn sm ghost", onclick: async () => {
      const r = o.recipe ? o.recipe() : null;
      if (!r) return;
      const urls = r.frames.map((f) => frames.snapshot(who, f.st, r.kind));
      const vb = frames.viewBox(who, r.kind).split(" ").map(Number);
      const fw = 160, fh = Math.round((fw * vb[3]) / vb[2]), cols = Math.min(urls.length, 10), rows = Math.ceil(urls.length / cols);
      const cv = h("canvas", { width: cols * fw, height: rows * fh });
      const g = cv.getContext("2d");
      await Promise.all(urls.map((u, i) => new Promise((res) => {
        const im = new Image();
        im.onload = () => (g.drawImage(im, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh), res());
        im.onerror = res;
        im.src = u;
      })));
      cv.toBlob((bl) => download(`${who.replace(":", "-")}_${o.type}-${o.id}_${urls.length}f.png`, bl));
    } }, iconEl("download"), "导出帧序列"));
    this.drawerEl.classList.add("open");
  }

  /* ------------------------------------------------------------ export */
  exportJSON() {
    const w = this.who, C = roster.info(w), kind = this._kind();
    const lines = Object.fromEntries(Object.entries(window.LIPSYNC).filter(([id, L]) => L.who === w && /^[A-Z]\d/.test(id)));
    const data = {
      character: kind === "film" ? { ...C, specs: window.RIG.SPECS[w] } : kind === "template" ? { id: w, look: roster.lookOf(w) } : C,
      expressions: this.cat.expressions.map((e) => ({ ...e, params: window.RIG.EXPR[e.id] })),
      poses: this.cat.poses.map((p) => ({ ...p, params: window.RIG.POSES[p.id] || null })),
      gestures: this.cat.gestures, acts: this.cat.acts, visemes: this.cat.visemes, mouths: this.cat.mouths, eyes: this.cat.eyes, hands: this.cat.hands, fx: this.cat.fx,
      voice: kind === "film" ? this.dialect.voices[w] : C.voice || null, lines, model3d: kind === "film" ? (this.manifest.actors || []).find((x) => x.id === C.actorId) || null : null, fps: 30,
    };
    delete data.character._card;
    download(`${w.replace(":", "-")}-assets.json`, JSON.stringify(data, null, 1));
  }
  exportCSV() {
    const c = this.cat;
    const rows = [["类别", "ID", "名称", "分组/时长", "描述", "适用", "参数"]];
    c.expressions.forEach((e) => rows.push(["表情", e.id, e.zh, e.group, e.desc, e.use, window.RIG.EXPR[e.id]]));
    c.poses.forEach((p) => rows.push(["姿势", p.id, p.zh, p.gesture || "", "", "", window.RIG.POSES[p.id] || ""]));
    c.acts.forEach((a) => rows.push(["动作", a.id, a.zh, a.dur, a.desc, a.use, ""]));
    c.visemes.forEach((v) => rows.push(["说话口型", v.id, v.zh, "", v.desc, v.sound, ""]));
    c.mouths.forEach((m) => rows.push(["静态嘴形", m.id, m.zh, "", m.desc, m.expr.join(" "), ""]));
    c.eyes.forEach((e) => rows.push(["眼", e.id, e.zh, "", e.desc, e.expr.join(" "), ""]));
    c.hands.forEach((x) => rows.push(["手", x.id, x.zh, "", x.desc, "", ""]));
    c.fx.forEach((x) => rows.push(["特效", x.id, x.zh, "", x.desc, x.expr.join(" "), ""]));
    Object.entries(window.LIPSYNC).filter(([id, L]) => L.who === this.who && /^[A-Z]\d/.test(id)).forEach(([id, L]) => rows.push(["台词", id, L.text, L.dur, L.gloss || "", L.lang || "zh", L.v]));
    download(`${this.who.replace(":", "-")}-assets.csv`, toCSV(rows), "text/csv");
  }
}

// template showcase: a pitch with a thumbs-up, played back and forth
function showcase(who) {
  const a = frames.actor(who);
  a.e(1, "pitch").p(1, "thumbR", 0.3);
  return { kind: "body", frames: frames.sample(a, 1, 1.5) };
}
