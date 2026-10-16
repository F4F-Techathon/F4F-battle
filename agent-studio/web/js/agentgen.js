// agentgen.js — "+" on the 演播 view: a shop's info text + logo → a new restaurant agent.
// The browser only measures the logo (downscaled to 96 px, dominant colours counted on
// a canvas — no vision model); the server decides 形象 → 口音 → 组件 → 声音 with Jev
// and streams each step, and the stage shows the agent materialising as they arrive.

import { h, api } from "./util.js";
import { icon, iconEl } from "./icons.js";

const PLACEHOLDER = "第一行写店名，其余随意写，例如：\n湘里人家\n菜系：湘菜\n人均：68元\n距离：1.5km\n招牌：剁椒鱼头、辣椒炒肉\n店主：陈姐\n简介：开了二十年的家常湘菜馆";

// demo shops, each with a logo drawn on a canvas (so the logo path is exercised too)
export const PRESETS = [
  { name: "湘里人家", text: "湘里人家\n菜系：湘菜\n人均：68元\n距离：1.5km\n招牌：剁椒鱼头、辣椒炒肉\n店主：陈姐\n简介：开了二十年的家常湘菜馆，辣得过瘾，米饭免费续。", logo: { bg: "#B8322A", fg: "#FFF4E2", ch: "湘", ring: "#F2C14E" } },
  { name: "鮨·一期一会", text: "鮨·一期一会\n菜系：日料 / 寿司 Omakase\n人均：398元\n距离：800米\n卖点：主厨每天从筑地直送的鱼，12 贯握寿司，只有 8 个吧台位", logo: { bg: "#1F2A44", fg: "#F4EFE6", ch: "鮨", ring: "#C9A44C" } },
  { name: "Luigi's Pizzeria", text: "Luigi's Pizzeria\n意式手工披萨，柴火窑烤，人均 120，距离 2.3 公里。\n招牌：玛格丽特披萨、提拉米苏\n老板是那不勒斯人，嗓门很大，爱讲他奶奶的配方。", logo: { bg: "#2E7D4F", fg: "#FFFFFF", ch: "L", ring: "#D64541" } },
  { name: "老北京炸酱面", text: "老北京炸酱面馆\n百年老字号，人均35，距离 600米。\n招牌：炸酱面、卤煮、豆汁儿\n老爷子亲自掌勺，说话慢悠悠的。", logo: { bg: "#C98A2B", fg: "#3B2412", ch: "京", ring: "#3B2412" } },
];

export function drawLogo(spec) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = spec.bg;
  g.beginPath();
  g.arc(48, 48, 46, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = spec.ring;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(48, 48, 39, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = spec.fg;
  g.font = `600 ${/[A-Za-z]/.test(spec.ch) ? 50 : 44}px "Noto Serif SC", serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(spec.ch, 48, 51);
  return cv;
}

// image / canvas → { data: 96 px PNG data URL, colors: [{hex, share}] } (chromatic only)
export async function processLogo(src) {
  let img = src;
  if (src instanceof Blob) {
    const url = URL.createObjectURL(src);
    img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("图片读不出来"));
      im.src = url;
    });
  }
  const S = 96;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  const w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height;
  const k = Math.min(S / w, S / hh);
  g.drawImage(img, (S - w * k) / 2, (S - hh * k) / 2, w * k, hh * k);
  const px = g.getImageData(0, 0, S, S).data;
  const bins = new Map();
  let opaque = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2], a = px[i + 3];
    if (a < 200) continue;
    opaque += 1;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx - mn < 34 || mx < 40 || mn > 228) continue; // greys, near-black, near-white
    const key = (r >> 5) * 64 + (gg >> 5) * 8 + (b >> 5);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n += 1;
    e.r += r;
    e.g += gg;
    e.b += b;
    bins.set(key, e);
  }
  const hex = (e) => "#" + [e.r, e.g, e.b].map((v) => Math.round(v / e.n).toString(16).padStart(2, "0")).join("").toUpperCase();
  const colors = [...bins.values()].sort((a, b) => b.n - a.n).filter((e) => e.n / Math.max(1, opaque) > 0.03).slice(0, 3)
    .map((e) => ({ hex: hex(e), share: +(e.n / Math.max(1, opaque)).toFixed(3) }));
  return { data: cv.toDataURL("image/png"), colors };
}

/* ------------------------------------------------------------- the dialog */
export function openGenerator(onSubmit) {
  let logo = null;
  const ta = h("textarea", { rows: 8, placeholder: PLACEHOLDER, class: "gen-text" });
  const prev = h("div", { class: "logo-prev" }, iconEl("image"));
  const sw = h("div", { class: "logo-sw" });
  const file = h("input", { type: "file", accept: "image/*", class: "hidden" });
  const drop = h("label", { class: "logo-drop", title: "点击或拖入 logo 图片" }, prev,
    h("div", { class: "logo-meta" }, h("b", null, "店铺 logo"), h("small", null, "点击或拖入图片 · 印在胸牌上，主色定主题色"), sw), file);
  const err = h("div", { class: "result bad hidden" });
  const setLogo = async (src) => {
    try {
      logo = await processLogo(src);
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove("hidden");
      return;
    }
    prev.innerHTML = "";
    prev.appendChild(h("img", { src: logo.data, alt: "logo" }));
    sw.innerHTML = "";
    if (!logo.colors.length) sw.appendChild(h("small", { class: "dim" }, "没有明显主色 · 由 Jev 选主题色"));
    logo.colors.forEach((c) => sw.appendChild(h("span", { class: "sw", title: `${c.hex} · ${Math.round(c.share * 100)}%` }, h("i", { style: { background: c.hex } }), c.hex)));
  };
  file.addEventListener("change", () => file.files[0] && setLogo(file.files[0]));
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) setLogo(f);
  });
  const presets = h("div", { class: "presets" }, PRESETS.map((p) =>
    h("button", { type: "button", onclick: () => {
      ta.value = p.text;
      setLogo(drawLogo(p.logo));
    } }, p.name)));
  const go = h("button", { class: "btn primary" }, iconEl("spark"), "生成 agent");
  const close = () => scrim.remove();
  go.addEventListener("click", () => {
    const text = ta.value.trim();
    if (!text) return ta.focus();
    close();
    onSubmit({ text, logo: logo ? logo.data : null, colors: logo ? logo.colors : [] });
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go.click();
    if (e.key === "Escape") close();
  });
  const scrim = h("div", { class: "scrim" }, h("div", { class: "modal gen-modal" },
    h("div", { class: "modal-h" }, h("h2", null, "添加店铺 agent"), h("span", { class: "sp" }), h("button", { class: "iconbtn sm", title: "关闭", html: icon("close"), onclick: close })),
    h("div", { class: "modal-b" },
      h("div", { class: "gen-flow" }, ["形象", "口音", "组件", "声音"].map((s, i) => h("span", null, h("em", null, i + 1), s))),
      h("label", { class: "field" }, h("span", null, "店铺信息"), ta), drop, err,
      h("div", { class: "field" }, h("span", null, "示例"), presets)),
    h("div", { class: "modal-f" }, h("span", { class: "dim", style: { fontSize: "12px" } }, "Ctrl + Enter 生成"), h("span", { class: "sp" }), h("button", { class: "btn", onclick: close }, "取消"), go)));
  scrim.addEventListener("mousedown", (e) => e.target === scrim && close());
  document.body.appendChild(scrim);
  ta.focus();
  return { setText: (t) => (ta.value = t), setLogo, submit: () => go.click() };
}

/* ------------------------------------------------------------- 我 */
export function openMeSettings(me, timbres, onSaved) {
  const name = h("input", { value: me.name || "我", maxlength: 8 });
  const sel = h("select", null, h("option", { value: "" }, "不配音（只出气泡）"),
    timbres.map((t) => h("option", { value: t.id, selected: (me.voice || {}).timbre === t.id ? true : null }, t.zh)));
  const audio = new Audio();
  const play = h("button", { class: "iconbtn", title: "试听音色", html: icon("play"), onclick: () => {
    if (!sel.value) return;
    audio.src = "/voices/" + sel.value + ".wav";
    audio.play().catch(() => {});
  } });
  const err = h("div", { class: "result bad hidden" });
  const close = () => {
    audio.pause();
    scrim.remove();
  };
  const save = h("button", { class: "btn primary", onclick: async () => {
    try {
      const r = await api("/api/agents/me", { name: name.value.trim() || "我", timbre: sel.value }, "PUT");
      close();
      onSaved(r);
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove("hidden");
    }
  } }, "保存");
  const scrim = h("div", { class: "scrim" }, h("div", { class: "modal", style: { width: "min(440px, calc(100vw - 32px))" } },
    h("div", { class: "modal-h" }, h("h2", null, "我 · 台下顾客")),
    h("div", { class: "modal-b" },
      h("p", null, "「我」是台下的顾客：可以提问、提要求，一次回应好几家店。台上的店主都会转向你，由 Jev 决定每个人的反应。"),
      h("label", { class: "field" }, h("span", null, "称呼"), name),
      h("div", { class: "field" }, h("span", null, "声音"), h("div", { class: "keyrow" }, sel, play)), err),
    h("div", { class: "modal-f" }, h("button", { class: "btn", onclick: close }, "取消"), save)));
  scrim.addEventListener("mousedown", (e) => e.target === scrim && close());
  document.body.appendChild(scrim);
  name.focus();
}
