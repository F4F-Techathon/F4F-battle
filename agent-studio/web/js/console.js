// console.js — the live view: stage, agent dock, event log, conversation thread,
// composer and the decision inspector. Everything renders from the live engine.
// The cast is dynamic: 我 (the customer), the owners on stage — the film's three and
// any generated from a shop's info + logo with "+" — and the host 小选.

import { h, bus, api } from "./util.js";
import { icon, iconEl, face, faceEl, clearFaces } from "./icons.js";
import { Stage } from "./stage.js";
import { LiveEngine, truthAnswers } from "./live.js";
import { makePlan, FILM_TRUTH, STAGE, quotesOf } from "./plan.js";
import * as roster from "./roster.js";
import { BODIES, HAIRS, OUTFITS, HATS } from "./rigkit.js";
import { openGenerator, openMeSettings } from "./agentgen.js";

const FILM_LINES = ["R1", "H1", "R2", "P0", "P1", "H2", "P2", "R3", "P3", "O3", "R4", "H3", "P4"];
const EXAMPLES = [
  { who: "me", text: "今晚想吃点不太辣的，人均一百以内，你们谁家合适？", quotes: [] },
  { who: "hua", text: "麻辣有什么好？吃完一晚上都在喝水，不如来我这喝杯好普洱！", quotes: ["R1"] },
  { who: "me", text: "你们俩先别吵，我就想知道哪家离我近、今晚还能订到位子？", quotes: ["R2", "H2"] },
  { who: "rong", text: "浪漫能当饭吃吗？来我这儿，鸳鸯锅一样可以约会！", quotes: ["P1"] },
  { who: "pierre", text: "八百八？那是艺术的价格，你们根本不懂浪漫！", quotes: ["H2"] },
  { who: "rong", text: "今天新到的毛肚，七上八下，脆得很！人均还是八十五！", quotes: [] },
  { who: "orb", text: "我发现你很在意距离，要不要听听华叔怎么说？", quotes: [] },
];
const STEPS = ["look", "accent", "assets", "voice"];
const STEP_ZH = { look: "形象", accent: "口音", assets: "组件", voice: "声音" };
const ZH = Object.fromEntries([...HAIRS.female, ...HAIRS.male, ...OUTFITS, ...HATS]);
const AGE_ZH = { young: "青年", middle: "中年", old: "老年" };

export class LiveView {
  constructor(root, cat, status, openSettings) {
    this.cat = cat;
    this.status = status;
    this.openSettings = openSettings;
    this.seq = 0;
    this.els = new Map();
    this.sel = null;
    this.replies = [];
    this.gens = {};
    this.exampleIx = 0;
    this._layout(root);
    this.stage = new Stage(this.stageHost, cat);
    this.engine = new LiveEngine(this.stage, cat, status);
    this.engine.on((turn) => this._onTurn(turn));
    bus.on((ev) => {
      this._log(ev);
      if (ev.type === "roster.change") this._rosterChanged(ev.payload);
    });
    setInterval(() => this._dock(), 90);
    this.setSpeaker("rong");
    this.session = { id: null, name: null };
    this.loop = false;
    bus.emit("session.start", { sessionId: "live-" + Date.now().toString(36) });
    this._offerRestore();
  }

  /* ------------------------------------------------------------ layout */
  _layout(root) {
    this.stageHost = h("div", { class: "stage-host" });
    this.pipeEl = h("span", { class: "pipe hidden" });
    this.genPanel = h("div", { class: "genpanel hidden" });
    const stageCard = h("div", { class: "stage-card" }, this.stageHost,
      h("div", { class: "stage-over" }, h("span", { class: "livetag" }, h("i"), "LIVE"), this.pipeEl), this.genPanel);
    this.dockEl = h("div", { class: "dock" });
    this.logEl = h("div", { class: "buslog" });
    const events = h("div", { class: "panel" }, h("div", { class: "panel-h" }, h("h3", null, "事件")), this.logEl);
    const main = h("div", { class: "main" }, stageCard, this.dockEl, events);

    this.thread = h("div", { class: "thread" }, h("div", { class: "empty" }, h("b", null, "开始一场路演"), "选择角色，输入台词，回车即演"));
    const filmBtn = h("button", { class: "iconbtn sm", title: "原片对白", html: icon("film") });
    this.menu = h("div", { class: "menu hidden" },
      h("button", { onclick: () => this.playFilm("film") }, iconEl("film"), "原片对白 · 原编排"),
      h("button", { onclick: () => this.playFilm("jev") }, iconEl("spark"), "原片对白 · Jev 编排"));
    filmBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menu.classList.toggle("hidden");
    });
    document.addEventListener("click", () => this.menu.classList.add("hidden"));
    this.titleEl = h("small", { class: "sessname" });
    this.playAllBtn = h("button", { class: "iconbtn sm", title: "自动播放全部", html: icon("playall"), onclick: () => this.autoplay() });
    this.sessMenu = h("div", { class: "menu sess hidden" });
    const sessBtn = h("button", { class: "iconbtn sm", title: "会话列表", html: icon("folder") });
    sessBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.menu.classList.add("hidden");
      this.sessMenu.classList.contains("hidden") ? this.openSessions() : this.sessMenu.classList.add("hidden");
    });
    this.sessMenu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => this.sessMenu.classList.add("hidden"));
    this.toastEl = h("div", { class: "toast hidden" });
    const head = h("div", { class: "convo-h" }, h("h2", null, "会话"), this.titleEl, h("span", { class: "sp" }),
      this.playAllBtn,
      h("button", { class: "iconbtn sm", title: "保存会话", html: icon("save"), onclick: () => this.save() }),
      h("div", { class: "menuwrap" }, sessBtn, this.sessMenu),
      h("div", { class: "menuwrap" }, filmBtn, this.menu),
      h("button", { class: "iconbtn sm", title: "停止", html: icon("stop"), onclick: () => this.engine.stop() }),
      h("button", { class: "iconbtn sm", title: "清空", html: icon("trash"), onclick: () => this.clear() }));
    const convo = h("aside", { class: "convo" }, head, this.thread, this.toastEl, this._composer());
    root.append(main, convo);
    this._buildDock();
    this._drawer();
  }

  // one card per agent: 我, the owners left to right, the host — then "+"
  _buildDock() {
    this.cards = {};
    this.dockEl.innerHTML = "";
    roster.order().forEach((w, i) => {
      const C = roster.info(w);
      const fc = faceEl(w, "idle", 42, C.name);
      const meter = h("span", { class: "meter" }, [0, 1, 2, 3, 4].map(() => h("i")));
      const st = h("span", { class: "state" }, "待命");
      const ex = h("span", { class: "ex" });
      const gear = w === "me" ? h("button", { class: "iconbtn sm gear", title: "我的设定（称呼 · 声音）", html: icon("gear"), onclick: (e) => {
        e.stopPropagation();
        this.meSettings();
      } }) : null;
      const sub = w === "me" ? ((C.voice || {}).timbre ? C.voiceDesc : "台下顾客 · 不配音") : C.plate;
      const card = h("div", { class: "agent" + (roster.kind(w) === "agent" ? " gen" : ""), style: { "--c": roster.edge(w) }, title: C.persona, onclick: () => this.setSpeaker(w) },
        h("div", { class: "av" }, fc, h("i", { class: "ring" }), C.logo ? h("img", { class: "badge-logo", src: C.logo, alt: "" }) : null),
        h("div", { class: "meta" },
          h("div", { class: "nm" }, h("b", null, C.name), gear, i < 9 ? h("span", { class: "kbd" }, "Alt " + (i + 1)) : null),
          h("div", { class: "rs" }, sub),
          h("div", { class: "now" }, st, ex, meter)));
      this.cards[w] = { card, fc, st, ex, meter, expr: "idle" };
      this.dockEl.appendChild(card);
    });
    Object.values(this.gens).forEach((g) => g.card && this.dockEl.appendChild(g.card));
    this.dockEl.appendChild(h("button", { class: "agent add", title: "用店铺信息 + logo 生成一个新的店主 agent", onclick: () => this.openAdd() },
      h("div", { class: "av" }, iconEl("plus")), h("div", { class: "meta" }, h("div", { class: "nm" }, h("b", null, "添加店铺")), h("div", { class: "rs" }, "店铺信息 + logo → agent"))));
    if (this.speaker) Object.entries(this.cards).forEach(([k, c]) => c.card.classList.toggle("sel", k === this.speaker));
  }

  _composer() {
    this.whoEl = h("div", { class: "who" });
    this._buildWho();
    this.langSel = h("select", { title: "配音语言（台词用普通话写，自动改写）", onchange: () => this._preview(true) }, this.cat.languages.map((l) => h("option", { value: l.id }, l.zh)));
    this.lzEl = h("div", { class: "lz hidden" });
    this.cutSw = h("input", { type: "checkbox" });
    this.voiceSw = h("input", { type: "checkbox", checked: true });
    const opts = h("div", { class: "opts" }, this.langSel, h("span", { class: "sp" }),
      h("button", { class: "iconbtn sm", title: "示例", html: icon("spark"), onclick: () => this.example() }),
      h("label", { class: "switch", title: "新台词打断正在说话的角色" }, this.cutSw, h("b"), "插话"),
      h("label", { class: "switch", title: "CosyVoice3 配音" }, this.voiceSw, h("b"), "配音"));
    this.replyEl = h("div", { class: "reply hidden" });
    this.input = h("textarea", { rows: 1, maxlength: 200, placeholder: "输入台词，回车发送" });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        this.send();
      } else if (e.key === "Escape") this.setReplies([]);
    });
    this.input.addEventListener("input", () => {
      this.input.style.height = "auto";
      this.input.style.height = Math.min(140, this.input.scrollHeight) + "px";
      this._preview();
    });
    const send = h("button", { class: "btn primary send", title: "发送（Enter）", html: icon("send"), onclick: () => this.send() });
    document.addEventListener("keydown", (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = +e.key;
      const order = roster.order();
      if (n >= 1 && n <= 9 && order[n - 1]) {
        e.preventDefault();
        this.setSpeaker(order[n - 1]);
        this.input.focus();
      } else if (e.key === "ArrowUp") {
        // add the latest line nobody is answering yet (press again for the one before)
        e.preventDefault();
        const next = [...this.engine.log].reverse().find((t) => t.who !== this.speaker && !this.replies.some((r) => r.id === t.id));
        if (next) this.toggleReply(next);
      }
    });
    return h("div", { class: "composer" }, this.whoEl, opts, this.replyEl, h("div", { class: "inrow" }, this.input, send), this.lzEl);
  }

  _buildWho() {
    this.whoBtns = {};
    this.whoEl.innerHTML = "";
    roster.order().forEach((w, i) => {
      const C = roster.info(w);
      const b = h("button", { style: { "--c": roster.edge(w) }, title: C.name + (i < 9 ? "（Alt+" + (i + 1) + "）" : ""), onclick: () => this.setSpeaker(w) }, faceEl(w, "idle", 26), h("span", null, C.name));
      this.whoBtns[w] = b;
      this.whoEl.appendChild(b);
    });
    if (this.speaker) Object.entries(this.whoBtns).forEach(([k, b]) => b.classList.toggle("on", k === this.speaker));
  }

  _rosterChanged(p) {
    if (p.op === "remove") {
      this.stage.removeAgent(p.id);
      clearFaces(p.id);
      if (this.speaker === p.id) this.setSpeaker("me");
    }
    this._buildDock();
    this._buildWho();
    if (this.speaker && !roster.order().includes(this.speaker)) this.setSpeaker("me");
  }

  setSpeaker(w) {
    if (roster.info(w).missing) return;
    this.speaker = w;
    Object.entries(this.whoBtns).forEach(([k, b]) => b.classList.toggle("on", k === w));
    Object.entries(this.cards).forEach(([k, c]) => c.card.classList.toggle("sel", k === w));
    this.langSel.value = roster.info(w).language || "zh";
    this._preview(true);
  }
  _voiceOn(who) {
    return this.voiceSw.checked && (who !== "me" || !!(roster.info("me").voice || {}).timbre);
  }
  // live rewrite preview (and voice prefetch) while the director types 普通话
  _preview(now) {
    clearTimeout(this._pf);
    const run = async () => {
      const text = this.input.value.trim(), lang = this.langSel.value, who = this.speaker;
      const zh = (this.cat.languages.find((l) => l.id === lang) || {}).zh || lang;
      if (!text || !this.engine.rewrite.has(lang)) {
        this.lzEl.classList.add("hidden");
        if (text && this._voiceOn(who)) this.engine.prefetch(who, text, lang);
        return;
      }
      const key = who + "|" + lang + "|" + text;
      if (key === this._lzKey && !now) return; // same text: no second cloud call
      this._lzKey = key;
      this.lzEl.className = "lz busy";
      this.lzEl.innerHTML = "";
      this.lzEl.append(h("span", { class: "tag" }, zh), h("span", { class: "typing" }, h("i"), h("i"), h("i")));
      const r = await this.engine.prefetch(who, text, lang);
      if (this._lzKey !== key) return;
      this.lzEl.className = "lz";
      this.lzEl.innerHTML = "";
      if (!r) return this.lzEl.append(h("span", { class: "tag" }, zh), h("span", { class: "dim" }, "改写服务不可用"));
      if (r.engine === "none" || r.engine === "error") {
        this.lzEl.classList.add("warn");
        return this.lzEl.append(h("span", { class: "tag" }, zh), h("span", null, r.note || "按原文配音"), h("button", { class: "linkbtn", onclick: () => this.openSettings() }, "设置改写模型"));
      }
      this.lzEl.append(h("span", { class: "tag", style: { "--c": roster.edge(who) } }, zh), h("span", { class: "out" }, r.text));
      if (!r.cached && r.ms) this.lzEl.append(h("span", { class: "dim mono" }, r.ms + "ms"));
    };
    // the rewrite is a paid cloud call: ask when a clause is finished, or after a real pause
    const t = this.input.value.trim();
    const done = /[，。！？；…,.!?;~]$/.test(t);
    if (now) run();
    else this._pf = setTimeout(run, done ? 300 : 1200);
  }

  /* ------------------------------------------------------------ replies (several at once) */
  toggleReply(turn) {
    const i = this.replies.findIndex((r) => r.id === turn.id);
    if (i >= 0) this.replies.splice(i, 1);
    else if (this.replies.length < 6) this.replies.push(turn);
    else this.toast("一次最多回复 6 条");
    this._renderReplies();
    this.input.focus();
  }
  setReplies(list) {
    this.replies = (list || []).filter(Boolean).slice(0, 6);
    this._renderReplies();
  }
  _renderReplies() {
    const el = this.replyEl;
    el.innerHTML = "";
    el.classList.toggle("hidden", !this.replies.length);
    this.els.forEach((m, id) => m.classList.toggle("quoting", this.replies.some((r) => r.id === id)));
    if (!this.replies.length) return;
    const n = this.replies.length, people = new Set(this.replies.map((r) => r.who)).size;
    el.appendChild(h("div", { class: "reply-h" }, iconEl("reply"), h("b", null, n > 1 ? `同时回复 ${n} 条` + (people > 1 ? ` · ${people} 人` : "") : "回复"),
      h("span", { class: "dim" }, "点消息上的 ↩ 可多选 · Alt+↑ 追加"), h("span", { class: "sp" }), h("button", { class: "linkbtn", onclick: () => this.setReplies([]) }, "清空")));
    this.replies.forEach((r) => el.appendChild(h("div", { class: "reply-row", style: { "--q": roster.edge(r.who) } }, h("span", { class: "bar" }),
      h("span", { class: "t" }, h("em", null, roster.info(r.who).name), r.text),
      h("button", { class: "iconbtn sm", title: "移除", html: icon("close"), onclick: () => this.toggleReply(r) }))));
  }
  _filmQuote(id) {
    if (id === "@me") return [...this.engine.log].reverse().find((t) => t.who === "me") || null;
    const L = window.LIPSYNC[id];
    return L ? { id: "film:" + id, who: L.who, text: L.text, src: L.gloss || L.text } : null;
  }
  example() {
    const ex = EXAMPLES[this.exampleIx++ % EXAMPLES.length];
    this.setSpeaker(ex.who);
    this.input.value = ex.text;
    this.setReplies(ex.quotes.map((id) => this._filmQuote(id)));
    this.input.dispatchEvent(new Event("input"));
    this.input.focus();
  }

  /* ------------------------------------------------------------ sending */
  send() {
    const text = this.input.value.trim();
    if (!text) return this.input.focus();
    const lang = this.langSel.value;
    const quotes = this.replies.map((r) => ({ who: r.who, text: r.text, src: r.src || r.text, ref: r.id }));
    const turn = {
      id: "t" + ++this.seq, who: this.speaker, text, src: text, lang, gloss: null, quotes, quote: quotes[0] || null,
      voiceOn: this._voiceOn(this.speaker), interrupt: this.cutSw.checked, override: {}, at: this.engine.now(),
    };
    this._addMsg(turn);
    this.engine.send(turn);
    this.input.value = "";
    this.lzEl.classList.add("hidden");
    this._lzKey = null;
    this.input.style.height = "auto";
    this.setReplies([]);
    this.input.focus();
  }
  // automation / tests: say a line as `who`, answering `quotes` (turn ids or film line ids)
  say(who, text, quoteIds) {
    this.setSpeaker(who);
    this.input.value = text;
    this.setReplies((quoteIds || []).map((id) => this.engine.log.find((t) => t.id === id) || this._filmQuote(id)));
    this.send();
    return this.engine.log[this.engine.log.length - 1];
  }

  playFilm(mode) {
    this.menu.classList.add("hidden");
    FILM_LINES.forEach((id) => {
      const L = window.LIPSYNC[id];
      const g = FILM_TRUTH[id];
      const Q = g && g.quote ? window.LIPSYNC[g.quote] : null;
      const q = Q ? { who: Q.who, text: Q.text, src: Q.gloss || Q.text, ref: "film:" + g.quote } : null;
      const lang = L.lang === "yue" ? "yue" : L.lang === "fr" ? "fr" : L.who === "rong" ? "sc" : L.who === "pierre" ? "frzh" : "zh";
      const turn = { id: "t" + ++this.seq, who: L.who, text: L.text, src: L.gloss || L.text, gloss: L.gloss || null, lang, quotes: q ? [q] : [], quote: q, film: id, voiceOn: true, override: {}, at: this.engine.now() };
      if (mode === "film") turn.decision = truthAnswers(id);
      this._addMsg(turn);
      this.engine.send(turn);
    });
  }

  clear(keepSession) {
    this.engine.clear();
    this.els.clear();
    this.thread.innerHTML = "";
    this.thread.appendChild(h("div", { class: "empty" }, h("b", null, "开始一场路演"), "选择角色，输入台词，回车即演"));
    this.closeDrawer();
    this.logEl.innerHTML = "";
    this.setReplies([]);
    this._setPlaying(false);
    if (!keepSession) {
      this.session = { id: null, name: null };
      this.titleEl.textContent = "";
    }
  }

  /* ------------------------------------------------------------ agents */
  openAdd() {
    if (STAGE.length + Object.keys(this.gens).length >= roster.MAX_STAGE) return this.toast(`舞台最多站 ${roster.MAX_STAGE} 位店主`);
    return openGenerator((payload) => this.generateAgent(payload));
  }

  // stream 形象 → 口音 → 组件 → 声音 from the server; the silhouette fills in as they land
  async generateAgent(payload) {
    const g = { payload, steps: {}, t0: performance.now(), id: null };
    try {
      const res = await fetch("/api/agents/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "HTTP " + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "error") throw new Error(ev.error);
          this._gen(g, ev);
        }
      }
      if (!g.agent) throw new Error("生成中断");
      return g.agent;
    } catch (e) {
      this._genFail(g, e.message);
      return null;
    }
  }

  _gen(g, ev) {
    const t = this.engine.now();
    if (ev.type === "start") {
      g.id = ev.id;
      g.shop = ev.shop;
      if (STAGE.includes(ev.id)) {
        // the same shop again: the old agent steps off first
        this.stage.removeAgent(ev.id);
        roster.remove(ev.id);
      }
      clearFaces(ev.id);
      this.gens[ev.id] = g;
      roster.provisional({ id: ev.id, name: ev.shop.name, restaurant: ev.shop.name, plate: "生成中…", edge: (payload(g).colors[0] || {}).hex || "#8A93A6",
        logo: payload(g).logo, rig: { body: "f_regular", gender: "female", age: "middle", hair: "bob", outfit: "shirt", hat: "none", theme: "#5A6072", badgeText: "?" } });
      this.stage.pendingAgent(ev.id);
      this.stage.pendingStep(ev.id, "look", "run");
      g.card = this._genCard(g);
      this._buildDock();
      this._genPanel(g);
      bus.emit("agent.gen", { actorId: ev.id, step: "start", note: ev.shop.name });
    } else if (ev.type === "step") {
      g.steps[ev.step] = { ...(g.steps[ev.step] || {}), ...ev };
      if (ev.status === "done" && ev.step === "look") {
        const r = ev.data.rig;
        roster.provisional({ ...roster.info(g.id), rig: r, edge: (payload(g).colors[0] || {}).hex || r.theme });
        clearFaces(g.id);
        this.stage.pendingAgent(g.id); // the real shape replaces the placeholder
      }
      STEPS.forEach((s) => g.steps[s] && this.stage.pendingStep(g.id, s, g.steps[s].status === "done" ? "done" : "run"));
      this._genPanel(g);
      this._genCardUpdate(g);
      bus.emit("agent.gen", { actorId: g.id, step: ev.step, status: ev.status, source: ev.decision && ev.decision.source, ms: ev.decision && ev.decision.ms, note: ev.note });
    } else if (ev.type === "done") {
      const a = ev.agent;
      g.agent = a;
      g.done = performance.now();
      delete this.gens[g.id];
      clearFaces(a.id);
      roster.add(a); // → roster.change: dock, composer, library and system rebuild
      this.stage.finalizeAgent(a.id, t);
      this._genPanel(g, a);
      bus.emit("agent.gen", { actorId: a.id, step: "done", ms: Math.round(g.done - g.t0) });
      setTimeout(() => this._greet(a), 1300);
    }
  }
  _genFail(g, msg) {
    if (g.id) {
      this.stage.cancelPending(g.id);
      roster.dropProvisional(g.id);
      delete this.gens[g.id];
      this._buildDock();
      this.genPanel.classList.add("hidden");
    }
    this.toast("生成失败：" + msg, 5000);
  }
  _greet(a) {
    const turn = { id: "t" + ++this.seq, who: a.id, text: a.greeting, src: a.greeting, lang: a.language, gloss: null, quotes: [], quote: null,
      voiceOn: this._voiceOn(a.id), interrupt: false, override: {}, at: this.engine.now() };
    this._addMsg(turn);
    this.engine.send(turn);
  }
  _genCard(g) {
    const logo = payload(g).logo;
    const card = h("div", { class: "agent pending", style: { "--c": (payload(g).colors[0] || {}).hex || "#8A93A6" } },
      h("div", { class: "av" }, logo ? h("img", { class: "face", src: logo, alt: "" }) : h("span", { class: "meface" }, "?"), h("i", { class: "ring" })),
      h("div", { class: "meta" }, h("div", { class: "nm" }, h("b", null, g.shop.name)), h("div", { class: "rs" }, "生成中 · 形象 → 口音 → 组件 → 声音"),
        h("div", { class: "now" }, h("span", { class: "steps" }, STEPS.map((s) => h("i", { "data-s": s, title: STEP_ZH[s] }))))));
    g.cardSteps = card.querySelector(".steps");
    return card;
  }
  _genCardUpdate(g) {
    if (g.cardSteps) g.cardSteps.querySelectorAll("i").forEach((i) => (i.className = (g.steps[i.dataset.s] || {}).status || ""));
  }
  // the generation card over the stage: each step, who decided it, what it chose
  _genPanel(g, agent) {
    const P = this.genPanel;
    clearTimeout(g.hide);
    P.className = "genpanel";
    P.innerHTML = "";
    const logo = payload(g).logo ? h("img", { src: payload(g).logo, alt: "" }) : h("span", null, ((g.shop || {}).name || "?").slice(0, 1));
    const secs = (((g.done || performance.now()) - g.t0) / 1000).toFixed(1);
    P.append(h("div", { class: "gp-h" }, h("div", { class: "gp-logo" }, logo),
      h("div", { class: "gp-t" }, h("b", null, g.shop ? g.shop.name : "生成中"), h("small", null, agent ? `${agent.name} 已登台 · ${roster.info(agent.id).voiceDesc || ""}` : "生成 agent")),
      h("span", { class: "sp" }), h("span", { class: "mono dim" }, secs + "s"),
      h("button", { class: "iconbtn sm", title: "关闭", html: icon("close"), onclick: () => P.classList.add("hidden") })));
    STEPS.forEach((s, i) => {
      const st = g.steps[s] || {};
      const d = st.decision;
      const state = st.status === "done" ? "done" : st.status ? "run" : "wait";
      P.appendChild(h("div", { class: "gp-row " + state },
        h("span", { class: "gp-dot" }, state === "done" ? iconEl("check") : h("em", null, String(i + 1))), h("b", null, STEP_ZH[s]),
        d ? h("span", { class: "src " + d.source, title: d.note || "" }, (d.source === "jev" ? "Jev" : "规则") + (d.ms != null ? " " + (d.ms / 1000).toFixed(1) + "s" : ""))
          : state === "run" ? h("span", { class: "typing" }, h("i"), h("i"), h("i")) : h("span"),
        h("span", { class: "gp-v" }, this._genSummary(s, st))));
      if (s === "assets" && state === "done") {
        P.appendChild(h("div", { class: "gp-faces" }, this.cat.expressions.map((e) => faceEl(g.id, e.id, 24, e.zh)),
          h("small", null, `${this.cat.expressions.length} 表情 · ${this.cat.poses.length} 姿势 · ${this.cat.acts.length - 1} 动作 · ${this.cat.visemes.length} 口型 · ${this.cat.fx.length} 特效`)));
      }
    });
    if (agent) g.hide = setTimeout(() => P.classList.add("out"), 8000);
  }
  _genSummary(s, st) {
    const D = st.data || {};
    if (st.status !== "done") return st.note || "";
    const cat = this.cat;
    const zh = (list, id) => (list.find((x) => x.id === id) || { zh: id }).zh;
    if (s === "look") {
      const r = D.rig;
      const body = (BODIES.find((b) => b.id === r.body) || {}).zh || r.body;
      return h("span", null, h("i", { class: "swatch", style: { background: r.theme } }),
        [body, AGE_ZH[r.age], ZH[r.hair], (ZH[r.outfit] || "").split(" + ")[0], r.hat !== "none" ? ZH[r.hat] : "", ...(r.accessories || []).map((a) => ({ glasses: "眼镜", mustache: "小胡子", earrings: "耳环" })[a])].filter(Boolean).join(" · "));
    }
    if (s === "accent") {
      const p = (((st.decision || {}).answers || {}).accent || {}).probabilities || {};
      return D.zh + (p[D.language] != null ? ` · ${Math.round(p[D.language] * 100)}%` : "");
    }
    if (s === "assets") {
      const d = D.defaults || {};
      return `${zh(cat.expressions, d.expr)} · ${zh(cat.gestures, d.gesture)} · ${zh(cat.acts, d.act)} · 能量 ${D.energy}`;
    }
    if (s === "voice") return `${D.zh} · ${D.speed}×` + (D.accentClip ? " · 口音提示音就绪" : "") + (D.prefetched ? ` · 预合成 ${D.prefetched} 句` : "");
    return "";
  }

  async meSettings() {
    let timbres = [];
    try {
      timbres = (await api("/api/voices")).timbres || [];
    } catch (e) {
      /* the dialog still lets you rename */
    }
    openMeSettings(roster.info("me"), timbres, (me) => {
      roster.setMe(me);
      this.toast(me.voice && me.voice.timbre ? `「${me.name}」的声音：${me.voiceDesc}` : `「${me.name}」不配音，只出气泡`);
    });
  }

  /* ------------------------------------------------------------ sessions */
  _serialize() {
    return this.engine.log.map((t) => {
      const qs = quotesOf(t).map((q) => ({ who: q.who, text: q.text, src: q.src || null }));
      return {
        who: t.who, src: t.src || t.text, text: t.text, lang: t.lang, gloss: t.gloss || null, quotes: qs, quote: qs[0] || null,
        film: t.film || null, voiceOn: t.voiceOn !== false, override: t.override || {},
        decision: t.decision ? { source: t.decision.source, note: t.decision.note || null, response: t.decision.response } : null,
        lz: t.lz || null, final: t.final || null, ms: t.ms || {}, at: t.at || 0, status: t.status === "interrupted" ? "interrupted" : "done",
      };
    });
  }
  toast(msg, ms) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove("hidden");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => this.toastEl.classList.add("hidden"), ms || 2200);
  }
  async save() {
    if (!this.engine.log.length) return this.toast("会话还是空的");
    if (!this.session.id) {
      const d = new Date(), pad = (n) => String(n).padStart(2, "0");
      const name = await askName(`路演 ${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
      if (name == null) return;
      this.session = { id: "s" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()), name: name.trim() || "未命名" };
    }
    try {
      const r = await api("/api/sessions/" + this.session.id, { name: this.session.name, turns: this._serialize(), meta: { app: "今晚吃啥" } }, "PUT");
      this.titleEl.textContent = r.name;
      this.toast(`已保存「${r.name}」· ${r.count} 句`);
    } catch (e) {
      this.toast("保存失败：" + e.message, 4000);
    }
  }
  _autosave() {
    clearTimeout(this._as);
    this._as = setTimeout(() => {
      if (!this.engine.log.length) return;
      api("/api/sessions/_autosave", { name: "自动保存", turns: this._serialize(), meta: { session: this.session } }, "PUT").catch(() => {});
    }, 1200);
  }
  async _offerRestore() {
    let d;
    try {
      d = await api("/api/sessions/_autosave");
    } catch (e) {
      return;
    }
    const empty = this.thread.querySelector(".empty");
    if (!d.turns || !d.turns.length || !empty) return;
    empty.append(h("div", { class: "restore" },
      h("button", { class: "btn sm", onclick: () => this.load("_autosave", false) }, iconEl("replay"), `恢复上次会话 · ${d.turns.length} 句`),
      h("button", { class: "btn sm ghost", onclick: () => this.load("_autosave", true) }, iconEl("playall"), "恢复并播放")));
  }
  async openSessions() {
    const m = this.sessMenu;
    m.innerHTML = "";
    m.classList.remove("hidden");
    const loopSw = h("input", { type: "checkbox", checked: this.loop ? true : null });
    loopSw.addEventListener("change", () => (this.loop = loopSw.checked));
    m.append(h("div", { class: "sess-h" }, h("b", null, "会话"), h("span", { class: "sp" }), h("label", { class: "switch" }, loopSw, h("b"), "循环播放")));
    let list = [];
    try {
      list = await api("/api/sessions");
    } catch (e) {
      m.append(h("div", { class: "dim sess-empty" }, e.message));
      return;
    }
    if (!list.length) m.append(h("div", { class: "dim sess-empty" }, "还没有保存的会话"));
    list.forEach((x) => {
      const del = h("button", { class: "iconbtn sm", title: "删除", html: icon("trash") });
      del.addEventListener("click", async () => {
        if (!del.classList.contains("armed")) {
          del.classList.add("armed");
          del.title = "再点一次删除";
          return;
        }
        await api("/api/sessions/" + x.id, null, "DELETE").catch(() => {});
        if (this.session.id === x.id) {
          this.session = { id: null, name: null };
          this.titleEl.textContent = "";
        }
        this.openSessions();
      });
      m.append(h("div", { class: "sess-row" + (this.session.id === x.id ? " on" : "") },
        h("div", { class: "faces" }, [...new Set(x.who)].slice(0, 4).map((w) => faceEl(w, "idle", 18))),
        h("div", { class: "meta" }, h("b", null, x.id === "_autosave" ? "自动保存" : x.name), h("small", null, `${x.count} 句 · ${(x.updated || "").slice(5, 16)}`)),
        h("button", { class: "iconbtn sm", title: "载入", html: icon("folder"), onclick: () => this.load(x.id, false) }),
        h("button", { class: "iconbtn sm", title: "载入并播放", html: icon("play"), onclick: () => this.load(x.id, true) }),
        del));
    });
  }
  async load(id, play) {
    this.sessMenu.classList.add("hidden");
    let d;
    try {
      d = await api("/api/sessions/" + id);
    } catch (e) {
      return this.toast("载入失败：" + e.message, 4000);
    }
    this.clear(true);
    this.session = id === "_autosave" ? (d.meta && d.meta.session) || { id: null, name: null } : { id, name: d.name };
    this.titleEl.textContent = this.session.name || "";
    let gone = 0;
    (d.turns || []).forEach((x) => {
      if (roster.info(x.who).missing) gone += 1;
      const qs = x.quotes || (x.quote ? [x.quote] : []);
      const t = { ...x, quotes: qs, quote: qs[0] || null, id: "t" + ++this.seq, phase: "done", status: x.status || "done", clauses: [], ms: x.ms || {}, override: x.override || {} };
      if (t.decision && !roster.info(t.who).missing) t.plan = makePlan(this.cat, t);
      this.engine.log.push(t);
      this._addMsg(t);
    });
    this.toast(`已载入 · ${(d.turns || []).length} 句` + (gone ? ` · ${gone} 句的 agent 已删除` : ""));
    if (play) this.autoplay(true);
  }
  // play every line of the session in order with its recorded voice and performance
  autoplay(force) {
    if (this.playingAll && !force) {
      this.engine.stop();
      return this._setPlaying(false);
    }
    if (!this.engine.log.length) return this.toast("会话还是空的");
    this.engine.stop();
    this._setPlaying(true);
    this.engine.log.filter((t) => !roster.info(t.who).missing).forEach((t) => this.engine.replay(t));
  }
  _setPlaying(on) {
    this.playingAll = on;
    this.playAllBtn.classList.toggle("on", on);
    this.playAllBtn.innerHTML = icon(on ? "stop" : "playall");
    this.playAllBtn.title = on ? "停止自动播放" : "自动播放全部";
  }

  /* ------------------------------------------------------------ thread */
  _addMsg(turn) {
    const empty = this.thread.querySelector(".empty");
    if (empty) empty.remove();
    const el = this._msgEl(turn);
    this.els.set(turn.id, el);
    this.thread.appendChild(el);
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  _onTurn(turn) {
    if (turn.phase === "done" && !turn.replayOf) this._autosave();
    if (this.playingAll && turn.phase === "done" && !this.engine.queue.length && !this.engine.current) {
      if (this.loop) setTimeout(() => this.playingAll && this.engine.log.forEach((t) => this.engine.replay(t)), 1200);
      else this._setPlaying(false);
    }
    const base = turn.ref || turn;
    const el = this.els.get(base.id);
    if (el) {
      const fresh = this._msgEl(base, turn.ref ? turn : null);
      el.replaceWith(fresh);
      this.els.set(base.id, fresh);
    }
    if (this.sel && (this.sel === base || this.sel === turn)) this._renderDrawer();
    this._pipe(turn);
  }

  _msgEl(turn, live) {
    const cat = this.cat;
    const C = roster.info(turn.who);
    const run = live || turn;
    const p = turn.plan;
    const body3 = roster.hasRig(turn.who);
    const exZh = (id) => (cat.expressions.find((e) => e.id === id) || { zh: id }).zh;
    const avExpr = p && body3 ? (p.punch.id && p.punch.id !== "same" ? p.punch.id : p.expr.id) : "idle";
    const cls = "msg" + (this.sel === turn ? " sel" : "") + (run.phase === "speaking" ? " speaking" : "") + (this.replies.some((r) => r.id === turn.id) ? " quoting" : "") + (turn.who === "me" ? " mine" : "");
    const el = h("div", { class: cls, style: { "--c": roster.edge(turn.who) }, onclick: () => this.inspect(turn) });
    el.appendChild(h("div", { class: "av" }, faceEl(turn.who, avExpr, 36, C.name)));
    const body = h("div", null);
    const lang = cat.languages.find((l) => l.id === turn.lang);
    const mm = Math.floor((turn.at || 0) / 60), ss = Math.floor((turn.at || 0) % 60);
    body.appendChild(h("div", { class: "hd" }, h("b", null, C.name), lang && turn.who !== "me" ? h("span", { class: "tag" }, lang.zh) : null,
      turn.film ? h("span", { class: "tag" }, turn.film) : null,
      h("span", { class: "dim mono" }, `${mm}:${String(ss).padStart(2, "0")}`), h("span", { class: "sp" }),
      h("div", { class: "acts" },
        h("button", { class: "iconbtn sm", title: "引用这句（可多选）", html: icon("reply"), onclick: (e) => {
          e.stopPropagation();
          this.toggleReply(turn);
        } }),
        h("button", { class: "iconbtn sm", title: "重播", html: icon("replay"), onclick: (e) => {
          e.stopPropagation();
          this.engine.replay(turn);
        } }),
        h("button", { class: "iconbtn sm", title: "检视决策", html: icon("inspect"), onclick: (e) => {
          e.stopPropagation();
          this.inspect(turn);
        } }))));
    const qs = quotesOf(turn);
    qs.slice(0, 3).forEach((q) => body.appendChild(h("div", { class: "quote", style: { "--q": roster.edge(q.who) } }, h("em", null, roster.info(q.who).name), q.text)));
    if (qs.length > 3) body.appendChild(h("div", { class: "quote more" }, `还回复了 ${qs.length - 3} 条`));
    body.appendChild(h("div", { class: "tx" + (turn.lzPending ? " pending" : "") }, turn.text));
    if (turn.src && turn.src !== turn.text) body.appendChild(h("div", { class: "gl" }, h("em", null, "原文"), turn.src));
    if (p) {
      const dec = h("div", { class: "dec" });
      if (body3) {
        const ec = h("span", { class: "chip" + (p.expr.manual ? " manual" : ""), title: "表情" }, faceEl(turn.who, p.expr.id, 20), exZh(p.expr.id));
        if (p.expr.conf != null) ec.appendChild(h("span", { class: "c" + (p.expr.gated ? " lo" : "") }, Math.round(p.expr.conf * 100) + "%"));
        if (p.punch.id && p.punch.id !== "same" && p.punch.id !== p.expr.id) ec.append(h("span", { class: "dim" }, "→"), faceEl(turn.who, p.punch.id, 20), exZh(p.punch.id));
        dec.appendChild(ec);
        const g = cat.gestures.find((x) => x.id === p.gesture.id);
        if (g) dec.appendChild(h("span", { class: "chip plain" + (p.gesture.manual ? " manual" : ""), title: "手势" }, iconEl("hand"), g.zh));
        const a = cat.acts.find((x) => x.id === p.act.id);
        if (a && a.id !== "none") dec.appendChild(h("span", { class: "chip plain" + (p.act.manual ? " manual" : ""), title: "动作" }, iconEl("bolt"), a.zh));
      }
      const s = cat.stances.find((x) => x.id === p.stance.id);
      if (qs.length && s) dec.appendChild(h("span", { class: "chip plain", title: "立场" }, iconEl("reply"), s.zh));
      const lis = h("div", { class: "lis" });
      Object.entries(p.listeners).forEach(([w, r]) => lis.appendChild(h("span", { class: "chip", title: roster.info(w).name + "：" + exZh(r.id) }, faceEl(w, r.id, 20), exZh(r.id))));
      body.append(dec, lis);
    }
    body.appendChild(this._status(turn, run));
    el.appendChild(body);
    return el;
  }

  _status(turn, run) {
    const st = h("div", { class: "st" });
    const ms = run.ms || {};
    const ph = run.phase;
    if (ph === "queued") st.append(h("span", null, "排队中"));
    else if (ph === "preparing") st.append(h("span", { class: "typing" }, h("i"), h("i"), h("i")), h("span", { class: "stl" }, turn.lzPending ? "改写中" : !run.plan ? "Jev 决策中" : !run.audioReady ? "配音生成中" : "准备开口"));
    else if (ph === "speaking") st.append(iconEl("wave"), h("span", { class: "stl" }, run.replayOf ? "重播中" : "发言中"));
    else if (run.status === "interrupted") st.append(h("span", { class: "warn" }, "已打断"));
    const bits = [];
    if (ms.rewrite != null) bits.push(`改写 ${ms.rewrite}ms`);
    if (ms.decide != null) bits.push(`${turn.decision && turn.decision.source === "jev" ? "Jev" : "决策"} ${ms.decide}ms`);
    if (ms.firstAudio != null) bits.push(`首句 ${(ms.firstAudio / 1000).toFixed(2)}s`);
    if (ms.speak != null && ph !== "preparing") bits.push(`开口 ${(ms.speak / 1000).toFixed(2)}s`);
    if (ms.dur) bits.push(`${ms.dur}s`);
    if (bits.length) st.append(h("span", null, bits.join(" · ")));
    if (turn.decision && turn.decision.source === "baseline") st.append(h("span", { class: "warn" }, "基线"));
    if (turn.decision && turn.decision.source === "film") st.append(h("span", null, "原编排"));
    if (run.voice && run.voice.source === "estimate" && turn.who !== "me") st.append(h("span", { class: "warn" }, "无配音"));
    if (turn.lz && turn.lz.note) st.append(h("span", { class: "warn" }, turn.lz.note));
    if (run.decisionError) st.append(h("span", { class: "err" }, run.decisionError));
    return st;
  }

  _pipe(turn) {
    const ms = turn.ms || {};
    if (ms.decide == null && ms.firstAudio == null) return;
    this.pipeEl.classList.remove("hidden");
    this.pipeEl.innerHTML = "";
    const parts = [];
    if (ms.decide != null) parts.push(["决策", ms.decide + "ms"]);
    if (ms.firstAudio != null) parts.push(["首句", (ms.firstAudio / 1000).toFixed(2) + "s"]);
    if (ms.speak != null) parts.push(["开口", (ms.speak / 1000).toFixed(2) + "s"]);
    parts.forEach(([k, v], i) => {
      if (i) this.pipeEl.appendChild(h("span", { class: "sep" }, "·"));
      this.pipeEl.append(k + " ", h("b", null, v));
    });
  }

  /* ------------------------------------------------------------ dock */
  _dock() {
    const cat = this.cat;
    const ST = { speaking: "发言中", preparing: "准备", reacting: "反应中", idle: "待命" };
    Object.entries(this.cards).forEach(([w, c]) => {
      const s = this.engine.agentState(w);
      if (c.card.dataset.state !== s.status) {
        c.card.dataset.state = s.status;
        c.st.textContent = ST[s.status];
      }
      const rig = roster.hasRig(w);
      if (rig && s.expr && s.expr !== c.expr) {
        c.expr = s.expr;
        c.fc.src = face(w, s.expr);
      }
      const ex = !rig ? "" : (cat.expressions.find((e) => e.id === s.expr) || { zh: "" }).zh + " · " + ((cat.poses.find((p) => p.id === s.pose) || { zh: s.pose || "" }).zh);
      if (c.ex.textContent !== ex) c.ex.textContent = ex;
      const bars = c.meter.children;
      for (let i = 0; i < bars.length; i += 1) {
        const lv = s.status === "speaking" ? Math.max(0.15, s.level * (0.6 + 0.4 * Math.sin(performance.now() / 90 + i * 1.7))) : 0.15;
        bars[i].style.height = (2 + 10 * lv).toFixed(1) + "px";
      }
    });
  }

  /* ------------------------------------------------------------ events */
  _log(ev) {
    const p = ev.payload || {};
    const who = p.actorId ? roster.info(p.actorId).name : "";
    const t = this.engine ? this.engine.now() : 0;
    let d = "";
    if (ev.type === "jev.answer") d = `${p.source === "jev" ? "Jev" : p.source === "film" ? "原编排" : "基线"} ${p.latencyMs}ms → ${p.expr || "—"} / ${p.gesture || "—"} / ${p.act || "—"}`;
    else if (ev.type === "jev.request" || ev.type === "turn.send") d = (p.text || "").slice(0, 24) + (p.quotes && p.quotes.length > 1 ? ` ↩×${p.quotes.length}` : "");
    else if (ev.type === "voice.ready") d = `首句 ${p.firstMs}ms · 全句 ${p.totalMs}ms · ${p.clauses} 分句`;
    else if (ev.type === "voice.request") d = `CosyVoice3 · ${p.lang}`;
    else if (ev.type === "voice.estimate") d = p.reason;
    else if (ev.type === "text.rewrite") d = p.note || `${p.model || p.engine} ${p.cached ? "缓存" : p.ms + "ms"} → ${p.text}`;
    else if (ev.type === "actor.speak") d = `${p.emotion} · ${p.gesture} · ${p.act}`;
    else if (ev.type === "actor.react") d = p.emotion;
    else if (ev.type === "turn.error") d = p.error;
    else if (ev.type === "agent.gen") d = p.step === "start" ? "开始生成 · " + (p.note || "") : p.step === "done" ? `登台 · 共 ${(p.ms / 1000).toFixed(1)}s` : `${STEP_ZH[p.step] || p.step} ${p.status || ""}${p.source ? " · " + (p.source === "jev" ? "Jev" : "规则") : ""}${p.ms != null ? " " + p.ms + "ms" : ""}${p.note ? " · " + p.note : ""}`;
    else if (ev.type === "roster.change") d = { add: "加入舞台", remove: "离开舞台", me: "更新设定" }[p.op] || p.op;
    if (ev.type === "roster.change" && p.id) {
      const row = h("div", { class: "ev", style: { "--c": roster.edge(p.id) } }, h("span", { class: "t" }, t.toFixed(2) + "s"), h("code", null, ev.type), h("b", null, roster.info(p.id).name), h("span", null, d));
      this.logEl.prepend(row);
      return;
    }
    const row = h("div", { class: "ev", style: { "--c": p.actorId ? roster.edge(p.actorId) : "#8a93a6" } },
      h("span", { class: "t" }, t.toFixed(2) + "s"), h("code", null, ev.type), h("b", null, who), h("span", null, d));
    this.logEl.prepend(row);
    while (this.logEl.children.length > 160) this.logEl.lastChild.remove();
  }

  /* ------------------------------------------------------------ inspector */
  _drawer() {
    this.drawerTitle = h("h2");
    this.drawerBody = h("div", { class: "drawer-b" });
    this.drawerEl = h("div", { class: "drawer inspector" },
      h("div", { class: "drawer-h" }, this.drawerTitle, h("span", { class: "sp" }),
        h("button", { class: "iconbtn sm", title: "重播", html: icon("replay"), onclick: () => this.sel && this.engine.replay(this.sel) }),
        h("button", { class: "iconbtn sm", title: "关闭", html: icon("close"), onclick: () => this.closeDrawer() })),
      this.drawerBody);
    document.body.appendChild(this.drawerEl);
  }
  inspect(turn) {
    const prev = this.sel;
    this.sel = turn;
    [prev, turn].forEach((t) => t && this._onTurn(t));
    this._renderDrawer();
    this.drawerEl.classList.add("open");
  }
  closeDrawer() {
    const prev = this.sel;
    this.sel = null;
    this.drawerEl.classList.remove("open");
    if (prev) this._onTurn(prev);
  }

  _renderDrawer() {
    const t = this.sel;
    if (!t) return;
    const cat = this.cat;
    const b = this.drawerBody;
    this.drawerTitle.innerHTML = "";
    this.drawerTitle.append(roster.info(t.who).name);
    b.innerHTML = "";
    const D = t.decision;
    const head = h("div", { class: "ihead" });
    quotesOf(t).forEach((q) => head.appendChild(h("div", { class: "quote muted", style: { "--q": roster.edge(q.who) } }, "↩ " + roster.info(q.who).name + "：" + q.text)));
    head.appendChild(h("div", null, t.text));
    if (D) {
      const src = D.source === "jev" ? ["jev", "TypeSafe Jev"] : D.source === "film" ? ["film", "原片编排"] : ["baseline", "关键词基线"];
      head.appendChild(h("div", { class: "m" }, h("span", { class: "srcbadge " + src[0] }, src[1]), D.response.model ? h("span", null, D.response.model) : null,
        t.ms && t.ms.decide != null ? h("span", null, t.ms.decide + " ms") : null,
        D.response.usage ? h("span", null, D.response.usage.input_tokens + " tokens") : null,
        h("span", null, Object.keys(D.response.answers || {}).length + " 问")));
    }
    b.appendChild(head);
    if (t.src && (t.src !== t.text || t.lz)) {
      const lz = t.lz || {};
      const langZh = (cat.languages.find((l) => l.id === t.lang) || {}).zh || t.lang;
      b.appendChild(h("div", { class: "isec" }, h("h4", null, "改写"),
        h("div", { class: "rw" }, h("div", null, h("small", null, "原文"), t.src), h("div", null, h("small", null, langZh), t.text)),
        h("div", { class: "dim mono", style: { fontSize: "11px", marginTop: "6px" } }, lz.engine === "llm" ? `${lz.model} · ${lz.cached ? "缓存" : ((t.ms && t.ms.rewrite) || 0) + " ms"}` : lz.note || "")));
    }
    if (D && D.note) b.appendChild(h("div", { class: "note" }, D.note));
    if (!D) {
      b.appendChild(h("div", { class: "empty" }, h("span", { class: "typing" }, h("i"), h("i"), h("i"))));
      return;
    }
    const A = D.response.answers || {};
    const plan = t.plan || makePlan(cat, t);
    const exprOpts = cat.expressions.map((e) => [e.id, e.zh]);
    const opt = {
      expr: exprOpts,
      punch: [["same", "不变"], ...exprOpts],
      gesture: cat.gestures.map((e) => [e.id, e.zh]),
      act: cat.acts.map((e) => [e.id, e.zh]),
      gaze: [["quoted", "被引用者"], ["other", "另一位"], ["audience", "观众"]],
      delivery: cat.deliveries.map((e) => [e.id, e.zh]),
      stance: cat.stances.map((e) => [e.id, e.zh]),
      bubble: [["normal", "普通"], ["shout", "大喊"], ["shaky", "发抖"]],
      reaction: cat.reactions.map((r) => [r, (cat.expressions.find((e) => e.id === r) || { zh: r }).zh]),
    };
    const zh = (list, id) => (list.find((o) => o[0] === id) || [id, id])[1];
    const row = (label, slot, key, list, entry, faceWho) => {
      const a = A[key];
      const sel = h("select", { title: "手动覆盖" }, h("option", { value: "" }, "自动"), list.map(([id, z]) => h("option", { value: id, selected: t.override && t.override[slot] === id ? true : null }, z)));
      sel.addEventListener("change", () => {
        this.engine.override(t, slot, sel.value || null);
        if (!this.engine.current) this.engine.replay(t);
      });
      const val = h("span", { class: "val" }, faceWho ? faceEl(faceWho, entry.id, 22) : null, zh(list, entry.id));
      const q = h("div", { class: "q" }, h("div", { class: "qh" }, h("span", { class: "lab" }, label), val,
        entry.gated ? h("span", { class: "gated", title: "置信度过低，改用人设默认" }, "门控") : null,
        entry.manual ? h("span", { class: "gated", style: { color: "var(--pierre)", borderColor: "rgba(161,140,230,.4)" } }, "手动") : null,
        h("span", { class: "sp" }), a && a.confidence != null ? ring(a.confidence) : null, sel));
      if (a && a.probabilities) {
        const ps = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
        const dist = h("div", { class: "dist" });
        ps.forEach(([id, p]) => p > 0.004 && dist.appendChild(h("i", { class: id === a.choice ? "top" : "", style: { flex: String(p) }, title: `${zh(list, id)} ${(p * 100).toFixed(1)}%` })));
        q.append(dist, h("div", { class: "distlab" }, ps.slice(0, 3).map(([id, p]) => h("span", null, h("b", null, zh(list, id)), " " + pct(p)))));
      }
      return q;
    };
    const sec = (title, ...rows) => h("div", { class: "isec" }, h("h4", null, title), ...rows);
    if (roster.hasRig(t.who))
      b.appendChild(sec("说话人",
        row("表情", "expr", "speaker_expr", opt.expr, plan.expr, t.who),
        row("笑点", "punch", "speaker_punch", opt.punch, plan.punch, plan.punch.id !== "same" ? t.who : null),
        row("手势", "gesture", "speaker_gesture", opt.gesture, plan.gesture),
        row("动作", "act", "speaker_act", opt.act, plan.act),
        row("视线", "gaze", "speaker_gaze", opt.gaze, plan.gaze)));
    b.appendChild(sec("语气",
      row("配音语气", "delivery", "delivery", opt.delivery, plan.delivery),
      row("立场", "stance", "stance", opt.stance, plan.stance),
      row("气泡", "bubble", "bubble", opt.bubble, plan.bubble)));
    b.appendChild(sec("旁听", ...Object.keys(plan.listeners).map((w) => row(roster.info(w).name, "listener_" + w, "listener_" + w, opt.reaction, plan.listeners[w], w))));
    const scale = (label, key) => {
      const a = A[key];
      const s = a && a.score != null ? a.score : null;
      return h("div", { class: "q" }, h("div", { class: "qh" }, h("span", { class: "lab" }, label), h("span", { class: "val mono" }, s == null ? "—" : s.toFixed(2)),
        h("span", { class: "sp" }), a && a.confidence != null ? ring(a.confidence) : null),
        h("div", { class: "scale4" }, [0, 1, 2, 3].map((i) => h("i", null, h("b", { style: { transform: `scaleX(${s == null ? 0 : Math.max(0, Math.min(1, s - i + 0.5))})` } })))),
        a && a.legend ? h("div", { class: "scalelab" }, h("span", null, a.legend["0"]), h("span", null, a.legend[String(Object.keys(a.legend).length - 1)])) : null);
    };
    b.appendChild(sec("评分", scale("情绪强度", "intensity"), scale("吃瓜值", "drama"), ...(A.persuasion ? [scale("心动变化", "persuasion")] : [])));
    if (D.request) b.appendChild(h("details", { class: "json" }, h("summary", null, "请求 JSON"), h("pre", null, JSON.stringify(D.request, null, 1))));
    b.appendChild(h("details", { class: "json" }, h("summary", null, "响应 JSON"), h("pre", null, JSON.stringify(D.response, null, 1))));
    if (t.voice && t.voice.job) b.appendChild(h("details", { class: "json" }, h("summary", null, "配音任务"), h("pre", null, JSON.stringify({ ...t.voice.job, clauses: t.voice.clauses }, null, 1))));
  }
}

function payload(g) {
  return g.payload || { colors: [], logo: null };
}

function pct(p) {
  return p < 0.01 ? "<1%" : Math.round(p * 100) + "%";
}

function ring(conf) {
  const r = 10, c = 2 * Math.PI * r;
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 26 26");
  s.setAttribute("class", "ring");
  s.innerHTML = `<title>置信度 ${conf.toFixed(2)}</title><circle class="bg" cx="13" cy="13" r="${r}"/><circle class="fg" cx="13" cy="13" r="${r}" stroke-dasharray="${(c * conf).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 13 13)"/><text x="13" y="16" text-anchor="middle">${Math.round(conf * 100)}</text>`;
  return s;
}

// a small naming dialog in the app's own style
function askName(value) {
  return new Promise((resolve) => {
    const input = h("input", { value });
    const done = (v) => {
      scrim.remove();
      resolve(v);
    };
    const ok = () => done(input.value.trim() || value);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) ok();
      if (e.key === "Escape") done(null);
    });
    const scrim = h("div", { class: "scrim" }, h("div", { class: "modal", style: { width: "min(420px, calc(100vw - 32px))" } },
      h("div", { class: "modal-h" }, h("h2", null, "保存会话")),
      h("div", { class: "modal-b" }, h("label", { class: "field" }, h("span", null, "名称"), input)),
      h("div", { class: "modal-f" }, h("button", { class: "btn", onclick: () => done(null) }, "取消"), h("button", { class: "btn primary", onclick: ok }, "保存"))));
    scrim.addEventListener("mousedown", (e) => e.target === scrim && done(null));
    document.body.appendChild(scrim);
    input.focus();
    input.select();
  });
}
