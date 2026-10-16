/* film-main.js — one driver tween carries composition time into every renderer. */
(function () {
  "use strict";
  var F = FILM, tl = F.tl;
  var tv = 0;
  var drv = {};
  // GSAP assigns `t` on every render, seek() included, so the setter re-poses
  // every character, bubble and counter as a pure function of time.
  Object.defineProperty(drv, "t", {
    get: function () {
      return tv;
    },
    set: function (v) {
      tv = v;
      for (var i = 0; i < F.renderers.length; i += 1) F.renderers[i](v);
    },
  });
  tl.fromTo(drv, { t: 0 }, { t: F.T.end, duration: F.T.end, ease: "none" }, 0);
  tl.seek(0);
})();
