"""Download Fun-CosyVoice3-0.5B-2512 from ModelScope into CosyVoice/pretrained_models."""
import os
from modelscope import snapshot_download

here = os.path.dirname(os.path.abspath(__file__))
dst = os.path.join(here, "CosyVoice", "pretrained_models", "Fun-CosyVoice3-0.5B")
snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=dst)
print("MODEL_DONE", dst)
