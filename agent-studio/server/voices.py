"""Voice templates: the timbres every generated agent is cast from, plus accents.

Timbre (gender × age): a base recording from the film (renders/voice-test/omni),
WORLD-shifted in pitch and formants (pyworld), then re-voiced by CosyVoice3
reading one fixed Mandarin sentence — that both launders vocoder artefacts and
gives the prompt a known transcript (needed for zero-shot).

Accent:
  · Chinese dialects — CosyVoice3's own instruction ("请用湖南话表达。"), any timbre.
  · Foreign accents  — the Pierre trick: the timbre first speaks one sentence in
    that language (cross-lingual), and that clip becomes the prompt for Chinese
    lines, which then carry the accent. Built once per (timbre, language).
"""
import json
import os
import threading
import time

import numpy as np
import soundfile as sf

SYS = "You are a helpful assistant."
TEMPLATE_TEXT = "您好，欢迎光临！今天的招牌菜特别新鲜，快坐下来尝一尝吧。"

TIMBRES = [
    {"id": "f_young", "zh": "女 · 青年 · 明亮", "gender": "female", "age": "young", "base": "ref_orb.wav", "f0": 1.0, "formant": 1.0},
    {"id": "f_girl", "zh": "女 · 少女 · 清甜", "gender": "female", "age": "young", "base": "ref_orb.wav", "f0": 1.12, "formant": 1.05},
    {"id": "f_mid", "zh": "女 · 中年 · 爽朗", "gender": "female", "age": "middle", "base": "ref_rong.wav", "f0": 1.0, "formant": 1.0},
    {"id": "f_old", "zh": "女 · 老年 · 慈和", "gender": "female", "age": "old", "base": "ref_rong.wav", "f0": 0.86, "formant": 0.96},
    {"id": "m_young", "zh": "男 · 青年 · 清朗", "gender": "male", "age": "young", "base": "ref_hua_zh.wav", "f0": 1.2, "formant": 1.04},
    {"id": "m_mid", "zh": "男 · 中年 · 浑厚", "gender": "male", "age": "middle", "base": "ref_hua_zh.wav", "f0": 1.0, "formant": 1.0},
    {"id": "m_old", "zh": "男 · 老年 · 沙哑", "gender": "male", "age": "old", "base": "ref_hua_zh.wav", "f0": 0.84, "formant": 0.95},
    {"id": "m_fr", "zh": "男 · 青年 · 法式", "gender": "male", "age": "young", "base": "ref_pierre.wav", "f0": 1.0, "formant": 1.0},
]
FOREIGN = {
    "ja": "いらっしゃいませ！今日のおすすめは新鮮なお寿司です。ぜひ食べてみてください。",
    "ko": "어서 오세요! 오늘은 정말 맛있는 김치찌개가 준비되어 있어요.",
    "en": "Welcome in! Today we have the best burgers in town, freshly grilled just for you.",
    "fr": "Bienvenue ! Ce soir, nous vous proposons un menu magnifique, préparé avec amour.",
    "it": "Benvenuti! Stasera abbiamo una pasta fatta in casa davvero deliziosa.",
    "es": "¡Bienvenidos! Hoy tenemos una paella deliciosa, recién hecha para ustedes.",
    "de": "Herzlich willkommen! Heute gibt es frische Würstchen und ein kühles Bier.",
    "ru": "Добро пожаловать! Сегодня у нас очень вкусный борщ и свежий хлеб.",
}


def world_shift(x, sr, f0k, fk):
    """Pitch × f0k and formant (spectral-envelope) warp × fk with the WORLD vocoder."""
    import pyworld as pw
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, frame_period=5.0)
    env = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    if fk != 1.0:
        n = env.shape[1]
        src = np.arange(n) / fk
        env = np.array([np.interp(src, np.arange(n), frame, right=frame[-1]) for frame in env])
    y = pw.synthesize(f0 * f0k, env, ap, sr, frame_period=5.0)
    return y.astype(np.float32)


class VoiceLibrary:
    def __init__(self, engine, film_dir, out_dir):
        self.engine = engine
        self.base_dir = os.path.join(film_dir, "renders", "voice-test", "omni")
        self.dir = out_dir
        os.makedirs(out_dir, exist_ok=True)
        self.state = "idle"
        self.progress = {}
        self.error = None
        self._lock = threading.Lock()

    def path(self, tid):
        return os.path.join(self.dir, f"{tid}.wav")

    def ready(self, tid):
        return os.path.isfile(self.path(tid))

    def status(self):
        return {"state": self.state, "error": self.error, "built": [t["id"] for t in TIMBRES if self.ready(t["id"])], "total": len(TIMBRES),
                "foreign": sorted(f[:-4] for f in os.listdir(self.dir) if f.count("__") == 1 and f.endswith(".wav"))}

    def catalog(self):
        return [{**{k: t[k] for k in ("id", "zh", "gender", "age")}, "ready": self.ready(t["id"]), "url": f"/voices/{t['id']}.wav", "text": TEMPLATE_TEXT} for t in TIMBRES]

    # ---------------------------------------------------------------- build
    def build_all(self):
        """Background: make every missing timbre template (seconds of GPU each)."""
        self.state = "building"
        try:
            for t in TIMBRES:
                if not self.ready(t["id"]):
                    self.build(t)
            self.state = "ready"
        except Exception as e:
            self.error = f"{type(e).__name__}: {e}"
            self.state = "error"

    def build(self, t):
        x, sr = sf.read(os.path.join(self.base_dir, t["base"]), dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        raw = self.path(t["id"] + "__raw")
        y = world_shift(x, sr, t["f0"], t["formant"]) if (t["f0"] != 1.0 or t["formant"] != 1.0) else x
        sf.write(raw, y, sr)
        out = self.engine.voice_once("cross", TEMPLATE_TEXT, raw)
        sf.write(self.path(t["id"]), out, self.engine.sr)
        self.progress[t["id"]] = time.time()

    def foreign(self, tid, lang):
        """The timbre speaking `lang` once — the prompt that gives Chinese lines that accent."""
        p = os.path.join(self.dir, f"{tid}__{lang}.wav")
        if os.path.isfile(p):
            return p
        with self._lock:
            if not os.path.isfile(p):
                if not self.ready(tid):
                    self.build(next(t for t in TIMBRES if t["id"] == tid))
                out = self.engine.voice_once("cross", FOREIGN[lang], self.path(tid))
                sf.write(p, out, self.engine.sr)
        return p

    def prompt(self, tid):
        if not self.ready(tid):
            with self._lock:
                if not self.ready(tid):
                    self.build(next(t for t in TIMBRES if t["id"] == tid))
        return self.path(tid), TEMPLATE_TEXT


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
