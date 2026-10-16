"""Whisper check for arbitrary clips.

usage: python asr_files.py <lang> <wav> [<wav> ...]      lang: zh | yue | fr | en
Prints what Whisper hears, so a dialect or accent sample can be checked
for intelligibility before it goes into the film.
"""
import os
import subprocess
import sys

import numpy as np
from transformers import pipeline

asr = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3-turbo", device="cpu")
lang = sys.argv[1]
for path in sys.argv[2:]:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
    x = np.frombuffer(pcm, dtype=np.float32).copy()
    kw = {"task": "transcribe"}
    if lang != "auto":
        kw["language"] = {"yue": "cantonese"}.get(lang, lang)
    out = asr({"raw": x, "sampling_rate": 16000}, generate_kwargs=kw)
    print(f"{os.path.basename(path):10s} [{lang}] {out['text'].strip()}", flush=True)
