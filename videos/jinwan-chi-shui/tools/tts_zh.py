"""Mandarin TTS with Kokoro v1.0 + misaki zh G2P.

usage: tts_zh.py <jobs.json>
jobs.json: [{"text": "...", "voice": "zf_xiaoyi", "speed": 1.0, "out": "a.wav"}, ...]
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import zh

CACHE = os.path.expanduser("~/.cache/hyperframes/tts")
kokoro = Kokoro(f"{CACHE}/models/kokoro-v1.0.onnx", f"{CACHE}/voices/voices-v1.0.bin")
g2p = zh.ZHG2P()

jobs = json.load(open(sys.argv[1], encoding="utf-8"))
for job in jobs:
    phonemes = g2p(job["text"])
    if isinstance(phonemes, tuple):
        phonemes = phonemes[0]
    samples, sr = kokoro.create(
        phonemes, voice=job["voice"], speed=job.get("speed", 1.0), is_phonemes=True
    )
    sf.write(job["out"], samples, sr)
    print(json.dumps({"out": job["out"], "seconds": round(len(samples) / sr, 3)}), flush=True)
