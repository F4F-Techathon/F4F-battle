"""Dialect voices with Fun-CosyVoice3-0.5B (Alibaba FunAudioLLM, Apache-2.0).

modes per line:
  instruct  — dialect / emotion by instruction, timbre from prompt_wav
              (instruct: 广东话 东北话 甘肃话 贵州话 河南话 湖北话 湖南话 江西话 闽南话
               宁夏话 山西话 陕西话 山东话 上海话 四川话 天津话 云南话)
  zero_shot — clone prompt_wav (needs prompt_text = its transcript)
  cross     — cross-lingual clone: the prompt's accent carries into the text
usage: tts_cosy.py <jobs.json> <out_dir>    (env COSY_DIR = CosyVoice checkout)
"""
import json
import os
import sys
import time

COSY = os.environ.get("COSY_DIR", os.path.expanduser("~/tts/CosyVoice"))
sys.path.append(COSY)
sys.path.append(os.path.join(COSY, "third_party", "Matcha-TTS"))

import torch  # noqa: E402
import torchaudio  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402

SYS = "You are a helpful assistant."
jobs = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
cosy = AutoModel(model_dir=os.path.join(COSY, "pretrained_models", "Fun-CosyVoice3-0.5B"))

for line in jobs:
    torch.manual_seed(line.get("seed", 3))
    t0 = time.time()
    mode = line["mode"]
    speed = line.get("speed", 1.0)
    if mode == "instruct":
        gen = cosy.inference_instruct2(line["text"], f"{SYS} {line['instruct']}<|endofprompt|>", line["prompt_wav"], stream=False, speed=speed)
    elif mode == "zero_shot":
        gen = cosy.inference_zero_shot(line["text"], f"{SYS}<|endofprompt|>{line['prompt_text']}", line["prompt_wav"], stream=False, speed=speed)
    else:
        gen = cosy.inference_cross_lingual(f"{SYS}<|endofprompt|>{line['text']}", line["prompt_wav"], stream=False, speed=speed)
    wav = torch.cat([j["tts_speech"] for j in gen], dim=1)
    path = os.path.join(out, line["id"] + ".wav")
    torchaudio.save(path, wav, cosy.sample_rate)
    print(json.dumps({"id": line["id"], "out": path, "seconds": round(wav.shape[1] / cosy.sample_rate, 2), "gen_secs": round(time.time() - t0, 1)}), flush=True)
