"""Re-voice the whole film with one engine, from lines_dialect.json.

usage: python3 revoice.py omni|cosy|qwen
Writes assets/voice/raw_<id>.wav for every line, then prints the follow-up
commands (post-process, lip-sync, retime check, fonts, mix, carve).
Engines run in their own environments:
  omni → ~/.venvs/omnivoice   cosy → ~/.venvs/cosyvoice311   qwen → any python3 + DASHSCOPE_API_KEY
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VOICE = os.path.join(ROOT, "assets", "voice")
engine = sys.argv[1]
cfg = json.load(open(os.path.join(HERE, "lines_dialect.json"), encoding="utf-8"))
V, L = cfg["voices"], cfg["lines"]
stage = os.path.join(ROOT, "renders", "voice-" + engine)
os.makedirs(stage, exist_ok=True)
env = dict(os.environ, HF_HUB_OFFLINE="1")

if engine == "omni":
    jobs = {"voices": {k: v["omni"] for k, v in V.items()},
            "lines": [{"id": l["id"], "voice": l["who"], "text": l["text"], "language": l["lang"]} for l in L]}
    path = os.path.join(stage, "jobs.json")
    json.dump(jobs, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    subprocess.run([os.path.expanduser("~/.venvs/omnivoice/bin/python"), os.path.join(HERE, "tts_omni.py"), path, stage], check=True, env=env)
elif engine == "cosy":
    # timbre prompts come from the OmniVoice designed references
    ref = os.path.join(ROOT, "renders", "voice-test", "omni")
    jobs = []
    for l in L:
        c = V[l["who"]]["cosy"]
        j = {"id": l["id"], "text": l["text"], "prompt_wav": os.path.join(ref, "ref_" + l["who"] + ".wav"), "mode": c["mode"], "speed": c.get("speed", 1.0)}
        if c["mode"] == "instruct":
            j["instruct"] = c["instruct"]
        if c["mode"] == "zero_shot":
            j["prompt_text"] = V[l["who"]]["omni"]["text"]
        jobs.append(j)
    path = os.path.join(stage, "jobs.json")
    json.dump(jobs, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    subprocess.run([os.path.expanduser("~/.venvs/cosyvoice311/bin/python"), os.path.join(HERE, "tts_cosy.py"), path, stage], check=True, env=env)
elif engine == "qwen":
    jobs = [{"id": l["id"], "text": l["text"], **V[l["who"]]["qwen"]} for l in L]
    path = os.path.join(stage, "jobs.json")
    json.dump(jobs, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    subprocess.run([sys.executable, os.path.join(HERE, "tts_qwen_cloud.py"), path, stage], check=True, env=env)
else:
    sys.exit("engine must be omni, cosy or qwen")

for l in L:
    src = os.path.join(stage, l["id"] + ".wav")
    dst = os.path.join(VOICE, "raw_" + l["id"] + ".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, dst], check=True)
    for ext in (".aiff",):
        old = os.path.join(VOICE, "raw_" + l["id"] + ext)
        if os.path.exists(old):
            os.remove(old)
print("raw voices written to assets/voice. Next:")
print("  NO_PITCH=1 sh tools/voice_post.sh " + " ".join(l["id"] for l in L))
print("  python tools/lipsync.py · update T + <audio> timings · python tools/fonts.py · python tools/mix.py · carve")
