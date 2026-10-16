# F4F · 今晚吃啥（餐馆角色 agent 模块）

2026 ShanghaiTech Techathon 项目 F4F 的一个模块：每家餐馆一个角色 agent，在直播舞台上轮番推销、互相拆台；顾客（「我」）在台下提问。目的是帮人治好选择困难。

## 目录

| 目录 | 内容 | 入口 |
|---|---|---|
| [`agent-studio/`](agent-studio/) | 多智能体实时演播室：<br>• TypeSafe Jev 决定表演<br>• LLM 把普通话改写成方言<br>• CosyVoice3 配音<br>• 「+」用店铺信息和 logo 生成新的店主 agent | [README](agent-studio/README.md) · [资产契约](agent-studio/CONTRACT.md) · [设计规范](agent-studio/DESIGN.md) |
| [`videos/jinwan-chi-shui/`](videos/jinwan-chi-shui/) | HyperFrames 宣传片。角色 rig（`assets/js/rig.js`）、口型和原片配音由演播室只读引用 | [BRIEF](videos/jinwan-chi-shui/BRIEF.md) |
| [`avatar-lab/`](avatar-lab/) | 三位店主的 3D 资产与表演接口样机（GLB、Blender 源文件） | [README](avatar-lab/README.md) |
| [`docs/restaurant-avatar/`](docs/restaurant-avatar/) | 角色设定、制作计划、接入契约、设定图 | [README](docs/restaurant-avatar/README.md) |
| [`tts/`](tts/) | CosyVoice3 部署：<br>• `CosyVoice/` 是上游仓库的 submodule<br>• 模型权重用 `download_model.py` 下载 | [install_cosyvoice.sh](tts/install_cosyvoice.sh) |

`agent-studio/server/app.py` 以 `agent-studio/` 的上一级为根目录读取其他目录，所以这几个目录要保持并列。

## 快速开始

```bash
git clone --recurse-submodules https://github.com/F4F-Techathon/F4F-battle.git
cd F4F-battle
bash tts/install_cosyvoice.sh        # conda 环境 cosyvoice：Python 3.10 + CUDA 12.1 torch
python tts/download_model.py         # Fun-CosyVoice3-0.5B 权重，约 9 GB，来自 ModelScope
cp agent-studio/.env.example agent-studio/.env   # 也可以启动后在页面的「设置」里填
python -m uvicorn server.app:app --app-dir agent-studio --port 8770
```

打开 <http://127.0.0.1:8770/>。

不装 CosyVoice 也能用：设置环境变量 `STUDIO_NO_TTS=1` 启动，没有配音，按估算口型表演。

## 不在仓库里的内容

- **API key**：只放在本机的 `agent-studio/.env`，已被忽略。
- **运行时数据**：会话、生成的 agent、配音缓存。
- **构建产物**：`node_modules`、`dist`、各类 zip 打包。
- **模型权重**。
