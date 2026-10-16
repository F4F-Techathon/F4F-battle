/* scene-agent.js — 3.8–31.8 s: the avatar-less agent takes the brief, filters the
 * town map down to three, and the three restaurant agents run to the roadshow tent. */
(function () {
  "use strict";
  var F = FILM, T = F.T, tl = F.tl, h = F.h, U = F.U, prand = F.prand;
  var root = F.$("sc-agent");

  /* ------------------------------------------------------------ layers */
  var fill = h("div", "abs", root);
  F.css(fill, { left: "0", top: "0", width: "1920px", height: "1080px", background: "#F5EEE3" });
  tl.fromTo(fill, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.inOut" }, T.agentIn);
  var bg = h("div", "ag-dots", root);
  var mapFrame = h("div", "map-frame", root);
  mapFrame.id = "mapFrame";
  mapFrame.setAttribute("data-layout-allow-overflow", "");
  var cam = h("div", "map-cam", mapFrame);
  cam.setAttribute("data-layout-allow-overflow", "");
  cam.setAttribute("data-layout-allow-overlap", "");
  var side = h("div", "side", root);
  var panel = h("div", "panel", root);
  var orbWrap = h("div", "orb-wrap", root);

  /* -------------------------------------------------------------- orb */
  var rings = [h("div", "orb-ring", orbWrap), h("div", "orb-ring", orbWrap), h("div", "orb-ring", orbWrap)];
  var orbShadow = h("div", "orb-shadow", orbWrap);
  var orb = h("div", "orb", orbWrap);
  orb.setAttribute("data-layout-allow-overflow", "");
  var swirl = h("div", "abs", orb);
  F.css(swirl, { left: "0", top: "0", width: "280px", height: "280px" });
  [["#FFD7B8", 40, 150, 130], ["#B79BE6", 150, 60, 120], ["#9FDCC9", 120, 170, 110], ["#F7A08E", 20, 40, 100]].forEach(function (b) {
    var e = h("div", "sw", swirl);
    F.css(e, { background: b[0], left: b[1] + "px", top: b[2] + "px", width: b[3] + "px", height: b[3] + "px", opacity: "0.85" });
  });
  h("div", "hl", orb);
  var ORB_LINES = ["O1", "O2a", "O2b"];
  F.each(function (t) {
    var o = 0, talking = false;
    ORB_LINES.forEach(function (id) {
      var L = F.line(id), lt = t - T[id];
      if (lt >= 0 && lt < L.dur) {
        talking = true;
        o = parseInt(L.o.charAt(Math.min(L.o.length - 1, Math.floor(lt * 30))), 10) / 9;
      }
    });
    var br = Math.sin(t * Math.PI * 2 / 3.4);
    orb.style.transform = "scale(" + (1 + 0.018 * br + 0.07 * o).toFixed(4) + ")";
    swirl.style.transform = "rotate(" + (t * 38).toFixed(1) + "deg)";
    rings.forEach(function (r, i) {
      var ph = ((t * 0.9 + i / 3) % 1);
      var a = talking ? (1 - ph) * 0.9 : (1 - ph) * 0.25;
      r.style.transform = "scale(" + (0.82 + ph * 0.55).toFixed(3) + ")";
      r.style.opacity = a.toFixed(3);
    });
  });
  // orb path: hook glow → centre → left of the chat → sidebar corner
  tl.fromTo(orbWrap, { x: 790, y: 370, scale: 0.9, opacity: 0 }, { x: 790, y: 370, scale: 1.4, opacity: 1, duration: 0.6, ease: "power3.out" }, T.agentIn);
  tl.to(orbWrap, { x: 230, y: 360, scale: 1.25, duration: 0.75, ease: "power3.inOut" }, T.orbSettle);
  tl.to(orbWrap, { x: -66, y: -54, scale: 0.36, duration: 0.8, ease: "power3.inOut" }, T.toMap);
  tl.to(orbShadow, { opacity: 0, duration: 0.3 }, T.toMap);

  /* ------------------------------------------------------------ chat panel */
  panel.innerHTML =
    '<div class="p-head"><div class="p-dot"></div><div class="p-title">今晚吃谁？</div><div class="p-st">● AI 选餐助手 · 在线</div><div class="p-pill">附近 128 家</div></div>' +
    '<div class="abs" id="thread" data-layout-allow-overflow style="left:0;right:0;top:124px;height:420px;overflow:hidden"><div class="abs" id="threadIn" style="left:0;right:0;top:0;height:600px"></div></div>' +
    '<div class="req" data-layout-allow-occlusion><div class="req-t">需求卡</div><div class="abs" id="reqRow" style="left:22px;right:22px;top:58px;display:flex;gap:14px;flex-wrap:nowrap"></div></div>' +
    '<div class="inbar"><div class="in-ph" id="inPh">说说你的想法…</div><div class="in-tx" id="inTx1"></div><div class="in-tx" id="inTx2"></div><div class="send" id="sendBtn">发送</div></div>';
  var threadIn = panel.querySelector("#threadIn");
  var reqRow = panel.querySelector("#reqRow");
  var inPh = panel.querySelector("#inPh"), inTx1 = panel.querySelector("#inTx1"), inTx2 = panel.querySelector("#inTx2");
  var sendBtn = panel.querySelector("#sendBtn");

  function msg(kind, top, html) {
    var m = h("div", "msg " + kind, threadIn, html);
    m.style.top = top + "px";
    return m;
  }
  var m1 = msg("ag", 16, "");
  F.typer(m1, F.line("O1").text, T.O1, F.line("O1").ct);
  var m2 = msg("me", 125, "下班了想吃顿好的，要有点氛围，别太远～");
  var m3 = msg("me", 234, "两个人，人均 200 以内吧");
  var m4 = msg("ag", 343, "");
  F.typer(m4, F.line("O2a").text, T.O2a, F.line("O2a").ct);

  function popMsg(el, t, fromRight) {
    el.style.transformOrigin = fromRight ? "100% 100%" : "0% 100%";
    tl.fromTo(el, { scale: 0.6, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.42, ease: "back.out(1.9)" }, t);
  }
  tl.fromTo(panel, { y: 70, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }, T.panelIn);
  popMsg(m1, T.O1 - 0.15, false);
  popMsg(m2, T.send1 + 0.05, true);
  popMsg(m3, T.send2 + 0.05, true);
  popMsg(m4, T.O2a - 0.15, false);
  tl.fromTo(threadIn, { y: 0 }, { y: -52, duration: 0.5, ease: "power3.inOut" }, T.O2a - 0.3);

  // input bar typing + send
  F.typeUniform(inTx1, "下班了想吃顿好的，要有点氛围，别太远～", T.type1, 0.8);
  F.typeUniform(inTx2, "两个人，人均 200 以内吧", T.type2, 0.55);
  tl.fromTo(inPh, { opacity: 1 }, { opacity: 0, duration: 0.1 }, T.type1 - 0.1);
  tl.fromTo(inTx1, { opacity: 1 }, { opacity: 0, duration: 0.08 }, T.send1);
  tl.fromTo(inTx2, { opacity: 1 }, { opacity: 0, duration: 0.08 }, T.send2);
  [T.send1, T.send2].forEach(function (ts) {
    tl.fromTo(sendBtn, { scale: 1 }, { keyframes: [{ scale: 0.86, duration: 0.07 }, { scale: 1.06, duration: 0.12 }, { scale: 1, duration: 0.1 }] }, ts - 0.1);
  });

  // chips fly from the messages into the need card
  var CHIPS = [
    ["今晚 · 晚餐", "#E3B04B", 1], ["有氛围", "#B39AD8", 1], ["≤ 3 km", "#8FC1A9", 1],
    ["2 人", "#E8A07B", 2], ["人均 ≤ ¥200", "#E57F76", 2],
  ];
  var chipEls = CHIPS.map(function (c, i) {
    var e = h("div", "chip", reqRow, "<i></i>" + c[0]);
    e.style.position = "relative";
    e.style.flex = "0 0 auto";
    e.style.setProperty("--edge", c[1]);
    var t0 = (c[2] === 1 ? T.chips1 : T.chips2) + (c[2] === 1 ? i : i - 3) * 0.13;
    var dy = c[2] === 1 ? -230 : -150;
    tl.fromTo(e, { x: 420 - i * 90, y: dy, scale: 0.4, opacity: 0, rotation: -14 }, { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, duration: 0.6, ease: "back.out(1.6)" }, t0);
    return e;
  });

  /* ------------------------------------------------------------- sidebar */
  side.innerHTML =
    '<div class="sd-h">选餐助手</div><div class="sd-st" id="sdSt">● 正在筛选…</div>' +
    '<div class="sd-sec" style="top:170px">你的需求</div>' +
    '<div class="abs" id="sdChips" style="left:30px;right:30px;top:208px;display:flex;flex-wrap:wrap;gap:12px"></div>' +
    '<div class="sd-sec" style="top:420px">筛选进度</div>' +
    '<div class="step" style="top:456px"><div class="n">1</div><div class="lb">距离 ≤ 3 km</div><div class="hi"></div><div class="ck"></div></div>' +
    '<div class="step" style="top:548px"><div class="n">2</div><div class="lb">有氛围 · 适合约会</div><div class="hi"></div><div class="ck"></div></div>' +
    '<div class="step" style="top:640px"><div class="n">3</div><div class="lb">人均 ≤ ¥200</div><div class="hi"></div><div class="ck"></div></div>' +
    '<div class="sd-sec" style="top:780px">候选餐馆</div>' +
    '<div class="cnt" id="sdCnt">128</div><div class="cnt-u" id="sdU">家 · 附近 3 km</div>';
  var sdChips = side.querySelector("#sdChips");
  CHIPS.forEach(function (c) {
    var e = h("div", "chip sm", sdChips, "<i></i>" + c[0]);
    e.style.position = "relative";
    e.style.setProperty("--edge", c[1]);
  });
  var steps = side.querySelectorAll(".step");
  var sdSt = side.querySelector("#sdSt"), sdCnt = side.querySelector("#sdCnt");
  // check marks are drawn with a tick inside
  steps.forEach(function (s) {
    s.querySelector(".ck").innerHTML = '<svg viewBox="0 0 40 40" width="40" height="40"><path d="M 11 21 L 18 28 L 30 14" stroke="#FFF8EC" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  });

  // panel → sidebar morph, map slides in
  tl.to(panel, { x: -1040, y: 20, scale: 0.42, opacity: 0, duration: 0.75, ease: "power3.inOut" }, T.toMap);
  tl.fromTo(side, { x: -120, opacity: 0, scale: 0.94 }, { x: 0, opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }, T.toMap + 0.25);
  tl.fromTo(mapFrame, { x: 1500 }, { x: 0, duration: 0.95, ease: "power3.out" }, T.toMap + 0.1);
  tl.fromTo(bg, { opacity: 0 }, { opacity: 1, duration: 0.5 }, T.agentIn);

  var PASSES = [T.pass1, T.pass2, T.pass3];
  var COUNTS = [128, 37, 9, 3];
  steps.forEach(function (s, i) {
    var hi = s.querySelector(".hi"), ck = s.querySelector(".ck");
    tl.fromTo(hi, { opacity: 0 }, { opacity: 1, duration: 0.2 }, PASSES[i] - 0.1);
    tl.to(hi, { opacity: 0, duration: 0.25 }, PASSES[i] + T.passDur);
    tl.fromTo(ck, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)" }, PASSES[i] + T.passDur - 0.1);
  });
  var lastC = -1;
  F.each(function (t) {
    var v = COUNTS[0];
    for (var i = 0; i < 3; i += 1) {
      var k = U.easeIO(F.seg(t, PASSES[i] + 0.35, PASSES[i] + T.passDur));
      if (t >= PASSES[i] + 0.35) v = Math.round(COUNTS[i] + (COUNTS[i + 1] - COUNTS[i]) * k);
    }
    if (v !== lastC) {
      lastC = v;
      sdCnt.textContent = String(v);
    }
    var st = t < T.pass3 + T.passDur ? "● 正在筛选…" : "● 已选出 3 家";
    if (sdSt.textContent !== st) sdSt.textContent = st;
  });
  tl.fromTo(sdCnt, { scale: 1 }, { keyframes: [{ scale: 1.18, duration: 0.12 }, { scale: 1, duration: 0.3 }] }, T.pass3 + T.passDur);

  /* ---------------------------------------------------------------- map */
  var WHO = ["rong", "hua", "pierre"];
  var HOME = { rong: [300, 700], hua: [1020, 370], pierre: [1120, 760] };
  var YOU = [700, 700];
  var PLAZA = [700, 470];
  var R3KM = 480;
  var ROADS = [
    [[-20, 500], [200, 478], [400, 505], [580, 472], [700, 470], [820, 470], [1000, 440], [1200, 488], [1420, 460]],
    [[700, -20], [690, 150], [712, 300], [700, 470], [700, 590], [680, 720], [655, 860], [640, 1020]],
    [[580, 472], [480, 560], [380, 620], [300, 700], [220, 790], [160, 880], [120, 1020]],
    [[820, 470], [920, 410], [1020, 370], [1140, 300], [1260, 230], [1420, 200]],
    [[700, 590], [840, 660], [980, 700], [1120, 760], [1250, 820], [1420, 920]],
    [[580, 472], [510, 380], [410, 300], [300, 250], [180, 215], [-20, 210]],
  ];
  function smooth(pts) {
    var d = "M " + pts[0][0] + " " + pts[0][1];
    for (var i = 1; i < pts.length - 1; i += 1) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += " Q " + pts[i][0] + " " + pts[i][1] + " " + mx + " " + my;
    }
    var l = pts[pts.length - 1];
    return d + " L " + l[0] + " " + l[1];
  }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var k = U.clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    var x = a[0] + k * dx - p[0], y = a[1] + k * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function nearRoad(p, m) {
    for (var r = 0; r < ROADS.length; r += 1) for (var i = 0; i < ROADS[r].length - 1; i += 1) if (distSeg(p, ROADS[r][i], ROADS[r][i + 1]) < m) return true;
    return false;
  }
  var SPOTS = [
    [150, 330], [262, 165], [395, 205], [470, 330], [118, 430], [330, 395],
    [860, 255], [960, 185], [1180, 215], [1300, 135], [1250, 380], [930, 330],
    [170, 600], [425, 650], [225, 885], [400, 885], [520, 770], [95, 760],
    [900, 640], [1000, 875], [1265, 690], [1335, 845], [830, 905], [1185, 965],
    [560, 620], [860, 560], [560, 330], [1080, 590], [1330, 545], [80, 560],
  ];
  var ROOFS = ["#C96B5A", "#6E8FB5", "#D9A441", "#8A6BA8", "#5E9C7A", "#B5835A", "#D47C8E", "#7A9A4A"];

  function house(x, y, roof, big) {
    var s = big ? 1.35 : 1;
    var g = '<g transform="translate(' + x + " " + y + ") scale(" + s + ')">';
    g += '<ellipse cx="0" cy="4" rx="46" ry="11" fill="#2B1B30" opacity=".12"/>';
    g += '<rect x="-36" y="-44" width="72" height="47" rx="6" fill="#F4E8D2"/>';
    g += '<rect x="-36" y="-8" width="72" height="11" rx="3" fill="#E1CDAA"/>';
    g += '<path d="M -45 -40 L -31 -72 L 31 -72 L 45 -40 Z" fill="' + roof + '"/>';
    g += '<path d="M -45 -40 L 45 -40 L 45 -33 L -45 -33 Z" fill="#2B1B30" opacity=".22"/>';
    g += '<path d="M -26 -64 L 26 -64" stroke="#FFFFFF" stroke-width="3" opacity=".25"/>';
    g += '<rect x="-8" y="-24" width="16" height="27" rx="5" fill="#7A5038"/>';
    g += '<rect x="-29" y="-28" width="14" height="12" rx="3" fill="#A6D3E2"/><rect x="15" y="-28" width="14" height="12" rx="3" fill="#A6D3E2"/>';
    return g + "</g>";
  }
  function tree(x, y, r, k) {
    var c1 = k % 3 === 0 ? "#5E9A5C" : k % 3 === 1 ? "#6EA866" : "#79B06A";
    return '<g transform="translate(' + x.toFixed(0) + " " + y.toFixed(0) + ')"><ellipse cx="4" cy="' + (r * 0.75).toFixed(0) + '" rx="' + (r * 0.9).toFixed(0) + '" ry="' + (r * 0.32).toFixed(0) + '" fill="#2B1B30" opacity=".13"/>' +
      '<circle r="' + r.toFixed(0) + '" fill="' + c1 + '"/><circle cx="' + (-r * 0.28).toFixed(0) + '" cy="' + (-r * 0.3).toFixed(0) + '" r="' + (r * 0.55).toFixed(0) + '" fill="#8CC37A" opacity=".75"/></g>';
  }

  var svg = '<svg viewBox="0 0 1400 1000" xmlns="http://www.w3.org/2000/svg">';
  svg += '<defs><pattern id="tiles" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="#B5D19A"/><rect width="50" height="50" fill="#AECB92"/><rect x="50" y="50" width="50" height="50" fill="#AECB92"/></pattern></defs>';
  svg += '<rect width="1400" height="1000" fill="url(#tiles)"/>';
  // darker meadow patches
  for (var pz = 0; pz < 14; pz += 1) svg += '<ellipse cx="' + (prand(pz * 3) * 1400).toFixed(0) + '" cy="' + (prand(pz * 5 + 1) * 1000).toFixed(0) + '" rx="' + (60 + prand(pz * 7) * 90).toFixed(0) + '" ry="' + (30 + prand(pz * 11) * 50).toFixed(0) + '" fill="#A4C487" opacity=".55"/>';
  // river + pond
  var river = "M -30 120 C 150 170, 300 60, 450 104 C 560 136, 600 40, 650 -30";
  svg += '<path d="' + river + '" stroke="#7FB8C8" stroke-width="64" fill="none" stroke-linecap="round"/>';
  svg += '<path d="' + river + '" stroke="#93CBD8" stroke-width="48" fill="none" stroke-linecap="round"/>';
  svg += '<path d="M 60 140 q 20 -8 40 0 M 330 86 q 20 -8 40 0 M 520 96 q 16 -8 32 0" stroke="#D6EEF3" stroke-width="4" fill="none" stroke-linecap="round"/>';
  svg += '<ellipse cx="1240" cy="96" rx="120" ry="58" fill="#7FB8C8"/><ellipse cx="1240" cy="92" rx="104" ry="46" fill="#93CBD8"/>';
  svg += '<path d="M 1190 86 q 14 -6 28 0 M 1250 104 q 14 -6 28 0" stroke="#D6EEF3" stroke-width="4" fill="none" stroke-linecap="round"/>';
  // roads
  ROADS.forEach(function (r) {
    svg += '<path d="' + smooth(r) + '" stroke="#D5BB8A" stroke-width="58" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  });
  ROADS.forEach(function (r) {
    svg += '<path d="' + smooth(r) + '" stroke="#E9D4A8" stroke-width="46" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  });
  // wooden bridge over the river on road F
  svg += '<g transform="translate(322 120) rotate(-8)"><rect x="-34" y="-40" width="68" height="80" rx="6" fill="#B07B4F"/><path d="M -34 -24 L 34 -24 M -34 -8 L 34 -8 M -34 8 L 34 8 M -34 24 L 34 24" stroke="#8A5A33" stroke-width="3"/></g>';
  // plaza
  svg += '<circle cx="' + PLAZA[0] + '" cy="' + (PLAZA[1] + 18) + '" r="128" fill="#D9C9AE"/><circle cx="' + PLAZA[0] + '" cy="' + (PLAZA[1] + 18) + '" r="116" fill="#E8DCC6"/>';
  for (var st = 0; st < 26; st += 1) {
    var a = (st / 26) * Math.PI * 2;
    svg += '<circle cx="' + (PLAZA[0] + Math.cos(a) * 92).toFixed(0) + '" cy="' + (PLAZA[1] + 18 + Math.sin(a) * 92).toFixed(0) + '" r="7" fill="#D3C2A4"/>';
  }
  // trees (seeded, avoiding roads, houses, plaza)
  var avoid = SPOTS.concat([HOME.rong, HOME.hua, HOME.pierre, YOU, PLAZA]);
  var trees = "";
  for (var ti = 0; ti < 220; ti += 1) {
    var p = [prand(ti * 17 + 3) * 1400, prand(ti * 29 + 7) * 1000];
    if (nearRoad(p, 52)) continue;
    var ok = true;
    for (var q = 0; q < avoid.length; q += 1) {
      var dx = p[0] - avoid[q][0], dy = p[1] - avoid[q][1] + 30;
      if (dx * dx + dy * dy < 78 * 78) ok = false;
    }
    if (Math.abs(p[0] - PLAZA[0]) < 170 && Math.abs(p[1] - PLAZA[1]) < 150) ok = false;
    // keep the river clear
    if (p[1] < 175 && p[0] < 680 && Math.abs(p[1] - (110 + Math.sin(p[0] / 120) * 30)) < 60) ok = false;
    if (Math.abs(p[0] - 1240) < 140 && Math.abs(p[1] - 96) < 80) ok = false;
    if (!ok) continue;
    trees += tree(p[0], p[1], 20 + prand(ti * 31) * 14, ti);
  }
  // flowers
  for (var fl = 0; fl < 90; fl += 1) {
    var fp = [prand(fl * 41 + 5) * 1400, prand(fl * 43 + 9) * 1000];
    if (nearRoad(fp, 34)) continue;
    svg += '<circle cx="' + fp[0].toFixed(0) + '" cy="' + fp[1].toFixed(0) + '" r="4" fill="' + ["#F6E7A8", "#F4B6C2", "#FFFFFF"][fl % 3] + '"/>';
  }
  // regular houses
  SPOTS.forEach(function (sp, i) {
    svg += house(sp[0], sp[1], ROOFS[i % ROOFS.length], false);
  });
  // the three special houses
  svg += house(HOME.rong[0], HOME.rong[1], "#C9483E", true);
  svg += '<g transform="translate(' + HOME.rong[0] + " " + HOME.rong[1] + ')"><line x1="-62" y1="-58" x2="62" y2="-58" stroke="#5A2A1A" stroke-width="2"/><circle cx="-40" cy="-46" r="11" fill="#E0453A"/><circle cx="40" cy="-46" r="11" fill="#E0453A"/><rect x="-16" y="-104" width="32" height="26" rx="6" fill="#FFF4DC"/><text x="0" y="-84" font-family="HY" font-size="20" text-anchor="middle" fill="#9F3931">川</text></g>';
  svg += house(HOME.hua[0], HOME.hua[1], "#2F6E62", true);
  svg += '<g transform="translate(' + HOME.hua[0] + " " + HOME.hua[1] + ')"><rect x="-16" y="-104" width="32" height="26" rx="6" fill="#FFF4DC"/><text x="0" y="-84" font-family="HY" font-size="20" text-anchor="middle" fill="#245548">粤</text><path d="M -58 -58 Q 0 -70 58 -58" stroke="#F3EAD8" stroke-width="4" fill="none"/></g>';
  svg += house(HOME.pierre[0], HOME.pierre[1], "#7A5A9E", true);
  svg += '<g transform="translate(' + HOME.pierre[0] + " " + HOME.pierre[1] + ')"><path d="M -50 -40 L 50 -40 L 44 -24 L -44 -24 Z" fill="#FFF4DC"/><path d="M -40 -40 L -32 -24 M -20 -40 L -14 -24 M 0 -40 L 0 -24 M 20 -40 L 14 -24 M 40 -40 L 32 -24" stroke="#7A5A9E" stroke-width="8"/><rect x="-16" y="-104" width="32" height="26" rx="6" fill="#FFF4DC"/><text x="0" y="-84" font-family="Fredoka" font-weight="700" font-size="17" text-anchor="middle" fill="#5F4482">Fr</text></g>';
  svg += trees;
  // the roadshow tent on the plaza
  var tx = PLAZA[0], ty = PLAZA[1];
  var tent = '<g transform="translate(' + tx + " " + ty + ')">';
  tent += '<ellipse cx="0" cy="44" rx="128" ry="24" fill="#2B1B30" opacity=".16"/>';
  for (var sI = 0; sI < 8; sI += 1) {
    var x0 = -104 + sI * 26, x1 = x0 + 26;
    tent += '<path d="M ' + x0 + " 40 L " + x1 + " 40 L " + (x1 * 0.8).toFixed(1) + " -34 L " + (x0 * 0.8).toFixed(1) + ' -34 Z" fill="' + (sI % 2 ? "#5B3A6E" : "#FFF4E2") + '"/>';
  }
  for (var rI = 0; rI < 8; rI += 1) {
    var a0 = -110 + rI * 27.5, a1 = a0 + 27.5;
    tent += '<path d="M ' + a0.toFixed(1) + " -30 L " + a1.toFixed(1) + ' -30 L 0 -132 Z" fill="' + (rI % 2 ? "#FFF4E2" : "#C9483E") + '"/>';
  }
  for (var bI = 0; bI < 8; bI += 1) {
    var b0 = -110 + bI * 27.5;
    tent += '<path d="M ' + b0.toFixed(1) + " -32 Q " + (b0 + 13.75).toFixed(1) + " -12 " + (b0 + 27.5).toFixed(1) + ' -32 Z" fill="' + (bI % 2 ? "#E3B04B" : "#7A5A9E") + '"/>';
  }
  tent += '<path id="tentDoor" d="M -26 40 L -26 2 Q 0 -26 26 2 L 26 40 Z" fill="#2A1236"/>';
  tent += '<line x1="0" y1="-132" x2="0" y2="-176" stroke="#5B3A6E" stroke-width="5"/><path d="M 2 -176 L 50 -164 L 2 -150 Z" fill="#EFCF6A"/>';
  tent += '<g transform="translate(0 62)"><rect x="-70" y="0" width="140" height="34" rx="10" fill="#FFF4DC" stroke="#5B3A6E" stroke-width="4"/><text x="0" y="25" font-family="HY" font-size="22" text-anchor="middle" fill="#5B3A6E">餐馆路演</text></g>';
  tent += "</g>";
  svg += tent;
  // you-are-here marker base
  svg += "</svg>";
  cam.innerHTML = svg;

  var layer = h("div", "abs", cam);
  F.css(layer, { left: "0", top: "0", width: "1400px", height: "1000px" });
  var circleSvg = '<svg class="abs" style="left:0;top:0;width:1400px;height:1000px;overflow:visible" viewBox="0 0 1400 1000">' +
    '<circle id="r3km" cx="' + YOU[0] + '" cy="' + YOU[1] + '" r="' + R3KM + '" fill="rgba(47,110,98,0.07)" stroke="#2F6E62" stroke-width="6" stroke-dasharray="22 16" stroke-linecap="round"/>' +
    "</svg>";
  layer.insertAdjacentHTML("beforeend", circleSvg);
  var r3 = layer.querySelector("#r3km");
  // dashed ring draws itself (svg-path-draw on a circle)
  var circ = 2 * Math.PI * R3KM;
  F.each(function (t) {
    var k = U.easeIO(F.seg(t, T.pass1, T.pass1 + 0.7));
    r3.setAttribute("stroke-dasharray", k >= 1 ? "22 16" : (circ * k).toFixed(1) + " " + circ.toFixed(1));
    r3.style.opacity = t < T.pass1 ? "0" : String(1 - F.seg(t, T.pass3 + 0.2, T.pass3 + 0.8) * 0.75);
  });

  // you marker
  var you = h("div", "abs", layer);
  F.css(you, { left: YOU[0] - 40 + "px", top: YOU[1] - 40 + "px", width: "80px", height: "80px" });
  you.innerHTML = '<div class="abs" id="youRing" style="inset:0;border-radius:50%;border:5px solid #2F6E62"></div>' +
    '<div class="abs" style="left:14px;top:14px;width:52px;height:52px;border-radius:50%;background:#2F6E62;box-shadow:0 5px 0 #245548;color:#FFF8EC;font:700 26px/52px Fredoka,NotoSC;text-align:center">你</div>';
  var youRing = you.querySelector("#youRing");
  F.each(function (t) {
    var ph = (t * 0.8) % 1;
    youRing.style.transform = "scale(" + (1 + ph * 0.9).toFixed(3) + ")";
    youRing.style.opacity = (1 - ph).toFixed(3);
  });
  tl.fromTo(you, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, T.pins - 0.2);

  /* --------------------------------------------------------------- pins */
  function pinSVG(col) {
    return '<svg viewBox="0 0 64 84"><ellipse cx="32" cy="80" rx="14" ry="4" fill="#2B1B30" opacity=".22"/>' +
      '<path d="M 32 78 C 22 62 6 50 6 31 C 6 15 18 5 32 5 C 46 5 58 15 58 31 C 58 50 42 62 32 78 Z" fill="' + col + '"/>' +
      '<path d="M 32 72 C 24 60 10 49 10 31" stroke="#000" stroke-opacity=".12" stroke-width="5" fill="none"/>' +
      '<circle cx="32" cy="31" r="14" fill="#FFFBF4"/><circle cx="32" cy="31" r="6" fill="' + col + '"/></svg>';
  }
  var PCOL = ["#D98B6A", "#7C9CC2", "#D9A441", "#9A84BD", "#6FA88A", "#C08A64", "#D98C9E", "#8AAA5A"];
  var pins = [];
  SPOTS.forEach(function (sp, i) {
    var el = h("div", "pin", layer, pinSVG(PCOL[i % PCOL.length]));
    F.css(el, { left: sp[0] + "px", top: sp[1] - 78 + "px" });
    var dx = sp[0] - YOU[0], dy = sp[1] - YOU[1];
    var pass = Math.sqrt(dx * dx + dy * dy) > R3KM ? 0 : i % 2 ? 1 : 2;
    pins.push({ el: el, pass: pass, i: i });
  });
  var finals = {};
  WHO.forEach(function (w, i) {
    var col = ["#C9483E", "#2F6E62", "#7A5A9E"][i];
    var el = h("div", "pin", layer, pinSVG(col));
    F.css(el, { left: HOME[w][0] + "px", top: HOME[w][1] - 104 + "px", width: "80px", height: "105px", marginLeft: "-40px", marginTop: "-105px" });
    finals[w] = el;
    pins.push({ el: el, pass: -1, i: 100 + i });
  });
  // drop in
  pins.forEach(function (p, k) {
    var t0 = T.pins + (prand(k * 3 + 1) * 0.65);
    tl.fromTo(p.el, { y: -60, scale: 0.2, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2.2)" }, t0);
    if (p.pass >= 0) {
      var tp = PASSES[p.pass] + 0.35 + prand(k * 7) * 0.7;
      tl.to(p.el, { filter: "grayscale(1) brightness(1.15)", duration: 0.15 }, tp - 0.15);
      tl.to(p.el, { scale: 0, rotation: k % 2 ? 24 : -24, opacity: 0, duration: 0.32, ease: "back.in(2.4)" }, tp);
    }
  });
  // scan sweeps for pass 2 and 3
  [[T.pass2, "rgba(122,90,158,0.30)"], [T.pass3, "rgba(227,176,75,0.34)"]].forEach(function (s) {
    var band = h("div", "abs", layer);
    F.css(band, { left: "-300px", top: "0", width: "260px", height: "1000px", background: "linear-gradient(90deg, rgba(0,0,0,0), " + s[1] + ", rgba(0,0,0,0))" });
    tl.fromTo(band, { x: 0, opacity: 0 }, { x: 1960, opacity: 1, duration: 1.1, ease: "power1.inOut" }, s[0]);
    tl.to(band, { opacity: 0, duration: 0.2 }, s[0] + 0.95);
  });
  // finalists glow + labels
  var LABELS = {
    rong: ["巴适川菜", "川菜 · ¥85/人 · 1.2 km", "#C9483E"],
    hua: ["华记粤点", "粤菜 · ¥128/人 · 0.8 km", "#2F6E62"],
    pierre: ["Chez Pierre", "法餐 · ¥198/人 · 2.1 km", "#7A5A9E"],
  };
  var glowRings = {};
  WHO.forEach(function (w, i) {
    var ring = h("div", "abs", layer);
    F.css(ring, { left: HOME[w][0] - 70 + "px", top: HOME[w][1] - 210 + "px", width: "140px", height: "140px", borderRadius: "50%", border: "6px solid " + LABELS[w][2], opacity: "0" });
    glowRings[w] = ring;
    var lab = h("div", "plabel", layer, LABELS[w][0] + "<small>" + LABELS[w][1] + "</small>");
    lab.style.setProperty("--edge", LABELS[w][2]);
    var lx = { rong: HOME.rong[0] - 120, hua: HOME.hua[0] - 30, pierre: HOME.pierre[0] - 160 }[w];
    F.css(lab, { left: lx + "px", top: HOME[w][1] - 250 + "px" });
    tl.fromTo(lab, { scale: 0.3, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, T.finals + i * 0.18);
    tl.to(lab, { scale: 0.6, opacity: 0, y: -20, duration: 0.25, ease: "power2.in" }, T.burst - 0.25);
    tl.to(finals[w], { scale: 1.25, duration: 0.3, ease: "back.out(2)" }, T.finals + i * 0.18);
    tl.to(finals[w], { scale: 0, opacity: 0, duration: 0.22, ease: "back.in(2)" }, T.burst + i * 0.12 - 0.05);
  });
  F.each(function (t) {
    WHO.forEach(function (w, i) {
      var r = glowRings[w];
      if (t < T.finals + i * 0.18 || t > T.burst + 0.3) {
        r.style.opacity = "0";
        return;
      }
      var ph = ((t - T.finals) * 1.1 + i * 0.3) % 1;
      r.style.transform = "scale(" + (0.6 + ph * 0.9).toFixed(3) + ")";
      r.style.opacity = ((1 - ph) * 0.9).toFixed(3);
    });
  });

  /* ------------------------------------------------- the three runners */
  var PATHS = {
    rong: [[300, 700], [382, 622], [480, 560], [575, 488], [640, 512], [652, 528]],
    hua: [[1020, 370], [930, 410], [840, 462], [770, 492], [710, 522], [702, 532]],
    pierre: [[1120, 760], [985, 702], [845, 660], [742, 600], [752, 540], [752, 530]],
  };
  function pathLen(P) {
    var L = [0];
    for (var i = 1; i < P.length; i += 1) {
      var dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1];
      L.push(L[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return L;
  }
  function along(P, L, k) {
    var d = k * L[L.length - 1];
    for (var i = 1; i < P.length; i += 1) {
      if (d <= L[i]) {
        var u = (d - L[i - 1]) / (L[i] - L[i - 1] || 1);
        return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u, P[i][0] - P[i - 1][0]];
      }
    }
    var l = P[P.length - 1];
    return [l[0], l[1], 0];
  }
  var RS = 0.25; // rig scale on the map
  var RW = 420 * RS, RH = 640 * RS, FEET = (610 / 640) * RH;
  var runners = {};
  WHO.forEach(function (w, i) {
    var box = h("div", "rigbox", layer);
    F.css(box, { width: RW + "px", height: RH + "px", left: "0", top: "0" });
    var rig = RIG.create(box, w, "map-" + w);
    var a = new RIG.Actor(rig, { seed: i + 3, expr: "idle" });
    var P = PATHS[w], L = pathLen(P);
    var tStart = T.run0 + i * 0.12, tEnd = T.run1 + i * 0.08;
    var pop = T.burst + i * 0.12;
    runners[w] = { box: box, a: a, P: P, L: L, tStart: tStart, tEnd: tEnd, pop: pop };
    F.actor(a, T.burst - 0.1, T.agentOut);
    a.run(tStart, tEnd, 3.4);
    F.each(function (t) {
      var k = U.easeIO(F.seg(t, tStart, tEnd));
      var pos = along(P, L, k);
      var s = t < pop ? 0 : t < pop + 0.45 ? U.easeOutBack(F.seg(t, pop, pop + 0.45)) : 1;
      var lift = t < pop + 0.45 ? -40 * Math.sin(Math.PI * F.seg(t, pop, pop + 0.45)) : 0;
      // squeeze into the tent door together
      var ke = F.seg(t, T.enter + i * 0.05, T.enter + 0.38 + i * 0.05);
      if (ke > 0) {
        var ee = ke * ke;
        pos = [U.lerp(pos[0], 700 + (i - 1) * 8, ee), U.lerp(pos[1], 500, ee)];
        s *= 1 - 0.45 * ee;
        lift -= 18 * Math.sin(Math.PI * ke);
      }
      box.style.transform = "translate(" + (pos[0] - RW / 2).toFixed(1) + "px," + (pos[1] - FEET + lift).toFixed(1) + "px) scale(" + s.toFixed(3) + ")";
      box.style.transformOrigin = "50% " + ((FEET / RH) * 100).toFixed(1) + "%";
      box.style.opacity = t < pop ? "0" : String(1 - F.seg(t, T.enter + 0.26 + i * 0.05, T.enter + 0.4 + i * 0.05));
    });
  });
  // poses + expressions
  var rA = runners.rong.a, hA = runners.hua.a, pA = runners.pierre.a;
  rA.e(T.burst, "pitch").p(T.burst + 0.3, "waveR").p(T.glance, "hip").e(T.glance, "sly").look(T.glance, 1, -0.2)
    .e(T.run0, "pitch").look(T.run0, 0.4, 0).e(T.bump, "shock").act(T.bump, "hop", 0.3).e(T.bump + 0.35, "angry").look(T.bump + 0.35, 1, 0);
  hA.e(T.burst + 0.12, "pitch").p(T.burst + 0.4, "hip").e(T.glance, "smug").look(T.glance, -1, 0.2)
    .e(T.run0, "smug").look(T.run0, -0.5, 0).e(T.bump, "shock").act(T.bump, "hop", 0.3).e(T.bump + 0.35, "sly").look(T.bump + 0.35, -1, 0);
  pA.e(T.burst + 0.24, "kiss").p(T.burst + 0.4, "kissR").p(T.burst + 0.9, "kissOut").e(T.glance, "haughty").p(T.glance, "rest")
    .e(T.run0, "proud").e(T.bump, "shock").act(T.bump, "hop", 0.3).e(T.bump + 0.35, "haughty");
  [rA, hA, pA].forEach(function (a) {
    a.act(T.bump + 0.1, "shake", 0.5, 1.2);
  });

  // mini speech bubbles on the map
  function mbub(w, text, t0, t1, dx, dy, edge) {
    var b = h("div", "mbub", layer, text);
    b.style.setProperty("--edge", edge);
    F.each(function (t) {
      var on = t >= t0 && t <= t1;
      if (!on) {
        if (b.style.opacity !== "0") b.style.opacity = "0";
        return;
      }
      var R = runners[w];
      var k = U.easeIO(F.seg(t, R.tStart, R.tEnd));
      var pos = along(R.P, R.L, k);
      var s = U.easeOutBack(F.seg(t, t0, t0 + 0.3));
      var o = Math.min(1, (t1 - t) / 0.2);
      b.style.transform = "translate(" + (pos[0] + dx).toFixed(1) + "px," + (pos[1] - FEET - 52 + dy).toFixed(1) + "px) translate(-50%,0) scale(" + s.toFixed(3) + ")";
      b.style.opacity = o.toFixed(3);
    });
    return b;
  }
  mbub("rong", "到我啦！", T.burst + 0.5, T.glance - 0.1, 0, 0, "#C9483E");
  mbub("hua", "饮茶先！", T.burst + 0.62, T.glance - 0.1, 0, 0, "#2F6E62");
  mbub("pierre", "Bonjour~", T.burst + 0.74, T.glance - 0.1, 0, 0, "#7A5A9E");
  mbub("rong", "哼！", T.glance + 0.1, T.run0 - 0.05, 0, 0, "#C9483E");
  mbub("hua", "嘿嘿", T.glance + 0.2, T.run0 - 0.05, 0, 0, "#2F6E62");
  mbub("pierre", "Pff…", T.glance + 0.3, T.run0 - 0.05, 0, 0, "#7A5A9E");

  // dust puffs while running
  WHO.forEach(function (w, wi) {
    var R = runners[w];
    var n = Math.floor((R.tEnd - R.tStart) / 0.11);
    var pool = [];
    for (var k = 0; k < n; k += 1) {
      var tk = R.tStart + k * 0.11;
      var pos = along(R.P, R.L, U.easeIO(F.seg(tk, R.tStart, R.tEnd)));
      var el = h("div", "puff", layer);
      el.style.opacity = "0";
      pool.push({ el: el, t: tk, x: pos[0] + (prand(k + wi * 50) - 0.5) * 16, y: pos[1] - 6 });
    }
    F.each(function (t) {
      for (var j = 0; j < pool.length; j += 1) {
        var p = pool[j], lt = t - p.t;
        if (lt < 0 || lt > 0.55) {
          if (p.el.style.opacity !== "0") p.el.style.opacity = "0";
          continue;
        }
        var q = lt / 0.55;
        p.el.style.transform = "translate(" + p.x.toFixed(1) + "px," + (p.y - q * 14).toFixed(1) + "px) scale(" + (0.4 + q * 0.9).toFixed(3) + ")";
        p.el.style.opacity = ((1 - q) * 0.85).toFixed(3);
      }
    });
  });

  /* --------------------------------------------------------- camera */
  var door = [PLAZA[0], PLAZA[1] + 24];
  function camAt(t) {
    var s = 1, cx = 700, cy = 500;
    var k1 = U.easeIO(F.seg(t, T.run0 - 0.2, T.run1));
    s = U.lerp(1, 1.5, k1);
    cx = U.lerp(700, 700, k1);
    cy = U.lerp(500, 520, k1);
    var k2 = F.seg(t, T.zoomTent, T.zoomTent + 1.45);
    if (k2 > 0) {
      var e = k2 * k2 * k2 * k2;
      s = U.lerp(1.5, 52, e);
      cx = U.lerp(700, door[0], Math.min(1, k2 * 2));
      cy = U.lerp(520, door[1], Math.min(1, k2 * 2));
    }
    return [s, cx, cy];
  }
  F.each(function (t) {
    var c = camAt(t);
    cam.style.transform = "translate(" + (700 - c[1] * c[0]).toFixed(2) + "px," + (500 - c[2] * c[0]).toFixed(2) + "px) scale(" + c[0].toFixed(4) + ")";
  });
  // frame grows to full screen while the camera dives into the tent
  tl.to(mapFrame, { x: -220, scale: 1.372, borderRadius: 0, duration: 0.9, ease: "power3.inOut" }, T.zoomTent);
  tl.to(side, { x: -520, opacity: 0, duration: 0.6, ease: "power3.in" }, T.zoomTent);
  tl.to(orbWrap, { x: -400, opacity: 0, duration: 0.6, ease: "power3.in" }, T.zoomTent);
})();
