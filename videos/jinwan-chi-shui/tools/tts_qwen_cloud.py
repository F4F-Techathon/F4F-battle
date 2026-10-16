"""Dialect voices with Alibaba Cloud Model Studio qwen3-tts-flash (cloud, paid per character).

Dialect voices on qwen3-tts-flash / qwen3-tts-flash-realtime:
  Sunny 四川-晴儿 (f) · Eric 四川-程川 (m) · Rocky 粤语-阿强 (m) · Kiki 粤语-阿清 (f)
  Jada 上海 · Dylan 北京 · Li 南京 · Marcus 陕西 · Roy 闽南 · Peter 天津 · Emilien (French-flavoured male)
Needs DASHSCOPE_API_KEY in the environment (create it in the Bailian console;
keep it in a local .env file, never in the repo).
usage: tts_qwen_cloud.py <jobs.json> <out_dir>
jobs.json: [{"id": "R1", "voice": "Sunny", "text": "...", "language_type": "Chinese"}]
"""
import json
import os
import sys
import urllib.request

URL = os.environ.get("DASHSCOPE_TTS_URL", "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation")
KEY = os.environ.get("DASHSCOPE_API_KEY")
if not KEY:
    sys.exit("DASHSCOPE_API_KEY is not set")

jobs = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
for job in jobs:
    body = {
        "model": job.get("model", "qwen3-tts-flash"),
        "input": {"text": job["text"], "voice": job["voice"], "language_type": job.get("language_type", "Chinese")},
    }
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.load(r)
    audio_url = res["output"]["audio"]["url"]
    path = os.path.join(out, job["id"] + ".wav")
    urllib.request.urlretrieve(audio_url, path)
    print(json.dumps({"id": job["id"], "voice": job["voice"], "out": path, "chars": res.get("usage", {}).get("characters")}), flush=True)
