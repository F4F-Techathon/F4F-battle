/* scene-hook.js — 0–4.6 s: choice overload. */
(function () {
  "use strict";
  var F = FILM, T = F.T, tl = F.tl, h = F.h;
  var root = F.$("sc-hook");

  var NAMES = [
    "老成都火锅", "阿婆烧腊饭", "Le Petit Bistro", "一碗好面", "东北饺子馆", "炭烤牛排屋", "云南过桥米线", "博多拉面",
    "湘味小炒", "潮汕牛肉火锅", "那不勒斯披萨", "泰式冬阴功", "韩式烤肉", "麻辣香锅", "广式早茶", "海鲜大排档",
    "轻食沙拉", "新疆烤串", "酸菜鱼工坊", "江南小厨", "日式咖喱屋", "寿喜锅", "西班牙小酒馆", "甜品研究所",
    "重庆小面", "顺德鱼生", "越南河粉", "台式卤肉饭", "意式手工面", "铁板烧", "羊蝎子", "椰子鸡",
  ];
  var TINTS = ["#F6D7C3", "#DCEBD3", "#E6DDF2", "#F8E6B8", "#D5E8E6", "#F3D1D1", "#E9E1D2", "#DDE4F2"];

  function dish(k, seed) {
    var p = F.prand;
    var s = '<svg viewBox="0 0 348 132" preserveAspectRatio="xMidYMid slice">';
    s += '<rect width="348" height="132" fill="' + TINTS[seed % TINTS.length] + '"/>';
    for (var i = 0; i < 9; i += 1) s += '<circle cx="' + (p(seed * 9 + i) * 348).toFixed(0) + '" cy="' + (p(seed * 13 + i) * 132).toFixed(0) + '" r="' + (6 + p(seed * 3 + i) * 10).toFixed(0) + '" fill="#FFFFFF" opacity=".35"/>';
    s += '<ellipse cx="174" cy="74" rx="78" ry="46" fill="#FFFFFF"/><ellipse cx="174" cy="70" rx="64" ry="36" fill="#F4ECDF"/>';
    if (k === 0) s += '<ellipse cx="174" cy="68" rx="56" ry="30" fill="#B8322A"/><circle cx="154" cy="62" r="7" fill="#E9A23B"/><circle cx="188" cy="74" r="6" fill="#5E9C4E"/><circle cx="198" cy="58" r="5" fill="#F3E2C2"/>';
    else if (k === 1) s += '<ellipse cx="174" cy="68" rx="56" ry="30" fill="#E9C27A"/><path d="M 132 64 Q 150 50 168 64 T 204 64 M 136 76 Q 154 62 172 76 T 208 76" stroke="#F7E6B8" stroke-width="6" fill="none"/><circle cx="196" cy="58" r="9" fill="#F2F0E6"/>';
    else if (k === 2) s += '<path d="M 130 76 Q 146 46 162 76 Z M 160 80 Q 176 48 192 80 Z M 188 76 Q 204 46 220 76 Z" fill="#FBF3E2" stroke="#E2D2B3" stroke-width="3"/>';
    else if (k === 3) s += '<path d="M 136 74 Q 140 48 182 52 Q 216 56 210 78 Q 196 92 160 90 Q 134 88 136 74 Z" fill="#7B3F28"/><path d="M 150 66 L 196 64 M 152 76 L 198 74" stroke="#5A2A18" stroke-width="4"/><circle cx="210" cy="62" r="8" fill="#5E9C4E"/>';
    else if (k === 4) s += '<rect x="136" y="56" width="36" height="26" rx="12" fill="#FFFFFF"/><rect x="138" y="52" width="32" height="12" rx="6" fill="#F08A5D"/><rect x="178" y="56" width="36" height="26" rx="12" fill="#FFFFFF"/><rect x="180" y="52" width="32" height="12" rx="6" fill="#E8505B"/>';
    else if (k === 5) s += '<path d="M 146 84 L 204 84 L 196 52 Q 176 40 154 52 Z" fill="#F4B6C2"/><path d="M 150 62 Q 176 52 200 62" stroke="#FFFFFF" stroke-width="6" fill="none"/><circle cx="176" cy="46" r="8" fill="#C9483E"/>';
    else if (k === 6) s += '<circle cx="160" cy="66" r="16" fill="#7DB36A"/><circle cx="186" cy="62" r="14" fill="#9CCB7E"/><circle cx="176" cy="80" r="12" fill="#E8505B"/><circle cx="198" cy="76" r="9" fill="#F2C14E"/>';
    else s += '<path d="M 128 84 L 220 48" stroke="#A8743E" stroke-width="5"/><rect x="146" y="64" width="16" height="16" rx="5" fill="#8A4B2A" transform="rotate(-21 154 72)"/><rect x="170" y="55" width="16" height="16" rx="5" fill="#B8672E" transform="rotate(-21 178 63)"/><rect x="194" y="46" width="16" height="16" rx="5" fill="#8A4B2A" transform="rotate(-21 202 54)"/>';
    return s + "</svg>";
  }

  var wall = h("div", "hook-wall", root);
  wall.setAttribute("data-layout-allow-overlap", "");
  wall.setAttribute("data-layout-allow-overflow", "");
  var cols = [];
  for (var c = 0; c < 4; c += 1) {
    var col = h("div", "hook-col", wall);
    col.style.left = 90 + c * 455 + "px";
    for (var r = 0; r < 9; r += 1) {
      var idx = (c * 9 + r) % NAMES.length;
      var card = h("div", "rcard", col);
      card.style.top = r * 262 - 300 + "px";
      var rating = (4.1 + F.prand(idx * 3) * 0.8).toFixed(1);
      var price = 40 + Math.round(F.prand(idx * 5) * 220);
      var km = (0.4 + F.prand(idx * 7) * 4.2).toFixed(1);
      card.innerHTML =
        '<div class="thumb">' + dish((idx * 5 + c) % 8, idx) + "</div>" +
        '<div class="nm">' + NAMES[idx] + "</div>" +
        '<div class="meta"><b>★ ' + rating + "</b> · ¥" + price + "/人 · " + km + "km</div>";
    }
    cols.push(col);
  }
  var veil = h("div", "hook-veil", root);
  var head = h("div", "hook-head", root);
  var title = h("div", "hook-title", head, "今晚吃什么？");
  var sub = h("div", "hook-sub", head, '附近 <b id="hookN">0</b> 家餐馆 · 已经刷了 40 分钟');
  var stamp = h("div", "hook-stamp", root, "选择困难");
  var glow = h("div", "hook-glow", root);

  // columns: a fling that slows down, alternating directions
  cols.forEach(function (col, i) {
    var dir = i % 2 ? 1 : -1;
    var dist = 820 + i * 90;
    tl.fromTo(col, { y: -dir * 260 }, { y: dir * dist - dir * 260, duration: 4.6, ease: "power2.out" }, 0);
  });
  tl.fromTo(title, { scale: 1.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.8)" }, T.hookTitle);
  tl.fromTo(sub, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, T.hookSub);
  var nEl = sub.querySelector("#hookN");
  var lastN = -1;
  F.each(function (t) {
    var n = Math.round(F.U.easeIO(F.seg(t, T.hookSub, T.hookSub + 0.9)) * 1284);
    if (n !== lastN) {
      lastN = n;
      nEl.textContent = n.toLocaleString("en-US");
    }
  });
  tl.fromTo(stamp, { scale: 2.8, rotation: -26, opacity: 0 }, { scale: 1, rotation: -12, opacity: 1, duration: 0.26, ease: "power4.in" }, T.hookStamp);
  tl.to(head, { keyframes: [{ x: -16, duration: 0.04 }, { x: 13, duration: 0.04 }, { x: -9, duration: 0.04 }, { x: 5, duration: 0.04 }, { x: 0, duration: 0.05 }] }, T.hookStamp + 0.26);
  // blur out, the agent glow takes over
  tl.fromTo(wall, { filter: "blur(0px)", opacity: 1 }, { filter: "blur(14px)", opacity: 0.45, duration: 0.8, ease: "power2.inOut" }, T.hookBlur);
  tl.fromTo([head, stamp], { opacity: 1 }, { opacity: 0, duration: 0.45, ease: "power2.in", immediateRender: false }, T.hookBlur + 0.15);
  tl.fromTo(glow, { scale: 0.15, opacity: 0 }, { scale: 1.1, opacity: 1, duration: 0.6, ease: "power2.out" }, T.hookBlur + 0.1);
  tl.to(glow, { scale: 1.5, opacity: 0, duration: 0.6, ease: "power1.in" }, T.agentIn + 0.1);
  tl.set(veil, { opacity: 1 }, 0);
})();
