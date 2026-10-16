"""Generate the music cues with MusicGen (local, offline after first download).

usage: musicgen.py <out_dir>
"""
import os
import sys

import numpy as np
import scipy.io.wavfile as wav
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

CUES = [
    ("cue_a_cozy", 30,
     "cozy farming life-sim game soundtrack, warm fingerpicked acoustic guitar, soft flute melody, "
     "gentle marimba, light shaker, cheerful and curious, 104 bpm, major key, clean mix"),
    ("cue_b_battle", 30,
     "playful comedic game show music, bouncy pizzicato strings, staccato bassoon, marimba and ukulele, "
     "light snappy drums, quirky mischievous and energetic, 118 bpm, major key, clean mix"),
    ("cue_b_battle2", 30,
     "playful comedic cartoon music, bouncy pizzicato strings, clarinet melody, ukulele strums, "
     "woodblock and light drums, cheeky and lively, 118 bpm, major key, clean mix"),
    ("cue_c_win", 12,
     "short triumphant cheerful fanfare, bright brass, glockenspiel and snare roll, celebration, "
     "major key, ends on a big final chord"),
]

processor = AutoProcessor.from_pretrained("facebook/musicgen-small")
model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
model.eval()
rate = model.config.audio_encoder.sampling_rate

for i, (name, seconds, prompt) in enumerate(CUES):
    torch.manual_seed(1234 + i)
    inputs = processor(text=[prompt], padding=True, return_tensors="pt")
    with torch.no_grad():
        audio = model.generate(
            **inputs, do_sample=True, guidance_scale=3.0, max_new_tokens=int(seconds * 50)
        )
    data = audio[0, 0].cpu().numpy().astype(np.float32)
    peak = float(np.max(np.abs(data))) or 1.0
    data = data / peak * 0.89
    wav.write(os.path.join(OUT, f"{name}.wav"), rate, data)
    print(f"{name}: {len(data) / rate:.2f}s", flush=True)
