"""Per-line lip-sync bake — a port of videos/jinwan-chi-shui/tools/lipsync.py.

The film script rewrites assets/js/lipsync.js for every line at once; here the
same algorithm runs on one freshly synthesised clip:
audio RMS envelope (mouth opening) + pinyin / jyutping finals or French vowel
letters (mouth shape), quantised to 30 fps, plus per-character reveal times
for the typewriter bubble.

Viseme ids: 0 closed (b p m / silence) · 1 A · 2 O · 3 E · 4 I · 5 U · 6 teeth
"""
import numpy as np
from pypinyin import Style, pinyin

FPS = 30
PUNCT = set("，。！？、：；…,.!?~— ")


def french_vowels(text):
    out, t, i = [], text.lower(), 0
    groups = [("eau", 2), ("ou", 5), ("au", 2), ("ieu", 3), ("eu", 3), ("oi", 1), ("a", 1), ("à", 1), ("e", 3), ("é", 3), ("è", 3), ("ê", 3),
              ("i", 4), ("y", 4), ("o", 2), ("ô", 2), ("u", 5)]
    while i < len(t):
        for g, v in groups:
            if t.startswith(g, i):
                if not (g == "e" and (i + 1 == len(t) or not t[i + 1].isalpha())):
                    out.append(v)
                i += len(g)
                break
        else:
            i += 1
    return out or [1]


def yue_viseme(ch):
    import ToJyutping
    jp = ToJyutping.get_jyutping_list(ch)[0][1]
    if not jp:
        return 3, None
    syl = jp.rstrip("123456")
    onset = None
    for ini in ("gw", "kw", "ng", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "w", "z", "c", "s", "j"):
        if syl.startswith(ini) and len(syl) > len(ini):
            if ini in ("b", "p", "m"):
                onset = 0
            elif ini in ("f", "z", "c", "s"):
                onset = 6
            syl = syl[len(ini):]
            break
    if syl in ("m", "ng"):
        return 0, None
    for nuc, v in (("aa", 1), ("yu", 5), ("oe", 2), ("eo", 2), ("a", 1), ("o", 2), ("e", 3), ("i", 4), ("u", 5)):
        if syl.startswith(nuc):
            return v, onset
    return 3, onset


def final_viseme(ch):
    ini = pinyin(ch, style=Style.INITIALS, strict=False)[0][0]
    fin = pinyin(ch, style=Style.FINALS, strict=False)[0][0]
    onset = None
    if ini in ("b", "p", "m"):
        onset = 0
    elif ini in ("f", "zh", "ch", "sh", "z", "c", "s", "r"):
        onset = 6
    if fin in ("i",) and ini in ("zh", "ch", "sh", "r", "z", "c", "s"):
        return 4, onset
    if fin in ("ian", "ie", "e", "ei", "en", "eng", "er", "ve", "ue", "uei", "ui"):
        return 3, onset
    if fin.startswith(("o", "uo", "ou", "io", "iou", "iu")) or fin in ("ao", "iao", "ong", "iong"):
        return 2, onset
    if "a" in fin:
        return 1, onset
    if fin.startswith(("i",)) or fin in ("in", "ing"):
        return 4, onset
    if fin.startswith(("u", "v", "ü")):
        return 5, onset
    return 3, onset


def envelope(x, sr):
    if x.ndim > 1:
        x = x.mean(axis=1)
    hop = sr // 100
    n = max(1, len(x) // hop)
    rms = np.sqrt(np.array([np.mean(x[i * hop:(i + 1) * hop] ** 2) for i in range(n)]))
    rms = np.convolve(rms, np.ones(3) / 3, mode="same")
    rms = rms / (np.percentile(rms, 95) + 1e-9)
    return np.clip(rms, 0, 1.0), len(x) / sr


def voiced_segments(env, thr=0.10, min_gap=0.11):
    on = env > thr
    segs = []
    i = 0
    n = len(env)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            segs.append([i / 100, j / 100])
            i = j
        else:
            i += 1
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [s for s in merged if s[1] - s[0] > 0.04]


def split_phrases(text):
    phrases, cur = [], []
    for ch in text:
        if ch in PUNCT:
            if cur:
                phrases.append(cur)
                cur = []
        else:
            cur.append(ch)
    if cur:
        phrases.append(cur)
    return phrases


def fit_segments(segs, k):
    segs = [list(s) for s in segs]
    while len(segs) > k:
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        g = int(np.argmin(gaps))
        segs[g][1] = segs[g + 1][1]
        del segs[g + 1]
    if len(segs) < k:
        return None
    return segs


def bake(x, sr, text, lang="zh"):
    """lang: zh (pinyin finals), yue (jyutping finals) or fr (vowel letters)."""
    env, dur = envelope(x, sr)
    segs = voiced_segments(env) or [[0.0, dur]]
    n_frames = int(np.ceil(dur * FPS))
    vis = np.zeros(n_frames, dtype=int)
    opn = np.zeros(n_frames)
    char_t = []

    if lang == "fr":
        span0, span1 = segs[0][0], segs[-1][1]
        seq = french_vowels(text)
        units = [(span0 + (span1 - span0) * i / len(seq), span0 + (span1 - span0) * (i + 1) / len(seq), v, None)
                 for i, v in enumerate(seq)]
        for i, _ in enumerate(text):
            char_t.append(round(span0 + (span1 - span0) * i / max(1, len(text)), 3))
    else:
        phrases = split_phrases(text) or [list(text or " ")]
        fitted = fit_segments(segs, len(phrases))
        units = []
        if fitted is None:
            span0, span1 = segs[0][0], segs[-1][1]
            total = sum(len(p) for p in phrases)
            acc = 0
            fitted = []
            for p in phrases:
                a = span0 + (span1 - span0) * acc / total
                acc += len(p)
                fitted.append([a, span0 + (span1 - span0) * acc / total])
        for p, (a, b) in zip(phrases, fitted):
            step = (b - a) / len(p)
            for i, ch in enumerate(p):
                v, onset = yue_viseme(ch) if lang == "yue" else final_viseme(ch)
                units.append((a + i * step, a + (i + 1) * step, v, onset))
        ui = 0
        last = 0.0
        for ch in text:
            if ch in PUNCT or ui >= len(units):
                char_t.append(round(last, 3))
            else:
                char_t.append(round(units[ui][0], 3))
                last = units[ui][1]
                ui += 1

    for f in range(n_frames):
        t = (f + 0.5) / FPS
        e = float(env[min(len(env) - 1, int(t * 100))])
        opn[f] = e
        v = 0
        for (a, b, uv, onset) in units:
            if a <= t < b:
                v = uv
                if onset is not None and t < a + min(0.05, (b - a) * 0.35):
                    v = onset
                break
        if e < 0.09:
            v = 0
        vis[f] = v
    return {
        "text": text,
        "dur": round(dur, 3),
        "v": "".join(str(x) for x in vis),
        "o": "".join(str(int(min(9, round(x * 9)))) for x in opn),
        "ct": char_t,
        "lang": lang,
    }
