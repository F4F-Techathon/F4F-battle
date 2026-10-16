#!/usr/bin/env bash
# Deploy Fun-CosyVoice3-0.5B on Windows (conda env "cosyvoice", Python 3.10, CUDA 12.1 torch).
set -euo pipefail
cd "$(dirname "$0")/CosyVoice"
CONDA=/c/Users/Bryan/anaconda3/Scripts/conda
if [ ! -d /c/Users/Bryan/anaconda3/envs/cosyvoice ]; then
  "$CONDA" create -n cosyvoice -y python=3.10
fi
PY=/c/Users/Bryan/anaconda3/envs/cosyvoice/python.exe
MIRROR="-i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com"
"$PY" -m pip install --upgrade pip $MIRROR
"$PY" -m pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121
# requirements without the Linux-only / UI-only pins and without the torch pins handled above
grep -vE '^(--extra-index-url|deepspeed|onnxruntime-gpu|tensorrt|gradio|torch==|torchaudio==)' requirements.txt > /tmp/cosy_req.txt
"$PY" -m pip install -r /tmp/cosy_req.txt $MIRROR
# extras for the studio server: lipsync bake + HTTP
"$PY" -m pip install pypinyin ToJyutping httpx python-multipart $MIRROR
"$PY" -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())"
echo INSTALL_DONE
