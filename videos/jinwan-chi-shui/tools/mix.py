"""Premix the music + SFX bed (assets/music/bed.wav).

The voices stay separate <audio> clips in index.html; this bed carries every
music cue and sound effect, ducked under the voice windows read from
assets/js/lipsync.js. Times mirror the T table in assets/js/film-core.js.
usage: python mix.py
"""
import json
import os
import re
import subprocess

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 48000


def load(path):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def db(x):
    return 10 ** (x / 20)


# ---------- timing (mirrors film-core.js)
src = open(os.path.join(ROOT, "assets", "js", "film-core.js"), encoding="utf-8").read()
T = {k: float(v) for k, v in re.findall(r"(\w+): (\d+(?:\.\d+)?)", src.split("var T = {")[1].split("};")[0])}
lip = json.loads(open(os.path.join(ROOT, "assets", "js", "lipsync.js"), encoding="utf-8").read().split("window.LIPSYNC = ")[1].rstrip(";\n"))
VOICES = ["O1", "O2a", "O2b", "R1", "H1", "R2", "P0", "P1", "H2", "P2", "R3", "P3", "O3", "R4", "H3", "P4", "O4"]
DUR = T["end"]
N = int(DUR * SR)
voice_win = [(T[v], T[v] + lip[v]["dur"]) for v in VOICES]


def at(v, frac):
    # a moment inside a voice line, as a fraction of its length (mirrors F.at)
    return T[v] + frac * lip[v]["dur"]

bed = np.zeros((N, 2), dtype=np.float32)


def place(buf, clip, t, gain_db=0.0, fade_in=0.0, fade_out=0.0, length=None, offset=0.0):
    a = clip[int(offset * SR):]
    if length is not None:
        a = a[: int(length * SR)]
    a = a * db(gain_db)
    n = len(a)
    if fade_in > 0:
        k = min(n, int(fade_in * SR))
        a[:k] *= np.linspace(0, 1, k)[:, None]
    if fade_out > 0:
        k = min(n, int(fade_out * SR))
        a[n - k:] *= np.linspace(1, 0, k)[:, None]
    s = int(t * SR)
    e = min(N, s + n)
    if e > s:
        buf[s:e] += a[: e - s]


# ---------- music
M = {k: load(os.path.join(ROOT, "assets", "music", k + ".wav")) for k in ["cue_a_cozy", "cue_b_battle", "cue_b_battle2", "cue_c_win"]}
music = np.zeros_like(bed)
place(music, M["cue_b_battle2"], 0.0, -3, fade_in=0.05, fade_out=0.8, length=4.4)
place(music, M["cue_a_cozy"], 3.6, 0, fade_in=0.8, fade_out=0.9, length=28.0)
place(music, M["cue_b_battle"], T["stageIn"] + 0.1, -2, fade_in=0.4, fade_out=1.4, length=29.9)
b2_len = T["click"] - 59.8 + 0.3
b2_off = max(0.3, min(5.0, len(M["cue_b_battle2"]) / SR - b2_len - 0.1))
place(music, M["cue_b_battle2"], 59.8, -1, fade_in=1.4, fade_out=0.8, length=b2_len, offset=b2_off)
place(music, M["cue_c_win"], T["click"], -1, fade_in=0.02, fade_out=0.9, length=DUR - T["click"])

# duck under the voices (attack 0.12 s, release 0.35 s), deeper under the insight beat
env = np.ones(N, dtype=np.float32)
for a, b in voice_win:
    s0, s1 = int((a - 0.12) * SR), int((b + 0.1) * SR)
    env[max(0, s0):min(N, s1)] = np.minimum(env[max(0, s0):min(N, s1)], db(-3))
deep = (int((T["O3"] - 0.2) * SR), int((T["R4"] - 0.1) * SR))
env[deep[0]:deep[1]] = np.minimum(env[deep[0]:deep[1]], db(-9))
# smooth the gain curve (one-pole, separate attack/release)
att, rel = np.exp(-1 / (0.12 * SR)), np.exp(-1 / (0.35 * SR))
sm = np.empty_like(env)
g = 1.0
for i in range(N):
    x = env[i]
    c = att if x < g else rel
    g = c * g + (1 - c) * x
    sm[i] = g
music *= sm[:, None]
bed += music * db(-4)

# ---------- sfx
S = {os.path.splitext(f)[0]: load(os.path.join(ROOT, "assets", "sfx", f)) for f in os.listdir(os.path.join(ROOT, "assets", "sfx")) if f.endswith(".mp3")}
EV = []


def ev(name, t, g, **kw):
    EV.append((name, t, g, kw))


ev("whoosh-short", T["hookTitle"] - 0.05, -6)
ev("impact-bass-1", T["hookStamp"] + 0.24, -4)
ev("sparkle", T["hookBlur"] + 0.4, -8)
ev("whoosh", T["agentIn"], -9)
ev("notification", T["O1"] - 0.15, -12)
ev("typing", T["type1"], -10, length=0.9, fade_out=0.1)
ev("click", T["send1"] - 0.08, -6)
for i in range(3):
    ev("pop", T["chips1"] + i * 0.13 + 0.12, -10)
ev("typing", T["type2"], -10, length=0.6, fade_out=0.1)
ev("click", T["send2"] - 0.08, -6)
for i in range(2):
    ev("pop", T["chips2"] + i * 0.13 + 0.12, -10)
ev("notification", T["O2a"] - 0.15, -13)
ev("whoosh", T["toMap"], -5)
for i in range(9):
    ev("pop", T["pins"] + i * 0.075, -16)
for p in ["pass1", "pass2", "pass3"]:
    ev("whoosh-short", T[p], -9)
    for i in range(3):
        ev("click-soft", T[p] + 0.4 + i * 0.22, -12)
    ev("ping", T[p] + T["passDur"] - 0.05, -9)
ev("sparkle", T["finals"], -6)
for i in range(3):
    ev("pop", T["burst"] + i * 0.12, -5)
ev("sparkle", T["burst"] + 0.1, -9)
ev("whoosh-short", T["run0"], -10)
ev("impact-bass-2", T["bump"], -10)
ev("pop", T["bump"] + 0.02, -8)
ev("whoosh-cinematic", T["zoomTent"] - 0.1, -6, length=2.2, fade_out=0.5)
ev("whoosh", T["curtain"], -7)
for t in [32.9, 33.5, 34.1]:
    ev("pop", t, -6)
ev("click-soft", T["hud"], -10)
for v in ["R1", "H1", "R2", "P0", "P1", "H2", "P2", "R3", "P3", "R4", "H3", "P4"]:
    if v != "P1":
        ev("pop", T[v] - 0.14, -11)
for t in [at("H1", 0.125), at("H2", 0.28), at("R3", 0.65)]:
    ev("impact-bass-2", t, -12)
for t in [at("H1", 0.27), at("R2", 0.41), at("H2", 0.42), at("R3", 0.69), at("P3", 0.5)]:
    ev("ping", t, -14)
ev("chime", T["O3"] - 0.2, -8)
ev("sparkle", at("O3", 0.64), -8)
ev("sparkle", T["R4"] - 0.1, -9)
ev("click", T["click"] - 0.05, -4)
ev("pop", T["click"], -6)
ev("sparkle", T["click"] + 0.05, -5)
ev("chime", T["O4"] - 0.1, -7)
ev("whoosh", T["endIn"], -8)
ev("sparkle", T["endIn"] + 0.4, -8)
for i in range(3):
    ev("pop", T["endIn"] + 0.95 + i * 0.16, -8)

sfx = np.zeros_like(bed)
for name, t, g, kw in EV:
    place(sfx, S[name], t, g, **kw)
bed += sfx * db(-2)

# master fade + soft limiter
fade = int(0.9 * SR)
bed[-fade:] *= np.linspace(1, 0, fade)[:, None]
peak = float(np.max(np.abs(bed)))
bed = np.tanh(bed * 1.2) / np.tanh(1.2) if peak > 0.9 else bed
sf.write(os.path.join(ROOT, "assets", "music", "bed.wav"), bed, SR, subtype="PCM_16")
print("bed.wav", round(len(bed) / SR, 2), "s · peak", round(peak, 3), "· events", len(EV))
