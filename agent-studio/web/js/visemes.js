// visemes.js — a lip track drawn as a strip: colour = mouth shape, height = opening.

export const VIS_COLOR = ["#3a3d4c", "#E57A63", "#E2B85C", "#4DB393", "#7FA8E6", "#A18CE6", "#D9D3C7"];

export function drawVisemes(cv, L) {
  const g = cv.getContext("2d");
  const n = L.v.length;
  const w = cv.width / n;
  g.clearRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < n; i += 1) {
    const v = +L.v[i], o = +L.o[i] / 9;
    g.fillStyle = VIS_COLOR[v];
    const hh = 2 + o * (cv.height - 2);
    g.fillRect(i * w, (cv.height - hh) / 2, Math.max(1, w - 0.4), hh);
  }
}
