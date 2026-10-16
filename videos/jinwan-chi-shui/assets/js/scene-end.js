/* scene-end.js — 80.4–86 s: logo, tagline, the three heads pop up. */
(function () {
  "use strict";
  var F = FILM, T = F.T, tl = F.tl, h = F.h;
  var root = F.$("sc-end");

  [["#F6C7B0", 300, 120, 520], ["#D9CCF0", 1260, 80, 560], ["#CFE4D6", 760, 520, 620]].forEach(function (g, i) {
    var e = h("div", "end-glow", root);
    F.css(e, { background: g[0], left: g[1] + "px", top: g[2] + "px", width: g[3] + "px", height: g[3] + "px", opacity: "0.8" });
    F.each(function (t) {
      e.style.transform = "translate(" + (Math.sin(t * 0.6 + i) * 30).toFixed(1) + "px," + (Math.cos(t * 0.5 + i) * 20).toFixed(1) + "px)";
    });
  });

  // stacked-layer extrusion for the logo (3d-text-depth-layers)
  var logo = h("div", "logo", root);
  logo.setAttribute("data-layout-allow-overlap", "");
  var face = h("div", "ly", logo, "今晚吃谁？");
  face.style.color = "#2B1B30";
  face.style.position = "relative";
  face.style.textShadow = "4px 6px 0 #C9483E, 8px 12px 0 #E3B04B, 12px 18px 0 #2F6E62, 16px 24px 0 #7A5A9E";
  var tag = h("div", "tag", root, "让餐馆吵一架，你只管吃瓜。");
  var tag2 = h("div", "tag2", root, "多智能体角色 · 实时语音对口型 · 表情驱动的选餐路演");

  var counter = h("div", "counter", root);
  var X = { rong: 600, hua: 960, pierre: 1320 };
  var S = 0.8, RW = 420 * S, RH = 640 * S;
  var WHO = ["rong", "hua", "pierre"];
  var actors = {};
  WHO.forEach(function (w, i) {
    var box = h("div", "rigbox", root);
    F.css(box, { width: RW + "px", height: RH + "px", left: X[w] - RW / 2 + "px", top: 532 + "px" });
    var rig = RIG.create(box, w, "end-" + w);
    var a = new RIG.Actor(rig, { seed: i + 7, expr: "idle" });
    actors[w] = F.actor(a, T.endIn, T.end);
    var t0 = T.endIn + 0.9 + i * 0.16;
    tl.fromTo(box, { y: 300 }, { y: 0, duration: 0.6, ease: "back.out(1.7)" }, t0);
  });
  root.appendChild(counter);
  actors.rong.e(T.endIn, "wink").p(T.endIn + 1.1, "thumbR");
  actors.hua.e(T.endIn, "laugh").p(T.endIn + 1.2, "belly").act(T.endIn + 1.3, "bounce", 2.4);
  actors.pierre.e(T.endIn, "kiss").p(T.endIn + 1.3, "kissR").p(T.endIn + 1.8, "kissOut");
  WHO.forEach(function (w) {
    actors[w].look(T.endIn, 0, 0.1);
  });

  tl.fromTo(logo, { scale: 0.6, opacity: 0, y: 40 }, { scale: 1, opacity: 1, y: 0, duration: 0.7, ease: "back.out(1.8)" }, T.endIn + 0.15);
  tl.fromTo(tag, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, T.endIn + 0.7);
  tl.fromTo(tag2, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, T.endIn + 1.0);
  tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.45 }, T.endIn);
  F.confetti(root, 960, 300, T.endIn + 0.35, { n: 36, seed: 31, cone: 1.2, dur: 2.4, g: 900 });
})();
