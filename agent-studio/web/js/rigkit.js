// rigkit.js — parametric characters on the film rig's DOM contract.
//
// The film's rig.js draws three hand-made characters; its renderer
// (Rig.prototype.render) and director (RIG.Actor) are generic over a spec plus
// a fixed SVG structure (data-k / data-m / data-eye / data-brow / data-fx /
// data-h / data-arm / data-leg). This module emits that same structure from
// interchangeable parts (body template × hair × outfit × hat × accessories ×
// logo badge) and binds it onto the film's own prototype, so every expression,
// gesture, act and viseme of the film works on a generated character unchanged.

const INK = "#2B1B30", MOUTH = "#5B1F33", TONGUE = "#EE7A86", TEETH = "#FFF8EE", WHITE = "#FFFDF7";
const f = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------- catalogue */
export const BODIES = [
  { id: "f_petite", zh: "女 · 娇小", gender: "female", height: "short", lext: 12, W: 78, shoulder: 62, legW: 35, round: false, scale: 0.93 },
  { id: "f_regular", zh: "女 · 标准", gender: "female", height: "regular", lext: 40, W: 86, shoulder: 70, legW: 40, round: false, scale: 1 },
  { id: "f_tall", zh: "女 · 高挑", gender: "female", height: "tall", lext: 70, W: 84, shoulder: 70, legW: 38, round: false, scale: 1.04 },
  { id: "m_round", zh: "男 · 矮壮", gender: "male", height: "short", lext: 16, W: 110, shoulder: 88, legW: 44, round: true, scale: 0.97 },
  { id: "m_regular", zh: "男 · 标准", gender: "male", height: "regular", lext: 40, W: 90, shoulder: 74, legW: 40, round: false, scale: 1 },
  { id: "m_tall", zh: "男 · 高大", gender: "male", height: "tall", lext: 72, W: 96, shoulder: 78, legW: 42, round: false, scale: 1.06 },
];
export const HAIRS = {
  female: [["bun", "高发髻"], ["bob", "齐耳短发"], ["long", "披肩长发"], ["ponytail", "马尾"]],
  male: [["side", "侧分短发"], ["crew", "寸头"], ["curly", "卷发"], ["bald", "光头"]],
};
export const OUTFITS = [["jacket", "盘扣短褂 + 半身围裙"], ["tang", "立领唐装 + 长围裙"], ["chef", "双排扣厨师服 + 领巾"], ["shirt", "衬衫 + 背带围裙"]];
export const HATS = [["none", "不戴帽"], ["toque", "高厨师帽"], ["cap", "厨师小帽"], ["bandana", "包头巾"]];
export const SKINS = ["#F6CBA9", "#F1C09B", "#F7D0B3", "#EBB892", "#DDA27C", "#C98E6B"];

/* --------------------------------------------------------------- colour */
function hexRgb(h) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
export function shade(h, k) {
  const [r, g, b] = hexRgb(h);
  return k < 0 ? rgbHex(r * (1 + k), g * (1 + k), b * (1 + k)) : rgbHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
}
function luma(h) {
  const [r, g, b] = hexRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* ------------------------------------------------------------- spec */
// look (from the agent contract) → the renderer's spec + part choices
export function specFor(look) {
  const body = BODIES.find((b) => b.id === look.body) || BODIES[look.gender === "male" ? 4 : 1];
  const male = body.gender === "male";
  const skin = look.skin || SKINS[0];
  const theme = look.theme || "#C9483E";
  const old = look.age === "old";
  const sp = {
    skin, skinShade: shade(skin, -0.12), blush: "#EE8C7E", brow: old ? "#6D6670" : look.hairColor || "#2A1C24",
    hair: old ? "#B8B2BE" : look.hairColor || "#2A1C24", hairHi: old ? "#D8D3DC" : shade(look.hairColor || "#2A1C24", 0.18),
    top: look.outfit === "chef" ? "#FBF7F0" : theme, topShade: look.outfit === "chef" ? "#E6DCCB" : shade(theme, -0.2),
    inner: "#F6E8D2", trim: "#F3EAD8",
    apron: look.outfit === "chef" ? "#FFFFFF" : look.outfit === "shirt" ? shade(theme, -0.05) : luma(theme) > 0.6 ? "#3A3540" : "#F3EAD8",
    apronShade: look.outfit === "chef" ? "#E7DFD2" : look.outfit === "shirt" ? shade(theme, -0.25) : luma(theme) > 0.6 ? "#2A2630" : "#DCCFB4",
    accent: look.outfit === "chef" ? theme : look.outfit === "shirt" ? "#FBF7F0" : shade(theme, 0.55),
    pants: look.pants || (male ? "#2F3640" : shade(theme, -0.62)), shoes: "#2B2028",
    face: male ? { rx: body.round ? 114 : 108, ry: 100, cy: -108 } : { rx: 102, ry: 100, cy: -110 },
    eye: male ? { x: 42, y: -102, rx: 19, ry: 22, lash: false } : { x: 40, y: -104, rx: 21, ry: 25, lash: true },
    browAt: male ? { x: 43, y: -150, w: 21, h: 6, sw: 10 } : { x: 40, y: -150, w: 19, h: 6, sw: 7 },
    mouthAt: { y: male ? -42 : -46, s: male ? 1.08 : 1 },
    cheek: male ? { x: 66, y: -58, rx: 22, ry: 12 } : { x: 62, y: -62, rx: 19, ry: 11 },
    steamY: look.hat === "toque" ? -372 : look.hair === "bun" ? -335 : -282,
    body: body.round ? 1.2 : 1, legW: body.legW, shoulder: body.shoulder, lext: body.lext, W: body.W, round: body.round,
  };
  const hatH = { toque: 340, cap: 270, bandana: 250, none: look.hair === "bun" ? 330 : 255 }[look.hat || "none"];
  const top = Math.min(-610, -(214 + body.lext) - hatH - 24);
  return { sp, body, male, old, theme, scale: body.scale || 1, viewBox: `-210 ${top} 420 ${30 - top}`, vbTop: top, vbH: 30 - top, headOrigin: -(214 + body.lext), headTop: -(214 + body.lext) - hatH };
}

/* ------------------------------------------------------------- helpers */
function capsule(cx, y, w, h, fill, extra) {
  return '<rect x="' + f(cx - w / 2) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(w / 2) + '" fill="' + fill + '"' + (extra || "") + "/>";
}

/* the film's mouths, eyes and effects — copied verbatim so states render identically */
function mouthShape(id, name, d, opts) {
  opts = opts || {};
  const clip = id + "-mc-" + name;
  let s = '<g data-m="' + name + '" opacity="0">';
  if (opts.stroke) {
    s += '<path d="' + d + '" fill="none" stroke="' + MOUTH + '" stroke-width="' + (opts.sw || 6.5) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    if (opts.dimple) s += '<circle cx="' + opts.dimple[0] + '" cy="' + opts.dimple[1] + '" r="2.6" fill="' + MOUTH + '" opacity=".7"/>';
    return s + "</g>";
  }
  s += '<clipPath id="' + clip + '"><path d="' + d + '"/></clipPath>';
  s += '<path d="' + d + '" fill="' + (opts.fill || MOUTH) + '"/>';
  s += '<g clip-path="url(#' + clip + ')">';
  if (opts.teethTop) s += '<rect x="-40" y="' + (opts.teethTop - 40) + '" width="80" height="40" rx="6" fill="' + TEETH + '"/>';
  if (opts.teethBot) s += '<rect x="-40" y="' + opts.teethBot + '" width="80" height="40" rx="6" fill="' + TEETH + '"/>';
  if (opts.tongue) s += '<ellipse cx="0" cy="' + opts.tongue[0] + '" rx="' + opts.tongue[1] + '" ry="' + opts.tongue[2] + '" fill="' + TONGUE + '"/>';
  if (opts.line) s += '<path d="' + opts.line + '" stroke="' + MOUTH + '" stroke-width="2" opacity=".5"/>';
  s += "</g>";
  if (opts.lips) s += '<path d="' + d + '" fill="none" stroke="' + opts.lips + '" stroke-width="3"/>';
  return s + "</g>";
}
function mouthSet(id) {
  let rest = "";
  rest += mouthShape(id, "smile", "M -22 -4 Q 0 15 22 -4", { stroke: true });
  rest += mouthShape(id, "grin", "M -30 -8 Q 0 -3 30 -8 Q 28 25 0 29 Q -28 25 -30 -8 Z", { teethTop: 0, tongue: [26, 17, 11] });
  rest += mouthShape(id, "laugh", "M -36 -11 Q 0 -5 36 -11 Q 34 34 0 39 Q -34 34 -36 -11 Z", { teethTop: -1, tongue: [34, 21, 14] });
  rest += mouthShape(id, "smirk", "M -20 5 Q 6 11 25 -8", { stroke: true, dimple: [29, -10] });
  rest += mouthShape(id, "flat", "M -16 3 L 16 3", { stroke: true });
  rest += mouthShape(id, "frown", "M -20 10 Q 0 -6 20 10", { stroke: true });
  rest += mouthShape(id, "O", "M 0 -16 C 13 -16 15 -4 15 4 C 15 14 8 20 0 20 C -8 20 -15 14 -15 4 C -15 -4 -13 -16 0 -16 Z", { tongue: [17, 10, 7] });
  rest += mouthShape(id, "pout", "M -13 6 Q 0 -5 13 6", { stroke: true, sw: 6 });
  rest += mouthShape(id, "wavy", "M -25 4 Q -19 -4 -13 4 Q -7 12 -1 4 Q 5 -4 11 4 Q 17 12 23 4", { stroke: true, sw: 5.5 });
  rest += mouthShape(id, "angry", "M -29 -7 L 29 -7 Q 27 17 0 20 Q -27 17 -29 -7 Z", { teethTop: -2, teethBot: 12, line: "M -30 3 L 30 3" });
  rest += mouthShape(id, "kiss", "M 0 -8 C 7 -8 9 -3 9 1 C 9 6 5 9 0 9 C -5 9 -9 6 -9 1 C -9 -3 -7 -8 0 -8 Z", { tongue: [8, 4, 3], lips: "#D96A72" });
  let vis = "";
  vis += mouthShape(id, "v0", "M -15 2 Q 0 8 15 2", { stroke: true, sw: 6 });
  vis += mouthShape(id, "v1", "M -21 -7 Q 0 -11 21 -7 Q 21 22 0 26 Q -21 22 -21 -7 Z", { teethTop: -3, tongue: [24, 14, 9] });
  vis += mouthShape(id, "v2", "M 0 -14 C 12 -14 14 -4 14 3 C 14 12 8 17 0 17 C -8 17 -14 12 -14 3 C -14 -4 -12 -14 0 -14 Z", { tongue: [15, 9, 6] });
  vis += mouthShape(id, "v3", "M -25 -5 Q 0 -9 25 -5 Q 23 14 0 16 Q -23 14 -25 -5 Z", { teethTop: -1, tongue: [16, 13, 6] });
  vis += mouthShape(id, "v4", "M -26 -4 Q 0 -7 26 -4 Q 24 8 0 10 Q -24 8 -26 -4 Z", { teethTop: 0, teethBot: 5 });
  vis += mouthShape(id, "v5", "M 0 -9 C 8 -9 10 -3 10 1 C 10 7 6 10 0 10 C -6 10 -10 7 -10 1 C -10 -3 -8 -9 0 -9 Z", { tongue: [9, 5, 3] });
  vis += mouthShape(id, "v6", "M -22 -4 Q 0 -7 22 -4 Q 20 8 0 9 Q -20 8 -22 -4 Z", { fill: TEETH, line: "M -22 2 L 22 2", lips: MOUTH });
  return { rest, vis };
}
function eyeSVG(id, side, sp) {
  const e = sp.eye, rx = e.rx, ry = e.ry;
  const clip = id + "-ec" + side;
  const lidRy = ry * 1.1, lidRx = rx * 1.35;
  const dir = side === "L" ? 1 : -1;
  let s = '<g data-eye="' + side + '" transform="translate(' + (side === "L" ? -e.x : e.x) + " " + e.y + ')">';
  s += '<g data-k="n"><g data-k="scl">';
  s += '<clipPath id="' + clip + '"><ellipse rx="' + rx + '" ry="' + ry + '"/></clipPath>';
  s += '<ellipse rx="' + rx + '" ry="' + ry + '" fill="' + WHITE + '"/>';
  s += '<g clip-path="url(#' + clip + ')">';
  s += '<g data-k="pup"><circle r="' + f(rx * 0.66) + '" fill="' + INK + '"/>';
  s += '<circle cx="' + f(-rx * 0.22) + '" cy="' + f(-ry * 0.24) + '" r="' + f(rx * 0.24) + '" fill="#FFFFFF"/>';
  s += '<circle cx="' + f(rx * 0.2) + '" cy="' + f(ry * 0.2) + '" r="' + f(rx * 0.11) + '" fill="#FFFFFF" opacity=".8"/></g>';
  s += '<ellipse data-k="lt" cx="0" cy="' + f(-ry - lidRy) + '" rx="' + f(lidRx) + '" ry="' + f(lidRy) + '" fill="' + sp.skin + '"/>';
  s += '<ellipse data-k="ltl" cx="0" cy="' + f(-ry - lidRy) + '" rx="' + f(lidRx) + '" ry="' + f(lidRy) + '" fill="none" stroke="' + INK + '" stroke-width="' + (e.lash ? 6 : 4.5) + '"/>';
  s += '<ellipse data-k="lb" cx="0" cy="' + f(ry + ry * 0.9) + '" rx="' + f(rx * 1.3) + '" ry="' + f(ry * 0.9) + '" fill="' + sp.skin + '"/>';
  s += "</g>";
  s += '<ellipse rx="' + f(rx + 0.6) + '" ry="' + f(ry + 0.6) + '" fill="none" stroke="' + sp.skin + '" stroke-width="3"/>';
  if (e.lash) {
    const ox = -dir * rx;
    s += '<path data-k="wing" d="M ' + f(ox * 0.9) + " " + f(-ry * 0.35) + " Q " + f(ox * 1.25) + " " + f(-ry * 0.55) + " " + f(ox * 1.42) + " " + f(-ry * 0.95) + '" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
  }
  s += "</g></g>";
  s += '<path data-k="happy" opacity="0" d="M ' + -rx + " 5 Q 0 " + f(-ry * 1.05) + " " + rx + ' 5" stroke="' + INK + '" stroke-width="7.5" fill="none" stroke-linecap="round"/>';
  s += '<path data-k="closed" opacity="0" d="M ' + -rx + " -3 Q 0 " + f(ry * 0.62) + " " + rx + ' -3" stroke="' + INK + '" stroke-width="6.5" fill="none" stroke-linecap="round"/>';
  s += '<path data-k="squeeze" opacity="0" d="M ' + f(-dir * rx * 0.8) + " " + f(-ry * 0.55) + " L " + f(dir * rx * 0.55) + " 0 L " + f(-dir * rx * 0.8) + " " + f(ry * 0.55) + '" stroke="' + INK + '" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const st = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? rx * 0.48 : rx * 1.12;
    st.push(f(Math.cos(a) * r) + "," + f(Math.sin(a) * r));
  }
  s += '<g data-k="star" opacity="0"><ellipse rx="' + rx + '" ry="' + ry + '" fill="' + WHITE + '"/><polygon points="' + st.join(" ") + '" fill="#F2B632" stroke="#E08A1E" stroke-width="2.5" stroke-linejoin="round"/><circle cx="' + f(-rx * 0.25) + '" cy="' + f(-ry * 0.3) + '" r="3.5" fill="#FFFFFF"/></g>';
  s += "</g>";
  return s;
}
function fxSVG(id, sp) {
  let s = "";
  s += '<g data-fx="sweat" opacity="0" transform="translate(96 -168)"><path d="M 0 -20 Q 15 2 0 13 Q -15 2 0 -20 Z" fill="#9AD6F2"/><ellipse cx="-4" cy="2" rx="3" ry="5" fill="#FFFFFF" opacity=".8"/></g>';
  s += '<g data-fx="anger" opacity="0" transform="translate(-92 -176)"><path d="M -18 -6 Q -6 -6 -6 -18 M 6 -18 Q 6 -6 18 -6 M 18 6 Q 6 6 6 18 M -6 18 Q -6 6 -18 6" stroke="#E0453A" stroke-width="6" fill="none" stroke-linecap="round"/></g>';
  const sy = sp.steamY;
  const cloud = (x, k) => '<g data-p="' + k + '"><g transform="translate(' + x + " " + sy + ')"><circle cx="-12" cy="4" r="12" fill="#FFFFFF"/><circle cx="10" cy="2" r="14" fill="#FFFFFF"/><circle cx="0" cy="-9" r="13" fill="#FFFFFF"/><circle cx="2" cy="6" r="11" fill="#F1E9F5"/></g></g>';
  s += '<g data-fx="steam" opacity="0">' + cloud(-46, 0) + cloud(48, 1) + cloud(2, 2) + "</g>";
  s += '<g data-fx="excl" opacity="0" transform="translate(0 -262)"><rect x="-8" y="-46" width="16" height="34" rx="8" fill="#E0453A"/><circle cy="2" r="8.5" fill="#E0453A"/></g>';
  s += '<g data-fx="quest" opacity="0" transform="translate(84 -236)"><path d="M -12 -10 Q -12 -26 2 -26 Q 16 -26 16 -12 Q 16 -2 4 2 L 4 10" stroke="#7A5A9E" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="4" cy="24" r="5.5" fill="#7A5A9E"/></g>';
  s += '<g data-fx="lines" opacity="0"><path d="M -78 -68 L -70 -54 M -66 -70 L -58 -56 M -54 -72 L -46 -58 M 50 -72 L 58 -58 M 62 -70 L 70 -56 M 74 -68 L 82 -54" stroke="' + sp.blush + '" stroke-width="4" stroke-linecap="round"/></g>';
  s += '<g data-fx="tears" opacity="0"><path d="M -60 -88 Q -52 -74 -60 -66 Q -68 -74 -60 -88 Z" fill="#9AD6F2"/><path d="M 60 -88 Q 68 -74 60 -66 Q 52 -74 60 -88 Z" fill="#9AD6F2"/></g>';
  const sparkle = (x, y, r) => '<path d="M ' + x + " " + (y - r) + " Q " + x + " " + y + " " + (x + r) + " " + y + " Q " + x + " " + y + " " + x + " " + (y + r) + " Q " + x + " " + y + " " + (x - r) + " " + y + " Q " + x + " " + y + " " + x + " " + (y - r) + ' Z" fill="#F2C14E"/>';
  s += '<g data-fx="sparkle" opacity="0">' + sparkle(-118, -190, 16) + sparkle(122, -150, 12) + sparkle(-96, -40, 10) + sparkle(110, -230, 9) + "</g>";
  return s;
}

/* -------------------------------------------------------------- hair */
function hairBack(sp, look) {
  const F = sp.face, rx = F.rx, top = F.cy - F.ry - 18;
  const hc = sp.hair, hi = sp.hairHi;
  const cap = '<path d="M ' + -(rx + 6) + " " + (F.cy + 10) + " Q " + -(rx + 12) + " " + (top - 4) + " 0 " + (top - 6) + " Q " + (rx + 12) + " " + (top - 4) + " " + (rx + 6) + " " + (F.cy + 10) + " L " + -(rx + 6) + " " + (F.cy + 10) + ' Z" fill="' + hc + '"/>';
  switch (look.hair) {
    case "bun":
      return cap + '<circle cx="8" cy="' + (top - 34) + '" r="54" fill="' + hc + '"/><path d="M -28 ' + (top - 60) + " Q 8 " + (top - 86) + " 44 " + (top - 58) + '" stroke="' + hi + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<line x1="-60" y1="' + (top - 62) + '" x2="72" y2="' + (top - 8) + '" stroke="' + shade(sp.top, 0.25) + '" stroke-width="7" stroke-linecap="round"/><circle cx="-60" cy="' + (top - 62) + '" r="9" fill="' + sp.top + '"/>';
    case "long":
      return '<path d="M ' + -(rx + 10) + " " + (F.cy - 20) + " Q " + -(rx + 16) + " " + (top - 6) + " 0 " + (top - 8) + " Q " + (rx + 16) + " " + (top - 6) + " " + (rx + 10) + " " + (F.cy - 20) + " L " + (rx + 18) + " 46 Q " + (rx * 0.6) + " 62 0 56 Q " + -(rx * 0.6) + " 62 " + -(rx + 18) + ' 46 Z" fill="' + hc + '"/>';
    case "ponytail":
      return cap + '<path d="M ' + (rx - 6) + " " + (top + 40) + " Q " + (rx + 70) + " " + (top + 30) + " " + (rx + 40) + " " + (F.cy + 40) + " Q " + (rx + 18) + " " + (F.cy - 10) + " " + (rx - 10) + " " + (top + 64) + ' Z" fill="' + hc + '"/><circle cx="' + (rx + 2) + '" cy="' + (top + 46) + '" r="9" fill="' + sp.top + '"/>';
    case "bob":
      return '<path d="M ' + -(rx + 10) + " " + (F.cy + 34) + " Q " + -(rx + 16) + " " + (top - 6) + " 0 " + (top - 8) + " Q " + (rx + 16) + " " + (top - 6) + " " + (rx + 10) + " " + (F.cy + 34) + " Q 0 " + (F.cy + 46) + " " + -(rx + 10) + " " + (F.cy + 34) + ' Z" fill="' + hc + '"/>';
    case "curly":
      return cap + [-1, 1].map((s) => '<circle cx="' + s * (rx - 2) + '" cy="' + (F.cy - 18) + '" r="19" fill="' + hc + '"/><circle cx="' + s * (rx + 2) + '" cy="' + (F.cy + 10) + '" r="14" fill="' + hc + '"/>').join("");
    case "bald":
      return [-1, 1].map((s) => '<path d="M ' + s * (rx - 2) + " " + (F.cy - 40) + " Q " + s * (rx + 10) + " " + (F.cy - 10) + " " + s * (rx - 2) + " " + (F.cy + 18) + '" stroke="' + hc + '" stroke-width="16" fill="none" stroke-linecap="round"/>').join("");
    default:
      return cap;
  }
}
function hairFront(sp, look) {
  const F = sp.face, rx = F.rx, top = F.cy - F.ry - 18;
  const hc = sp.hair, hi = sp.hairHi;
  if (look.hat && look.hat !== "none") {
    // under a hat only the fringe at the temples shows
    return [-1, 1].map((s) => '<path d="M ' + s * (rx - 4) + " " + (F.cy - 52) + " Q " + s * (rx + 4) + " " + (F.cy - 20) + " " + s * (rx - 6) + " " + (F.cy - 2) + '" stroke="' + hc + '" stroke-width="12" fill="none" stroke-linecap="round"/>').join("");
  }
  switch (look.hair) {
    case "bun":
    case "ponytail":
      return '<path d="M ' + -(rx + 3) + " " + (F.cy + 10) + " Q " + -(rx + 7) + " " + (top - 2) + " 4 " + (top - 5) + " Q " + (rx + 7) + " " + (top - 2) + " " + (rx + 3) + " " + (F.cy + 10) + " Q " + (rx - 6) + " " + (top + 52) + " " + (rx - 34) + " " + (top + 70) + " Q " + (rx - 28) + " " + (top + 40) + " " + (rx - 48) + " " + (top + 28) + " Q 10 " + (top + 16) + " " + -(rx - 26) + " " + (top + 44) + " Q " + -(rx - 4) + " " + (top + 64) + " " + -(rx + 3) + " " + (F.cy + 10) + ' Z" fill="' + hc + '"/>' +
        '<path d="M -44 ' + (top + 2) + " Q 4 " + (top - 14) + " 52 " + (top + 4) + '" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>';
    case "bob":
    case "long":
      return '<path d="M ' + -(rx + 4) + " " + (F.cy + 6) + " Q " + -(rx + 8) + " " + (top - 4) + " 0 " + (top - 6) + " Q " + (rx + 8) + " " + (top - 4) + " " + (rx + 4) + " " + (F.cy + 6) + " L " + (rx - 8) + " " + (F.cy - 36) + " Q " + (rx * 0.4) + " " + (top + 54) + " 0 " + (top + 50) + " Q " + -(rx * 0.5) + " " + (top + 58) + " " + -(rx - 8) + " " + (F.cy - 36) + ' Z" fill="' + hc + '"/>' +
        '<path d="M -50 ' + (top + 4) + " Q 0 " + (top - 12) + " 50 " + (top + 4) + '" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>';
    case "side":
      return '<path d="M ' + -(rx + 1) + " " + (F.cy - 2) + " Q " + -(rx + 9) + " " + (top - 8) + " 0 " + (top - 10) + " Q " + (rx + 9) + " " + (top - 8) + " " + (rx + 1) + " " + (F.cy - 2) + " Q " + (rx - 6) + " " + (top + 44) + " " + (rx - 16) + " " + (top + 58) + " Q " + (rx - 52) + " " + (top + 40) + " 20 " + (top + 60) + " Q -30 " + (top + 30) + " " + -(rx - 30) + " " + (top + 48) + " Q " + -(rx - 6) + " " + (top + 64) + " " + -(rx + 1) + " " + (F.cy - 2) + ' Z" fill="' + hc + '"/>' +
        (look.age === "middle" ? '<path d="M ' + -(rx + 1) + " " + (F.cy - 2) + " Q " + -(rx + 6) + " " + (top + 30) + " " + -(rx - 22) + " " + (top + 6) + " Q " + -(rx - 14) + " " + (top + 40) + " " + -(rx + 1) + ' ' + (F.cy - 2) + ' Z" fill="#C2BCC8"/>' : "") +
        '<path d="M -70 ' + (top + 2) + " Q -20 " + (top - 12) + " 40 " + (top + 2) + '" stroke="' + hi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/>';
    case "crew":
      return '<path d="M ' + -(rx - 2) + " " + (F.cy - 30) + " Q " + -(rx + 2) + " " + (top + 4) + " 0 " + (top + 2) + " Q " + (rx + 2) + " " + (top + 4) + " " + (rx - 2) + " " + (F.cy - 30) + " Q " + (rx - 14) + " " + (top + 34) + " 0 " + (top + 30) + " Q " + -(rx - 14) + " " + (top + 34) + " " + -(rx - 2) + " " + (F.cy - 30) + ' Z" fill="' + hc + '" opacity=".95"/>';
    case "curly": {
      let s = "";
      for (let i = 0; i < 7; i += 1) {
        const x = -rx * 0.78 + (i * rx * 1.56) / 6;
        s += '<circle cx="' + f(x) + '" cy="' + f(top + 18 + Math.abs(i - 3) * 6) + '" r="' + (24 - Math.abs(i - 3) * 2) + '" fill="' + hc + '"/>';
      }
      return s;
    }
    case "bald":
      return '<ellipse cx="-30" cy="' + (top + 30) + '" rx="22" ry="10" fill="#FFFFFF" opacity=".35"/>';
    default:
      return "";
  }
}
function hatSVG(sp, look) {
  const F = sp.face, rx = F.rx, top = F.cy - F.ry - 18;
  switch (look.hat) {
    case "toque":
      return '<rect x="' + -(rx - 4) + '" y="' + (top - 48) + '" width="' + (2 * rx - 8) + '" height="56" fill="#FFFFFF"/>' +
        '<circle cx="-58" cy="' + (top - 50) + '" r="52" fill="#FFFFFF"/><circle cx="58" cy="' + (top - 50) + '" r="52" fill="#FFFFFF"/><circle cx="0" cy="' + (top - 78) + '" r="60" fill="#FFFFFF"/>' +
        '<path d="M -40 ' + (top - 88) + " L -44 " + (top - 10) + " M 0 " + (top - 118) + " L 0 " + (top - 10) + " M 40 " + (top - 88) + " L 44 " + (top - 10) + '" stroke="#EAE3D7" stroke-width="5" stroke-linecap="round"/>' +
        '<rect x="' + -(rx - 6) + '" y="' + (top - 12) + '" width="' + (2 * rx - 12) + '" height="42" rx="12" fill="#FFFFFF"/><rect x="' + -(rx - 6) + '" y="' + (top + 22) + '" width="' + (2 * rx - 12) + '" height="8" rx="4" fill="#ECE5DA"/>';
    case "cap":
      return '<path d="M ' + -(rx + 2) + " " + (top + 34) + " L " + -(rx - 14) + " " + (top - 30) + " Q 0 " + (top - 44) + " " + (rx - 14) + " " + (top - 30) + " L " + (rx + 2) + " " + (top + 34) + ' Z" fill="#FFFFFF"/>' +
        '<rect x="' + -(rx + 4) + '" y="' + (top + 24) + '" width="' + (2 * rx + 8) + '" height="16" rx="8" fill="' + sp.accent + '"/>';
    case "bandana":
      return '<path d="M ' + -(rx + 4) + " " + (top + 40) + " Q " + -(rx + 10) + " " + (top - 22) + " 0 " + (top - 24) + " Q " + (rx + 10) + " " + (top - 22) + " " + (rx + 4) + " " + (top + 40) + " Q 0 " + (top + 22) + " " + -(rx + 4) + " " + (top + 40) + ' Z" fill="' + sp.top + '"/>' +
        '<path d="M ' + (rx - 4) + " " + (top + 26) + " q 34 -6 40 18 q -22 -2 -30 8 z" + '" fill="' + sp.topShade + '"/><circle cx="-30" cy="' + (top + 2) + '" r="6" fill="' + shade(sp.top, 0.5) + '"/><circle cx="20" cy="' + (top - 6) + '" r="6" fill="' + shade(sp.top, 0.5) + '"/>';
    default:
      return "";
  }
}

/* ------------------------------------------------------------- bodies */
function torsoPath(W, bottom) {
  return "M " + f(-W * 0.77) + " -210 Q " + f(-W * 0.98) + " -206 " + f(-W) + " -186 L " + f(-W * 1.05) + " -104 Q " + f(-W * 1.05) + " " + f(bottom - 2) + " " + f(-W * 0.82) + " " + bottom +
    " L " + f(W * 0.82) + " " + bottom + " Q " + f(W * 1.05) + " " + f(bottom - 2) + " " + f(W * 1.05) + " -104 L " + W + " -186 Q " + f(W * 0.98) + " -206 " + f(W * 0.77) + " -210 Z";
}
function torsoSVG(sp, look) {
  const W = sp.W, bot = sp.round ? -70 : -84;
  let s = '<path d="' + torsoPath(W, bot) + '" fill="' + sp.top + '"/>';
  s += '<path d="M ' + f(W * 0.67) + " -206 Q " + W + " -204 " + f(W * 1.02) + " -186 L " + f(W * 1.05) + " -104 Q " + f(W * 1.05) + " " + (bot - 6) + " " + f(W * 0.9) + " " + (bot - 2) + " L " + f(W * 0.8) + " " + (bot - 2) + " Q " + f(W * 0.86) + " -150 " + f(W * 0.67) + ' -206 Z" fill="' + sp.topShade + '" opacity=".55"/>';
  const btn = (x, y) => '<rect x="' + (x - 14) + '" y="' + y + '" width="28" height="7" rx="3.5" fill="' + sp.trim + '"/><circle cx="' + (x + 15) + '" cy="' + (y + 3.5) + '" r="4.5" fill="' + sp.trim + '"/>';
  switch (look.outfit) {
    case "jacket":
      s += '<path d="M -24 -212 L 0 -170 L 24 -212 Z" fill="' + sp.inner + '"/><path d="M -29 -219 Q 0 -207 29 -219 L 31 -206 Q 0 -194 -31 -206 Z" fill="' + sp.topShade + '"/>';
      [-188, -168, -148].forEach((y) => (s += btn(-3, y)));
      s += '<path d="M ' + f(-W * 0.87) + " -130 L " + f(W * 0.87) + " -130 L " + f(W * 0.94) + " -42 Q 0 -33 " + f(-W * 0.94) + ' -42 Z" fill="' + sp.apron + '"/>';
      s += '<rect x="' + f(-W * 0.93) + '" y="-136" width="' + f(W * 1.86) + '" height="12" rx="6" fill="' + sp.apronShade + '"/>';
      s += '<rect x="' + f(-W * 0.56) + '" y="-106" width="42" height="34" rx="6" fill="' + sp.apronShade + '"/>';
      break;
    case "tang":
      s += '<path d="M -29 -220 Q 0 -208 29 -220 L 31 -205 Q 0 -193 -31 -205 Z" fill="' + sp.trim + '"/><path d="M 2 -200 Q 8 -160 6 -122" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
      [-186, -165, -144].forEach((y) => (s += btn(5, y)));
      s += '<path d="M ' + f(-W * 0.86) + " -124 L " + f(W * 0.86) + " -124 L " + f(W * 0.92) + " -28 Q 0 -17 " + f(-W * 0.92) + ' -28 Z" fill="' + sp.apron + '"/>';
      s += '<rect x="' + f(-W * 0.9) + '" y="-130" width="' + f(W * 1.8) + '" height="12" rx="6" fill="' + sp.apronShade + '"/>';
      s += '<rect x="14" y="-104" width="46" height="38" rx="8" fill="' + sp.top + '"/>';
      break;
    case "chef":
      s += '<path d="M 10 -204 Q 15 -150 10 -96" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
      [-182, -158, -134].forEach((y) => (s += '<circle cx="-22" cy="' + y + '" r="5.5" fill="#3B2A44"/><circle cx="32" cy="' + y + '" r="5.5" fill="#3B2A44"/>'));
      s += '<path d="M ' + f(-W * 0.88) + " -122 L " + f(W * 0.88) + " -122 L " + f(W * 0.95) + " -38 Q 0 -30 " + f(-W * 0.95) + ' -38 Z" fill="' + sp.apron + '"/>';
      s += '<rect x="' + f(-W * 0.93) + '" y="-128" width="' + f(W * 1.86) + '" height="11" rx="5.5" fill="' + sp.apronShade + '"/>';
      s += '<path d="M -35 -221 Q 0 -201 35 -221 L 31 -204 Q 0 -186 -31 -204 Z" fill="' + sp.accent + '"/><path d="M -7 -201 L 7 -201 L 20 -164 L 0 -175 L -20 -164 Z" fill="' + sp.accent + '"/><path d="M 0 -175 L 20 -164 L 7 -201 Z" fill="' + shade(sp.accent, -0.2) + '"/>';
      break;
    default: // shirt + bib apron
      s += '<path d="M -26 -214 L -6 -192 L -16 -184 Z M 26 -214 L 6 -192 L 16 -184 Z" fill="' + sp.inner + '"/>';
      s += '<path d="M ' + f(-W * 0.5) + " -196 L " + f(W * 0.5) + " -196 L " + f(W * 0.56) + " -150 L " + f(W * 0.88) + " -128 L " + f(W * 0.94) + " -38 Q 0 -30 " + f(-W * 0.94) + " -38 L " + f(-W * 0.88) + " -128 L " + f(-W * 0.56) + ' -150 Z" fill="' + sp.apron + '"/>';
      s += '<path d="M ' + f(-W * 0.5) + " -196 L " + f(-W * 0.62) + " -214 M " + f(W * 0.5) + " -196 L " + f(W * 0.62) + ' -214" stroke="' + sp.apronShade + '" stroke-width="7" stroke-linecap="round"/>';
      s += '<rect x="' + f(-W * 0.3) + '" y="-112" width="' + f(W * 0.6) + '" height="36" rx="8" fill="' + sp.apronShade + '"/>';
  }
  return s;
}
function badgeSVG(id, sp, look) {
  const W = sp.W, x = f(-W * 0.46), y = look.outfit === "shirt" ? -176 : -172, r = 23;
  let s = '<g data-k="badge" transform="translate(' + x + " " + y + ')">';
  s += '<circle r="' + (r + 3) + '" fill="' + shade(look.theme || sp.top, -0.35) + '"/><circle r="' + r + '" fill="#FFFFFF"/>';
  if (look.logo) {
    s += '<clipPath id="' + id + '-badge"><circle r="' + (r - 3) + '"/></clipPath>';
    s += '<image href="' + look.logo + '" x="' + -(r - 3) + '" y="' + -(r - 3) + '" width="' + 2 * (r - 3) + '" height="' + 2 * (r - 3) + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + id + '-badge)"/>';
  } else {
    s += '<circle r="' + (r - 3) + '" fill="' + (look.theme || sp.top) + '"/><text y="7" text-anchor="middle" font-size="21" font-weight="700" font-family="Noto Sans SC, sans-serif" fill="#FFFFFF">' + esc((look.badgeText || "店").slice(0, 1)) + "</text>";
  }
  s += '<circle r="' + r + '" fill="none" stroke="' + (look.theme || sp.top) + '" stroke-width="2.5"/></g>';
  return s;
}
function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function armSVG(sp, look, side) {
  const long = look.outfit === "chef" || look.outfit === "shirt";
  const sleeve = sp.top;
  let forearm = long ? capsule(0, -6, 29, 58, look.outfit === "shirt" ? sp.inner : sleeve) + capsule(0, 34, 31, 14, sp.topShade) : capsule(0, -6, 27, 62, sp.skin);
  let upper = capsule(0, -10, sp.round ? 36 : 34, 72, look.outfit === "shirt" ? sp.inner : sleeve);
  if (look.outfit === "tang") upper += capsule(0, 44, 36, 14, sp.trim);
  if (look.outfit === "jacket") forearm += capsule(0, -8, 33, 16, sp.topShade);
  const hand = '<g data-k="hand">' +
    '<g data-h="open"><circle r="18" fill="' + sp.skin + '"/><ellipse cx="' + (side === "L" ? 13 : -13) + '" cy="-6" rx="7" ry="9" fill="' + sp.skin + '"/></g>' +
    '<g data-h="fist" opacity="0"><circle r="16" fill="' + sp.skin + '"/><path d="M -9 -4 L 9 -4 M -9 3 L 9 3" stroke="' + sp.skinShade + '" stroke-width="2.5" stroke-linecap="round"/></g>' +
    '<g data-h="thumb" opacity="0"><circle r="16" fill="' + sp.skin + '"/>' + capsule(side === "L" ? 7 : -7, 2, 12, 32, sp.skin) + '<path d="M -9 2 L 9 2 M -9 9 L 9 9" stroke="' + sp.skinShade + '" stroke-width="2.5" stroke-linecap="round"/></g>' +
    '<g data-h="point" opacity="0"><circle r="16" fill="' + sp.skin + '"/>' + capsule(0, 6, 11, 34, sp.skin) + "</g></g>";
  return '<g data-arm="' + side + '">' + upper + '<g data-k="elbow">' + forearm + '<g data-k="handpos">' + hand + "</g></g></g>";
}
function legSVG(sp, side) {
  const w = sp.legW, L = sp.lext;
  return '<g data-leg="' + side + '">' + capsule(0, -6, w, 90 + L, sp.pants) +
    '<path d="M ' + f(-w / 2 - 4) + " " + (92 + L) + " Q " + f(-w / 2 - 4) + " " + (70 + L) + " " + (side === "L" ? -4 : 4) + " " + (70 + L) + " Q " + f(w / 2 + 6) + " " + (70 + L) + " " + f(w / 2 + 6) + " " + (92 + L) + ' Z" fill="' + sp.shoes + '"/></g>';
}

/* ------------------------------------------------------------- build */
export function buildSVG(id, look) {
  const S = specFor(look), sp = S.sp, fa = sp.face;
  const m = mouthSet(id);
  let head = hairBack(sp, look);
  head += '<ellipse cx="' + -(fa.rx - 6) + '" cy="' + (fa.cy + 6) + '" rx="19" ry="25" fill="' + sp.skin + '"/><ellipse cx="' + (fa.rx - 6) + '" cy="' + (fa.cy + 6) + '" rx="19" ry="25" fill="' + sp.skin + '"/>';
  head += '<ellipse cx="' + -(fa.rx - 4) + '" cy="' + (fa.cy + 8) + '" rx="8" ry="12" fill="' + sp.skinShade + '"/><ellipse cx="' + (fa.rx - 4) + '" cy="' + (fa.cy + 8) + '" rx="8" ry="12" fill="' + sp.skinShade + '"/>';
  if ((look.accessories || []).includes("earrings")) head += '<circle cx="' + -(fa.rx - 2) + '" cy="' + (fa.cy + 34) + '" r="6.5" fill="' + sp.accent + '"/><circle cx="' + (fa.rx - 2) + '" cy="' + (fa.cy + 34) + '" r="6.5" fill="' + sp.accent + '"/>';
  head += '<ellipse cx="0" cy="' + fa.cy + '" rx="' + fa.rx + '" ry="' + fa.ry + '" fill="' + sp.skin + '"/>';
  if (S.male && S.body.round) head += '<path d="M -44 -16 Q 0 6 44 -16" stroke="' + sp.skinShade + '" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>';
  head += '<g data-k="feat">';
  head += '<ellipse data-k="cheekL" cx="' + -sp.cheek.x + '" cy="' + sp.cheek.y + '" rx="' + sp.cheek.rx + '" ry="' + sp.cheek.ry + '" fill="' + sp.blush + '"/>';
  head += '<ellipse data-k="cheekR" cx="' + sp.cheek.x + '" cy="' + sp.cheek.y + '" rx="' + sp.cheek.rx + '" ry="' + sp.cheek.ry + '" fill="' + sp.blush + '"/>';
  head += S.male ? '<ellipse cx="0" cy="-74" rx="12" ry="9" fill="' + sp.skinShade + '"/>' : '<ellipse cx="0" cy="-74" rx="8" ry="6" fill="' + sp.skinShade + '"/>';
  if (S.old) head += '<path d="M -68 -96 l -10 -4 M -68 -88 l -12 0 M 68 -96 l 10 -4 M 68 -88 l 12 0" stroke="' + sp.skinShade + '" stroke-width="3" stroke-linecap="round"/>';
  head += eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp);
  if ((look.accessories || []).includes("glasses")) {
    const e = sp.eye;
    head += '<g fill="none" stroke="#3B2A44" stroke-width="5"><circle cx="' + -e.x + '" cy="' + e.y + '" r="' + (e.ry + 7) + '"/><circle cx="' + e.x + '" cy="' + e.y + '" r="' + (e.ry + 7) + '"/><path d="M ' + -(e.x - e.ry - 7) + " " + (e.y - 4) + " Q 0 " + (e.y - 12) + " " + (e.x - e.ry - 7) + " " + (e.y - 4) + '"/></g>';
  }
  head += '<linearGradient id="' + id + '-flush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0453A" stop-opacity=".95"/><stop offset=".3" stop-color="#E0453A" stop-opacity=".55"/><stop offset=".44" stop-color="#E0453A" stop-opacity="0"/></linearGradient>';
  head += '<ellipse data-k="red" cx="0" cy="' + fa.cy + '" rx="' + (fa.rx - 2) + '" ry="' + (fa.ry - 2) + '" fill="url(#' + id + '-flush)" opacity="0"/>';
  const b = sp.browAt;
  ["L", "R"].forEach((side) => {
    const x = side === "L" ? -b.x : b.x;
    const d = side === "L" ? "M " + -b.w + " 2 Q " + -2 + " " + -b.h + " " + b.w + " 0" : "M " + -b.w + " 0 Q 2 " + -b.h + " " + b.w + " 2";
    head += '<g data-brow="' + side + '" transform="translate(' + x + " " + b.y + ')"><path d="' + d + '" stroke="' + sp.brow + '" stroke-width="' + b.sw + '" fill="none" stroke-linecap="round"/></g>';
  });
  if ((look.accessories || []).includes("mustache")) head += '<path d="M 0 -60 Q -18 -66 -34 -52 Q -16 -54 0 -54 Q 16 -54 34 -52 Q 18 -66 0 -60 Z" fill="' + sp.hair + '"/>';
  head += '<g data-k="mouth" transform="translate(0 ' + sp.mouthAt.y + ") scale(" + sp.mouthAt.s + ')">' + m.rest + '<g data-k="talk">' + m.vis + "</g></g>";
  head += "</g>";
  head += '<g data-k="hairF">' + hairFront(sp, look) + hatSVG(sp, look) + "</g>";
  head += fxSVG(id, sp);
  const sh = sp.shoulder;
  let svg = '<ellipse data-k="shadow" cx="0" cy="2" rx="' + (sp.round ? 104 : 88) + '" ry="16" fill="#2B1B30" opacity=".18"/>';
  svg += '<g data-k="body">';
  svg += '<g data-k="legL" transform="translate(-30 ' + (-98 - sp.lext) + ')">' + legSVG(sp, "L") + "</g>";
  svg += '<g data-k="legR" transform="translate(30 ' + (-98 - sp.lext) + ')">' + legSVG(sp, "R") + "</g>";
  svg += '<g data-k="torso"><g transform="translate(0 ' + -sp.lext + ')">';
  svg += '<rect x="-17" y="-236" width="34" height="32" rx="10" fill="' + sp.skinShade + '"/>';
  svg += torsoSVG(sp, look) + badgeSVG(id, sp, look);
  svg += '<g data-k="head" transform="translate(0 -214)">' + head + "</g>";
  svg += '<g data-k="armL" transform="translate(' + -sh + ' -200)">' + armSVG(sp, look, "L") + "</g>";
  svg += '<g data-k="armR" transform="translate(' + sh + ' -200)">' + armSVG(sp, look, "R") + "</g>";
  svg += "</g></g></g>";
  return { svg, S };
}

/* ------------------------------------------------------------- the rig */
let PROTO = null;
function proto() {
  if (PROTO) return PROTO;
  const probe = document.createElement("div");
  PROTO = Object.getPrototypeOf(window.RIG.create(probe, "rong", "kit-probe"));
  return PROTO;
}

// a Rig built on the film's prototype: same render(), same Actor
export function createKitRig(container, look, id) {
  const { svg: markup, S } = buildSVG(id, look);
  const rig = Object.create(proto());
  rig.who = look.id || "kit";
  rig.id = id;
  rig.sp = S.sp;
  rig.kit = S;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", S.viewBox);
  svg.setAttribute("class", "rig rig-kit");
  svg.setAttribute("overflow", "visible");
  svg.innerHTML = markup;
  container.appendChild(svg);
  rig.svg = svg;
  const q = (sel) => svg.querySelector(sel);
  rig.el = {
    body: q('[data-k="body"]'), torso: q('[data-k="torso"]'), head: q('[data-k="head"]'), shadow: q('[data-k="shadow"]'),
    feat: q('[data-k="feat"]'), hairF: q('[data-k="hairF"]'), red: q('[data-k="red"]'),
    cheekL: q('[data-k="cheekL"]'), cheekR: q('[data-k="cheekR"]'), mouth: q('[data-k="mouth"]'), talk: q('[data-k="talk"]'),
    legL: q('[data-k="legL"]'), legR: q('[data-k="legR"]'),
  };
  rig.mouths = {};
  svg.querySelectorAll("[data-m]").forEach((n) => (rig.mouths[n.getAttribute("data-m")] = n));
  rig.eyes = {};
  ["L", "R"].forEach((s) => {
    const g = svg.querySelector('[data-eye="' + s + '"]');
    const k = (x) => g.querySelector('[data-k="' + x + '"]');
    rig.eyes[s] = { g, n: k("n"), scl: k("scl"), pup: k("pup"), lt: k("lt"), ltl: k("ltl"), lb: k("lb"), wing: k("wing"), happy: k("happy"), closed: k("closed"), squeeze: k("squeeze"), star: k("star") };
  });
  rig.brows = { L: q('[data-brow="L"]'), R: q('[data-brow="R"]') };
  rig.arms = {};
  ["L", "R"].forEach((s) => {
    const g = q('[data-k="arm' + s + '"]');
    const hands = {};
    g.querySelectorAll("[data-h]").forEach((n) => (hands[n.getAttribute("data-h")] = n));
    rig.arms[s] = { g, x: (s === "L" ? -1 : 1) * S.sp.shoulder, elbow: g.querySelector('[data-k="elbow"]'), handpos: g.querySelector('[data-k="handpos"]'), hands };
  });
  rig.fx = {};
  svg.querySelectorAll("[data-fx]").forEach((n) => (rig.fx[n.getAttribute("data-fx")] = n));
  rig.steamP = svg.querySelectorAll('[data-fx="steam"] [data-p]');
  rig.cache = new Map();
  return rig;
}
