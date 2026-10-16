#!/usr/bin/env bash
# Resume after torch: openai-whisper 20231117's setup.py imports pkg_resources,
# which setuptools>=81 removed — build it with an older setuptools, no isolation.
set -euo pipefail
cd "$(dirname "$0")/CosyVoice"
PY=/c/Users/Bryan/anaconda3/envs/cosyvoice/python.exe
MIRROR="-i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com"
"$PY" -m pip install "setuptools<81" wheel $MIRROR
"$PY" -m pip install openai-whisper==20231117 --no-build-isolation $MIRROR
grep -vE '^(--extra-index-url|deepspeed|onnxruntime-gpu|tensorrt|gradio|torch==|torchaudio==|openai-whisper)' requirements.txt > /tmp/cosy_req.txt
"$PY" -m pip install -r /tmp/cosy_req.txt $MIRROR
"$PY" -m pip install pypinyin ToJyutping httpx python-multipart $MIRROR
"$PY" -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())"
echo INSTALL_DONE
