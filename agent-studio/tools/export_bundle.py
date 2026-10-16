"""Bundle the studio (http://localhost:8770/#live) into one standalone, reproducible zip.

    python agent-studio/tools/export_bundle.py [--out exports/techthon-live.zip]

Run it with the interpreter that runs the studio: its `pip freeze` becomes
requirements-lock.txt, and its Python / OS / GPU become the build record in INSTALL.md.

The zip keeps the repo layout, because server/app.py derives every path from the
parent of agent-studio/ (film assets, avatar-lab, docs, CosyVoice). Only what the
studio actually reads is included:

  agent-studio/        server, web, dev tools, generated timbre library (voices/), docs
  videos/jinwan-chi-shui/   rig.js, lipsync.js, the 17 film voice clips, the dialect
                       table, the five OmniVoice reference voices — nothing else
  avatar-lab/public/   manifest.json, the three GLB models, the reference sheets
  docs/restaurant-avatar/concepts/   concept sheets
  tts/CosyVoice/       the engine source (no .git, no weights) + tts/download_model.py

and four generated files: INSTALL.md, requirements-lock.txt, requirements-lite.txt,
start.bat / start.sh, MANIFEST.txt (sha256 of everything).

Deliberately left out: .env (real API keys), sessions/, agents/, cache/ (runtime data,
regenerated), __pycache__, and the 9 GB CosyVoice3 weights (public; INSTALL.md says how
to fetch them). The only edit to a source file, applied to the copy inside the zip: the
model-viewer <script> points at web/vendor/ instead of the jsDelivr CDN.

Gates: no secret from .env (or an sk-… / Bearer token) may appear in any file written;
if a source file changes while the zip is being built, the build restarts; every
static /film /lab /docs-assets /voices path literal in web/ and server/ must exist in
the bundle.
"""
import argparse
import datetime
import hashlib
import os
import platform
import re
import subprocess
import sys
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
ROOT = os.path.dirname(STUDIO)
TOP = "techthon-live"

VIEWER_FILE = "model-viewer-3.5.0.min.js"
VIEWER_SRC = os.path.join(HERE, "vendor", VIEWER_FILE)
VIEWER_CDN = "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"
VIEWER_LOCAL = "/vendor/" + VIEWER_FILE

SKIP_DIRS = {"__pycache__", ".git", "node_modules"}
# lite mode (STUDIO_NO_TTS=1): everything server/*.py imports at module level
LITE = ["fastapi", "uvicorn", "httpx", "numpy", "soundfile", "pypinyin", "ToJyutping"]
# static URL roots the server mounts -> where they live inside the bundle
MOUNTS = {
    "/film/": "videos/jinwan-chi-shui/",
    "/lab/": "avatar-lab/public/",
    "/docs-assets/": "docs/restaurant-avatar/",
    "/voices/": "agent-studio/voices/",
}


def walk(base, keep, skip_dirs):
    for dp, dn, fn in os.walk(base):
        dn[:] = sorted(d for d in dn if d not in skip_dirs)
        for f in sorted(fn):
            if f.endswith(".pyc"):
                continue
            full = os.path.join(dp, f)
            rel = os.path.relpath(full, base).replace(os.sep, "/")
            if keep(rel):
                yield full


def plan():
    """arcname (relative to the bundle root) -> source path on disk."""
    files = {}

    def tree(rel_dir, keep=lambda r: True, skip_dirs=SKIP_DIRS):
        base = os.path.join(ROOT, *rel_dir.split("/"))
        n = 0
        for full in walk(base, keep, skip_dirs):
            files[os.path.relpath(full, ROOT).replace(os.sep, "/")] = full
            n += 1
        if not n:
            sys.exit("nothing found under %s" % rel_dir)

    def one(rel):
        full = os.path.join(ROOT, *rel.split("/"))
        if not os.path.isfile(full):
            sys.exit("missing %s" % rel)
        files[rel] = full

    s = "agent-studio"
    tree(s + "/server", lambda r: r.endswith(".py") and "/" not in r)
    tree(s + "/web")
    tree(s + "/tools", lambda r: r.endswith(".py") and "/" not in r and r != "export_bundle.py")
    tree(s + "/voices", lambda r: r.endswith(".wav"))
    for f in ("README.md", "DESIGN.md", ".env.example", ".gitignore"):
        one(s + "/" + f)

    f = "videos/jinwan-chi-shui"
    one(f + "/assets/js/rig.js")
    one(f + "/assets/js/lipsync.js")
    tree(f + "/assets/voice", lambda r: r.endswith(".wav") and not r.startswith("raw_"))
    one(f + "/tools/lines_dialect.json")
    one(f + "/tools/lines.json")
    tree(f + "/renders/voice-test/omni", lambda r: r.startswith("ref_") and r.endswith(".wav"))

    one("avatar-lab/public/manifest.json")
    tree("avatar-lab/public/models")
    tree("avatar-lab/public/references")
    tree("docs/restaurant-avatar/concepts")
    tree("tts/CosyVoice", skip_dirs=SKIP_DIRS | {"pretrained_models"})
    one("tts/download_model.py")
    return files


SECRET_NAME = re.compile(r"KEY|TOKEN|SECRET|PASSWORD", re.I)


def read_env_secrets():
    """Values of secret-looking variables only: model names and base URLs are not secrets
    (and legitimately appear in .env.example's comments)."""
    vals = set()
    path = os.path.join(STUDIO, ".env")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    if SECRET_NAME.search(k) and len(v) >= 8:
                        vals.add(v)
    for k in ("TYPESAFE_API_KEY", "LLM_API_KEY"):
        v = os.environ.get(k, "").strip()
        if len(v) >= 8:
            vals.add(v)
    return [v.encode("utf-8") for v in vals]


TOKEN_RE = re.compile(rb"\bsk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{24,}")


# ---------------------------------------------------------------- generated files

def pip_freeze():
    out = subprocess.run([sys.executable, "-m", "pip", "freeze"], capture_output=True, text=True, check=True).stdout
    lines = [l.strip() for l in out.splitlines() if l.strip()]
    bad = [l for l in lines if " @ " in l or l.startswith("-e ")]
    if bad:
        sys.exit("pip freeze has local/editable installs, which cannot be reproduced: %s" % bad[:3])
    return lines


def pin_of(freeze, name):
    for l in freeze:
        if l.split("==")[0].lower().replace("_", "-") == name.lower().replace("_", "-"):
            return l
    sys.exit("%s is not installed in this interpreter, so it cannot be pinned" % name)


def gpu_name():
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True, timeout=10)
        return r.stdout.strip().splitlines()[0] if r.returncode == 0 and r.stdout.strip() else "unknown"
    except Exception:
        return "unknown"


def lock_text(freeze, built):
    head = [
        "# Exact versions of the environment this studio was built and run in.",
        "# %s · CPython %s · %s" % (built, platform.python_version(), platform.platform()),
        "# torch / torchaudio are the CUDA 12.1 builds, which live on the PyTorch index:",
        "--extra-index-url https://download.pytorch.org/whl/cu121",
    ]
    return "\n".join(head + freeze) + "\n"


def lite_text(freeze):
    head = [
        "# Lite mode (STUDIO_NO_TTS=1): UI, stage, Jev / keyword decisions, estimated lip-sync, asset library.",
        "# No torch, no GPU, no model download. Pins match requirements-lock.txt.",
    ]
    return "\n".join(head + [pin_of(freeze, n) for n in LITE]) + "\n"


START_BAT = r"""@echo off
rem Studio launcher (portable).   start.bat            full mode (needs the model, see INSTALL.md)
rem                               start.bat lite       no speech synthesis, no model or GPU needed
rem                               start.bat lite 8771  ... on another port
rem Set STUDIO_PYTHON to the python.exe of the environment you installed into
rem (default: the `python` on PATH).
setlocal
cd /d "%~dp0"
set "PORT=8770"
if /i "%~1"=="lite" set "STUDIO_NO_TTS=1"
if not "%~2"=="" set "PORT=%~2"
if "%STUDIO_PYTHON%"=="" (set "PY=python") else (set "PY=%STUDIO_PYTHON%")
echo Studio: http://127.0.0.1:%PORT%/#live    python: %PY%
if defined STUDIO_NO_TTS echo Lite mode: speech synthesis is off.
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:%PORT%/#live"
"%PY%" -m uvicorn server.app:app --app-dir agent-studio --host 127.0.0.1 --port %PORT%
pause
"""

START_SH = """#!/usr/bin/env bash
# Studio launcher (portable).   ./start.sh          full mode (needs the model, see INSTALL.md)
#                               ./start.sh lite     no speech synthesis, no model or GPU needed
# STUDIO_PYTHON = python of the environment you installed into (default: `python`); PORT = 8770.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8770}"
[ "${1:-}" = "lite" ] && export STUDIO_NO_TTS=1
PY="${STUDIO_PYTHON:-python}"
echo "Studio: http://127.0.0.1:${PORT}/#live    python: ${PY}"
exec "$PY" -m uvicorn server.app:app --app-dir agent-studio --host 127.0.0.1 --port "$PORT"
"""

MODELS_README = """CosyVoice3 weights go here:  pretrained_models/Fun-CosyVoice3-0.5B/
(9.1 GB, public — ModelScope FunAudioLLM/Fun-CosyVoice3-0.5B-2512.)

    python tts/download_model.py

The server treats the model as present when
pretrained_models/Fun-CosyVoice3-0.5B/cosyvoice3.yaml exists. Without it the studio
still starts; /api/status reports the speech engine as unavailable and live lines play
with estimated lip-sync and no voice.
"""

INSTALL_TMPL = """# 演播台（#live）独立复现包

导出自本机的 `http://localhost:8770/#live`（今晚吃谁 · 多智能体演播室）。
默认打开的就是演播台；资产库、系统等其它标签页也在包里。

- 导出时间：@@BUILT@@
- 构建环境：Python @@PY@@ · @@OS@@ · GPU @@GPU@@ · torch @@TORCH@@
- 完整性：`MANIFEST.txt` 记录了每个文件的 sha256

## 包里没有的三样东西

| 缺什么 | 为什么 | 怎么补 |
|---|---|---|
| Python 环境 | 太大、且和机器绑定 | `requirements-lock.txt`（完整）或 `requirements-lite.txt`（无 GPU） |
| CosyVoice3 模型权重，约 9.1 GB | 公开模型，体积太大 | `python tts/download_model.py`（ModelScope） |
| API key | `.env` 里是你的私人密钥，已刻意排除 | 复制 `agent-studio/.env.example` 为 `agent-studio/.env` 再填；不填也能跑 |

另外，会话（`sessions/`）、已生成的 agent（`agents/`）、已合成语音的缓存（`cache/`）是运行时数据，没有打进来，第一次使用时会自动重新生成。
没有 Jev key 时决策走“关键词基线”，没有改写模型 key 时方言改写关闭——界面里都会明确标出。

## 方式一：轻量模式（无 GPU、无模型）

能用：舞台与人物表演、关键词基线决策（有 key 则走 Jev）、估算口型、资产库、3D 模型。不能用：配音。

```bat
python -m venv .venv
.venv\\Scripts\\python -m pip install -r requirements-lite.txt
set STUDIO_PYTHON=.venv\\Scripts\\python.exe
start.bat lite
```

浏览器打开 <http://127.0.0.1:8770/#live>（`start.bat` 会自动打开）。macOS / Linux 用 `./start.sh lite`。

## 方式二：完整模式（GPU 配音）

要求：NVIDIA GPU（构建机为 12 GB 显存）、Python 3.10、Windows（`requirements-lock.txt` 是在 Windows 上冻结的）。

```bat
conda create -n cosyvoice -y python=3.10
conda activate cosyvoice
python -m pip install -r requirements-lock.txt
python tts/download_model.py
set STUDIO_PYTHON=python
start.bat
```

`download_model.py` 结束后应当存在 `tts/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B/cosyvoice3.yaml`。
服务启动后模型在后台加载，约 30–60 秒，页面右上角状态灯变绿即可配音。加载期间可以选“不配音 · 估算口型”。

## 目录布局（请保持不变）

`server/app.py` 用 `agent-studio/` 的上一级当根目录去找其余资源，所以解压后的结构必须是：

```
agent-studio/                 服务端、前端、开发工具、音色库
videos/jinwan-chi-shui/       原片的 rig.js、lipsync.js、17 句原声、方言表、5 条参考音色
avatar-lab/public/            manifest.json、3 个 GLB 模型、参考图
docs/restaurant-avatar/       设定图
tts/CosyVoice/                CosyVoice3 引擎源码（不含权重）
```

`videos/`、`avatar-lab/`、`docs/` 下只保留了演播台实际读取的文件，不是完整项目。

## 与源码树的差异

1. `agent-studio/web/index.html`：model-viewer 的 `<script>` 从 jsDelivr CDN 改成本地 `web/vendor/@@VIEWER@@`（同一版本 3.5.0）。其余代码一字未改。
2. `start.bat` / `start.sh` 是新写的可移植版本，不含原来写死的 `C:\\Users\\...` 路径；原 `agent-studio/start.bat` 没有带。`agent-studio/README.md`、`DESIGN.md` 是原文，里面提到的路径以本文件为准。
3. 页面仍会向 Google Fonts 请求 Inter / JetBrains Mono / Noto 字体；离线时自动回退到系统字体，只影响字形，不影响功能。
4. 新增：`INSTALL.md`、`requirements-lock.txt`、`requirements-lite.txt`、`MANIFEST.txt`、`tts/CosyVoice/pretrained_models/README.txt`。

## 环境变量

| 变量 | 作用 |
|---|---|
| `STUDIO_NO_TTS=1` | 不加载 CosyVoice3（轻量模式） |
| `STUDIO_PYTHON` | 启动脚本使用的 Python |
| `COSY_DIR` | CosyVoice 源码目录，默认 `tts/CosyVoice` |
| `TYPESAFE_API_KEY` / `TYPESAFE_MODEL` | Jev 决策 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 方言改写（任意 OpenAI 兼容接口） |

也可以在页面的设置面板里填 key，它会写入 `agent-studio/.env`。

## 重新导出

在源码树里用运行演播台的那个 Python 执行：

```bash
python agent-studio/tools/export_bundle.py
```
"""


def install_text(built, freeze):
    torch = next((l.split("==")[1] for l in freeze if l.lower().startswith("torch==")), "not installed")
    return (INSTALL_TMPL.replace("@@BUILT@@", built).replace("@@PY@@", platform.python_version()).replace("@@OS@@", platform.platform())
            .replace("@@GPU@@", gpu_name()).replace("@@TORCH@@", torch).replace("@@VIEWER@@", VIEWER_FILE))


# ---------------------------------------------------------------- build

def build(out_path, built):
    files = plan()
    secrets = read_env_secrets()
    freeze = pip_freeze()
    for need in ("fastapi", "pyworld", "modelscope", "torch"):
        pin_of(freeze, need)
    if not os.path.isfile(VIEWER_SRC):
        sys.exit("missing %s\n  fetch it: curl -L -o \"%s\" %s" % (VIEWER_SRC, VIEWER_SRC, VIEWER_CDN))

    stamp = {}  # source path -> (size, mtime_ns) when read
    entries = []  # (arcname, bytes, mtime, mode)

    def take(arc, data, mtime, mode=0o644):
        for s in secrets:
            if s in data:
                sys.exit("SECRET from .env found in %s -- refusing to bundle" % arc)
        if TOKEN_RE.search(data):
            sys.exit("token-shaped string (sk-... or Bearer ...) found in %s -- refusing to bundle" % arc)
        entries.append((arc, data, mtime, mode))

    now = time.time()
    for arc, src in sorted(files.items()):
        st0 = os.stat(src)
        with open(src, "rb") as fh:
            data = fh.read()
        st1 = os.stat(src)
        if (st0.st_size, st0.st_mtime_ns) != (st1.st_size, st1.st_mtime_ns) or len(data) != st1.st_size:
            return None, [arc]
        stamp[src] = (st1.st_size, st1.st_mtime_ns)
        if arc == "agent-studio/web/index.html":
            text = data.decode("utf-8")
            if text.count(VIEWER_CDN) != 1:
                sys.exit("index.html no longer loads model-viewer from %s exactly once; update export_bundle.py" % VIEWER_CDN)
            data = text.replace(VIEWER_CDN, VIEWER_LOCAL).encode("utf-8")
        take(arc, data, st1.st_mtime)
    with open(VIEWER_SRC, "rb") as fh:
        take("agent-studio/web/vendor/" + VIEWER_FILE, fh.read(), os.stat(VIEWER_SRC).st_mtime)

    gen = {
        "INSTALL.md": install_text(built, freeze),
        "requirements-lock.txt": lock_text(freeze, built),
        "requirements-lite.txt": lite_text(freeze),
        "tts/CosyVoice/pretrained_models/README.txt": MODELS_README,
    }
    for arc, text in gen.items():
        take(arc, text.encode("utf-8"), now)
    take("start.bat", START_BAT.replace("\n", "\r\n").encode("utf-8"), now)
    take("start.sh", START_SH.encode("utf-8"), now, 0o755)

    # every static path literal the code can request must exist in the bundle
    have = {e[0] for e in entries}
    missing = []
    for base in ("agent-studio/web", "agent-studio/server"):
        for e in entries:
            if e[0].startswith(base + "/") and e[0].endswith((".js", ".py", ".html", ".css")):
                for m in re.finditer(r"""["'`](/film/|/lab/|/docs-assets/|/voices/)([A-Za-z0-9_./-]+)""", e[1].decode("utf-8", "ignore")):
                    rel = MOUNTS[m.group(1)] + m.group(2)
                    if not m.group(2).endswith("/") and not m.group(2).endswith("_") and rel not in have:
                        missing.append("%s  (from %s)" % (rel, e[0]))
    if missing:
        sys.exit("static references with no file in the bundle:\n  " + "\n  ".join(sorted(set(missing))))

    lines = ["# %s — standalone bundle of the studio live view" % TOP, "# built %s" % built, "# sha256  bytes  path"]
    for arc, data, _, _ in sorted(entries):
        lines.append("%s  %d  %s" % (hashlib.sha256(data).hexdigest(), len(data), arc))
    take("MANIFEST.txt", ("\n".join(lines) + "\n").encode("utf-8"), now)

    # a source file touched, added or removed while we read means the zip may mix two states
    changed = [a for a, s in files.items() if not os.path.isfile(s) or (os.stat(s).st_size, os.stat(s).st_mtime_ns) != stamp[s]]
    if changed or set(plan()) != set(files):
        return None, changed or ["(file set changed)"]

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    tmp = out_path + ".part"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for arc, data, mtime, mode in sorted(entries):
            t = time.localtime(max(mtime, 315532800))
            zi = zipfile.ZipInfo(TOP + "/" + arc, date_time=t[:6])
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = (0o100000 | mode) << 16
            zf.writestr(zi, data, compresslevel=6)
    os.replace(tmp, out_path)
    return entries, []


def wait_until_settled(settle, limit=900):
    """A tree that is being edited can be internally inconsistent (a module imported by
    code whose caller is not rewired yet). Wait until nothing has been touched for
    `settle` seconds before snapshotting."""
    t0 = time.time()
    while True:
        newest = max(os.stat(p).st_mtime for p in plan().values())
        age = time.time() - newest
        if age >= settle:
            return
        if time.time() - t0 > limit:
            sys.exit("the source tree is still being edited (last change %.0fs ago); retry when it is quiet" % age)
        print("source touched %.0fs ago -- waiting for %ds of quiet" % (age, settle))
        time.sleep(min(settle - age + 1, 30))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "exports", "techthon-live.zip"))
    ap.add_argument("--settle", type=int, default=120, help="seconds the tree must be untouched before snapshotting (0 = don't wait)")
    args = ap.parse_args()
    if args.settle > 0:
        wait_until_settled(args.settle)
    built = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    for attempt in range(1, 6):
        entries, changed = build(args.out, built)
        if entries is not None:
            break
        print("source changed while building (%s) -- restarting (%d/5)" % (", ".join(changed[:3]), attempt))
        time.sleep(2)
        built = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    else:
        sys.exit("the source tree kept changing; stop whatever is editing it and retry")

    groups = {}
    for arc, data, _, _ in entries:
        top = "/".join(arc.split("/")[:2]) if arc.count("/") >= 1 and arc.split("/")[0] in ("agent-studio", "videos", "avatar-lab", "docs", "tts") else "(root)"
        n, b = groups.get(top, (0, 0))
        groups[top] = (n + 1, b + len(data))
    for k, (n, b) in sorted(groups.items()):
        print("  %-34s %5d files %8.2f MB" % (k, n, b / 1e6))
    print("wrote %s  (%d files, %.1f MB)" % (args.out, len(entries), os.path.getsize(args.out) / 1e6))


if __name__ == "__main__":
    main()
