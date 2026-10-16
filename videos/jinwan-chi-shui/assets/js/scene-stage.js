/* scene-stage.js — 31.2–80.8 s: the roadshow. Curtain, pitches, roasts,
 * the agent's latent-need insight, the pick and the booking. */
(function () {
  "use strict";
  var F = FILM, T = F.T, tl = F.tl, h = F.h, U = F.U, prand = F.prand;
  var root = F.$("sc-stage");
  var WHO = ["rong", "hua", "pierre"];
  var X = { rong: 440, hua: 960, pierre: 1480 };
  var EDGE = { rong: "#C9483E", hua: "#2F6E62", pierre: "#7A5A9E" };
  var NAME = { rong: "蓉姐 · 巴适川菜", hua: "华叔 · 华记粤点", pierre: "Pierre · Chez Pierre" };
  var FEET_Y = 905;

  /* ------------------------------------------------------------ set */
  h("div", "st-wall", root);
  h("div", "st-stripes", root);
  var marquee = h("div", "marquee", root, '<div class="mt">今晚吃谁？</div>');
  var bulbs = [];
  for (var b = 0; b < 30; b += 1) {
    var el = h("i", "bulb", marquee);
    var MW = 520, MH = 86, per = 2 * (MW + MH);
    var d = (b / 30) * per, x, y;
    if (d < MW) { x = d; y = 0; } else if (d < MW + MH) { x = MW; y = d - MW; } else if (d < 2 * MW + MH) { x = MW - (d - MW - MH); y = MH; } else { x = 0; y = MH - (d - 2 * MW - MH); }
    F.css(el, { left: x - 6 + "px", top: y - 6 + "px" });
    bulbs.push(el);
  }
  F.each(function (t) {
    var k = Math.floor(t * 6);
    for (var i = 0; i < bulbs.length; i += 1) bulbs[i].style.opacity = (i + k) % 3 === 0 ? "1" : "0.45";
  });
  var beams = {}, pools = {};
  WHO.forEach(function (w) {
    var bm = h("div", "beam", root);
    bm.style.left = X[w] + "px";
    beams[w] = bm;
  });
  h("div", "st-floor", root);
  h("div", "st-floor-lines", root);
  h("div", "st-edge", root);
  WHO.forEach(function (w) {
    var pl = h("div", "pool", root);
    pl.style.left = X[w] + "px";
    pools[w] = pl;
  });
  // floating dust in the beams
  var motes = [];
  for (var m = 0; m < 36; m += 1) {
    var mo = h("i", "abs", root);
    F.css(mo, { width: "5px", height: "5px", borderRadius: "50%", background: "#FFE9B8", left: "0", top: "0" });
    motes.push({ el: mo, w: WHO[m % 3], ox: (prand(m * 3) - 0.5) * 260, oy: 160 + prand(m * 5) * 620, sp: 8 + prand(m * 7) * 16, ph: prand(m * 11) * 6 });
  }
  F.each(function (t) {
    for (var i = 0; i < motes.length; i += 1) {
      var p = motes[i];
      var y = p.oy - ((t * p.sp) % 200);
      var x = X[p.w] + p.ox * (0.3 + y / 900) + Math.sin(t * 0.7 + p.ph) * 10;
      p.el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      p.el.style.opacity = (0.25 + 0.35 * Math.sin(t * 1.3 + p.ph) * Math.sin(t * 1.3 + p.ph)).toFixed(2);
    }
  });

  /* ---------------------------------------------------------- actors */
  var S = 0.98, RW = 420 * S, RH = 640 * S, FEET = (610 / 640) * RH;
  var actors = {}, boxes = {};
  WHO.forEach(function (w, i) {
    var box = h("div", "rigbox", root);
    F.css(box, { width: RW + "px", height: RH + "px", left: X[w] - RW / 2 + "px", top: FEET_Y - FEET + "px", transformOrigin: "50% " + ((FEET / RH) * 100).toFixed(1) + "%" });
    var rig = RIG.create(box, w, "st-" + w);
    var a = new RIG.Actor(rig, { seed: i * 2 + 1, expr: "idle" });
    actors[w] = F.actor(a, T.stageIn, T.endIn + 0.5);
    boxes[w] = box;
  });
  var plates = {};
  var PLATE_T = { rong: "川菜 · ¥85/人 · 1.2 km", hua: "粤菜 · ¥128/人 · 0.8 km", pierre: "法餐 · ¥198/人 · 2.1 km" };
  WHO.forEach(function (w, i) {
    var p = h("div", "plate", root, '<i class="nail" style="left:14px"></i><i class="nail" style="right:14px"></i><div class="pn">' + NAME[w] + '</div><div class="pt">' + PLATE_T[w] + "</div>");
    p.style.left = X[w] + "px";
    if (w === "pierre") p.querySelector(".pn").style.fontSize = "34px";
    plates[w] = p;
    tl.fromTo(p, { scale: 0, rotation: i % 2 ? 8 : -8, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(2.2)" }, T.plates[i]);
  });

  var R = actors.rong, H = actors.hua, P = actors.pierre;
  var LOOK = {
    rong: { hua: [1, 0.1], pierre: [1, 0.05], cam: [0, 0.15] },
    hua: { rong: [-1, 0.1], pierre: [1, 0.1], cam: [0, 0.15] },
    pierre: { rong: [-1, 0.05], hua: [-1, 0.1], cam: [0, 0.15] },
  };
  function look(a, w, t, target) {
    var v = LOOK[w][target] || [0, 0];
    a.look(t, v[0], v[1]);
  }

  /* --------------------------------------------------------- the play */
  // intro: each lands its signature pose as its plate pops
  R.e(T.stageIn, "listen").p(T.plates[0], "hipR").e(T.plates[0], "pitch").act(T.plates[0], "hop", 0.35).e(T.plates[0] + 0.7, "wink");
  H.e(T.stageIn, "listen").p(T.plates[1], "belly").e(T.plates[1], "smug").act(T.plates[1], "puff", 0.6);
  P.e(T.stageIn, "listen").p(T.plates[2], "kissR").e(T.plates[2], "kiss").p(T.plates[2] + 0.45, "kissOut").p(T.plates[2] + 1.1, "rest").e(T.plates[2] + 1.1, "proud");
  look(R, "rong", T.stageIn, "cam");
  look(H, "hua", T.stageIn, "cam");
  look(P, "pierre", T.stageIn, "cam");
  R.e(T.hud, "idle");
  H.e(T.hud, "idle");
  P.e(T.hud, "haughty");

  // R1 — 蓉姐 pitches
  R.say(T.R1, "R1").e(T.R1, "pitch").p(T.R1, "hipR").act(T.R1, "stepIn", F.len("R1", 1)).p(F.at("R1", 0.67), "thumbR").e(F.at("R1", 0.68), "wink");
  look(R, "rong", T.R1, "cam");
  look(H, "hua", T.R1, "rong");
  H.e(F.at("R1", 0.11), "listen").e(F.at("R1", 0.54), "eyeroll");
  look(P, "pierre", T.R1, "rong");
  P.e(F.at("R1", 0.17), "haughty");
  // H1 — 华叔 roasts her
  H.say(T.H1, "H1").e(T.H1, "sly").p(T.H1, "wagR").act(T.H1, "lean", F.len("H1", 0.41), -0.6).p(F.at("H1", 0.43), "bellyR").e(F.at("H1", 0.45), "smug");
  look(H, "hua", T.H1, "rong");
  look(H, "hua", F.at("H1", 0.45), "cam");
  R.e(F.at("H1", 0.125), "shock").act(F.at("H1", 0.125), "hop", 0.32).p(F.at("H1", 0.125), "rest").e(F.at("H1", 0.36), "angry").p(F.at("H1", 0.36), "hip").act(F.at("H1", 0.36), "puff", 0.8);
  look(R, "rong", T.H1, "hua");
  P.e(F.at("H1", 0.18), "smug");
  look(P, "pierre", T.H1, "hua");
  // R2 — she fires back
  R.say(T.R2, "R2").e(T.R2, "angry").p(T.R2, "pointRhip").act(T.R2, "shake", 0.5);
  look(R, "rong", T.R2, "hua");
  H.e(F.at("R2", 0.26), "sweat").act(F.at("R2", 0.26), "shiver", 1.2);
  P.e(F.at("R2", 0.15), "laugh").act(F.at("R2", 0.15), "bounce", 1.2);
  look(P, "pierre", T.R2, "rong");
  // P0/P1 — Pierre, above it all
  P.say(T.P0, "P0").e(T.P0, "haughty").p(T.P0, "shrug").say(T.P1, "P1").e(T.P1, "proud").p(T.P1, "presentL").p(F.at("P1", 0.72), "kissR").e(F.at("P1", 0.72), "kiss").p(F.at("P1", 0.9), "kissOut");
  look(P, "pierre", T.P0, "cam");
  R.e(T.P0 + 0.2, "eyeroll").p(T.P0, "hip");
  H.e(T.P0 + 0.2, "eyeroll").p(T.P0, "rest");
  look(R, "rong", F.at("P1", 0.39), "pierre");
  look(H, "hua", F.at("P1", 0.39), "pierre");
  R.e(F.at("P1", 0.46), "think");
  H.e(F.at("P1", 0.52), "sly");
  // H2 — the price roast
  H.say(T.H2, "H2").e(T.H2, "laugh").p(T.H2, "pointR").act(T.H2, "bounce", F.len("H2", 0.95)).e(F.at("H2", 0.39), "sly").e(F.at("H2", 0.66), "laugh");
  look(H, "hua", T.H2, "pierre");
  P.e(F.at("H2", 0.28), "shock").act(F.at("H2", 0.28), "hop", 0.32).p(F.at("H2", 0.28), "rest").e(F.at("H2", 0.6), "sweat");
  look(P, "pierre", T.H2, "hua");
  R.e(F.at("H2", 0.3), "laugh").act(F.at("H2", 0.3), "bounce", F.len("H2", 0.48)).p(F.at("H2", 0.3), "belly");
  // P2 — Pierre scrambles
  P.say(T.P2, "P2").e(T.P2, "nervous").p(T.P2, "handsUp").act(T.P2, "shiver", F.len("P2", 1));
  look(P, "pierre", T.P2, "cam");
  H.e(F.at("P2", 0.1), "smug").p(T.P2, "hip");
  R.e(F.at("P2", 0.1), "sly").p(T.P2, "rest");
  look(R, "rong", T.P2, "pierre");
  // R3 — the steak joke
  R.say(T.R3, "R3").e(T.R3, "sly").p(T.R3, "pointRhip").e(F.at("R3", 0.62), "laugh").act(F.at("R3", 0.62), "bounce", 1.4);
  look(R, "rong", T.R3, "pierre");
  P.e(F.at("R3", 0.65), "shock").act(F.at("R3", 0.65), "hop", 0.3).p(F.at("R3", 0.65), "rest");
  H.e(F.at("R3", 0.65), "squeal").act(F.at("R3", 0.65), "bounce", 1.6).p(F.at("R3", 0.65), "belly");
  // P3 — he snaps
  P.say(T.P3, "P3").e(T.P3, "angry").p(T.P3, "pointLhip").act(T.P3, "shake", 0.6);
  look(P, "pierre", T.P3, "rong");
  R.e(T.P3 + 0.3, "smug").p(T.P3, "hip");
  H.e(T.P3 + 0.4, "laugh");
  // O3 — the agent's insight: everyone looks up
  WHO.forEach(function (w, i) {
    var a = actors[w];
    a.e(T.O3 + 0.1 + i * 0.12, "think").p(T.O3 + 0.1, "rest");
    a.look(T.O3 + 0.1, w === "rong" ? 0.6 : w === "pierre" ? -0.6 : 0, -1);
  });
  R.e(F.at("O3", 0.66), "star").act(F.at("O3", 0.66), "hop", 0.35).p(F.at("O3", 0.66), "clasp");
  H.e(F.at("O3", 0.7), "shock");
  P.e(F.at("O3", 0.7), "sweat");
  // R4 — she seizes it
  R.say(T.R4, "R4").e(T.R4, "star").p(T.R4, "waveR").act(T.R4, "stepIn", T.click - T.R4).act(F.at("R4", 0.56), "hop", 0.35).p(F.at("R4", 0.6), "thumbR").e(F.at("R4", 0.62), "wink");
  look(R, "rong", T.R4, "cam");
  H.e(F.at("R4", 0.21), "eyeroll");
  look(H, "hua", T.R4, "rong");
  P.e(F.at("R4", 0.21), "pout");
  // H3 / P4 — graceful losers
  H.say(T.H3, "H3").e(T.H3, "pout").p(T.H3, "hip");
  P.say(T.P4, "P4").e(T.P4, "kiss").act(T.P4, "bow", 0.8).p(T.P4, "bow");
  look(P, "pierre", T.P4, "cam");
  // the pick
  R.e(T.click + 0.05, "win").p(T.click + 0.05, "cheer").act(T.click + 0.05, "jump", 0.55).act(T.click + 0.9, "hop", 0.35).act(T.click + 1.5, "bounce", 2.6);
  look(R, "rong", T.click, "cam");
  H.e(T.click + 0.3, "pout").e(T.O4 + 0.4, "smug").p(T.O4 + 0.4, "thumbR");
  look(H, "hua", T.click, "rong");
  P.e(T.click + 0.3, "sweat").e(T.O4 + 0.6, "kiss").p(T.O4 + 0.6, "kissR").p(T.O4 + 1.1, "kissOut");
  look(P, "pierre", T.click, "rong");

  /* ---------------------------------------- spotlight + speaker focus */
  var SPEAK = [
    ["rong", T.R1, F.lineEnd("R1")], ["hua", T.H1, F.lineEnd("H1")], ["rong", T.R2, F.lineEnd("R2")],
    ["pierre", T.P0, F.lineEnd("P1")], ["hua", T.H2, F.lineEnd("H2")], ["pierre", T.P2, F.lineEnd("P2")],
    ["rong", T.R3, F.lineEnd("R3")], ["pierre", T.P3, F.lineEnd("P3")], ["rong", T.R4, F.lineEnd("R4")],
    ["hua", T.H3, F.lineEnd("H3")], ["pierre", T.P4, F.lineEnd("P4")],
  ];
  function focusAt(t, w) {
    if (t >= T.click) return w === "rong" ? 1 : 0.35;
    if (t >= T.O3 - 0.1 && t < T.R4 - 0.1) return 0.55;
    var best = null;
    for (var i = 0; i < SPEAK.length; i += 1) if (t >= SPEAK[i][1] - 0.15 && t <= SPEAK[i][2] + 0.25) best = SPEAK[i][0];
    if (!best) return 0.85;
    return best === w ? 1 : 0.5;
  }
  var focusState = { rong: 0.85, hua: 0.85, pierre: 0.85 };
  F.each(function (t) {
    WHO.forEach(function (w) {
      // smooth the focus by sampling a short window (pure function of t)
      var acc = 0;
      for (var k = 0; k < 6; k += 1) acc += focusAt(t - k * 0.04, w);
      var f = acc / 6;
      var on = t < T.curtain + 0.6 ? F.seg(t, T.curtain, T.curtain + 0.6) : 1;
      beams[w].style.opacity = (f * on).toFixed(3);
      pools[w].style.opacity = (f * on).toFixed(3);
      var br = 0.62 + 0.38 * f;
      boxes[w].style.filter = "brightness(" + br.toFixed(3) + ")";
      focusState[w] = f;
    });
  });

  /* ------------------------------------------------------------ HUD */
  var melon = h("div", "hud-melon", root,
    '<svg class="abs" style="left:22px;top:14px" width="64" height="64" viewBox="0 0 64 64"><path d="M 4 22 A 28 28 0 0 0 60 22 Z" fill="#5FA35A"/><path d="M 9 22 A 23 23 0 0 0 55 22 Z" fill="#FFF4DC"/><path d="M 13 22 A 19 19 0 0 0 51 22 Z" fill="#E8505B"/><circle cx="24" cy="30" r="2.6" fill="#2B1B30"/><circle cx="33" cy="34" r="2.6" fill="#2B1B30"/><circle cx="42" cy="29" r="2.6" fill="#2B1B30"/></svg>' +
    '<div class="lb">吃瓜值</div><div class="bar"><div class="fill" id="melonFill"></div></div><div class="val" id="melonVal">12%</div>');
  var live = h("div", "hud-live", root, "<i></i>路演直播中 · 3 位主理人");
  var mFill = melon.querySelector("#melonFill"), mVal = melon.querySelector("#melonVal");
  var MELON = [[0, 0.12], [F.at("H1", 0.27), 0.34], [F.at("R2", 0.41), 0.5], [F.at("H2", 0.42), 0.71], [F.at("R3", 0.69), 0.9], [F.at("P3", 0.5), 1.0]];
  F.each(function (t) {
    var v = MELON[0][1];
    for (var i = 1; i < MELON.length; i += 1) v = U.lerp(v, MELON[i][1], U.easeOutBack(F.seg(t, MELON[i][0], MELON[i][0] + 0.5)) * 1);
    mFill.style.transform = "scaleX(" + U.clamp(v, 0, 1).toFixed(3) + ")";
    var txt = Math.round(U.clamp(v, 0, 1) * 100) + "%";
    if (mVal.textContent !== txt) mVal.textContent = txt;
  });
  // melon slices that pop off the meter on each roast
  MELON.slice(1).forEach(function (e, i) {
    var s = h("div", "abs", root, '<svg width="44" height="44" viewBox="0 0 64 64"><path d="M 4 22 A 28 28 0 0 0 60 22 Z" fill="#5FA35A"/><path d="M 13 22 A 19 19 0 0 0 51 22 Z" fill="#E8505B"/></svg><b style="position:absolute;left:46px;top:6px;font:700 26px Fredoka;color:#EFCF6A;white-space:nowrap">+1 瓜</b>');
    F.css(s, { left: "530px", top: "44px", width: "130px", height: "44px" });
    tl.fromTo(s, { x: -40, opacity: 0, scale: 0.4 }, { x: 0, opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, e[0]);
    tl.to(s, { y: -30, opacity: 0, duration: 0.4, ease: "power2.in" }, e[0] + 0.9);
  });
  tl.fromTo([melon, live], { y: -140 }, { y: 0, duration: 0.6, ease: "back.out(1.6)" }, T.hud);
  F.each(function (t) {
    live.firstChild.style.opacity = Math.floor(t * 2) % 2 ? "0.35" : "1";
  });

  // ticker: 心动指数 (Chinese convention: red = up, green = down)
  var tick = h("div", "ticker", root, '<div class="tk-lab">心动指数</div><div class="tk-win" data-layout-allow-occlusion><div class="tk-run" id="tkRun"></div></div>');
  tick.setAttribute("data-layout-allow-occlusion", "");
  var run = tick.querySelector("#tkRun");
  var VAL = {
    rong: [[0, 62.0], [F.lineEnd("R1"), 66.4], [F.lineEnd("H1"), 63.2], [F.lineEnd("R2"), 64.8], [F.lineEnd("R3"), 69.9], [F.at("O3", 0.66), 74.5], [F.lineEnd("R4"), 88.6], [T.click, 99.0]],
    hua: [[0, 60.5], [F.lineEnd("H1"), 65.1], [F.lineEnd("R2"), 63.9], [F.lineEnd("H2"), 66.8], [F.lineEnd("R4"), 61.2]],
    pierre: [[0, 58.8], [F.lineEnd("P1"), 67.5], [F.lineEnd("H2"), 59.1], [F.lineEnd("P2"), 61.0], [F.lineEnd("R3"), 55.2], [F.at("O3", 0.66), 63.0], [F.lineEnd("R4"), 57.4]],
  };
  var TKN = { rong: "巴适川菜", hua: "华记粤点", pierre: "Chez Pierre" };
  var GOSSIP = ["热评：“八百八？我选泡面”", "热评：“三分熟喊妈妈 笑死”", "热评：“四个钟的汤 我等得起”", "热评：“蓉姐好会”"];
  var items = [];
  for (var rep = 0; rep < 3; rep += 1) {
    WHO.forEach(function (w) {
      var it = h("span", "it", run, TKN[w] + ' <b class="v">0</b> <b class="a">▲</b>');
      it.setAttribute("data-layout-allow-occlusion", "");
      items.push({ w: w, v: it.querySelector(".v"), a: it.querySelector(".a") });
    });
    h("span", "it", run, GOSSIP[rep % GOSSIP.length]).setAttribute("data-layout-allow-occlusion", "");
  }
  tick.querySelectorAll(".tk-lab, .tk-run *").forEach(function (n) {
    n.setAttribute("data-layout-allow-occlusion", "");
  });
  function valAt(w, t) {
    var L = VAL[w], v = L[0][1], prev = v;
    for (var i = 1; i < L.length; i += 1) {
      if (t >= L[i][0]) {
        prev = L[i - 1][1];
        v = U.lerp(L[i - 1][1], L[i][1], U.easeIO(F.seg(t, L[i][0], L[i][0] + 0.6)));
      }
    }
    return [v, v >= prev];
  }
  F.each(function (t) {
    run.style.transform = "translateX(" + (-((t - T.hud) * 90) % 1600).toFixed(1) + "px)";
    items.forEach(function (it) {
      var r = valAt(it.w, t);
      var s = r[0].toFixed(1);
      if (it.v.textContent !== s) it.v.textContent = s;
      var arrow = r[1] ? "▲" : "▼", cls = r[1] ? "a up" : "a dn";
      if (it.a.textContent !== arrow) it.a.textContent = arrow;
      if (it.a.className !== cls) it.a.className = cls;
    });
  });
  tl.fromTo(tick, { y: 80 }, { y: 0, duration: 0.5, ease: "power3.out" }, T.hud + 0.2);

  /* -------------------------------------------------------- bubbles */
  var BUBS = [
    { id: "R1", w: "rong", hl: ["人均才八十五"] },
    { id: "H1", w: "hua", hl: ["嘴都肿晒", "拍拖", "四个钟"] },
    { id: "R2", w: "rong", hl: ["饿晕"], shout: true },
    { id: "P0", w: "pierre", until: "P1" },
    { id: "P1", w: "pierre", hl: ["烛光", "红酒", "浪漫"] },
    { id: "H2", w: "hua", hl: ["八百八", "公仔面"] },
    { id: "P2", w: "pierre", hl: ["一百九十八"], shaky: true },
    { id: "R3", w: "rong", hl: ["喊妈妈"] },
    { id: "P3", w: "pierre", hl: ["艺术"], shout: true },
    { id: "R4", w: "rong", hl: ["露台包间", "巴适"] },
    { id: "H3", w: "hua" },
    { id: "P4", w: "pierre" },
  ];
  var BUB_W = 600;
  var HEAD_TOP = { rong: 344, hua: 437, pierre: 315 };
  var BUB_X = { rong: 440, hua: 960, pierre: 1372 };
  var bubLayer = h("div", "abs", root);
  bubLayer.setAttribute("data-layout-allow-overflow", "");
  F.css(bubLayer, { inset: "0", left: "0", top: "0", width: "1920px", height: "1080px" });
  BUBS.forEach(function (B, i) {
    var L = F.line(B.id);
    var start = T[B.id];
    var next = i + 1 < BUBS.length ? T[BUBS[i + 1].id] : start + L.dur + 1;
    var end = B.until ? T[B.until] - 0.05 : Math.min(next - 0.02, start + L.dur + 1.1);
    if (B.id === "R4") end = T.H3 - 0.02;
    if (B.id === "P3") end = T.O3 - 0.4;
    if (B.id === "P4") end = T.click - 0.1;
    var cx = BUB_X[B.w];
    var bw = L.gloss ? 680 : BUB_W;
    var el = h("div", "bub" + (B.shout ? " shout" : "") + (L.gloss ? " bub-yue" : ""), bubLayer);
    el.style.setProperty("--edge", EDGE[B.w]);
    F.css(el, { left: cx - bw / 2 + "px", bottom: 1080 - HEAD_TOP[B.w] + 36 + "px" });
    var inner = h("div", "bub-in", el);
    var body = h("div", "bub-body", inner);
    h("div", "bub-name", body, B.w === "rong" ? "蓉姐" : B.w === "hua" ? "华叔" : "Pierre");
    var text = h("div", "bub-text", body);
    var tail = h("div", "bub-tail", inner);
    tail.style.left = bw / 2 - 24 + (X[B.w] - cx) + "px";
    if (B.shout) {
      body.style.borderWidth = "6px";
      body.style.transform = "rotate(-1.5deg)";
    }
    F.typer(text, L.text, start, L.ct, B.hl);
    if (L.gloss) {
      // Cantonese line: a Mandarin gloss fades in with the bubble so it can be read while he speaks
      var gl = h("div", "bub-gloss", body, L.gloss);
      var glT = start + 0.25;
      F.each(function (t) {
        gl.style.opacity = F.seg(t, glT, glT + 0.3).toFixed(2);
      });
    }
    var tilt = B.w === "rong" ? 9 : B.w === "pierre" ? -9 : 0;
    tl.fromTo(el, { scale: 0.25, rotationX: -75, rotationY: tilt * 2, y: 50, opacity: 0, transformPerspective: 900 },
      { scale: 1, rotationX: 8, rotationY: tilt, y: 0, opacity: 1, duration: 0.5, ease: "back.out(2)", transformPerspective: 900 }, start - 0.12);
    tl.to(el, { y: -46, scale: 0.9, opacity: 0, filter: "blur(6px)", duration: 0.34, ease: "power2.in" }, end);
    // idle float + shake for nervous bubbles (inner element, pure function of t)
    F.each(function (t) {
      if (t < start - 0.2 || t > end + 0.4) return;
      var y = Math.sin((t - start) * 2.4) * 5;
      var x = B.shaky ? Math.sin(t * 60) * 2.5 : 0;
      inner.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
    });
  });

  /* --------------------------------------------------- insight card */
  var dim = h("div", "dim", root);
  dim.style.opacity = "0";
  var ins = h("div", "insight", root,
    '<div class="ins-orb"></div><div class="ins-t">我注意到……</div><div class="ins-s">吃瓜时，你在这两个词上停留最久</div>' +
    '<div class="dw" style="top:134px"><div class="k">烛光</div><div class="tr"><div class="tf" id="dw1" style="background:#B39AD8"></div></div><div class="v" id="dv1">0.0 s</div></div>' +
    '<div class="dw" style="top:182px"><div class="k">麻辣</div><div class="tr"><div class="tf" id="dw2" style="background:#E57F76"></div></div><div class="v" id="dv2">0.0 s</div></div>' +
    '<div class="ins-res" id="insRes">今晚是约会 ＋ 想吃辣？</div>');
  var dw1 = ins.querySelector("#dw1"), dw2 = ins.querySelector("#dw2"), dv1 = ins.querySelector("#dv1"), dv2 = ins.querySelector("#dv2"), insRes = ins.querySelector("#insRes");
  tl.fromTo(dim, { opacity: 0 }, { opacity: 1, duration: 0.4 }, T.O3 - 0.25);
  tl.to(dim, { opacity: 0, duration: 0.4 }, T.R4 - 0.3);
  tl.fromTo(ins, { y: -60, scale: 0.7, opacity: 0, rotationX: -40, transformPerspective: 1000 }, { y: 0, scale: 1, opacity: 1, rotationX: 0, duration: 0.6, ease: "back.out(1.8)", transformPerspective: 1000 }, T.O3 - 0.2);
  tl.to(ins, { y: -40, scale: 0.85, opacity: 0, duration: 0.35, ease: "power2.in" }, T.R4 - 0.25);
  tl.fromTo(insRes, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)" }, F.at("O3", 0.64));
  F.each(function (t) {
    var k1 = U.easeIO(F.seg(t, F.at("O3", 0.17), F.at("O3", 0.37))), k2 = U.easeIO(F.seg(t, F.at("O3", 0.29), F.at("O3", 0.49)));
    dw1.style.transform = "scaleX(" + (0.82 * k1).toFixed(3) + ")";
    dw2.style.transform = "scaleX(" + (0.72 * k2).toFixed(3) + ")";
    var a = (3.2 * k1).toFixed(1) + " s", b2 = (2.8 * k2).toFixed(1) + " s";
    if (dv1.textContent !== a) dv1.textContent = a;
    if (dv2.textContent !== b2) dv2.textContent = b2;
  });
  // keep the characters above the dim layer during the insight
  WHO.forEach(function (w) {
    root.appendChild(boxes[w]);
  });
  root.appendChild(bubLayer);
  root.appendChild(ins);

  /* ------------------------------------------------- cursor + pick */
  var cur = h("div", "cursor", root, '<svg viewBox="0 0 64 80" width="64" height="80"><path d="M 8 6 L 8 62 L 22 49 L 32 72 L 43 67 L 33 45 L 52 45 Z" fill="#FFFBF4" stroke="#2B1B30" stroke-width="5" stroke-linejoin="round"/></svg>');
  var rip = h("div", "ripple", root);
  F.css(rip, { left: X.rong + "px", top: "960px" });
  var sel = h("div", "sel", plates.rong);
  tl.fromTo(cur, { x: 1560, y: 1100, opacity: 0 }, { x: X.rong + 30, y: 950, opacity: 1, duration: 0.85, ease: "power3.inOut" }, T.cursor);
  tl.to(cur, { keyframes: [{ scale: 0.82, duration: 0.08 }, { scale: 1, duration: 0.14 }] }, T.click - 0.06);
  tl.to(cur, { x: X.rong + 260, y: 1120, opacity: 0, duration: 0.6, ease: "power2.in" }, T.click + 0.6);
  F.each(function (t) {
    var k = F.seg(t, T.click, T.click + 0.6);
    var on = t >= T.click && t <= T.click + 0.6;
    rip.style.opacity = on ? (1 - k).toFixed(3) : "0";
    rip.style.transform = "scale(" + (0.2 + 1.4 * (1 - Math.pow(1 - k, 2))).toFixed(3) + ")";
  });
  tl.fromTo(sel, { opacity: 0, scale: 1.2 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, T.click);
  tl.to(plates.rong, { keyframes: [{ scale: 0.92, duration: 0.08 }, { scale: 1.08, duration: 0.16 }, { scale: 1, duration: 0.2 }] }, T.click - 0.02);
  F.confetti(root, X.rong, 520, T.click + 0.05, { n: 40, seed: 3 });
  F.confetti(root, X.rong - 160, 640, T.click + 0.2, { n: 22, seed: 9, cone: 0.7 });
  F.confetti(root, X.rong + 160, 640, T.click + 0.3, { n: 22, seed: 17, cone: 0.7 });

  /* -------------------------------------------------- booking card */
  var book = h("div", "book", root,
    '<div class="bk-ck"><svg viewBox="0 0 96 96" width="96" height="96"><path id="bkTick" d="M 27 50 L 42 65 L 70 34" stroke="#FFF8EC" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
    '<div class="bk-t">预订成功！</div><div class="bk-s">巴适川菜 · 蓉姐已为你留好位置</div>' +
    '<div class="bk-row">' +
    '<div class="bk-it" style="left:0;width:200px"><div class="k">时间</div><div class="v">今晚 19:30</div></div>' +
    '<div class="bk-it" style="left:216px;width:130px"><div class="k">人数</div><div class="v">2 位</div></div>' +
    '<div class="bk-it" style="left:362px;width:170px"><div class="k">座位</div><div class="v">露台包间</div></div>' +
    '<div class="bk-it" style="left:548px;width:164px"><div class="k">锅底</div><div class="v">鸳鸯锅</div></div>' +
    "</div>");
  var tick2 = book.querySelector("#bkTick");
  var TL = 70;
  F.each(function (t) {
    var k = U.easeIO(F.seg(t, T.O4 + 0.35, T.O4 + 0.75));
    tick2.setAttribute("stroke-dasharray", (TL * k).toFixed(1) + " " + TL);
  });
  tl.fromTo(book, { y: -80, scale: 0.6, opacity: 0, rotationX: -50, transformPerspective: 1000 }, { y: 0, scale: 1, opacity: 1, rotationX: 0, duration: 0.6, ease: "back.out(1.7)", transformPerspective: 1000 }, T.O4 - 0.1);
  book.querySelectorAll(".bk-it").forEach(function (it, i) {
    tl.fromTo(it, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(2)" }, T.O4 + 0.6 + i * 0.12);
  });

  /* ------------------------------------------------------- curtains */
  var cvr = h("div", "cvr", root);
  cvr.setAttribute("data-layout-allow-overflow", "");
  var cL = h("div", "cvr", cvr), cR = h("div", "cvr cvr-right", cvr);
  cL.setAttribute("data-layout-allow-overflow", "");
  cR.setAttribute("data-layout-allow-overflow", "");
  var pel = h("div", "pelmet", cvr);
  h("div", "pelmet-trim", pel);
  var PX = 100 / 1920;
  function buildCurtain(el, dir, widths) {
    var total = 0;
    var folds = widths.map(function (w, i) {
      var fold = h("div", "cvr-fold", el);
      fold.style.width = w * PX * 19.2 + 4 + "px";
      fold.style.setProperty("--crest", 44 + ((i * 5) % 13) + "%");
      total += w;
      return { el: fold, w: w, u: i / (widths.length - 1) };
    });
    return { folds: folds, dir: dir, anchor: 980 - total };
  }
  var curtains = [
    buildCurtain(cL, 1, [88, 124, 70, 106, 136, 80, 112, 62, 98, 130, 69]),
    buildCurtain(cR, -1, [104, 66, 128, 84, 120, 62, 100, 134, 76, 112, 89]),
  ];
  function pose(p) {
    curtains.forEach(function (c) {
      var x = c.anchor;
      c.folds.forEach(function (f) {
        var sx = 1 - p * (0.88 - 0.14 * f.u);
        var sy = 1 - p * 0.07 * f.u * f.u;
        f.el.style.transform = "translateX(" + (c.dir * x).toFixed(1) + "px) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")";
        f.el.style.setProperty("--shade", (0.34 * (1 - sx)).toFixed(3));
        x += f.w * sx;
      });
    });
  }
  F.each(function (t) {
    pose(U.easeIO(F.seg(t, T.curtain, T.curtain + 1.25)));
  });
  // HUD and the marquee sign sit on top of the valance
  root.appendChild(marquee);
  root.appendChild(melon);
  root.appendChild(live);
  root.appendChild(tick);
  // the stage fades in over the dive into the tent door
  var fadeIn = h("div", "abs", root);
  F.css(fadeIn, { inset: "0", left: "0", top: "0", width: "1920px", height: "1080px", background: "#2A1236" });
  tl.fromTo(fadeIn, { opacity: 1 }, { opacity: 0, duration: 0.35 }, T.stageIn + 0.05);
})();
