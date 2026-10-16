/* rig.js — flat 2D character rig (SVG) + a pure-function face/body director.
 *
 * Every visible pose is computed from the composition time `t` alone:
 * expression presets blend over 0.22 s behind a head squash, blinks follow a
 * fixed per-character schedule, and the mouth reads baked visemes from
 * window.LIPSYNC (tools/lipsync.py). The same state machine can later take a
 * live viseme stream instead of the baked one.
 *
 * Character local space: x = 0 is the body centre, y = 0 is the floor.
 */
(function () {
  "use strict";
  if (window.RIG) return;

  var INK = "#2B1B30";
  var MOUTH = "#5B1F33";
  var TONGUE = "#EE7A86";
  var TEETH = "#FFF8EE";
  var WHITE = "#FFFDF7";

  /* ------------------------------------------------------------------ specs */
  var SPECS = {
    rong: {
      skin: "#F6CBA9", skinShade: "#E5AC88", blush: "#F0857A", hair: "#2A1C24", hairHi: "#4A3442",
      top: "#C9483E", topShade: "#A23933", inner: "#F6E8D2", apron: "#E3B04B", apronShade: "#C9963A",
      pants: "#4A2B3D", shoes: "#2E1B2C", brow: "#2A1C24",
      face: { rx: 104, ry: 100, cy: -110 }, eye: { x: 40, y: -104, rx: 22, ry: 26, lash: true },
      browAt: { x: 40, y: -150, w: 19, h: 6, sw: 7 }, mouthAt: { y: -46, s: 1 }, cheek: { x: 62, y: -62, rx: 19, ry: 11 }, steamY: -335,
      body: 1, legW: 42, shoulder: 70, lext: 40,
    },
    hua: {
      skin: "#F1C09B", skinShade: "#DCA27F", blush: "#EE8C7E", hair: "#1E1B21", hairHi: "#3A3540", gray: "#C2BCC8",
      top: "#2F6E62", topShade: "#245548", trim: "#F3EAD8", apron: "#F3EAD8", apronShade: "#DCCFB4",
      pants: "#2F3640", shoes: "#3B2A22", brow: "#26222A",
      face: { rx: 114, ry: 100, cy: -108 }, eye: { x: 44, y: -102, rx: 19, ry: 22, lash: false },
      browAt: { x: 45, y: -150, w: 21, h: 5, sw: 12 }, mouthAt: { y: -40, s: 1.12 }, cheek: { x: 68, y: -58, rx: 23, ry: 13 }, steamY: -262,
      body: 1.2, legW: 40, shoulder: 84, lext: 30,
    },
    pierre: {
      skin: "#F7D0B3", skinShade: "#E4B293", blush: "#EF9487", hair: "#6B4330", hairHi: "#8A5A40",
      top: "#FBF7F0", topShade: "#E6DCCB", scarf: "#7A5A9E", scarfShade: "#5F4482", pin: "#EFCF6A",
      apron: "#FFFFFF", apronShade: "#E7DFD2", pants: "#4B3560", shoes: "#26202C", brow: "#5A3726",
      face: { rx: 100, ry: 104, cy: -112 }, eye: { x: 38, y: -106, rx: 20, ry: 25, lash: false },
      browAt: { x: 39, y: -152, w: 19, h: 8, sw: 8 }, mouthAt: { y: -46, s: 0.98 }, cheek: { x: 60, y: -64, rx: 18, ry: 10 }, steamY: -372,
      body: 1, legW: 38, shoulder: 70, lext: 38,
    },
  };

  /* ---------------------------------------------------------------- helpers */
  function f(n) {
    return Math.round(n * 100) / 100;
  }
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function lerp(a, b, k) {
    return a + (b - a) * k;
  }
  function easeIO(k) {
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  }
  function easeOutBack(k) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  }
  function capsule(cx, y, w, h, fill, extra) {
    return '<rect x="' + f(cx - w / 2) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(w / 2) + '" fill="' + fill + '"' + (extra || "") + "/>";
  }

  /* ------------------------------------------------------------- mouths */
  // Each mouth shape: an outline path, optional teeth band / tongue, clipped.
  function mouthShape(id, name, d, opts) {
    opts = opts || {};
    var clip = id + "-mc-" + name;
    var s = '<g data-m="' + name + '" opacity="0">';
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
    var rest = "";
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
    var vis = "";
    vis += mouthShape(id, "v0", "M -15 2 Q 0 8 15 2", { stroke: true, sw: 6 });
    vis += mouthShape(id, "v1", "M -21 -7 Q 0 -11 21 -7 Q 21 22 0 26 Q -21 22 -21 -7 Z", { teethTop: -3, tongue: [24, 14, 9] });
    vis += mouthShape(id, "v2", "M 0 -14 C 12 -14 14 -4 14 3 C 14 12 8 17 0 17 C -8 17 -14 12 -14 3 C -14 -4 -12 -14 0 -14 Z", { tongue: [15, 9, 6] });
    vis += mouthShape(id, "v3", "M -25 -5 Q 0 -9 25 -5 Q 23 14 0 16 Q -23 14 -25 -5 Z", { teethTop: -1, tongue: [16, 13, 6] });
    vis += mouthShape(id, "v4", "M -26 -4 Q 0 -7 26 -4 Q 24 8 0 10 Q -24 8 -26 -4 Z", { teethTop: 0, teethBot: 5 });
    vis += mouthShape(id, "v5", "M 0 -9 C 8 -9 10 -3 10 1 C 10 7 6 10 0 10 C -6 10 -10 7 -10 1 C -10 -3 -8 -9 0 -9 Z", { tongue: [9, 5, 3] });
    vis += mouthShape(id, "v6", "M -22 -4 Q 0 -7 22 -4 Q 20 8 0 9 Q -20 8 -22 -4 Z", { fill: TEETH, line: "M -22 2 L 22 2", lips: MOUTH });
    return { rest: rest, vis: vis };
  }

  /* --------------------------------------------------------------- eyes */
  function eyeSVG(id, side, sp) {
    var e = sp.eye, rx = e.rx, ry = e.ry;
    var clip = id + "-ec" + side;
    var lidRy = ry * 1.1, lidRx = rx * 1.35;
    var dir = side === "L" ? 1 : -1; // inner direction (+x for the screen-left eye)
    var s = '<g data-eye="' + side + '" transform="translate(' + (side === "L" ? -e.x : e.x) + " " + e.y + ')">';
    // normal eye
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
    // skin ring hides the anti-aliased sclera edge under a closing lid
    s += '<ellipse rx="' + f(rx + 0.6) + '" ry="' + f(ry + 0.6) + '" fill="none" stroke="' + sp.skin + '" stroke-width="3"/>';
    if (e.lash) {
      // eyeliner wing at the outer corner, follows the lid (data-k=wing translated in render)
      var ox = -dir * rx;
      s += '<path data-k="wing" d="M ' + f(ox * 0.9) + " " + f(-ry * 0.35) + " Q " + f(ox * 1.25) + " " + f(-ry * 0.55) + " " + f(ox * 1.42) + " " + f(-ry * 0.95) + '" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
    }
    s += "</g></g>";
    // happy ^  closed ‿  squeeze >  star
    s += '<path data-k="happy" opacity="0" d="M ' + -rx + " 5 Q 0 " + f(-ry * 1.05) + " " + rx + ' 5" stroke="' + INK + '" stroke-width="7.5" fill="none" stroke-linecap="round"/>';
    s += '<path data-k="closed" opacity="0" d="M ' + -rx + " -3 Q 0 " + f(ry * 0.62) + " " + rx + ' -3" stroke="' + INK + '" stroke-width="6.5" fill="none" stroke-linecap="round"/>';
    s += '<path data-k="squeeze" opacity="0" d="M ' + f(-dir * rx * 0.8) + " " + f(-ry * 0.55) + " L " + f(dir * rx * 0.55) + " 0 L " + f(-dir * rx * 0.8) + " " + f(ry * 0.55) + '" stroke="' + INK + '" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    var st = [];
    for (var i = 0; i < 10; i += 1) {
      var a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? rx * 0.48 : rx * 1.12;
      st.push(f(Math.cos(a) * r) + "," + f(Math.sin(a) * r));
    }
    s += '<g data-k="star" opacity="0"><ellipse rx="' + rx + '" ry="' + ry + '" fill="' + WHITE + '"/><polygon points="' + st.join(" ") + '" fill="#F2B632" stroke="#E08A1E" stroke-width="2.5" stroke-linejoin="round"/><circle cx="' + f(-rx * 0.25) + '" cy="' + f(-ry * 0.3) + '" r="3.5" fill="#FFFFFF"/></g>';
    s += "</g>";
    return s;
  }

  /* ----------------------------------------------------------- hair & hats */
  function hairBack(sp, who) {
    if (who === "rong") {
      return (
        '<path d="M -110 -100 Q -118 -228 0 -230 Q 118 -228 110 -100 Q 106 -58 96 -42 L -96 -42 Q -106 -58 -110 -100 Z" fill="' + sp.hair + '"/>' +
        '<circle cx="8" cy="-262" r="56" fill="' + sp.hair + '"/>' +
        '<path d="M -30 -290 Q 8 -318 46 -288" stroke="' + sp.hairHi + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<path d="M -36 -258 Q 6 -236 50 -262" stroke="' + sp.hairHi + '" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>' +
        '<line x1="-62" y1="-292" x2="74" y2="-236" stroke="#E3B04B" stroke-width="7" stroke-linecap="round"/>' +
        '<circle cx="-62" cy="-292" r="9" fill="#C9483E"/><circle cx="-65" cy="-295" r="3" fill="#F6E8D2"/>' +
        '<ellipse cx="6" cy="-217" rx="36" ry="11" fill="#C9483E"/>'
      );
    }
    if (who === "hua") {
      return '<path d="M -112 -112 Q -118 -226 0 -228 Q 118 -226 112 -112 L 100 -112 L -100 -112 Z" fill="' + sp.hair + '"/>';
    }
    // pierre: hair below the toque, side curls
    return (
      '<path d="M -106 -112 Q -112 -196 0 -200 Q 112 -196 106 -112 Q 104 -82 96 -72 L -96 -72 Q -104 -82 -106 -112 Z" fill="' + sp.hair + '"/>' +
      '<circle cx="-101" cy="-128" r="19" fill="' + sp.hair + '"/><circle cx="101" cy="-128" r="19" fill="' + sp.hair + '"/>' +
      '<circle cx="-104" cy="-100" r="14" fill="' + sp.hair + '"/><circle cx="104" cy="-100" r="14" fill="' + sp.hair + '"/>'
    );
  }

  function hairFront(sp, who) {
    if (who === "rong") {
      return (
        '<path d="M -109 -100 Q -113 -216 4 -219 Q 113 -216 109 -100 Q 101 -148 72 -168 Q 78 -138 57 -126 Q 51 -168 10 -180 Q -42 -186 -76 -160 Q -99 -140 -109 -100 Z" fill="' + sp.hair + '"/>' +
        '<path d="M -44 -196 Q 4 -214 52 -192" stroke="' + sp.hairHi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>' +
        '<path d="M -101 -150 Q -116 -98 -104 -56 Q -100 -46 -95 -58 Q -102 -98 -90 -146 Z" fill="' + sp.hair + '"/>' +
        '<path d="M 98 -150 Q 114 -104 104 -66 Q 112 -60 108 -50 Q 96 -60 92 -70 Q 100 -104 88 -146 Z" fill="' + sp.hair + '"/>'
      );
    }
    if (who === "hua") {
      return (
        '<path d="M -113 -110 Q -121 -232 0 -234 Q 121 -232 113 -110 Q 107 -150 97 -170 Q 62 -150 22 -172 Q -30 -198 -78 -177 Q -101 -160 -113 -110 Z" fill="' + sp.hair + '"/>' +
        '<path d="M -113 -110 Q -120 -180 -92 -210 Q -98 -172 -102 -150 Q -106 -128 -113 -110 Z" fill="' + sp.gray + '"/>' +
        '<path d="M -70 -214 Q -20 -228 40 -214" stroke="' + sp.hairHi + '" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/>' +
        '<rect x="-115" y="-128" width="12" height="34" rx="6" fill="' + sp.hair + '"/><rect x="103" y="-128" width="12" height="34" rx="6" fill="' + sp.hair + '"/>'
      );
    }
    return (
      '<path d="M -97 -184 Q -72 -156 -46 -176 Q -22 -154 4 -176 Q 28 -156 52 -176 Q 78 -160 97 -184 Z" fill="' + sp.hair + '"/>' +
      // toque
      '<rect x="-100" y="-262" width="200" height="56" fill="#FFFFFF"/>' +
      '<circle cx="-58" cy="-262" r="52" fill="#FFFFFF"/><circle cx="58" cy="-262" r="52" fill="#FFFFFF"/><circle cx="0" cy="-290" r="60" fill="#FFFFFF"/>' +
      '<path d="M -40 -300 L -44 -222 M 0 -330 L 0 -222 M 40 -300 L 44 -222" stroke="#EAE3D7" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="-98" y="-224" width="196" height="42" rx="12" fill="#FFFFFF"/>' +
      '<rect x="-98" y="-190" width="196" height="8" rx="4" fill="#ECE5DA"/>'
    );
  }

  /* --------------------------------------------------------------- bodies */
  function torsoSVG(sp, who) {
    var s = "";
    if (who === "rong") {
      s += '<path d="M -66 -210 Q -84 -206 -86 -186 L -90 -104 Q -90 -86 -70 -84 L 70 -84 Q 90 -86 90 -104 L 86 -186 Q 84 -206 66 -210 Z" fill="' + sp.top + '"/>';
      s += '<path d="M 58 -206 Q 84 -204 86 -186 L 90 -104 Q 90 -90 78 -86 L 70 -86 Q 74 -150 58 -206 Z" fill="' + sp.topShade + '" opacity=".55"/>';
      s += '<path d="M -24 -212 L 0 -170 L 24 -212 Z" fill="' + sp.inner + '"/>';
      s += '<path d="M -29 -219 Q 0 -207 29 -219 L 31 -206 Q 0 -194 -31 -206 Z" fill="' + sp.topShade + '"/>';
      [-188, -168, -148].forEach(function (y) {
        s += '<rect x="-17" y="' + y + '" width="28" height="7" rx="3.5" fill="' + sp.inner + '"/><circle cx="15" cy="' + (y + 3.5) + '" r="4.5" fill="' + sp.inner + '"/>';
      });
      s += '<g transform="translate(44 -192) rotate(18)"><path d="M 0 0 Q 12 4 15 22 Q 5 16 -2 4 Z" fill="#E0453A"/><path d="M -2 2 Q -6 -6 2 -8" stroke="#4F8A4A" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>';
      s += '<path d="M -75 -130 L 75 -130 L 81 -42 Q 0 -33 -81 -42 Z" fill="' + sp.apron + '"/>';
      s += '<path d="M 50 -130 L 75 -130 L 81 -42 Q 66 -40 58 -39 Q 62 -90 50 -130 Z" fill="' + sp.apronShade + '" opacity=".6"/>';
      s += '<rect x="-80" y="-136" width="160" height="12" rx="6" fill="' + sp.apronShade + '"/>';
      s += '<rect x="-48" y="-106" width="42" height="36" rx="6" fill="' + sp.apronShade + '"/><rect x="-48" y="-106" width="42" height="9" rx="4" fill="' + sp.topShade + '"/>';
      return s;
    }
    if (who === "hua") {
      s += '<path d="M -74 -210 Q -100 -204 -104 -178 L -113 -110 Q -115 -74 -82 -70 L 82 -70 Q 115 -74 113 -110 L 104 -178 Q 100 -204 74 -210 Z" fill="' + sp.top + '"/>';
      s += '<path d="M 66 -206 Q 100 -204 104 -178 L 113 -110 Q 113 -80 96 -72 L 84 -72 Q 96 -150 66 -206 Z" fill="' + sp.topShade + '" opacity=".6"/>';
      s += '<path d="M -29 -220 Q 0 -208 29 -220 L 31 -205 Q 0 -193 -31 -205 Z" fill="' + sp.trim + '"/>';
      s += '<path d="M 2 -200 Q 8 -160 6 -122" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
      [-186, -165, -144].forEach(function (y) {
        s += '<rect x="-10" y="' + y + '" width="30" height="7" rx="3.5" fill="' + sp.trim + '"/><circle cx="-11" cy="' + (y + 3.5) + '" r="4.5" fill="' + sp.trim + '"/>';
      });
      s += '<path d="M -90 -124 L 90 -124 L 96 -28 Q 0 -17 -96 -28 Z" fill="' + sp.apron + '"/>';
      s += '<path d="M 62 -124 L 90 -124 L 96 -28 Q 80 -24 70 -23 Q 76 -80 62 -124 Z" fill="' + sp.apronShade + '" opacity=".7"/>';
      s += '<rect x="-94" y="-130" width="188" height="12" rx="6" fill="' + sp.apronShade + '"/>';
      s += '<rect x="14" y="-104" width="48" height="40" rx="8" fill="' + sp.top + '"/>';
      s += '<g transform="translate(38 -84)"><path d="M 0 10 Q -14 -2 -4 -14 Q 6 -2 0 10 Z" fill="' + sp.trim + '"/><path d="M 1 10 Q 14 0 12 -10 Q 0 -6 1 10 Z" fill="' + sp.trim + '" opacity=".85"/></g>';
      return s;
    }
    s += '<path d="M -64 -210 Q -82 -206 -84 -186 L -88 -100 Q -88 -84 -70 -82 L 70 -82 Q 88 -84 88 -100 L 84 -186 Q 82 -206 64 -210 Z" fill="' + sp.top + '"/>';
    s += '<path d="M 56 -206 Q 82 -204 84 -186 L 88 -100 Q 88 -88 76 -84 L 68 -84 Q 74 -150 56 -206 Z" fill="' + sp.topShade + '" opacity=".7"/>';
    s += '<path d="M 10 -204 Q 15 -150 10 -96" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
    [-182, -158, -134].forEach(function (y) {
      s += '<circle cx="-22" cy="' + y + '" r="5.5" fill="#3B2A44"/><circle cx="32" cy="' + y + '" r="5.5" fill="#3B2A44"/>';
    });
    s += '<path d="M -76 -122 L 76 -122 L 82 -38 Q 0 -30 -82 -38 Z" fill="' + sp.apron + '"/>';
    s += '<path d="M 54 -122 L 76 -122 L 82 -38 Q 70 -36 62 -35 Q 66 -80 54 -122 Z" fill="' + sp.apronShade + '"/>';
    s += '<rect x="-80" y="-128" width="160" height="11" rx="5.5" fill="' + sp.apronShade + '"/>';
    s += '<path d="M -35 -221 Q 0 -201 35 -221 L 31 -204 Q 0 -186 -31 -204 Z" fill="' + sp.scarf + '"/>';
    s += '<path d="M -7 -201 L 7 -201 L 20 -164 L 0 -175 L -20 -164 Z" fill="' + sp.scarf + '"/><path d="M 0 -175 L 20 -164 L 7 -201 Z" fill="' + sp.scarfShade + '"/>';
    s += '<g transform="translate(0 -203)"><circle r="7" fill="' + sp.pin + '"/><path d="M 0 -5 L 0 5 M -4 0 L 4 0" stroke="#B88A2A" stroke-width="2"/></g>';
    return s;
  }

  function armSVG(sp, who, side) {
    var sleeve = sp.top;
    var forearm = '';
    if (who === "rong") {
      forearm = capsule(0, -6, 27, 62, sp.skin) + capsule(0, -8, 33, 16, sp.topShade);
    } else if (who === "hua") {
      forearm = capsule(0, -6, 28, 60, sp.skin);
    } else {
      forearm = capsule(0, -6, 29, 58, sleeve) + capsule(0, 34, 31, 14, sp.topShade);
    }
    var upper = capsule(0, -10, 34, 72, sleeve);
    if (who === "hua") upper += capsule(0, 44, 36, 14, sp.trim);
    if (who === "pierre") upper += '<path d="M -17 10 Q 0 16 17 10" stroke="' + sp.topShade + '" stroke-width="3" fill="none"/>';
    var hand =
      '<g data-k="hand">' +
      '<g data-h="open"><circle r="18" fill="' + sp.skin + '"/><ellipse cx="' + (side === "L" ? 13 : -13) + '" cy="-6" rx="7" ry="9" fill="' + sp.skin + '"/></g>' +
      '<g data-h="fist" opacity="0"><circle r="16" fill="' + sp.skin + '"/><path d="M -9 -4 L 9 -4 M -9 3 L 9 3" stroke="' + sp.skinShade + '" stroke-width="2.5" stroke-linecap="round"/></g>' +
      '<g data-h="thumb" opacity="0"><circle r="16" fill="' + sp.skin + '"/>' + capsule(side === "L" ? 7 : -7, 2, 12, 32, sp.skin) + '<path d="M -9 2 L 9 2 M -9 9 L 9 9" stroke="' + sp.skinShade + '" stroke-width="2.5" stroke-linecap="round"/></g>' +
      '<g data-h="point" opacity="0"><circle r="16" fill="' + sp.skin + '"/>' + capsule(0, 6, 11, 34, sp.skin) + "</g>" +
      "</g>";
    return (
      '<g data-arm="' + side + '">' + upper +
      '<g data-k="elbow">' + forearm + '<g data-k="handpos">' + hand + "</g></g></g>"
    );
  }

  function legSVG(sp, who, side) {
    var w = sp.legW, L = sp.lext;
    return (
      '<g data-leg="' + side + '">' +
      capsule(0, -6, w, 90 + L, sp.pants) +
      '<path d="M ' + f(-w / 2 - 4) + " " + (92 + L) + " Q " + f(-w / 2 - 4) + " " + (70 + L) + " " + (side === "L" ? -4 : 4) + " " + (70 + L) + " Q " + f(w / 2 + 6) + " " + (70 + L) + " " + f(w / 2 + 6) + " " + (92 + L) + ' Z" fill="' + sp.shoes + '"/>' +
      "</g>"
    );
  }

  /* -------------------------------------------------------------- effects */
  function fxSVG(id, sp) {
    var s = "";
    s += '<g data-fx="sweat" opacity="0" transform="translate(96 -168)"><path d="M 0 -20 Q 15 2 0 13 Q -15 2 0 -20 Z" fill="#9AD6F2"/><ellipse cx="-4" cy="2" rx="3" ry="5" fill="#FFFFFF" opacity=".8"/></g>';
    s += '<g data-fx="anger" opacity="0" transform="translate(-92 -176)">' +
      '<path d="M -18 -6 Q -6 -6 -6 -18 M 6 -18 Q 6 -6 18 -6 M 18 6 Q 6 6 6 18 M -6 18 Q -6 6 -18 6" stroke="#E0453A" stroke-width="6" fill="none" stroke-linecap="round"/></g>';
    var sy = sp.steamY, cloud = function (x, k) {
      return '<g data-p="' + k + '"><g transform="translate(' + x + " " + sy + ')"><circle cx="-12" cy="4" r="12" fill="#FFFFFF"/><circle cx="10" cy="2" r="14" fill="#FFFFFF"/><circle cx="0" cy="-9" r="13" fill="#FFFFFF"/><circle cx="2" cy="6" r="11" fill="#F1E9F5"/></g></g>';
    };
    s += '<g data-fx="steam" opacity="0">' + cloud(-46, 0) + cloud(48, 1) + cloud(2, 2) + "</g>";
    s += '<g data-fx="excl" opacity="0" transform="translate(0 -262)"><rect x="-8" y="-46" width="16" height="34" rx="8" fill="#E0453A"/><circle cy="2" r="8.5" fill="#E0453A"/></g>';
    s += '<g data-fx="quest" opacity="0" transform="translate(84 -236)"><path d="M -12 -10 Q -12 -26 2 -26 Q 16 -26 16 -12 Q 16 -2 4 2 L 4 10" stroke="#7A5A9E" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="4" cy="24" r="5.5" fill="#7A5A9E"/></g>';
    s += '<g data-fx="lines" opacity="0"><path d="M -78 -68 L -70 -54 M -66 -70 L -58 -56 M -54 -72 L -46 -58 M 50 -72 L 58 -58 M 62 -70 L 70 -56 M 74 -68 L 82 -54" stroke="' + sp.blush + '" stroke-width="4" stroke-linecap="round"/></g>';
    s += '<g data-fx="tears" opacity="0"><path d="M -60 -88 Q -52 -74 -60 -66 Q -68 -74 -60 -88 Z" fill="#9AD6F2"/><path d="M 60 -88 Q 68 -74 60 -66 Q 52 -74 60 -88 Z" fill="#9AD6F2"/></g>';
    var sparkle = function (x, y, r) {
      return '<path d="M ' + x + " " + (y - r) + " Q " + x + " " + y + " " + (x + r) + " " + y + " Q " + x + " " + y + " " + x + " " + (y + r) + " Q " + x + " " + y + " " + (x - r) + " " + y + " Q " + x + " " + y + " " + x + " " + (y - r) + ' Z" fill="#F2C14E"/>';
    };
    s += '<g data-fx="sparkle" opacity="0">' + sparkle(-118, -190, 16) + sparkle(122, -150, 12) + sparkle(-96, -40, 10) + sparkle(110, -230, 9) + "</g>";
    return s;
  }

  /* ---------------------------------------------------------------- build */
  function buildSVG(id, who) {
    var sp = SPECS[who];
    var m = mouthSet(id);
    var fa = sp.face;
    var head = "";
    head += hairBack(sp, who);
    head += '<ellipse cx="' + -(fa.rx - 6) + '" cy="' + (fa.cy + 6) + '" rx="19" ry="25" fill="' + sp.skin + '"/><ellipse cx="' + (fa.rx - 6) + '" cy="' + (fa.cy + 6) + '" rx="19" ry="25" fill="' + sp.skin + '"/>';
    head += '<ellipse cx="' + -(fa.rx - 4) + '" cy="' + (fa.cy + 8) + '" rx="8" ry="12" fill="' + sp.skinShade + '"/><ellipse cx="' + (fa.rx - 4) + '" cy="' + (fa.cy + 8) + '" rx="8" ry="12" fill="' + sp.skinShade + '"/>';
    if (who === "rong") head += '<circle cx="' + -(fa.rx - 2) + '" cy="' + (fa.cy + 34) + '" r="6.5" fill="#C9483E"/><circle cx="' + (fa.rx - 2) + '" cy="' + (fa.cy + 34) + '" r="6.5" fill="#C9483E"/>';
    head += '<ellipse cx="0" cy="' + fa.cy + '" rx="' + fa.rx + '" ry="' + fa.ry + '" fill="' + sp.skin + '"/>';
    if (who === "hua") head += '<path d="M -44 -16 Q 0 6 44 -16" stroke="' + sp.skinShade + '" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>';
    head += '<g data-k="feat">';
    head += '<ellipse data-k="cheekL" cx="' + -sp.cheek.x + '" cy="' + sp.cheek.y + '" rx="' + sp.cheek.rx + '" ry="' + sp.cheek.ry + '" fill="' + sp.blush + '"/>';
    head += '<ellipse data-k="cheekR" cx="' + sp.cheek.x + '" cy="' + sp.cheek.y + '" rx="' + sp.cheek.rx + '" ry="' + sp.cheek.ry + '" fill="' + sp.blush + '"/>';
    if (who === "hua") head += '<ellipse cx="0" cy="-74" rx="14" ry="11" fill="' + sp.skinShade + '"/><ellipse cx="-4" cy="-78" rx="5" ry="3.5" fill="#FFFFFF" opacity=".45"/>';
    else if (who === "pierre") head += '<path d="M -3 -96 Q 2 -78 -9 -68 Q 0 -63 9 -68" stroke="' + sp.skinShade + '" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    else head += '<ellipse cx="0" cy="-74" rx="8" ry="6" fill="' + sp.skinShade + '"/>';
    head += eyeSVG(id, "L", sp) + eyeSVG(id, "R", sp);
    head += '<linearGradient id="' + id + '-flush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0453A" stop-opacity=".95"/><stop offset=".3" stop-color="#E0453A" stop-opacity=".55"/><stop offset=".44" stop-color="#E0453A" stop-opacity="0"/></linearGradient>';
    head += '<ellipse data-k="red" cx="0" cy="' + fa.cy + '" rx="' + (fa.rx - 2) + '" ry="' + (fa.ry - 2) + '" fill="url(#' + id + '-flush)" opacity="0"/>';
    var b = sp.browAt;
    ["L", "R"].forEach(function (side) {
      var x = side === "L" ? -b.x : b.x;
      var d = side === "L" ? "M " + -b.w + " 2 Q " + -2 + " " + -b.h + " " + b.w + " 0" : "M " + -b.w + " 0 Q 2 " + -b.h + " " + b.w + " 2";
      head += '<g data-brow="' + side + '" transform="translate(' + x + " " + b.y + ')"><path d="' + d + '" stroke="' + sp.brow + '" stroke-width="' + b.sw + '" fill="none" stroke-linecap="round"/></g>';
    });
    head += '<g data-k="mouth" transform="translate(0 ' + sp.mouthAt.y + ") scale(" + sp.mouthAt.s + ')">' + m.rest + '<g data-k="talk">' + m.vis + "</g></g>";
    head += "</g>";
    head += '<g data-k="hairF">' + hairFront(sp, who) + "</g>";
    head += fxSVG(id, sp);

    var sh = sp.shoulder;
    var svg = "";
    svg += '<ellipse data-k="shadow" cx="0" cy="2" rx="' + (who === "hua" ? 104 : 88) + '" ry="16" fill="#2B1B30" opacity=".18"/>';
    svg += '<g data-k="body">';
    svg += '<g data-k="legL" transform="translate(-30 ' + (-98 - sp.lext) + ')">' + legSVG(sp, who, "L") + "</g>";
    svg += '<g data-k="legR" transform="translate(30 ' + (-98 - sp.lext) + ')">' + legSVG(sp, who, "R") + "</g>";
    svg += '<g data-k="torso"><g transform="translate(0 ' + -sp.lext + ')">';
    svg += '<rect x="-17" y="-236" width="34" height="32" rx="10" fill="' + sp.skinShade + '"/>';
    svg += torsoSVG(sp, who);
    svg += '<g data-k="head" transform="translate(0 -214)">' + head + "</g>";
    svg += '<g data-k="armL" transform="translate(' + -sh + ' -200)">' + armSVG(sp, who, "L") + "</g>";
    svg += '<g data-k="armR" transform="translate(' + sh + ' -200)">' + armSVG(sp, who, "R") + "</g>";
    svg += "</g></g></g>";
    return svg;
  }

  /* --------------------------------------------------- expressions / poses */
  // brow: [yL, rotL, yR, rotR]  (rot > 0 lowers the inner end = angry)
  var EXPR = {
    idle: { brow: [0, 0, 0, 0], lid: [0.12, 0.12], bot: [0.04, 0.04], scl: 1, pup: 1, eye: ["n", "n"], mouth: "smile", blush: 0.28, tilt: 0 },
    listen: { brow: [-3, -2, -3, -2], lid: [0.14, 0.14], bot: [0.08, 0.08], scl: 1, pup: 1.03, eye: ["n", "n"], mouth: "smile", blush: 0.28, tilt: 4 },
    pitch: { brow: [-9, -6, -9, -6], lid: [0.02, 0.02], bot: [0.22, 0.22], scl: 1.02, pup: 1.05, eye: ["n", "n"], mouth: "grin", blush: 0.48, tilt: -3, talk: 1.1 },
    proud: { brow: [-8, -8, -8, -8], lid: [0.46, 0.46], bot: [0.26, 0.26], scl: 1, pup: 0.95, eye: ["n", "n"], mouth: "smirk", blush: 0.36, tilt: -7 },
    wink: { brow: [-10, -6, 3, 6], lid: [0.04, 0.04], bot: [0.22, 0.22], scl: 1, pup: 1, eye: ["n", "happy"], mouth: "grin", blush: 0.55, tilt: 7, fx: { sparkle: 1 } },
    star: { brow: [-13, -10, -13, -10], lid: [0, 0], bot: [0, 0], scl: 1.08, pup: 1, eye: ["star", "star"], mouth: "laugh", blush: 0.78, tilt: 3, talk: 1.15, fx: { sparkle: 1 } },
    sly: { brow: [-11, -6, 4, 15], lid: [0.42, 0.34], bot: [0.24, 0.24], scl: 1, pup: 0.9, eye: ["n", "n"], mouth: "smirk", blush: 0.3, tilt: -5 },
    eyeroll: { brow: [-9, -6, -9, -6], lid: [0.36, 0.36], bot: [0, 0], scl: 1, pup: 0.9, eye: ["n", "n"], mouth: "flat", blush: 0.2, tilt: -8, look: { x: 0.3, y: -1 } },
    laugh: { brow: [-10, -8, -10, -8], lid: [0, 0], bot: [0, 0], scl: 1, pup: 1, eye: ["happy", "happy"], mouth: "laugh", blush: 0.72, tilt: -6, talk: 1.2 },
    shock: { brow: [-19, -13, -19, -13], lid: [0, 0], bot: [0, 0], scl: 1.17, pup: 0.5, eye: ["n", "n"], mouth: "O", blush: 0.12, tilt: 0, talk: 1.15, fx: { excl: 1 } },
    sweat: { brow: [-7, -18, -7, -18], lid: [0.2, 0.2], bot: [0.06, 0.06], scl: 1.02, pup: 0.8, eye: ["n", "n"], mouth: "wavy", blush: 0.42, tilt: 5, look: { x: -0.55, y: 0.25 }, fx: { sweat: 1, lines: 1 } },
    angry: { brow: [5, 23, 5, 23], lid: [0.3, 0.3], bot: [0.14, 0.14], scl: 1, pup: 0.84, eye: ["n", "n"], mouth: "angry", blush: 0.3, red: 0.5, tilt: 0, talk: 1.12, fx: { anger: 1, steam: 1 } },
    win: { brow: [-13, -8, -13, -8], lid: [0, 0], bot: [0, 0], scl: 1, pup: 1, eye: ["happy", "happy"], mouth: "laugh", blush: 0.78, tilt: 0, talk: 1.2, fx: { sparkle: 1 } },
    pout: { brow: [-4, -17, -4, -17], lid: [0.42, 0.42], bot: [0.1, 0.1], scl: 1, pup: 0.95, eye: ["n", "n"], mouth: "pout", blush: 0.6, tilt: 7, look: { x: -0.3, y: 0.75 } },
    haughty: { brow: [-13, -6, -13, -6], lid: [0, 0], bot: [0, 0], scl: 1, pup: 1, eye: ["closed", "closed"], mouth: "smirk", blush: 0.3, tilt: -9 },
    think: { brow: [-11, -6, 2, 11], lid: [0.24, 0.24], bot: [0.05, 0.05], scl: 1, pup: 0.95, eye: ["n", "n"], mouth: "flat", blush: 0.2, tilt: 6, look: { x: 0.6, y: -0.7 }, fx: { quest: 1 } },
    kiss: { brow: [-11, -6, -11, -6], lid: [0, 0], bot: [0, 0], scl: 1, pup: 1, eye: ["closed", "closed"], mouth: "kiss", blush: 0.62, tilt: -6, fx: { sparkle: 1 } },
    smug: { brow: [-6, -4, -11, -10], lid: [0.3, 0.3], bot: [0.22, 0.22], scl: 1, pup: 1, eye: ["n", "n"], mouth: "grin", blush: 0.36, tilt: -4 },
    nervous: { brow: [-8, -16, -8, -16], lid: [0.1, 0.1], bot: [0.12, 0.12], scl: 1.04, pup: 0.75, eye: ["n", "n"], mouth: "grin", blush: 0.5, tilt: 4, talk: 0.95, fx: { sweat: 1 } },
    squeal: { brow: [-12, -10, -12, -10], lid: [0, 0], bot: [0, 0], scl: 1, pup: 1, eye: ["squeeze", "squeeze"], mouth: "laugh", blush: 0.8, tilt: 0, talk: 1.2 },
  };

  // Arm pose: [shoulder, elbow, hand] — shoulder > 0 lifts the arm outward.
  var POSES = {
    rest: [[12, -8, "open"], [12, -8, "open"]],
    hip: [[58, -104, "fist"], [58, -104, "fist"]],
    hipL: [[58, -104, "fist"], [12, -8, "open"]],
    hipR: [[12, -8, "open"], [58, -104, "fist"]],
    thumbR: [[58, -104, "fist"], [20, -180, "thumb"]],
    thumbL: [[20, -180, "thumb"], [58, -104, "fist"]],
    waveL: [[158, -20, "open"], [12, -8, "open"]],
    waveR: [[12, -8, "open"], [158, -20, "open"]],
    pointL: [[86, 4, "point"], [14, -10, "open"]],
    pointR: [[14, -10, "open"], [86, 4, "point"]],
    pointRhip: [[58, -104, "fist"], [86, 4, "point"]],
    pointLhip: [[86, 4, "point"], [58, -104, "fist"]],
    cheer: [[165, 6, "open"], [165, 6, "open"]],
    shrug: [[40, 100, "open"], [40, 100, "open"]],
    clasp: [[-10, -110, "fist"], [-10, -110, "fist"]],
    kissR: [[12, -8, "open"], [-24, -146, "fist"]],
    kissOut: [[12, -8, "open"], [104, -30, "open"]],
    belly: [[-2, -86, "open"], [-2, -86, "open"]],
    bellyR: [[12, -8, "open"], [-2, -86, "open"]],
    wagR: [[12, -8, "open"], [26, -152, "point"]],
    wagL: [[26, -152, "point"], [12, -8, "open"]],
    present: [[12, -8, "open"], [50, 30, "open"]],
    presentL: [[50, 30, "open"], [12, -8, "open"]],
    handsUp: [[30, -150, "open"], [30, -150, "open"]],
    bow: [[-8, -96, "open"], [-8, -96, "open"]],
    run: [[24, -70, "fist"], [24, -70, "fist"]],
  };
  var OSC = { waveL: [0, 1], waveR: [1, 1], wagR: [1, 2], wagL: [0, 2], handsUp: [2, 3] };

  /* ------------------------------------------------------------- the rig */
  function Rig(container, who, id, opts) {
    opts = opts || {};
    this.who = who;
    this.id = id;
    this.sp = SPECS[who];
    var vb = opts.viewBox || "-210 -610 420 640";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", vb);
    svg.setAttribute("class", "rig rig-" + who);
    svg.setAttribute("overflow", "visible");
    svg.innerHTML = buildSVG(id, who);
    container.appendChild(svg);
    this.svg = svg;
    var q = function (sel) {
      return svg.querySelector(sel);
    };
    this.el = {
      body: q('[data-k="body"]'), torso: q('[data-k="torso"]'), head: q('[data-k="head"]'), shadow: q('[data-k="shadow"]'),
      feat: q('[data-k="feat"]'), hairF: q('[data-k="hairF"]'), red: q('[data-k="red"]'),
      cheekL: q('[data-k="cheekL"]'), cheekR: q('[data-k="cheekR"]'), mouth: q('[data-k="mouth"]'), talk: q('[data-k="talk"]'),
      legL: q('[data-k="legL"]'), legR: q('[data-k="legR"]'),
    };
    var self = this;
    this.mouths = {};
    svg.querySelectorAll("[data-m]").forEach(function (n) {
      self.mouths[n.getAttribute("data-m")] = n;
    });
    this.eyes = {};
    ["L", "R"].forEach(function (s) {
      var g = svg.querySelector('[data-eye="' + s + '"]');
      self.eyes[s] = {
        g: g, n: g.querySelector('[data-k="n"]'), scl: g.querySelector('[data-k="scl"]'), pup: g.querySelector('[data-k="pup"]'),
        lt: g.querySelector('[data-k="lt"]'), ltl: g.querySelector('[data-k="ltl"]'), lb: g.querySelector('[data-k="lb"]'),
        wing: g.querySelector('[data-k="wing"]'),
        happy: g.querySelector('[data-k="happy"]'), closed: g.querySelector('[data-k="closed"]'),
        squeeze: g.querySelector('[data-k="squeeze"]'), star: g.querySelector('[data-k="star"]'),
      };
    });
    this.brows = { L: svg.querySelector('[data-brow="L"]'), R: svg.querySelector('[data-brow="R"]') };
    this.arms = {};
    ["L", "R"].forEach(function (s) {
      var g = svg.querySelector('[data-k="arm' + s + '"]');
      var hands = {};
      g.querySelectorAll("[data-h]").forEach(function (n) {
        hands[n.getAttribute("data-h")] = n;
      });
      self.arms[s] = {
        g: g, x: (s === "L" ? -1 : 1) * self.sp.shoulder, elbow: g.querySelector('[data-k="elbow"]'),
        handpos: g.querySelector('[data-k="handpos"]'), hands: hands,
      };
    });
    this.fx = {};
    svg.querySelectorAll("[data-fx]").forEach(function (n) {
      self.fx[n.getAttribute("data-fx")] = n;
    });
    this.steamP = svg.querySelectorAll('[data-fx="steam"] [data-p]');
    this.cache = new Map();
  }

  Rig.prototype.set = function (el, attr, val) {
    if (!el) return;
    var key = el;
    var c = this.cache.get(key);
    if (!c) {
      c = {};
      this.cache.set(key, c);
    }
    if (c[attr] === val) return;
    c[attr] = val;
    el.setAttribute(attr, val);
  };

  // st: the full visual state (see Actor.state)
  Rig.prototype.render = function (st) {
    var sp = this.sp, e = this.el, self = this;
    // body
    this.set(e.body, "transform", "translate(" + f(st.bx) + " " + f(st.by) + ") rotate(" + f(st.lean) + ") scale(" + f(st.sx) + " " + f(st.sy) + ")");
    this.set(e.shadow, "transform", "scale(" + f(st.shadow) + " 1)");
    this.set(e.shadow, "opacity", f(0.18 * st.shadowA));
    this.set(e.legL, "transform", "translate(-30 " + (-98 - sp.lext) + ") rotate(" + f(st.legL) + ")");
    this.set(e.legR, "transform", "translate(30 " + (-98 - sp.lext) + ") rotate(" + f(st.legR) + ")");
    this.set(e.head, "transform", "translate(" + f(st.hx) + " " + f(-214 + st.hy) + ") rotate(" + f(st.tilt) + ") scale(" + f(st.hsx) + " " + f(st.hsy) + ")");
    this.set(e.feat, "transform", "translate(" + f(st.fs) + " 0)");
    this.set(e.hairF, "transform", "translate(" + f(st.fs * 0.35) + " 0)");
    this.set(e.red, "opacity", f(st.red * 1.1));
    this.set(e.cheekL, "opacity", f(st.blush));
    this.set(e.cheekR, "opacity", f(st.blush));
    // brows
    var bw = sp.browAt;
    this.set(this.brows.L, "transform", "translate(" + -bw.x + " " + f(bw.y + st.brow[0]) + ") rotate(" + f(st.brow[1]) + ")");
    this.set(this.brows.R, "transform", "translate(" + bw.x + " " + f(bw.y + st.brow[2]) + ") rotate(" + f(-st.brow[3]) + ")");
    // eyes
    var ry = sp.eye.ry, rx = sp.eye.rx, lidRy = ry * 1.1;
    ["L", "R"].forEach(function (s, i) {
      var E = self.eyes[s], mode = st.eye[i];
      if (mode === "n" && st.lid[i] > 0.9) mode = "closed";
      self.set(E.n, "opacity", mode === "n" ? "1" : "0");
      self.set(E.happy, "opacity", mode === "happy" ? "1" : "0");
      self.set(E.closed, "opacity", mode === "closed" ? "1" : "0");
      self.set(E.squeeze, "opacity", mode === "squeeze" ? "1" : "0");
      self.set(E.star, "opacity", mode === "star" ? "1" : "0");
      if (mode === "star") self.set(E.star, "transform", "scale(" + f(st.scl) + ") rotate(" + f(st.starRot) + ")");
      if (mode !== "n") return;
      self.set(E.scl, "transform", "scale(" + f(st.scl) + ")");
      self.set(E.pup, "transform", "translate(" + f(st.look.x * rx * 0.34) + " " + f(st.look.y * ry * 0.3) + ") scale(" + f(st.pup) + ")");
      var lid = clamp(st.lid[i], 0, 1);
      var cy = -ry - lidRy + lid * 1.95 * ry;
      self.set(E.lt, "cy", f(cy));
      self.set(E.ltl, "cy", f(cy));
      self.set(E.ltl, "opacity", lid > 0.04 ? "1" : "0");
      if (E.wing) self.set(E.wing, "transform", "translate(0 " + f(lid * 1.6 * ry) + ")");
      var bot = clamp(st.bot[i], 0, 1);
      self.set(E.lb, "cy", f(ry + ry * 0.9 - bot * 1.25 * ry));
    });
    // mouth
    var mk = st.mouth;
    for (var name in this.mouths) {
      var on = name === mk ? "1" : "0";
      this.set(this.mouths[name], "opacity", on);
    }
    if (mk.charAt(0) === "v") {
      var o = st.open, tsc = st.talkScale || 1;
      var sy = mk === "v4" || mk === "v6" ? 0.8 + 0.2 * o : mk === "v0" ? 1 : 0.42 + 0.58 * o;
      var sx = mk === "v0" ? 1 : 0.9 + 0.12 * o;
      this.set(this.el.talk, "transform", "scale(" + f(sx * tsc) + " " + f(sy * tsc) + ")");
    }
    // arms
    ["L", "R"].forEach(function (s, i) {
      var A = self.arms[s], a = st.arms[i], sign = s === "L" ? 1 : -1;
      self.set(A.g, "transform", "translate(" + f(A.x) + " " + f(-200 + st.armY) + ") rotate(" + f(sign * a[0]) + ")");
      self.set(A.elbow, "transform", "translate(0 56) rotate(" + f(sign * a[1]) + ")");
      self.set(A.handpos, "transform", "translate(0 58) rotate(" + f(sign * (a[3] || 0)) + ")");
      for (var h in A.hands) self.set(A.hands[h], "opacity", h === a[2] ? "1" : "0");
    });
    // fx
    var fx = st.fx;
    for (var k in this.fx) {
      var v = fx[k] || 0;
      this.set(this.fx[k], "opacity", f(v > 0 ? Math.min(1, v) : 0));
    }
    if (fx.sweat) this.set(this.fx.sweat, "transform", "translate(96 " + f(-168 + st.sweatY) + ")");
    if (fx.excl) this.set(this.fx.excl, "transform", "translate(0 -262) scale(" + f(st.exclS) + ")");
    if (fx.anger) this.set(this.fx.anger, "transform", "translate(-92 -176) scale(" + f(st.angerS) + ")");
    if (fx.sparkle) this.set(this.fx.sparkle, "transform", "scale(" + f(st.sparkS) + ")");
    if (fx.steam) {
      for (var p = 0; p < this.steamP.length; p += 1) {
        var ph = (st.steamPh + p * 0.33) % 1;
        this.set(this.steamP[p], "transform", "translate(" + f((p - 1) * ph * 18) + " " + f(-ph * 70) + ") scale(" + f(0.5 + ph * 0.7) + ")");
        this.set(this.steamP[p], "opacity", f(Math.sin(Math.PI * ph)));
      }
    }
  };

  /* ---------------------------------------------------------- the director */
  // Schedules hold [time, value, ...] rows sorted by time; all times are
  // composition seconds. at(t) is a pure function of t.
  function Actor(rig, opts) {
    opts = opts || {};
    this.rig = rig;
    this.seed = opts.seed || 0;
    this.expr = [[0, opts.expr || "idle"]];
    this.pose = [[0, opts.pose || "rest"]];
    this.talks = [];
    this.looks = [[0, { x: 0, y: 0 }]];
    this.acts = [];
    this.fxs = [];
    this.runs = [];
    this.moves = [[0, opts.x || 0, opts.y || 0, opts.scale || 1]];
    this.flips = [];
  }
  function lastBefore(list, t) {
    var idx = -1;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i][0] <= t) idx = i;
      else break;
    }
    return idx;
  }
  function sortRows(list) {
    list.sort(function (a, b) {
      return a[0] - b[0];
    });
  }
  Actor.prototype.say = function (t, lineId, opts) {
    this.talks.push({ t: t, id: lineId, data: window.LIPSYNC[lineId], opts: opts || {} });
    return this;
  };
  Actor.prototype.e = function (t, name) {
    this.expr.push([t, name]);
    sortRows(this.expr);
    return this;
  };
  Actor.prototype.p = function (t, name, dur) {
    this.pose.push([t, name, dur || 0.3]);
    sortRows(this.pose);
    return this;
  };
  Actor.prototype.look = function (t, x, y) {
    this.looks.push([t, { x: x, y: y }]);
    sortRows(this.looks);
    return this;
  };
  Actor.prototype.act = function (t, name, dur, amp) {
    this.acts.push([t, name, dur || 0.5, amp == null ? 1 : amp]);
    return this;
  };
  Actor.prototype.fx = function (t, name, dur) {
    this.fxs.push([t, name, dur || 1]);
    return this;
  };
  // run: [t0, t1] with leg cycle; move: keyframe positions in container px
  Actor.prototype.run = function (t0, t1, rate) {
    this.runs.push([t0, t1, rate || 3.2]);
    return this;
  };

  Actor.prototype.blinkAt = function (t) {
    var iv = [2.9, 3.7, 2.3, 4.4, 3.1, 2.6, 3.9];
    var x = 0.9 + this.seed * 0.73;
    var i = this.seed;
    while (x < t - 0.2) {
      x += iv[i % iv.length];
      i += 1;
    }
    var d = t - x;
    // also catch the previous blink
    var prev = x - iv[(i - 1 + iv.length) % iv.length];
    var dp = t - prev;
    var k = 0;
    [d, dp].forEach(function (dd) {
      if (dd >= 0 && dd < 0.16) k = Math.max(k, 1 - Math.abs(dd - 0.07) / 0.09);
    });
    return clamp(k, 0, 1);
  };

  Actor.prototype.state = function (t) {
    var self = this;
    // ---- expression blend
    var ei = lastBefore(this.expr, t);
    var cur = EXPR[this.expr[ei][1]] || EXPR.idle;
    var prev = ei > 0 ? EXPR[this.expr[ei - 1][1]] || EXPR.idle : cur;
    var since = t - this.expr[ei][0];
    var k = ei > 0 ? easeIO(clamp(since / 0.22, 0, 1)) : 1;
    var A = prev, B = cur;
    var st = {};
    st.brow = [0, 1, 2, 3].map(function (i) {
      return lerp(A.brow[i], B.brow[i], k);
    });
    st.lid = [lerp(A.lid[0], B.lid[0], k), lerp(A.lid[1], B.lid[1], k)];
    st.bot = [lerp(A.bot[0], B.bot[0], k), lerp(A.bot[1], B.bot[1], k)];
    st.scl = lerp(A.scl || 1, B.scl || 1, k);
    st.pup = lerp(A.pup || 1, B.pup || 1, k);
    st.blush = lerp(A.blush, B.blush, k);
    st.red = lerp(A.red || 0, B.red || 0, k);
    var tiltE = lerp(A.tilt || 0, B.tilt || 0, k);
    st.eye = k < 0.5 ? A.eye : B.eye;
    var restMouth = k < 0.5 ? A.mouth : B.mouth;
    st.talkScale = lerp(A.talk || 1, B.talk || 1, k);
    // squash pulse on change
    var pulse = 0;
    if (ei > 0 && since < 0.34) {
      var p = since / 0.34;
      pulse = Math.sin(p * Math.PI) * (p < 0.45 ? -1 : 0.55) * (1 - p * 0.4);
    }
    // ---- look
    var li = lastBefore(this.looks, t);
    var L1 = this.looks[li][1], L0 = li > 0 ? this.looks[li - 1][1] : L1;
    var lk = li > 0 ? easeIO(clamp((t - this.looks[li][0]) / 0.25, 0, 1)) : 1;
    var look = { x: lerp(L0.x, L1.x, lk), y: lerp(L0.y, L1.y, lk) };
    if (B.look && k >= 0.5) look = { x: lerp(look.x, B.look.x, clamp((k - 0.5) * 2, 0, 1)), y: lerp(look.y, B.look.y, clamp((k - 0.5) * 2, 0, 1)) };
    st.look = look;
    st.fs = look.x * 9;
    // ---- blink
    var bl = st.eye[0] === "n" && st.eye[1] === "n" && since > 0.25 ? this.blinkAt(t) : 0;
    if (bl > 0) st.lid = [Math.max(st.lid[0], bl), Math.max(st.lid[1], bl)];
    // ---- talk
    st.mouth = restMouth;
    st.open = 0;
    var talkAmp = 0;
    for (var ti = 0; ti < this.talks.length; ti += 1) {
      var T = this.talks[ti];
      if (!T.data) continue;
      var lt = t - T.t;
      if (lt >= 0 && lt < T.data.dur) {
        var fr = Math.min(T.data.v.length - 1, Math.floor(lt * 30));
        st.mouth = "v" + T.data.v.charAt(fr);
        st.open = parseInt(T.data.o.charAt(fr), 10) / 9;
        talkAmp = 1;
        if (st.mouth === "v0" && (restMouth === "laugh" || restMouth === "grin")) st.mouth = "v3";
        break;
      }
    }
    // ---- idle body
    var br = Math.sin((t / 3.1 + this.seed * 0.29) * Math.PI * 2);
    var sway = Math.sin((t / 4.3 + this.seed * 0.17) * Math.PI * 2);
    st.bx = 0;
    st.by = 0;
    st.sx = 1;
    st.sy = 1 + 0.012 * br;
    st.lean = sway * 0.9;
    st.hx = 0;
    st.hy = -1.5 * br - talkAmp * st.open * 3;
    st.tilt = tiltE + talkAmp * 2.2 * Math.sin(t * 2 * Math.PI * 1.6 + this.seed);
    st.hsx = 1 - pulse * 0.05;
    st.hsy = 1 + pulse * 0.07;
    st.armY = 0;
    st.legL = 0;
    st.legR = 0;
    st.shadow = 1;
    st.shadowA = 1;
    st.starRot = Math.sin(t * 5) * 8;
    // ---- arms
    var pi = lastBefore(this.pose, t);
    var P1 = POSES[this.pose[pi][1]] || POSES.rest;
    var P0 = pi > 0 ? POSES[this.pose[pi - 1][1]] || POSES.rest : P1;
    var pd = this.pose[pi][2] || 0.3;
    var pk = pi > 0 ? clamp((t - this.pose[pi][0]) / pd, 0, 1) : 1;
    var pke = pk < 1 ? easeOutBack(pk) : 1;
    var osc = OSC[this.pose[pi][1]];
    st.arms = [0, 1].map(function (i) {
      var a0 = P0[i], a1 = P1[i];
      var s = lerp(a0[0], a1[0], pke), el = lerp(a0[1], a1[1], pke);
      var hand = pk < 0.5 ? a0[2] : a1[2];
      var wr = 0;
      if (osc && osc[0] === i && pk >= 1) {
        var w = Math.sin((t - self.pose[pi][0]) * Math.PI * 2 * (osc[1] === 2 ? 2.6 : 2.2));
        if (osc[1] === 1) el += w * 18;
        else wr = w * 22;
      }
      if (osc && osc[1] === 3) el += Math.sin((t - self.pose[pi][0]) * Math.PI * 2 * 3 + i * Math.PI) * 10;
      return [s, el, hand, wr];
    });
    // ---- run cycle
    for (var ri = 0; ri < this.runs.length; ri += 1) {
      var R = this.runs[ri];
      if (t >= R[0] && t <= R[1]) {
        var ph = (t - R[0]) * R[2] * Math.PI * 2;
        var fade = clamp(Math.min(t - R[0], R[1] - t) / 0.12, 0, 1);
        st.legL = Math.sin(ph) * 32 * fade;
        st.legR = -Math.sin(ph) * 32 * fade;
        st.by += -Math.abs(Math.sin(ph)) * 16 * fade;
        st.lean += 6 * fade;
        st.arms = [
          [24 + Math.sin(ph) * 30 * fade, -70, "fist", 0],
          [24 - Math.sin(ph) * 30 * fade, -70, "fist", 0],
        ];
      }
    }
    // ---- actions
    st.fx = {};
    for (var ai = 0; ai < this.acts.length; ai += 1) {
      var a = this.acts[ai];
      var at = t - a[0];
      if (at < -0.2 || at > a[2] + 0.3) continue;
      var q = clamp(at / a[2], 0, 1);
      var amp = a[3];
      if (a[1] === "hop" || a[1] === "jump") {
        var H = (a[1] === "hop" ? 38 : 110) * amp;
        if (at < 0 && at > -0.12) {
          st.sy *= 1 - 0.08 * (1 + at / 0.12);
        } else if (at >= 0 && at <= a[2]) {
          st.by -= H * Math.sin(Math.PI * q);
          st.sy *= 1 + 0.06 * Math.sin(Math.PI * q);
          st.shadow *= 1 - 0.35 * Math.sin(Math.PI * q);
          st.shadowA *= 1 - 0.5 * Math.sin(Math.PI * q);
        } else if (at > a[2] && at < a[2] + 0.18) {
          var lq = (at - a[2]) / 0.18;
          st.sy *= 1 - 0.1 * Math.sin(Math.PI * lq);
          st.sx *= 1 + 0.06 * Math.sin(Math.PI * lq);
        }
      } else if (a[1] === "shake" && at >= 0 && at <= a[2]) {
        st.bx += Math.sin(q * Math.PI * 2 * 6) * 7 * amp * (1 - q);
      } else if (a[1] === "bounce" && at >= 0 && at <= a[2]) {
        st.by -= Math.abs(Math.sin(q * Math.PI * 2 * a[2] * 2.2)) * 10 * amp;
        st.sy *= 1 + 0.02 * Math.sin(q * Math.PI * 2 * a[2] * 4.4);
      } else if (a[1] === "nod" && at >= 0 && at <= a[2]) {
        st.hy += Math.sin(Math.PI * q) * 10 * amp;
      } else if (a[1] === "lean" && at >= 0) {
        var lk2 = easeIO(clamp(at / 0.3, 0, 1)) * (at > a[2] ? 1 - easeIO(clamp((at - a[2]) / 0.3, 0, 1)) : 1);
        st.lean += 8 * amp * lk2;
        st.bx += 10 * amp * lk2;
      } else if (a[1] === "bow" && at >= 0 && at <= a[2]) {
        var bk = Math.sin(Math.PI * q);
        st.hy += 26 * bk * amp;
        st.sy *= 1 - 0.07 * bk * amp;
        st.tilt += 0;
      } else if (a[1] === "puff" && at >= 0 && at <= a[2]) {
        var pq = Math.sin(Math.PI * q);
        st.sx *= 1 + 0.05 * pq * amp;
        st.sy *= 1 + 0.04 * pq * amp;
      } else if (a[1] === "shiver" && at >= 0 && at <= a[2]) {
        st.bx += Math.sin(at * 70) * 2.2 * amp;
      } else if (a[1] === "stepIn" && at >= 0) {
        var sk = easeIO(clamp(at / 0.35, 0, 1)) * (at > a[2] ? 1 - easeIO(clamp((at - a[2]) / 0.3, 0, 1)) : 1);
        st.sx *= 1 + 0.06 * sk * amp;
        st.sy *= 1 + 0.06 * sk * amp;
      }
    }
    // ---- fx: from expression + explicit
    var efx = (k >= 0.5 ? B.fx : A.fx) || {};
    for (var key in efx) st.fx[key] = 1;
    for (var fi = 0; fi < this.fxs.length; fi += 1) {
      var F = this.fxs[fi];
      if (t >= F[0] && t <= F[0] + F[2]) st.fx[F[1]] = 1;
    }
    var fin = clamp(since / 0.25, 0, 1);
    for (var key2 in st.fx) st.fx[key2] *= key2 === "excl" ? (since < 0.9 ? 1 : 0) : fin;
    st.sweatY = ((since * 26) % 40);
    st.exclS = since < 0.25 ? easeOutBack(clamp(since / 0.25, 0, 1)) : 1;
    st.angerS = 1 + 0.12 * Math.sin(t * Math.PI * 2 * 2.5);
    st.sparkS = 0.9 + 0.12 * Math.sin(t * Math.PI * 2 * 1.8);
    st.steamPh = (t * 0.9) % 1;
    // squash from pulse on whole body (subtle)
    st.sy *= 1 + pulse * 0.025;
    return st;
  };

  Actor.prototype.render = function (t) {
    this.rig.render(this.state(t));
  };

  window.RIG = {
    SPECS: SPECS,
    EXPR: EXPR,
    POSES: POSES,
    create: function (container, who, id, opts) {
      return new Rig(container, who, id, opts);
    },
    Actor: Actor,
    util: { clamp: clamp, lerp: lerp, easeIO: easeIO, easeOutBack: easeOutBack },
  };
})();
