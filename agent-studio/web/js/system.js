// system.js — the multi-agent architecture, rebuilt from the roster whenever an agent
// joins or leaves and lit live from the event bus; the agent registry; and a check
// that asks Jev to choreograph the film's dialogue and compares with scene-stage.js.

import { h, api, bus, download } from "./util.js";
import { iconEl, faceEl } from "./icons.js";
import { FILM_TRUTH, STAGE } from "./plan.js";
import * as roster from "./roster.js";

const NW = 184, NH = 58;
const LIGHT = {
  "turn.send": ["director"], "jev.request": ["jev"], "jev.answer": ["jev", "perf"], "voice.request": ["voice"], "voice.ready": ["voice"],
  "voice.estimate": ["stage"], "turn.prepare": ["stage"], "actor.speak": ["perf", "stage"], "actor.react": ["perf"], "text.rewrite": ["rewrite"],
};
const GEN_LIGHT = { start: ["g_shop"], look: ["g_look"], accent: ["g_accent"], assets: ["g_assets"], voice: ["g_voice"], done: ["g_kit"] };

export class SystemView {
  constructor(root, cat, status) {
    this.cat = cat;
    this.status = status;
    this.diag = h("div", { class: "diag" });
    this.pills = h("div", { class: "sysstat" });
    this.reg = h("div", { class: "tablewrap" });
    this.kpis = h("div", { class: "kpis" });
    this.table = h("div", { class: "tablewrap hidden" });
    this.runBtn = h("button", { class: "btn primary", onclick: () => this.validate() }, iconEl("play"), "运行");
    this.exportBtn = h("button", { class: "btn ghost hidden", onclick: () => download("jev-vs-film.json", JSON.stringify(this.result, null, 1)) }, iconEl("download"), "导出");
    root.append(h("h1", null, "系统"), this.diag, this.pills,
      h("div", { class: "valbar" }, h("h2", null, "Agent 名单"), h("span", { class: "sp" }), h("span", { class: "dim", style: { fontSize: "12px" } }, "每个 agent 一份资产契约：形象模板 · 口音 · 音色 · 默认表演")), this.reg,
      h("div", { class: "valbar" }, h("h2", null, "Jev 与原片编排一致性"), h("span", { class: "sp" }), this.exportBtn, this.runBtn),
      this.kpis, this.table);
    this._kpis(null);
    this.redraw();
    bus.on((ev) => {
      if (ev.type === "roster.change") this.redraw(ev.payload);
      else this._light(ev);
    });
    this.renderStatus();
  }

  redraw(change) {
    this.diag.innerHTML = this._svg(change && change.op === "add" ? change.id : null);
    this._registry();
  }

  // columns: director → agents (我 · host · owners) → Jev / rewrite / voice → rig → stage,
  // and along the bottom the generator that turns a shop into a new owner
  _svg(fresh) {
    const owners = STAGE.slice();
    const nodes = [];
    const n = (id, x, y, t, s, c, extra) => nodes.push({ id, x, y, t, s, c, ...(extra || {}) });
    const colH = Math.max(owners.length * 66, 3 * 80);
    const top = 24;
    const mid = top + colH / 2 - NH / 2;
    n("director", 18, mid, "导演", "实时编写台词 · 多选引用");
    n("me", 230, top + 8, "我 · 台下顾客", roster.info("me").voice && roster.info("me").voice.timbre ? "提问 · 配音" : "提问 · 一次回复多家", roster.edge("me"), { face: "me" });
    n("orb", 230, top + 8 + 80, "小选 · 主持", "需求 · 筛选 · 洞察", roster.edge("orb"), { face: "orb" });
    owners.forEach((w, i) => {
      const C = roster.info(w);
      const lang = this.cat.languages.find((l) => l.id === C.language);
      const y = top + (colH - owners.length * 66) / 2 + i * 66;
      n(w, 446, y, `${C.name} · ${C.restaurant}`, `${roster.kind(w) === "agent" ? "生成 · " : "原片 · "}${lang ? lang.zh : C.language}`, roster.edge(w), { face: w, fresh: w === fresh });
    });
    n("jev", 690, top + colH * 0.18 - NH / 2 + 10, "Jev 决策", "并行问答 · 置信度门控");
    n("rewrite", 690, mid, "LLM 改写", "普通话 → 方言 / 口音");
    n("voice", 690, top + colH * 0.82 - NH / 2 - 10, "CosyVoice3", "分句流式 · 音色模板 · 口型");
    n("perf", 925, top + colH * 0.18 - NH / 2 + 10, "表演 rig", `表情 ${this.cat.expressions.length} · 姿势 ${this.cat.poses.length} · 动作 ${this.cat.acts.length - 1}`);
    n("stage", 925, top + colH * 0.82 - NH / 2 - 10, "舞台", `${owners.length} 位店主 · 气泡 · 聚光`);
    const gy = top + colH + 64;
    const gen = [["g_shop", "店铺信息 + logo", "文本 · logo 主色"], ["g_look", "Jev · 形象", "性别 年龄 体型 发型 服装"], ["g_accent", "Jev · 口音", "菜系 → 地区口音"],
      ["g_assets", "Jev · 组件", "招牌表情 手势 动作 反应"], ["g_voice", "Jev · 声音", "音色模板 · 语速 · 提示音"], ["g_kit", "rigkit + 音色模板", "形象模板 × 部件 × 胸牌"]];
    gen.forEach(([id, t, s], i) => n(id, 18 + i * 186, gy, t, s, null, { gen: true, w: 170 }));
    const by = Object.fromEntries(nodes.map((x) => [x.id, x]));
    const edges = [["director", "me"], ["director", "orb"], ...owners.map((w) => ["director", w]), ["me", "jev"], ["orb", "jev"], ...owners.map((w) => [w, "jev"]),
      ...owners.map((w) => [w, "rewrite"]), ["rewrite", "voice"], ["orb", "voice"], ["jev", "perf"], ["voice", "stage"], ["perf", "stage"],
      ["g_shop", "g_look"], ["g_look", "g_accent"], ["g_accent", "g_assets"], ["g_assets", "g_voice"], ["g_voice", "g_kit"]];
    const H = gy + NH + 26;
    let s = `<svg viewBox="0 0 1130 ${H}" class="diagsvg"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#4a4d5e"/></marker></defs>`;
    s += `<text class="lane" x="18" y="${gy - 16}">生成管线 · 店铺 → agent</text>`;
    const wOf = (x) => x.w || NW;
    edges.forEach(([a, b]) => {
      const A = by[a], B = by[b];
      if (!A || !B) return;
      let x1 = A.x + wOf(A), y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2;
      if (a === "perf" && b === "stage") [x1, y1, x2, y2] = [A.x + wOf(A) / 2, A.y + NH, B.x + wOf(B) / 2, B.y];
      const mx = (x1 + x2) / 2;
      s += `<path class="edge${A.gen ? " gen" : ""}" data-e="${a}-${b}" d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" marker-end="url(#ar)"/>`;
    });
    // the generator feeds the owners' column
    const K = by.g_kit, last = by[owners[owners.length - 1]] || by.orb;
    s += `<path class="edge gen" data-e="g_kit-${fresh || "owners"}" d="M ${K.x + wOf(K)} ${K.y + NH / 2} C ${K.x + wOf(K) + 60} ${K.y + NH / 2}, ${last.x + NW / 2} ${K.y - 20}, ${last.x + NW / 2} ${last.y + NH}" marker-end="url(#ar)"/>`;
    nodes.forEach((x) => {
      const w = wOf(x);
      s += `<g class="node${x.gen ? " gen" : ""}${x.fresh ? " fresh" : ""}" data-n="${x.id}"><rect class="box" x="${x.x}" y="${x.y}" width="${w}" height="${NH}" rx="14"/>`;
      if (x.c) s += `<circle cx="${x.x + 18}" cy="${x.y + 21}" r="5" fill="${x.c}"/>`;
      s += `<text class="nt" x="${x.x + (x.c ? 30 : 15)}" y="${x.y + 26}">${esc(clip(x.t, x.c ? 11 : 12))}</text><text class="ns" x="${x.x + 15}" y="${x.y + 45}">${esc(clip(x.s, 15))}</text></g>`;
    });
    return s + "</svg>";
  }

  _light(ev) {
    const p = ev.payload || {};
    const ids = (ev.type === "agent.gen" ? GEN_LIGHT[p.step] || [] : LIGHT[ev.type] || []).slice();
    if (p.actorId && ev.type !== "agent.gen") ids.push(p.actorId);
    ids.forEach((id) => {
      const g = this.diag.querySelector(`[data-n="${id}"]`);
      if (g) {
        g.classList.add("hot");
        clearTimeout(g._t);
        g._t = setTimeout(() => g.classList.remove("hot"), 1200);
      }
      this.diag.querySelectorAll(`[data-e$="-${id}"]`).forEach((e) => {
        e.classList.add("flow");
        clearTimeout(e._t);
        e._t = setTimeout(() => e.classList.remove("flow"), 1200);
      });
    });
  }

  // one row per agent: what its asset contract says
  _registry() {
    const L = (id) => (this.cat.languages.find((l) => l.id === id) || { zh: id }).zh;
    const rows = roster.order().map((w) => {
      const C = roster.info(w);
      const k = roster.kind(w);
      const rig = k === "film" ? "原片手绘 rig" : k === "agent" ? `${C.rig.body} · ${C.rig.hair} · ${C.rig.outfit}${C.rig.hat !== "none" ? " · " + C.rig.hat : ""}` : k === "host" ? "光球" : "台下（无形象）";
      const voice = k === "film" ? "原片参考音色" : (C.voice || {}).timbre ? "tpl:" + C.voice.timbre + " · " + C.voice.speed + "×" : "—";
      return h("tr", null, h("td", null, h("div", { class: "cell" }, faceEl(w, "idle", 24), h("b", null, C.name))), h("td", { class: "mono sub2" }, w),
        h("td", null, { film: "原片", agent: "生成", host: "主持", user: "用户" }[k]), h("td", null, C.restaurant), h("td", null, L(C.language)),
        h("td", { class: "sub2" }, rig), h("td", { class: "sub2 mono" }, voice), h("td", { class: "sub2" }, C.created || ""));
    });
    this.reg.innerHTML = "";
    this.reg.appendChild(h("table", { class: "vt" }, h("thead", null, h("tr", null, ["agent", "id", "类型", "店铺", "口音", "形象", "声音", "生成时间"].map((x) => h("th", null, x)))), h("tbody", null, rows)));
  }

  renderStatus() {
    const j = this.status.jev || {}, t = this.status.tts || {}, st = t.stats || {}, v = this.status.voices || {}, l = this.status.llm || {};
    const rtf = st.audio_secs ? (st.llm_secs / st.audio_secs).toFixed(2) : "—";
    this.pills.innerHTML = "";
    this.pills.append(
      h("span", { class: "pill " + (j.configured ? "ok" : "warn") }, h("i"), j.configured ? `Jev · ${j.model} · ${j.masked}` : "Jev 未配置 · 关键词基线"),
      h("span", { class: "pill " + (l.configured ? "ok" : "warn") }, h("i"), l.configured ? `改写 · ${l.model}` : "改写未配置 · 按原文配音"),
      h("span", { class: "pill " + (t.state === "ready" ? "ok" : t.state === "error" ? "bad" : "warn") }, h("i"),
        t.state === "ready" ? `CosyVoice3 · ${t.device} · ${st.clauses || 0} 分句 · 命中 ${st.cache_hits || 0} · 预合成 ${st.prefetched || 0} · 实时率 ${rtf}` : `CosyVoice3 · ${t.state || "—"}`),
      h("span", { class: "pill " + ((v.built || []).length === v.total ? "ok" : "warn") }, h("i"), `音色模板 ${(v.built || []).length}/${v.total || 8} · 口音提示音 ${(v.foreign || []).length}`));
  }

  _kpis(score) {
    this.kpis.innerHTML = "";
    [["开口表情", "expr"], ["手势", "gesture"], ["身体动作", "act"], ["旁听反应", "listener"]].forEach(([zh, k]) => {
      const s = score && score[k];
      this.kpis.appendChild(h("div", { class: "kpi" }, h("small", null, zh), h("b", null, s && s[2] ? Math.round((s[0] / s[2]) * 100) + "%" : "—"),
        h("span", null, s ? `Top-1 ${s[0]}/${s[2]} · Top-3 ${s[1]}/${s[2]}` : "Top-1 · Top-3")));
    });
  }

  async validate() {
    this.runBtn.disabled = true;
    const C = this.cat.characters, cat = this.cat;
    const exZh = (id) => (cat.expressions.find((e) => e.id === id) || cat.gestures.find((e) => e.id === id) || cat.acts.find((e) => e.id === id) || { zh: id }).zh;
    const score = { expr: [0, 0, 0], gesture: [0, 0, 0], act: [0, 0, 0], listener: [0, 0, 0] };
    const tb = h("tbody");
    this.table.innerHTML = "";
    this.table.classList.remove("hidden");
    this.table.appendChild(h("table", { class: "vt" }, h("thead", null, h("tr", null, ["", "台词", "开口表情", "手势", "身体动作", "旁听反应", ""].map((x) => h("th", null, x)))), tb));
    const history = [], rows = [];
    for (const id of Object.keys(FILM_TRUTH)) {
      const L = window.LIPSYNC[id], G = FILM_TRUTH[id];
      const q = G.quote ? { who: window.LIPSYNC[G.quote].who, text: window.LIPSYNC[G.quote].text } : null;
      const lang = L.lang === "yue" ? "yue" : L.lang === "fr" ? "fr" : L.who === "rong" ? "sc" : L.who === "pierre" ? "frzh" : "zh";
      let res;
      try {
        // the film's own cast, whoever else is on stage now
        res = await api("/api/decide", { speaker: L.who, text: L.text, lang, quotes: q ? [q] : [], stage: ["rong", "hua", "pierre"], history: history.slice(-4) });
      } catch (e) {
        tb.appendChild(h("tr", null, h("td", null, id), h("td", { colspan: 6, class: "miss" }, e.message)));
        continue;
      }
      history.push({ who: L.who, text: L.text });
      const A = res.response.answers;
      const judge = (key, truth, kind, who) => {
        const a = A[key];
        if (!truth || !a) return h("td", { class: "sub2" }, "—");
        const top3 = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]);
        const hit1 = a.choice === truth, hit3 = top3.includes(truth);
        score[kind][0] += hit1;
        score[kind][1] += hit3;
        score[kind][2] += 1;
        return h("td", null, h("div", { class: "cell " + (hit1 ? "hit" : hit3 ? "near" : "miss") }, who ? faceEl(who, a.choice, 22) : null, exZh(a.choice)),
          h("div", { class: "sub2" }, "原片 " + exZh(truth) + " · " + Math.round((a.probabilities[truth] || 0) * 100) + "%"));
      };
      const lis = h("td");
      Object.entries(G.listeners).forEach(([w, truth]) => {
        const a = A["listener_" + w];
        if (!a) return;
        const top3 = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]);
        const hit1 = a.choice === truth, hit3 = top3.includes(truth);
        score.listener[0] += hit1;
        score.listener[1] += hit3;
        score.listener[2] += 1;
        lis.appendChild(h("div", { class: "cell " + (hit1 ? "hit" : hit3 ? "near" : "miss"), title: "原片 " + exZh(truth) }, faceEl(w, a.choice, 22), exZh(a.choice)));
      });
      if (!lis.children.length) lis.appendChild(h("span", { class: "sub2" }, "—"));
      tb.appendChild(h("tr", null,
        h("td", null, faceEl(L.who, "idle", 26, C[L.who].name)),
        h("td", null, h("div", null, L.text), q ? h("div", { class: "sub2" }, "↩ " + C[q.who].name + "：" + q.text.slice(0, 16)) : null, h("div", { class: "sub2 mono" }, id)),
        judge("speaker_expr", G.expr, "expr", L.who === "orb" ? null : L.who), judge("speaker_gesture", G.gesture, "gesture"), judge("speaker_act", G.act, "act"), lis,
        h("td", null, h("span", { class: "srcbadge " + (res.source === "jev" ? "jev" : "baseline") }, res.source === "jev" ? "Jev" : "基线"))));
      rows.push({ id, source: res.source, answers: A, truth: G });
      this._kpis(score);
    }
    this.result = { score, rows };
    this.exportBtn.classList.remove("hidden");
    this.runBtn.disabled = false;
  }
}

// clip to n CJK-character widths (Latin letters count a little over half)
function clip(s, n) {
  s = String(s || "");
  let w = 0;
  for (let i = 0; i < s.length; i += 1) {
    w += s.charCodeAt(i) > 0x2e80 ? 1 : 0.56;
    if (w > n) return s.slice(0, i) + "…";
  }
  return s;
}
function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
