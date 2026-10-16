"""Export the film as one self-contained, playable HTML file.

    renders/jinwan-chi-shui.html  — double-click to play, works offline

What goes in:
  * index.html's markup and CSS, with the four woff2 fonts inlined as data: URLs
  * GSAP 3.14.2 (the version index.html pins, vendored as tools/gsap-3.14.2.min.js)
    and the eight film scripts, inlined in their original order
  * one pre-mixed MP3 soundtrack: the 17 voice clips placed at their data-start,
    plus bed.wav run through its data-fx-chain / data-automation carve exactly as
    the HyperFrames preview graph does (RBJ peaking biquads + a gain node, lanes
    interpolated linearly per 128-sample render quantum)

The composition plays inside a same-origin srcdoc iframe; the player page drives
FILM.tl from the soundtrack's clock and toggles the four scenes by their
data-start / data-duration, which is the part the HyperFrames runtime normally does.
index.html and assets/ are only read, never written.

usage: python tools/export_html.py [--kbps 192] [--out renders/jinwan-chi-shui.html]
       (needs numpy, scipy, soundfile — e.g. the cosyvoice conda env)
"""
import argparse
import base64
import html
import io
import json
import os
import re

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 48000
QUANTUM = 128  # Web Audio render quantum: automation is applied per block


def attrs_of(tag):
    return {k: html.unescape(v) for k, v in re.findall(r'([a-zA-Z-]+)="([^"]*)"', tag)}


# ---------------------------------------------------------------- audio

def peaking_coeffs(f0, gain_db, q):
    # Web Audio spec "peaking" biquad (RBJ cookbook)
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    cw = np.cos(w0)
    b = np.array([1 + alpha * a, -2 * cw, 1 - alpha * a])
    den = np.array([1 + alpha / a, -2 * cw, 1 - alpha / a])
    return b / den[0], den / den[0]


def lane_curve(points, times):
    ts = np.array([p["t"] for p in points], dtype=np.float64)
    vs = np.array([p["v"] for p in points], dtype=np.float64)
    return np.interp(times, ts, vs)


def apply_chain(x, chain, automation):
    """Run a stereo buffer through a data-fx-chain with its automation lanes."""
    lanes = {l["target"]: l["points"] for l in (automation or {}).get("lanes", [])}
    n = len(x)
    nblk = (n + QUANTUM - 1) // QUANTUM
    block_t = np.arange(nblk) * QUANTUM / SR  # clip-local time of each quantum
    y = x.copy()
    for node in chain["nodes"]:
        if node.get("enabled") is False:
            continue
        p = node["params"]
        gain_lane = lanes.get("fx.%s.gain" % node["id"])
        gains = lane_curve(gain_lane, block_t) if gain_lane else np.full(nblk, float(p.get("gain", 0)))
        if node["type"] == "gain":
            g = np.repeat(10 ** (gains / 20), QUANTUM)[:n]
            y *= g[:, None]
        elif node["type"] == "peaking":
            f0, q = float(p["frequency"]), float(p.get("q", 1))
            for ch in range(y.shape[1]):
                zi = np.zeros(2)
                col = y[:, ch]
                out = np.empty_like(col)
                cache = {}
                for i in range(nblk):
                    gdb = round(float(gains[i]), 4)
                    if gdb not in cache:
                        cache[gdb] = peaking_coeffs(f0, gdb, q)
                    b, a = cache[gdb]
                    s, e = i * QUANTUM, min(n, (i + 1) * QUANTUM)
                    out[s:e], zi = lfilter(b, a, col[s:e], zi=zi)
                y[:, ch] = out
        else:
            raise SystemExit("unsupported fx node type in chain: %s" % node["type"])
    return y


def build_mix(audio_tags, duration):
    n_total = int(round(duration * SR))
    mix = np.zeros((n_total, 2), dtype=np.float64)
    for tag in audio_tags:
        a = attrs_of(tag)
        data, sr = sf.read(os.path.join(ROOT, a["src"]), dtype="float64", always_2d=True)
        if sr != SR:
            raise SystemExit("%s is %d Hz, expected %d" % (a["src"], sr, SR))
        if data.shape[1] == 1:  # Web Audio up-mixes mono to both speakers
            data = np.repeat(data, 2, axis=1)
        start = float(a["data-start"])
        dur = float(a.get("data-duration", len(data) / SR))
        data = data[: int(round(dur * SR))]
        if "data-fx-chain" in a:
            chain = json.loads(a["data-fx-chain"])
            auto = json.loads(a["data-automation"]) if "data-automation" in a else None
            data = apply_chain(data, chain, auto)
        data = data * float(a.get("data-volume", 1))
        s = int(round(start * SR))
        e = min(n_total, s + len(data))
        mix[s:e] += data[: e - s]
        print("  %-6s %6.2fs +%5.2fs%s" % (a["id"], start, dur, "  (fx chain + automation)" if "data-fx-chain" in a else ""))
    return mix


def encode_mp3(mix, kbps):
    peak = float(np.max(np.abs(mix)))
    print("  mix peak %.3f (%.2f dBFS)" % (peak, 20 * np.log10(max(peak, 1e-9))))
    buf = io.BytesIO()
    with sf.SoundFile(buf, "w", SR, 2, format="MP3", subtype="MPEG_LAYER_III") as f:
        # constant bitrate keeps <audio> seeking exact; level 0..1 maps 320..32 kbps
        mode = sf._ffi.new("int*", 0)  # SF_BITRATE_MODE_CONSTANT
        sf._snd.sf_command(f._file, 0x1305, mode, sf._ffi.sizeof("int"))
        level = sf._ffi.new("double*", (320 - kbps) / (320 - 32))
        sf._snd.sf_command(f._file, 0x1301, level, sf._ffi.sizeof("double"))
        f.write(np.clip(mix, -1, 1).astype(np.float32))
    return buf.getvalue()


# ---------------------------------------------------------------- html

def data_url(path, mime):
    with open(path, "rb") as fh:
        return "data:%s;base64,%s" % (mime, base64.b64encode(fh.read()).decode("ascii"))


def inline_script(code):
    return "<script>\n" + code.replace("</script", "<\\/script") + "\n</script>"


def build_composition(src, gsap_code):
    out = src
    # fonts
    out = re.sub(
        r'url\("(assets/fonts/[^"]+\.woff2)"\)',
        lambda m: 'url("%s")' % data_url(os.path.join(ROOT, m.group(1)), "font/woff2"),
        out,
    )
    # gsap from the CDN -> inline, plus the registry the runtime would normally provide
    out, n = re.subn(
        r'<script src="https://cdn\.jsdelivr\.net/npm/gsap@[^"]+"></script>',
        lambda m: inline_script("window.__timelines = window.__timelines || {};") + "\n" + inline_script(gsap_code)
        + '\n<style>html,body,*{text-rendering:geometricPrecision}</style>',
        out,
    )
    assert n == 1, "gsap script tag not found"
    # film scripts, same order
    out, n = re.subn(
        r'<script src="(assets/js/[^"]+\.js)"></script>',
        lambda m: inline_script(open(os.path.join(ROOT, m.group(1)), encoding="utf-8").read()),
        out,
    )
    assert n == 8, "expected 8 film scripts, found %d" % n
    # audio clips move to the player's single pre-mixed track
    out = re.sub(r"\s*<!--[^>]*?-->(?=\s*<audio)", "", out)
    out = re.sub(r"\s*<audio\b[^>]*>\s*</audio>", "", out)
    assert "<audio" not in out and "assets/" not in out, "unresolved asset reference left in composition"
    return out


PLAYER = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__TITLE__</title>
<style>
  :root { --bg: #120a17; --bar: #1d1224; --fg: #f5eee3; --dim: #a8999f; --accent: #e3b04b; --track: #3d2748; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg);
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  #player { position: fixed; inset: 0; display: flex; flex-direction: column; }
  #screen { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: pointer; }
  #frame { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; border: 0;
    transform-origin: 0 0; pointer-events: none; background: #f5eee3; }
  #big { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(18, 10, 23, 0.35); border: 0; padding: 0; cursor: pointer; transition: opacity .2s; }
  #big span { width: 96px; height: 96px; border-radius: 50%; background: rgba(245, 238, 227, 0.95);
    display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 30px rgba(0,0,0,.35); }
  #big svg { width: 40px; height: 40px; margin-left: 6px; fill: #2b1b30; }
  #big.hide { opacity: 0; pointer-events: none; }
  #bar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: var(--bar); }
  #bar button { flex: none; width: 36px; height: 36px; border: 0; border-radius: 8px; background: transparent;
    color: var(--fg); cursor: pointer; display: flex; align-items: center; justify-content: center; }
  #bar button:hover, #bar button:focus-visible { background: rgba(245, 238, 227, 0.12); outline: none; }
  #bar svg { width: 20px; height: 20px; fill: currentColor; }
  .time { flex: none; font-variant-numeric: tabular-nums; color: var(--dim); min-width: 92px; text-align: center; }
  #seekwrap { position: relative; flex: 1; height: 36px; display: flex; align-items: center; }
  #seek { width: 100%; margin: 0; appearance: none; -webkit-appearance: none; height: 6px; border-radius: 3px; cursor: pointer;
    background: linear-gradient(to right, var(--accent) var(--p, 0%), var(--track) var(--p, 0%)); }
  #seek::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--fg); border: 0; }
  #seek::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--fg); border: 0; }
  .tick { position: absolute; top: 6px; width: 2px; height: 6px; background: var(--dim); opacity: .6; pointer-events: none; }
  .tick b { position: absolute; top: 18px; left: 4px; font-weight: 500; font-size: 11px; color: var(--dim); white-space: nowrap; }
  @media (max-width: 640px) { .tick b { display: none; } .time { min-width: 0; font-size: 12px; } #bar { gap: 6px; padding: 8px; } }
</style>
</head>
<body>
<div id="player">
  <div id="screen">
    <iframe id="frame" title="__TITLE__" srcdoc="__SRCDOC__"></iframe>
    <button id="big" aria-label="播放"><span><svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"/></svg></span></button>
  </div>
  <div id="bar">
    <button id="play" aria-label="播放 / 暂停（空格）" title="播放 / 暂停（空格）"><svg viewBox="0 0 24 24"><path id="playicon" d="M6 4l15 8-15 8z"/></svg></button>
    <span class="time" id="cur">0:00.0</span>
    <div id="seekwrap"><input id="seek" type="range" min="0" max="__DUR__" step="0.01" value="0" aria-label="进度" /></div>
    <span class="time" id="dur"></span>
    <button id="fs" aria-label="全屏（F）" title="全屏（F）"><svg viewBox="0 0 24 24"><path d="M4 9V4h5v2H6v3zm10-5h6v5h-2V6h-4zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z"/></svg></button>
  </div>
</div>
<audio id="mix" preload="auto" src="__AUDIO__"></audio>
<script>
(function () {
  "use strict";
  var DUR = __DUR__;
  var POSTER_T = 2.6;          // frame shown under the play button before the first play
  var CHAPTERS = __CHAPTERS__;
  var PLAY = "M6 4l15 8-15 8z", PAUSE = "M6 4h4v16H6zm8 0h4v16h-4z";

  var screen = document.getElementById("screen");
  var frame = document.getElementById("frame");
  var big = document.getElementById("big");
  var playBtn = document.getElementById("play");
  var icon = document.getElementById("playicon");
  var seek = document.getElementById("seek");
  var cur = document.getElementById("cur");
  var mix = document.getElementById("mix");
  var film = null, clips = [], started = false, scrubbing = false, lastT = -1;

  function fmt(t) {
    t = Math.max(0, t);
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }
  document.getElementById("dur").textContent = fmt(DUR);

  CHAPTERS.forEach(function (c) {
    var k = document.createElement("div");
    k.className = "tick";
    k.style.left = (c[0] / DUR * 100) + "%";
    k.innerHTML = "<b></b>";
    k.firstChild.textContent = c[1];
    document.getElementById("seekwrap").appendChild(k);
  });

  function fit() {
    var w = screen.clientWidth, h = screen.clientHeight;
    var s = Math.min(w / 1920, h / 1080);
    frame.style.transform = "translate(" + ((w - 1920 * s) / 2) + "px," + ((h - 1080 * s) / 2) + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fit);
  fit();

  // one frame of the film at time t: GSAP timeline + scene visibility by data-start/data-duration
  function render(t) {
    if (!film) return;
    var v = Math.min(Math.max(t, 0), DUR - 0.001);
    film.tl.seek(v, false);
    for (var i = 0; i < clips.length; i += 1) {
      var c = clips[i], on = v >= c.s && v < c.e;
      if (c.on !== on) { c.on = on; c.el.style.visibility = on ? "visible" : "hidden"; }
    }
  }

  function clock() { return started ? mix.currentTime : 0; }

  function ui(t) {
    seek.value = t.toFixed(2);
    seek.style.setProperty("--p", (t / DUR * 100) + "%");
    cur.textContent = fmt(t);
  }

  function loop() {
    var t = scrubbing ? Number(seek.value) : clock();
    if (t !== lastT) {
      lastT = t;
      render(started || scrubbing ? t : POSTER_T);
      if (!scrubbing) ui(t);
    }
    requestAnimationFrame(loop);
  }

  function setIcon() {
    var playing = !mix.paused && !mix.ended;
    icon.setAttribute("d", playing ? PAUSE : PLAY);
    big.classList.toggle("hide", playing || (started && mix.currentTime > 0));
  }

  function toggle() {
    if (!film) return;
    if (mix.paused || mix.ended) {
      if (mix.ended || mix.currentTime >= DUR - 0.05) mix.currentTime = 0;
      started = true;
      lastT = -1;
      var p = mix.play();
      if (p && p.catch) p.catch(function (e) { console.warn("play() rejected:", e); setIcon(); });
    } else {
      mix.pause();
    }
  }

  function seekTo(t) {
    started = true;
    mix.currentTime = Math.min(Math.max(t, 0), DUR);
    lastT = -1;
    setIcon();
  }

  mix.addEventListener("play", setIcon);
  mix.addEventListener("pause", setIcon);
  mix.addEventListener("ended", function () { lastT = -1; setIcon(); });

  big.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
  screen.addEventListener("click", toggle);
  // blur so a later Space press goes to the keydown handler, not to the focused button too
  playBtn.addEventListener("click", function () { playBtn.blur(); toggle(); });
  seek.addEventListener("input", function () {
    scrubbing = true; started = true;
    seek.style.setProperty("--p", (seek.value / DUR * 100) + "%");
    cur.textContent = fmt(Number(seek.value));
    big.classList.add("hide");
  });
  seek.addEventListener("change", function () { scrubbing = false; seekTo(Number(seek.value)); });
  document.getElementById("fs").addEventListener("click", function () {
    var el = document.getElementById("player");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  });
  document.addEventListener("keydown", function (e) {
    if (e.target === seek && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(clock() - 5); }
    else if (e.key === "ArrowRight") { e.preventDefault(); seekTo(clock() + 5); }
    else if (e.key === "f" || e.key === "F") document.getElementById("fs").click();
    else if (e.key === "Home") { e.preventDefault(); seekTo(0); }
  });

  function boot() {
    var w = frame.contentWindow, d = frame.contentDocument;
    if (!w || !w.FILM) { setTimeout(boot, 30); return; }
    film = w.FILM;
    var root = d.querySelector("[data-composition-id]");
    Array.prototype.forEach.call(root.querySelectorAll("[data-start]"), function (el) {
      var s = Number(el.getAttribute("data-start")), du = Number(el.getAttribute("data-duration"));
      clips.push({ el: el, s: s, e: s + du, on: null });
    });
    (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(function () {
      lastT = -1;
      requestAnimationFrame(loop);
    });
  }
  if (frame.contentDocument && frame.contentDocument.readyState === "complete") boot();
  else frame.addEventListener("load", boot);
})();
</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gsap", default=os.path.join(HERE, "gsap-3.14.2.min.js"), help="gsap.min.js 3.14.2, the version index.html pins")
    ap.add_argument("--kbps", type=int, default=192)
    ap.add_argument("--out", default=os.path.join(ROOT, "renders", "jinwan-chi-shui.html"))
    args = ap.parse_args()

    src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    root_tag = re.search(r"<[^>]*data-composition-id=[^>]*>", src).group(0)
    duration = float(attrs_of(root_tag)["data-duration"])
    title = html.unescape(re.search(r"<title>(.*?)</title>", src, re.S).group(1).strip())
    gsap_code = open(args.gsap, encoding="utf-8").read()
    assert "GSAP 3.14.2" in gsap_code[:200], "expected GSAP 3.14.2"

    print("mixing soundtrack (%.2fs @ %d Hz)" % (duration, SR))
    audio_tags = re.findall(r"<audio\b[^>]*>", src)
    mp3 = encode_mp3(build_mix(audio_tags, duration), args.kbps)
    print("  mp3 %.2f MB" % (len(mp3) / 1e6))

    comp = build_composition(src, gsap_code)
    scenes = [attrs_of(t) for t in re.findall(r'<div[^>]*class="clip scene"[^>]*>', src)]
    names = {"sc-hook": "开场", "sc-agent": "智能体", "sc-stage": "舞台", "sc-end": "结尾"}
    # the opening needs no marker at 0:00, and its label would collide with the next one
    chapters = [[float(s["data-start"]), names.get(s["id"], s["id"])] for s in scenes if float(s["data-start"]) > 0]

    page = (
        PLAYER.replace("__TITLE__", html.escape(title))
        .replace("__DUR__", repr(duration))
        .replace("__CHAPTERS__", json.dumps(chapters, ensure_ascii=False))
        .replace("__AUDIO__", "data:audio/mpeg;base64," + base64.b64encode(mp3).decode("ascii"))
        .replace("__SRCDOC__", html.escape(comp, quote=True))
    )
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(page)
    print("wrote %s (%.2f MB)" % (args.out, os.path.getsize(args.out) / 1e6))


if __name__ == "__main__":
    main()
