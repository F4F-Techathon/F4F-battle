// icons.js — one line-icon set for the whole UI, and the expression face icons
// (each character × each expression, rendered once from the rig and cached).

import * as frames from "./frames.js";
import * as roster from "./roster.js";

const P = {
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5V9h4.5"/>',
  inspect: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  reply: '<path d="M10 15l-5-5 5-5"/><path d="M5 10h8a6 6 0 0 1 6 6v3"/>',
  send: '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5a6.5 6.5 0 0 1-6.5 6.5h-.4a6 6 0 0 1-4.6-2.2L3.7 15.4a1.5 1.5 0 0 1 2.2-2l2.1 2.1"/>',
  bolt: '<path d="M13 3L5 13.5h6.5L10 21l8-10.5h-6.5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  bubble: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cut: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7L18 4M15.7 15.7L6 4"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/>',
  save: '<path d="M5 4.5h11l3 3V19.5H5z"/><path d="M8 4.5v4.5h7V4.5M8 19.5v-6h8v6"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  playall: '<path d="M4 6.5h10M4 11.5h10M4 16.5h6"/><path d="M15.5 14v6.5l5.5-3.25z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  loop: '<path d="M17 3l3 3-3 3"/><path d="M4 11.5V10a4 4 0 0 1 4-4h12M7 21l-3-3 3-3"/><path d="M20 12.5V14a4 4 0 0 1-4 4H4"/>',
};

export function icon(name, cls) {
  return `<svg class="i${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;
}

export function iconEl(name, cls) {
  const t = document.createElement("template");
  t.innerHTML = icon(name, cls);
  return t.content.firstChild;
}

const cache = new Map();
// face(who, expr) → blob URL of that character's head showing the expression
export function face(who, expr) {
  if (!roster.hasRig(who)) return null;
  const k = who + "|" + (expr || "idle");
  if (cache.has(k)) return cache.get(k);
  const a = frames.actor(who);
  a.e(0, expr || "idle");
  const st = a.state(2);
  const url = frames.snapshot(who, st, "icon");
  cache.set(k, url);
  return url;
}

export function clearFaces(who) {
  [...cache.keys()].filter((k) => k.startsWith(who + "|")).forEach((k) => {
    URL.revokeObjectURL(cache.get(k));
    cache.delete(k);
  });
  frames.invalidate(who);
}

// an <img> (or the host's orb, or 我's monogram) sized `px`
export function faceEl(who, expr, px, title) {
  if (!roster.hasRig(who)) {
    const s = document.createElement("span");
    s.className = who === "orb" ? "orbface" : "meface";
    s.style.width = s.style.height = px + "px";
    if (who !== "orb") {
      s.style.fontSize = Math.round(px * 0.46) + "px";
      s.textContent = (roster.info(who).name || "我").slice(0, 1);
    }
    if (title) s.title = title;
    return s;
  }
  const img = document.createElement("img");
  img.className = "face";
  img.width = img.height = px;
  img.alt = title || "";
  if (title) img.title = title;
  img.src = face(who, expr);
  return img;
}
