"""Pitch-movement proxy for 'how lively does this voice sound'.

For each clip: F0 range (5th–95th percentile, semitones), F0 spread (std,
semitones) and the share of voiced frames. Flat, robotic delivery shows a
narrow range and a small spread.
usage: python prosody.py <wav> [<wav> ...]
"""
import os
import sys

import librosa
import numpy as np

print(f"{'clip':28s} {'range st':>9s} {'std st':>7s} {'voiced':>7s}")
for path in sys.argv[1:]:
    y, sr = librosa.load(path, sr=16000, mono=True)
    f0, vflag, _ = librosa.pyin(y, fmin=65, fmax=600, sr=sr, frame_length=1024, hop_length=160)
    f0 = f0[vflag & ~np.isnan(f0)]
    if len(f0) < 10:
        print(f"{path[-28:]:28s}   (no pitch)")
        continue
    st = 12 * np.log2(f0 / np.median(f0))
    rng = np.percentile(st, 95) - np.percentile(st, 5)
    name = os.path.join(os.path.basename(os.path.dirname(path)), os.path.basename(path))
    print(f"{name[-28:]:28s} {rng:9.1f} {np.std(st):7.2f} {np.mean(vflag):7.2f}")
