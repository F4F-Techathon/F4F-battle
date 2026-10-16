// settings.js — keys stay on the local server and are only ever shown masked:
// Jev (performance decisions) and the dialect-rewrite LLM (any OpenAI-compatible API).

import { h, api } from "./util.js";
import { icon } from "./icons.js";

export async function openSettings(status, engine, onChange) {
  const scrim = h("div", { class: "scrim" });
  const close = () => {
    scrim.remove();
    document.removeEventListener("keydown", esc);
  };
  const esc = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", esc);
  scrim.addEventListener("mousedown", (e) => e.target === scrim && close());

  let s = {};
  try {
    s = await api("/api/settings");
  } catch (e) {
    s = { configured: false, masked: "", model: "jev-latest", llm: { presets: {} } };
  }
  const L = s.llm || { presets: {} };
  const masked = (ok, m, empty) => (ok ? "已保存 " + m + "，输入新 key 可替换" : empty);

  // Jev
  const keyIn = h("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: masked(s.configured, s.masked, "粘贴 TypeSafe API key") });
  const modelIn = h("input", { value: s.model || "jev-latest" });
  const modeSel = h("select", null, h("option", { value: "auto" }, "Jev"), h("option", { value: "baseline" }, "关键词基线"));
  modeSel.value = engine.decideMode;
  const jevState = h("dd", null, s.configured ? "已配置 · " + s.masked : "未配置");

  // rewrite LLM
  const presetSel = h("select", null, h("option", { value: "" }, "自定义"), Object.entries(L.presets || {}).map(([id, p]) => h("option", { value: id }, p.name)));
  const baseIn = h("input", { value: L.base_url || "", placeholder: "https://api.deepseek.com", spellcheck: "false" });
  const lmodelIn = h("input", { value: L.model || "", placeholder: "deepseek-chat", spellcheck: "false" });
  const lkeyIn = h("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: masked(L.configured, L.masked, "粘贴 API key") });
  const llmState = h("dd", null, L.configured ? `已配置 · ${L.model} · ${L.masked}` : "未配置（台词按原文配音）");
  const match = Object.entries(L.presets || {}).find(([, p]) => p.base_url === L.base_url);
  presetSel.value = match ? match[0] : "";
  presetSel.addEventListener("change", () => {
    const p = (L.presets || {})[presetSel.value];
    if (!p) return;
    baseIn.value = p.base_url;
    lmodelIn.value = p.model;
  });

  const persist = h("input", { type: "checkbox", checked: true });
  const result = h("div", { class: "result hidden" });
  const show = (cls, msg) => {
    result.className = "result " + cls;
    result.textContent = msg;
  };
  const save = async () => {
    const body = { model: modelIn.value.trim() || "jev-latest", persist: persist.checked, llm_base_url: baseIn.value.trim(), llm_model: lmodelIn.value.trim() };
    if (keyIn.value.trim()) body.api_key = keyIn.value.trim();
    if (lkeyIn.value.trim()) body.llm_api_key = lkeyIn.value.trim();
    try {
      s = await api("/api/settings", body);
      const l = s.llm || {};
      keyIn.value = lkeyIn.value = "";
      keyIn.placeholder = masked(s.configured, s.masked, "粘贴 TypeSafe API key");
      lkeyIn.placeholder = masked(l.configured, l.masked, "粘贴 API key");
      jevState.textContent = s.configured ? "已配置 · " + s.masked : "未配置";
      llmState.textContent = l.configured ? `已配置 · ${l.model} · ${l.masked}` : "未配置（台词按原文配音）";
      engine.decideMode = modeSel.value;
      show("ok", "已保存" + (persist.checked ? "，并写入 agent-studio/.env" : "（仅本次运行）"));
      onChange && onChange();
      return true;
    } catch (e) {
      show("bad", e.message);
      return false;
    }
  };
  const testJev = async () => {
    if ((keyIn.value.trim() || modelIn.value.trim() !== s.model) && !(await save())) return;
    show("", "连接 Jev…");
    try {
      const r = await api("/api/settings/test", {});
      show("ok", `Jev 连接成功 · ${r.model} · ${r.latency_ms} ms`);
    } catch (e) {
      show("bad", "Jev 连接失败：" + e.message);
    }
  };
  const testLlm = async () => {
    if (!(await save())) return;
    show("", "改写测试中…");
    try {
      const r = await api("/api/settings/test_llm", {});
      show("ok", `${r.model} · ${r.ms} ms ·「${r.src}」→「${r.text}」`);
    } catch (e) {
      show("bad", "改写失败：" + e.message);
    }
  };

  const t = status.tts || {};
  const st = t.stats || {};
  const rtf = st.audio_secs ? (st.llm_secs / st.audio_secs).toFixed(2) : "—";
  const field = (label, el) => h("label", { class: "field" }, h("span", null, label), el);
  const modal = h("div", { class: "modal", role: "dialog", "aria-label": "设置" },
    h("div", { class: "modal-h" }, h("h2", null, "设置"), h("span", { class: "sp" }), h("button", { class: "iconbtn sm", title: "关闭", html: icon("close"), onclick: close })),
    h("div", { class: "modal-b" },
      h("div", { class: "isec" }, h("h4", null, "JEV · 表演决策"), h("dl", { class: "kv2" }, h("dt", null, "状态"), jevState)),
      field("API key", keyIn),
      h("div", { class: "grid2" }, field("模型", modelIn), field("动作决策", modeSel)),
      h("hr"),
      h("div", { class: "isec" }, h("h4", null, "方言改写 · LLM"), h("dl", { class: "kv2" }, h("dt", null, "状态"), llmState)),
      h("div", { class: "grid2" }, field("服务", presetSel), field("模型", lmodelIn)),
      field("接口地址（OpenAI 兼容）", baseIn),
      field("API key", lkeyIn),
      h("label", { class: "switch" }, persist, h("b"), "保存到 .env"),
      result,
      h("hr"),
      h("div", { class: "isec" }, h("h4", null, "配音 · COSYVOICE3"),
        h("dl", { class: "kv2" },
          h("dt", null, "状态"), h("dd", null, t.state === "ready" ? "就绪" : t.state === "loading" ? "加载中" : t.state === "error" ? "错误：" + t.error : t.state || "—"),
          h("dt", null, "设备"), h("dd", null, t.device || "—"),
          h("dt", null, "已合成"), h("dd", { class: "mono" }, `${st.clauses || 0} 分句 · 缓存命中 ${st.cache_hits || 0} · 预合成 ${st.prefetched || 0}`),
          h("dt", null, "实时率"), h("dd", { class: "mono" }, rtf)))),
    h("div", { class: "modal-f" }, h("button", { class: "btn", onclick: testJev }, "测试 Jev"), h("button", { class: "btn", onclick: testLlm }, "测试改写"), h("span", { class: "sp" }),
      h("button", { class: "btn primary", onclick: async () => (await save()) && setTimeout(close, 600) }, "保存")));
  modeSel.addEventListener("change", () => (engine.decideMode = modeSel.value));
  scrim.appendChild(modal);
  document.body.appendChild(scrim);
  (L.configured ? (s.configured ? modelIn : keyIn) : lkeyIn).focus();
}
