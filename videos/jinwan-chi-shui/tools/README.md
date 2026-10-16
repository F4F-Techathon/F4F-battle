# 今晚吃谁？— 制作流水线

本目录存放视频的全部生成脚本。改台词、换配音或改时间后，按下面的顺序重跑。

## 环境

- Python 虚拟环境（配音、口型、字体、混音）：

  ```bash
  python3 -m venv .venv
  .venv/bin/pip install kokoro-onnx soundfile "misaki[zh]" pypinyin fonttools brotli
  ```

  Kokoro 模型文件来自 `~/.cache/hyperframes/tts/`（`kokoro-v1.0.onnx`、`voices-v1.0.bin`），由 `npx hyperframes tts` 首次运行时下载。
- 配乐和语音核对需要带 `torch` + `transformers` 的 Python（本机是 `/opt/anaconda3/bin/python3`）。
- `ffmpeg`、Node 24。

## 文件

| 文件 | 作用 |
|---|---|
| `lines.json` | 全部台词：id、角色、音色、语速、文本 |
| `tts_zh.py` | Kokoro v1.0 + misaki 中文分词合成普通话（绕开 `hyperframes tts` 的 espeak 路径问题） |
| `voice_post.sh` | 去首尾静音、华叔降调 1.5 个半音、响度 -16 LUFS、48 kHz |
| `lipsync.py` | 由音量包络 + 拼音韵母烘焙 30 fps 口型，并生成逐字出现时间 → `assets/js/lipsync.js` |
| `asr_check.py` | 用 Whisper 回听配音，对照台词找错音 |
| `fonts.py` | 按片中实际用字裁剪字体 → `assets/fonts/*.woff2` |
| `musicgen.py` | 本机 MusicGen 生成 4 段配乐 |
| `mix.py` | 配乐 + 音效预混成 `assets/music/bed.wav`（读 `film-core.js` 的时间表） |

## 重跑顺序

```bash
# 1. 改 lines.json 后重配（示例：只重配 H1 和 R2）
.venv/bin/python tts_zh.py tts_jobs_fix.json      # 任务文件格式见 tts_zh.py 顶部
sh voice_post.sh H1 R2
# 法语两句用 macOS：say -v Jacques -o ../assets/voice/raw_P4.aiff "Bon appétit !"

# 2. 口型与逐字时间
.venv/bin/python lipsync.py

# 3. 更新 assets/js/film-core.js 的时间表 T 和 index.html 里对应 <audio> 的 data-start / data-duration

# 4. 字体子集（文字有改动时）
.venv/bin/python fonts.py <放 ttf 的目录>

# 5. 混音 + 人声避让
.venv/bin/python mix.py
node ~/.claude/skills/hyperframes-audio/scripts/carve.mjs --comp ../index.html --bed bed

# 6. 检查与预览
cd .. && npx hyperframes check && npx hyperframes preview --background
```

## 方言配音（替换 Kokoro）

台词的方言版在 `lines_dialect.json`：蓉姐说四川话，华叔说粤语（`gloss` 是普通话释义），Pierre 说带法国口音的普通话和两句法语。三种引擎都能整片重配：

| 引擎 | 脚本 | 环境 | 方言做法 | 许可 |
|---|---|---|---|---|
| OmniVoice（k2-fsa） | `tts_omni.py` | `~/.venvs/omnivoice`（MPS） | 音色设计写“女，中年，四川话”；粤语用 `language="yue"`；法语参考音跨语种克隆出法国口音 | 模型 CC-BY-NC，仅限非商业 |
| Fun-CosyVoice3-0.5B | `tts_cosy.py` | `~/.venvs/cosyvoice311` + `~/tts/CosyVoice` | 指令“请用四川话表达。”“请用广东话表达。”，另有开心/伤心/生气指令 | Apache-2.0 |
| Qwen3-TTS-Flash（阿里云百炼） | `tts_qwen_cloud.py` | 任意 python3 + `DASHSCOPE_API_KEY` | 现成方言音色：Sunny/Eric 四川话、Rocky/Kiki 粤语、Emilien 法式男声 | 云服务，按字符计费 |

```bash
python3 tools/revoice.py cosy          # 现用 CosyVoice3；也可 omni / qwen：生成 assets/voice/raw_*.wav
NO_PITCH=1 sh tools/voice_post.sh O1 O2a O2b R1 H1 R2 P0 P1 H2 P2 R3 P3 O3 R4 H3 P4 O4
~/.venvs/film-tools/bin/python tools/lipsync.py tools/lines_dialect.json   # 粤语按粤拼、法语按元音出口型
python3 tools/retime.py                # 按新台词长度重排舞台段，改 T 表、<audio> 位置和全片长度
~/.venvs/film-tools/bin/python tools/fonts.py <ttf 目录>
~/.venvs/film-tools/bin/python tools/mix.py
node ~/.claude/skills/hyperframes-audio/scripts/carve.mjs --comp index.html --bed bed
npx hyperframes check
```

语速在 `lines_dialect.json` 的 `voices.<角色>.cosy.speed` 里调。舞台上的表情、手势和音效都按“台词进行到百分之几”触发（`F.at(id, 比例)`），换语速或方言后不用逐个改时间。

对比与核对：`voice_compare.py` 生成 `renders/voice-test/compare.html` 和 `ab_all.mp3`；`asr_files.py <zh|yue|fr> <wav…>` 用 Whisper 回听。
工具环境：`~/.venvs/film-tools`（kokoro-onnx、misaki、pypinyin、ToJyutping、fonttools）。

## 角色系统

- `assets/js/rig.js`：一套 SVG 骨骼，三个角色换装换色。表情预设 `EXPR`（20 种）、手势 `POSES`（25 种）。
- 每帧状态只由时间决定：表情 0.22 s 混合并伴随头部挤压回弹；眨眼按固定节奏；嘴型读 `window.LIPSYNC`。
- 接实时语音时，把 `Actor.state()` 里读 `LIPSYNC` 的部分换成实时口型流即可，表情和手势接口不变。
