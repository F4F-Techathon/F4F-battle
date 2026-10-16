/* film-core.js — shared timing table, helpers and the per-frame renderer list. */
(function () {
  "use strict";
  var U = RIG.util;

  // Every beat of the film, in composition seconds.
  var T = {
    end: 93.51,
    // hook
    hookTitle: 0.35, hookSub: 0.95, hookStamp: 2.0, hookBlur: 3.2,
    // agent / intake
    agentIn: 3.8, orbSettle: 4.6, panelIn: 4.5,
    O1: 4.8,
    type1: 8.7, send1: 9.6, chips1: 10.15,
    type2: 10.75, send2: 11.4, chips2: 11.85,
    O2a: 12.4,
    // map
    toMap: 14.6, pins: 15.5,
    pass1: 16.6, pass2: 18.3, pass3: 19.9, passDur: 1.35,
    O2b: 21.4, finals: 21.5, burst: 23.0, glance: 24.35,
    run0: 25.3, run1: 28.9, bump: 29.0, enter: 29.35, zoomTent: 29.72, agentOut: 31.8,
    // stage
    stageIn: 31.2, curtain: 31.45, plates: [32.9, 33.5, 34.1], hud: 34.8,
    R1: 37.2, H1: 41.05, R2: 46.05, P0: 49.04, P1: 49.86, H2: 55.27, P2: 61.36, R3: 64.82, P3: 68.49,
    O3: 70.43, R4: 75.15, H3: 79.02, P4: 80.51,
    cursor: 81.45, click: 82.35, O4: 83.55,
    endIn: 87.91,
  };

  function line(id) {
    return window.LIPSYNC[id];
  }
  function lineEnd(id) {
    return T[id] + line(id).dur;
  }
  // a moment inside a voice line, as a fraction of its spoken length
  function at(id, frac) {
    return T[id] + frac * line(id).dur;
  }
  function len(id, frac) {
    return frac * line(id).dur;
  }

  function prand(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function h(tag, cls, parent, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function seg(t, a, b) {
    return U.clamp((t - a) / (b - a), 0, 1);
  }
  function css(el, o) {
    for (var k in o) el.style[k] = o[k];
    return el;
  }

  var FILM = {
    T: T,
    tl: gsap.timeline({ paused: true }),
    renderers: [],
    actors: [],
    U: U,
    prand: prand,
    h: h,
    seg: seg,
    css: css,
    line: line,
    lineEnd: lineEnd,
    at: at,
    len: len,
    $: function (id) {
      return document.getElementById(id);
    },
    // run fn(t) every frame (pure function of t)
    each: function (fn) {
      FILM.renderers.push(fn);
    },
    // register an actor rendered inside [t0, t1]
    actor: function (actor, t0, t1) {
      FILM.renderers.push(function (t) {
        if (t >= t0 - 0.05 && t <= t1 + 0.05) actor.render(t);
      });
      return actor;
    },
    // typewriter: spans revealed at char times of a voice line
    typer: function (container, text, startT, ct, hl) {
      var spans = [];
      var marks = new Array(text.length).fill(false);
      (hl || []).forEach(function (w) {
        var i = text.indexOf(w);
        if (i >= 0) for (var k = i; k < i + w.length; k += 1) marks[k] = true;
      });
      for (var i = 0; i < text.length; i += 1) {
        var s = document.createElement("span");
        s.textContent = text.charAt(i);
        if (marks[i]) s.className = "h";
        s.style.opacity = "0";
        container.appendChild(s);
        spans.push(s);
      }
      var last = -1;
      FILM.each(function (t) {
        var n = 0;
        for (var j = 0; j < spans.length; j += 1) if (t >= startT + ct[j] - 0.06) n = j + 1;
        if (n === last) return;
        last = n;
        for (var q = 0; q < spans.length; q += 1) spans[q].style.opacity = q < n ? "1" : "0";
      });
      return spans;
    },
    // uniform typewriter (no audio): n chars over [t0, t0+dur]
    typeUniform: function (container, text, t0, dur, caret) {
      var spans = [];
      for (var i = 0; i < text.length; i += 1) {
        var s = document.createElement("span");
        s.textContent = text.charAt(i);
        s.style.opacity = "0";
        container.appendChild(s);
        spans.push(s);
      }
      var last = -1;
      FILM.each(function (t) {
        var n = Math.round(seg(t, t0, t0 + dur) * spans.length);
        if (n === last) return;
        last = n;
        for (var q = 0; q < spans.length; q += 1) spans[q].style.opacity = q < n ? "1" : "0";
      });
      return spans;
    },
    // confetti burst at (x, y) inside parent, fired at t0 — pure ballistic function of t
    confetti: function (parent, x, y, t0, opts) {
      opts = opts || {};
      var n = opts.n || 40, dur = opts.dur || 1.9, G = opts.g || 1250;
      var pal = opts.palette || ["#C9483E", "#E3B04B", "#2F6E62", "#7A5A9E", "#EFCF6A", "#F08A7E"];
      var field = h("div", "confetti", parent);
      field.setAttribute("data-layout-allow-overflow", "");
      css(field, { left: x + "px", top: y + "px" });
      var ps = [];
      for (var i = 0; i < n; i += 1) {
        var el = h("i", "", field);
        el.style.background = pal[i % pal.length];
        var a = -Math.PI / 2 + (prand(i * 5 + 2 + (opts.seed || 0)) * 2 - 1) * (opts.cone || 0.95);
        var sp = 520 + prand(i * 7 + 3 + (opts.seed || 0)) * 680;
        ps.push({ el: el, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spin: (prand(i * 11 + 4) * 2 - 1) * 720, sc: 0.7 + prand(i * 13) * 0.7 });
      }
      FILM.each(function (t) {
        var lt = t - t0;
        var on = lt >= 0 && lt <= dur;
        for (var i = 0; i < ps.length; i += 1) {
          var p = ps[i];
          if (!on) {
            if (p.el.style.opacity !== "0") p.el.style.opacity = "0";
            continue;
          }
          var px = p.vx * lt * (1 - lt * 0.25), py = p.vy * lt + 0.5 * G * lt * lt;
          p.el.style.transform = "translate(" + px.toFixed(1) + "px," + py.toFixed(1) + "px) rotate(" + (p.spin * lt).toFixed(0) + "deg) scale(" + p.sc.toFixed(2) + ")";
          p.el.style.opacity = String(Math.min(1, (dur - lt) / 0.35));
        }
      });
    },
  };
  window.FILM = FILM;
})();
