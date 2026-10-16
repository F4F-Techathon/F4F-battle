"""Dialect voices with OmniVoice (k2-fsa, local, Apple Silicon MPS).

Each character gets a designed reference clip once (voice design), then every
line is cloned from that clip so the timbre stays the same across lines.
usage: tts_omni.py <jobs.json> <out_dir>
jobs.json: {"voices": {name: {"instruct": str, "language": str, "text": str}},
            "lines":  [{"id": str, "voice": name, "text": str, "language": str, "speed": float}]}
Model licence: CC-BY-NC (non-commercial).
"""
import json
import os
import sys
import time

import soundfile as sf
import torch
from omnivoice import OmniVoice

jobs = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
dev = "mps" if torch.backends.mps.is_available() else "cpu"
model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=dev, dtype=torch.float32)

refs = {}
for name, v in jobs["voices"].items():
    torch.manual_seed(v.get("seed", 7))
    t0 = time.time()
    if "ref_audio" in v:
        wav_path, ref_text = v["ref_audio"], v["ref_text"]
    else:
        audio = model.generate(text=v["text"], language=v.get("language"), instruct=v["instruct"])
        wav_path = os.path.join(out, f"ref_{name}.wav")
        sf.write(wav_path, audio[0], 24000)
        ref_text = v["text"]
    refs[name] = model.create_voice_clone_prompt(ref_audio=wav_path, ref_text=ref_text)
    print(json.dumps({"voice": name, "ref": wav_path, "secs": round(time.time() - t0, 1)}), flush=True)

for line in jobs["lines"]:
    torch.manual_seed(line.get("seed", 11))
    t0 = time.time()
    audio = model.generate(
        text=line["text"],
        language=line.get("language"),
        voice_clone_prompt=refs[line["voice"]],
        speed=line.get("speed"),
    )
    path = os.path.join(out, line["id"] + ".wav")
    sf.write(path, audio[0], 24000)
    print(json.dumps({"id": line["id"], "out": path, "seconds": round(len(audio[0]) / 24000, 2), "gen_secs": round(time.time() - t0, 1)}), flush=True)
