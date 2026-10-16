// util.js — tiny DOM + math helpers shared by every view.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") {
        // custom properties (--c) need setProperty; Object.assign drops them
        for (const s in v) s.startsWith("--") ? el.style.setProperty(s, v[s]) : (el.style[s] = v[s]);
      }
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  }
  return el;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
export const easeOutBack = (k) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
export const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function fmtT(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return (m ? m + ":" : "") + (m ? String((s % 60).toFixed(2)).padStart(5, "0") : (s % 60).toFixed(2)) + "s";
}

export function download(name, data, type = "application/json") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
}

// a small event bus: the multi-agent "message bus" every view listens to
const listeners = new Set();
export const bus = {
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(type, payload) {
    const ev = { type, payload: payload || {}, at: performance.now() };
    listeners.forEach((fn) => fn(ev));
  },
};

export async function api(path, body, method) {
  const opt = body != null ? { method: method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: method || "GET" };
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || "HTTP " + r.status);
  return j;
}
