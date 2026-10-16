"""Fun-CosyVoice3-0.5B voices for the four agents (local GPU), tuned for live use.

Mirrors videos/jinwan-chi-shui/tools/tts_cosy.py: timbre prompts are the film's
OmniVoice-designed references (renders/voice-test/omni/ref_<who>.wav); dialect
comes from an instruction (请用四川话表达。/ 请用广东话表达。), Pierre's French
accent from cross-lingual cloning of his French reference.

Live path (measured on this machine: prompt extraction ≈1.3 s on CPU, LLM ≈28 ms
per speech token, native stream=True gives no speed control and a 2.5 s first chunk):
  • every (speaker, instruction) prompt is extracted once and cached (add_zero_shot_spk);
  • a line is split into clauses at punctuation and synthesised clause by clause,
    each clause streamed to the browser as soon as it exists (speed preserved);
  • clauses the user has finished typing are pre-synthesised in the background
    (prefetch), so most of a line is ready by the time it is sent.
"""
import hashlib
import json
import os
import queue
import sys
import threading
import time
from collections import OrderedDict

import numpy as np
import soundfile as sf

SYS = "You are a helpful assistant."
SPLIT = set("，。！？；…!?;~")
PAUSE = {"，": 0.10, ",": 0.10, "；": 0.14, ";": 0.14, "…": 0.22, "~": 0.12}
END_PAUSE = 0.2  # after 。！？


def split_clauses(text):
    """Deterministic clause split shared by prefetch and live synthesis."""
    out, cur = [], ""
    for ch in text:
        cur += ch
        if ch in SPLIT:
            out.append(cur)
            cur = ""
    if cur.strip():
        out.append(cur)
    merged = []
    for c in out:
        core = "".join(ch for ch in c if ch not in SPLIT and not ch.isspace())
        if merged and len(core) < 4:
            merged[-1] += c
        else:
            merged.append(c)
    # a very short opening clause joins the next one — unless it is a complete little
    # sentence ("饮茶？", "来嘛！"), which voices fast and natural on its own
    if len(merged) > 1:
        head = merged[0].rstrip()
        core = "".join(ch for ch in head if ch not in SPLIT)
        if len(core) < 2 or (len(core) < 4 and head[-1:] not in "。！？!?"):
            merged[1] = merged[0] + merged[1]
            merged.pop(0)
    return [m for m in merged if m.strip()]


def pause_after(clause):
    last = clause.rstrip()[-1:] if clause.strip() else ""
    if last in "。！？!?":
        return END_PAUSE
    return PAUSE.get(last, 0.06)


class CosyVoiceEngine:
    def __init__(self, cosy_dir, film_dir, cache_dir, catalog):
        self.cosy_dir = cosy_dir
        self.model_dir = os.path.join(cosy_dir, "pretrained_models", "Fun-CosyVoice3-0.5B")
        self.ref_dir = os.path.join(film_dir, "renders", "voice-test", "omni")
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        self.catalog = catalog
        with open(os.path.join(film_dir, "tools", "lines_dialect.json"), encoding="utf-8") as fh:
            self.voices = json.load(fh)["voices"]
        self.state = "idle"
        self.error = None
        self.device = None
        self.model = None
        self.sr = 24000
        self.load_secs = None
        self.fp16 = False
        self._lock = threading.Lock()
        self._spk = set()
        self._clips = OrderedDict()  # (spk, clause, speed) -> float32 audio
        self._live = 0
        self._jobs = queue.Queue()
        self.agents = {}  # generated agents: who → {"timbre", "speed"}
        self.lib = None  # voices.VoiceLibrary, attached by the app
        self.stats = {"clauses": 0, "cache_hits": 0, "prefetched": 0, "llm_secs": 0.0, "audio_secs": 0.0}

    # ------------------------------------------------------------ loading
    def start(self):
        if self.state in ("loading", "ready"):
            return
        self.state = "loading"
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        t0 = time.time()
        try:
            if not os.path.isfile(os.path.join(self.model_dir, "cosyvoice3.yaml")):
                raise FileNotFoundError(f"model not found in {self.model_dir}")
            sys.path.append(self.cosy_dir)
            sys.path.append(os.path.join(self.cosy_dir, "third_party", "Matcha-TTS"))
            try:
                import torch
            except ImportError:
                raise RuntimeError("当前 Python 没有 torch：请用 conda 环境 cosyvoice 启动服务（见 agent-studio/README.md）")
            from cosyvoice.cli.cosyvoice import AutoModel
            self.device = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
            self.fp16 = torch.cuda.is_available() and os.environ.get("COSY_FP16", "0") == "1"
            self.model = AutoModel(model_dir=self.model_dir, fp16=self.fp16)
            self.sr = self.model.sample_rate
            # register every character's default voice now so the first line is fast
            for who in ("rong", "hua", "pierre", "orb"):
                lang = self.catalog["characters"][who]["language"]
                self._ensure_spk(self.job(who, "预热", lang))
            self.load_secs = round(time.time() - t0, 1)
            self.state = "ready"
            threading.Thread(target=self._worker, daemon=True).start()
            if self.lib:
                threading.Thread(target=self.lib.build_all, daemon=True).start()
        except Exception as e:  # surfaced through /api/status
            self.error = f"{type(e).__name__}: {e}"
            self.state = "error"

    def status(self):
        return {"state": self.state, "error": self.error, "device": self.device, "load_secs": self.load_secs,
                "model": "Fun-CosyVoice3-0.5B-2512", "fp16": self.fp16, "stats": self.stats, "queue": self._jobs.qsize()}

    # ------------------------------------------------------------ jobs
    def _base(self, who):
        """Timbre prompt for a speaker: film reference, a generated agent's timbre, or `tpl:<timbre>`."""
        if who in self.voices:
            return {"prompt_wav": os.path.join(self.ref_dir, f"ref_{who}.wav"), "prompt_text": self.voices[who].get("omni", {}).get("text", ""),
                    "speed": float(self.voices[who].get("cosy", {}).get("speed", 1.0)), "timbre": None}
        if who.startswith("tpl:"):
            tid, spd = who[4:], 1.1
        else:
            a = self.agents.get(who, {})
            tid, spd = a.get("timbre"), float(a.get("speed", 1.1))
        if not tid or not self.lib:
            raise ValueError(f"no voice for {who}")
        wav, text = self.lib.prompt(tid)
        return {"prompt_wav": wav, "prompt_text": text, "speed": spd, "timbre": tid}

    def job(self, who, text, lang, delivery="neutral", speed=None):
        lang_cfg = next((l for l in self.catalog["languages"] if l["id"] == lang), None)
        if lang_cfg is None:
            raise ValueError(f"unknown language {lang}")
        base = self._base(who)
        sp = float(speed) if speed else base["speed"]
        mode = lang_cfg["cosy"]["mode"]
        instruct = lang_cfg["cosy"].get("instruct", "")
        prompt_wav = base["prompt_wav"]
        if lang_cfg["cosy"].get("accent") and base["timbre"]:
            # foreign accent: the timbre's own clip in that language becomes the prompt
            prompt_wav = self.lib.foreign(base["timbre"], lang_cfg["cosy"]["accent"])
        # CosyVoice3 takes ONE instruction per request (cosyvoice/utils/common.py instruct_list):
        # a dialect OR an emotion OR a speed. Dialect voices keep the dialect; only plain
        # Mandarin may carry an emotion ("请非常生气地说一句话。").
        dl = next((d for d in self.catalog["deliveries"] if d["id"] == delivery), None)
        if dl and dl.get("instruct") and mode == "zero_shot":
            mode, instruct = "instruct", f"请非常{dl['instruct']}地说一句话。"
        j = {"who": who, "text": text, "lang": lang, "mode": mode, "speed": round(sp, 3),
             "prompt_wav": prompt_wav, "instruct": instruct if mode == "instruct" else "",
             "prompt_text": base["prompt_text"] if mode == "zero_shot" else "",
             "tag": lang_cfg["cosy"].get("tag", ""), "lipsync": lang_cfg["lipsync"]}
        j["spk"] = f"{os.path.basename(prompt_wav)}|{mode}|{j['instruct'] or j['prompt_text'][:8]}"
        j["key"] = hashlib.sha1(json.dumps({k: j[k] for k in ("spk", "text", "speed", "tag")}, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16]
        return j

    def _ensure_spk(self, j):
        if j["spk"] in self._spk:
            return
        if j["mode"] == "instruct":
            ptext = f"{SYS} {j['instruct']}<|endofprompt|>"
        elif j["mode"] == "zero_shot":
            ptext = f"{SYS}<|endofprompt|>{j['prompt_text']}"
        else:
            ptext = ""
        self.model.add_zero_shot_spk(ptext, j["prompt_wav"], j["spk"])
        self._spk.add(j["spk"])

    def _infer(self, j, clause):
        """One clause, under the GPU lock. Returns float32 audio (post-processed)."""
        import torch
        self._ensure_spk(j)
        torch.manual_seed(3)
        m = self.model
        t0 = time.time()
        if j["mode"] == "instruct":
            gen = m.inference_instruct2(clause, f"{SYS} {j['instruct']}<|endofprompt|>", j["prompt_wav"], zero_shot_spk_id=j["spk"], stream=False, speed=j["speed"])
        elif j["mode"] == "zero_shot":
            gen = m.inference_zero_shot(clause, f"{SYS}<|endofprompt|>{j['prompt_text']}", j["prompt_wav"], zero_shot_spk_id=j["spk"], stream=False, speed=j["speed"])
        else:
            gen = m.inference_cross_lingual(f"{SYS}<|endofprompt|>{j['tag']}{clause}", j["prompt_wav"], zero_shot_spk_id=j["spk"], stream=False, speed=j["speed"])
        wav = torch.cat([g["tts_speech"] for g in gen], dim=1).squeeze(0).float().cpu().numpy()
        x = post(wav, self.sr)
        self.stats["clauses"] += 1
        self.stats["llm_secs"] = round(self.stats["llm_secs"] + time.time() - t0, 2)
        self.stats["audio_secs"] = round(self.stats["audio_secs"] + len(x) / self.sr, 2)
        return x

    def voice_once(self, mode, text, prompt_wav, instruct="", prompt_text="", speed=1.0):
        """One uncached synthesis (voice-template building / accent bootstrapping)."""
        import torch
        if self.state != "ready":
            raise RuntimeError("CosyVoice3 not ready")
        with self._lock:
            torch.manual_seed(3)
            m = self.model
            if mode == "instruct":
                gen = m.inference_instruct2(text, f"{SYS} {instruct}<|endofprompt|>", prompt_wav, stream=False, speed=speed)
            elif mode == "zero_shot":
                gen = m.inference_zero_shot(text, f"{SYS}<|endofprompt|>{prompt_text}", prompt_wav, stream=False, speed=speed)
            else:
                gen = m.inference_cross_lingual(f"{SYS}<|endofprompt|>{text}", prompt_wav, stream=False, speed=speed)
            wav = torch.cat([g["tts_speech"] for g in gen], dim=1).squeeze(0).float().cpu().numpy()
        return post(wav, self.sr)

    def clause_audio(self, j, clause, live=True):
        ck = (j["spk"], clause, j["speed"], j["tag"])
        if ck in self._clips:
            self._clips.move_to_end(ck)
            self.stats["cache_hits"] += 1
            return self._clips[ck], True
        if live:
            self._live += 1
        try:
            with self._lock:
                if ck in self._clips:  # a prefetch finished it while we waited
                    self.stats["cache_hits"] += 1
                    return self._clips[ck], True
                x = self._infer(j, clause)
        finally:
            if live:
                self._live -= 1
        self._clips[ck] = x
        while len(self._clips) > 600:
            self._clips.popitem(last=False)
        return x, False

    # ------------------------------------------------------------ prefetch
    def prefetch(self, who, text, lang):
        if self.state != "ready":
            return 0
        j = self.job(who, text, lang)
        n = 0
        for c in split_clauses(text):
            if c.rstrip()[-1:] in SPLIT and (j["spk"], c, j["speed"], j["tag"]) not in self._clips:
                self._jobs.put((j, c))
                n += 1
        return n

    def _worker(self):
        while True:
            j, c = self._jobs.get()
            # live requests always go first
            while self._live:
                time.sleep(0.05)
            try:
                _, cached = self.clause_audio(j, c, live=False)
                if not cached:
                    self.stats["prefetched"] += 1
            except Exception:
                pass

    # ------------------------------------------------------------ whole line
    def synth(self, j):
        """Whole line (non-live callers): clauses joined with punctuation pauses; cached wav."""
        path = os.path.join(self.cache_dir, j["key"] + ".wav")
        if os.path.isfile(path):
            x, sr = sf.read(path, dtype="float32")
            return x, sr, True
        if self.state != "ready":
            raise RuntimeError(f"CosyVoice3 not ready ({self.state}{': ' + self.error if self.error else ''})")
        parts = []
        for c in split_clauses(j["text"]):
            x, _ = self.clause_audio(j, c)
            parts += [x, np.zeros(int(pause_after(c) * self.sr), dtype="float32")]
        x = np.concatenate(parts[:-1]) if parts else np.zeros(1, dtype="float32")
        sf.write(path, x, self.sr)
        return x, self.sr, False


def post(x, sr, thr_db=-40.0, pad=0.03, target_rms_db=-19.0):
    """voice_post.sh without ffmpeg: trim head/tail silence, level to a common loudness, peak-limit."""
    if len(x) == 0:
        return x.astype("float32")
    hop = max(1, sr // 100)
    n = len(x) // hop
    if n > 2:
        rms = np.sqrt(np.array([np.mean(x[i * hop:(i + 1) * hop] ** 2) for i in range(n)]) + 1e-12)
        db = 20 * np.log10(rms / (np.max(rms) + 1e-12))
        on = np.where(db > thr_db)[0]
        if len(on):
            a = max(0, on[0] * hop - int(pad * sr))
            b = min(len(x), (on[-1] + 1) * hop + int(pad * sr))
            x = x[a:b]
    rms = np.sqrt(np.mean(x ** 2) + 1e-12)
    x = x * (10 ** (target_rms_db / 20) / rms)
    pk = np.max(np.abs(x))
    if pk > 0.95:
        x = x * (0.95 / pk)
    fade = min(len(x) // 4, int(0.008 * sr))
    if fade > 1:
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
    return x.astype("float32")
