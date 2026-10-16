"""Transcribe the Mandarin voice lines with Whisper and compare with lines.json.

usage: python asr_check.py   (needs torch + transformers; uses the cached
openai/whisper-large-v3-turbo model)
"""
import difflib
import json
import os

import subprocess

import numpy as np
from transformers import pipeline

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE = os.path.join(os.path.dirname(HERE), "assets", "voice")
LINES = json.load(open(os.path.join(HERE, "lines.json"), encoding="utf-8"))
asr = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3-turbo", device="cpu")
PUNCT = "，。！？、：；…,.!?~ "


def clean(s):
    return "".join(c for c in s if c not in PUNCT)


import sys
ONLY = set(sys.argv[1:])
for line in [l for l in LINES if not ONLY or l["id"] in ONLY]:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(VOICE, line["id"] + ".wav"), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(pcm, dtype=np.float32).copy()
    out = asr({"raw": x, "sampling_rate": 16000}, generate_kwargs={"language": "zh", "task": "transcribe"})
    got = out["text"].strip()
    ratio = difflib.SequenceMatcher(None, clean(line["text"]), clean(got)).ratio()
    print(f"{line['id']:4s} {ratio:.2f}  want: {line['text']}  |  heard: {got}", flush=True)
