# 今晚吃啥 · 多智能体演播室（agent-studio）

把 `videos/jinwan-chi-shui` 的三位餐馆主理人和主持人「小选」变成可以实时导演的多智能体。另外：
- 「+」可以用任意店铺的信息和 logo 当场生成新的店主 agent；
- 「我」作为台下顾客也是一个 agent。

导演用**普通话**写台词，选一位角色，再选择回应哪几个人的哪几句话（可以多选），按回车，角色立刻开演：

```
回车 ─┬─► 改写 LLM：普通话 → 四川话 / 粤语 / 法式口音（或法语）──► CosyVoice3 分句流式配音 ─┐
      └─► TypeSafe Jev：13 个问题并行 → 表情、手势、动作、视线、立场、气泡、旁听反应 ─────┴─► 舞台表演
```

- **0 ms**：消息上屏，发言人转向被回应的人，气泡里出现打字点，其他人转头看过来。
- **Jev 返回**（约 0.5–1 s）：表情和手势先到位。
- **第一句音频到达**：开口，逐字出字幕，旁听者在台词进行到约 22% / 40% 时做出反应。

视频项目只读：rig.js、lipsync.js、配音、字体都从 `/film/…` 读取，没有改动 `videos/` 下的任何文件。

## 三个视图

- **演播**
  - 舞台、每位智能体的实时状态（表情头像、手势、音量电平）、事件流和会话。
  - **「+ 添加店铺」**：
    - 输入店铺信息（第一行店名，其余可以写「菜系 / 人均 / 招牌 / 店主 / 简介」）和 logo。
    - 依次生成形象 → 口音 → 组件 → 声音，每步由 Jev 决定，没有 key 时用规则。
    - 新角色先以剪影站上舞台，逐步显形，然后亮相并说开场白。
    - 整个过程约 3–7 s；外国口音第一次用要多约 6 s 生成提示音。详见 [CONTRACT.md](CONTRACT.md)。
  - **「我」**：
    - 台下的顾客。气泡从舞台下方出现，店主们转向你，Jev 决定每个人的反应。
    - 点「我」卡片上的齿轮可以改称呼，或选一个音色配音（默认不配音）。
  - **多选引用**：
    - 点消息上的 ↩ 可以连选好几条，Alt+↑ 逐条追加。
    - 一句话同时回应好几个人，被回应的人都会被 Jev 当作「被针对」。
  - 撰写区实时显示改写预览；打字时就开始改写和预合成，按回车时大部分音频已经就绪。
  - 点任意消息打开检视器：
    - 改写的原文和结果；
    - Jev 的每个问题，带分布条和置信度环；
    - 逐项手动覆盖，改完立即重播。
  - **会话**：
    - 「保存」把整场对白存进 `agent-studio/sessions/`，内容包括原文、改写、Jev 决策、手动覆盖，以及已生成配音的引用。
    - 「会话列表」可以载入、载入并播放、删除，还能开关循环播放。
    - 「自动播放」按顺序重演整场，使用已录好的配音和编排。
    - 每句结束后自动保存；刷新页面后，可以一键恢复上次会话，或恢复后直接播放。
- **资产**
  - 总览依次是：
    - **通用模板**：
      - 6 种体型，按性别 × 身高；
      - 8 种音色，每种都能现场试听 27 种口音。
    - **原片角色**。
    - **生成的 agent**。
  - 每一项都能点进去看同一套资产：表情 20、手势 26、动作 10、口型 7+11、眼睛与手型、特效 8、声音。
  - 模板另有「部件」页，展示发型、服装、帽子、配饰、主题色的各个变体。
  - 生成的 agent 另有「档案」页：店铺原文、人设、四步 Jev 决策（含概率），可以试听开场白、删除 agent。
  - 原片角色另有角色设定图、台词、3D。
  - 卡片直接循环播放动画。
  - 点卡片打开详情：大号实时 rig，可暂停、切换 0.5× / 1×，显示参数和片中用法，可导出帧序列 PNG。
  - 可导出 JSON / CSV。
- **系统**
  - 实时架构图：新 agent 加入或删除时立即重画，包括底部的「店铺 → agent」生成管线。随事件点亮。
  - Agent 名单：列出每份资产契约的形象模板、口音和音色。
  - Jev 与原片编排一致性检验：把原片 13 句台词交给 Jev，与 `scene-stage.js` 的手工编排对比。

## 运行

服务需要 conda 环境 `cosyvoice`（Python 3.10、torch 2.3.1 + CUDA 12.1）。双击 `start.bat`，或：

```bash
C:/Users/Bryan/anaconda3/envs/cosyvoice/python.exe -m uvicorn server.app:app --app-dir agent-studio --port 8770
```

打开 <http://127.0.0.1:8770/>。CosyVoice3 在后台加载，约 30 s–3 min，右上角「配音」变绿即可。

点右上角的状态灯或齿轮打开**设置**，填两组 key。key 只保存在本机服务端（`agent-studio/.env`，已忽略），页面只显示掩码。

- **Jev**：在 <https://console.typesafe.ai/keys> 获取，可以「测试 Jev」。
- **方言改写**：任意 OpenAI 兼容接口，内置 DeepSeek / 通义千问 / OpenAI 预设，可以「测试改写」。没有配置时按原文配音，并在界面提示。

### 快捷键

| 键 | 作用 |
|---|---|
| Enter | 发送 |
| Shift+Enter | 换行 |
| Alt+1…9 | 切换角色（我、台上店主从左到右、小选） |
| Alt+↑ | 追加引用：再按一次追加更早的一句 |
| Esc | 清空引用 |

另外两个开关：
- **插话**：新台词打断正在说的人。
- **配音**：关掉后按估算口型表演。

## 实测（RTX 4080 Laptop）

- **Jev**：13 问并行，约 7.5k tokens，每句 0.5–1.0 s。
- **CosyVoice3**：说话人提示已缓存，按分句合成，实时率约 1。
  - 冷启动时第一句约 1.5–3 s 出声。
  - 打字时已经预合成好的句子，回车后不到 0.1 s 出声。
- **Jev 与原片编排一致性**：

  | | Top-1 | Top-3 |
  |---|---|---|
  | 开口表情 | 67% | 92% |
  | 手势 | 42% | 75% |
  | 身体动作 | 33% | 75% |
  | 旁听反应 | 17% | 61% |

  原片只是众多合理编排中的一种。

## CosyVoice3 部署说明（Windows）

- **代码与模型**：
  - 代码在 `tts/CosyVoice`（FunAudioLLM/CosyVoice，含 Matcha-TTS 子模块）。
  - 模型在 `pretrained_models/Fun-CosyVoice3-0.5B`，来自 ModelScope `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`。
- **安装**：先运行 `tts/install_cosyvoice.sh`。
  - `openai-whisper==20231117` 在新版 setuptools 下构建失败（缺少 `pkg_resources`），用 `tts/install_cosyvoice_resume.sh` 处理：先装 `setuptools<81`，再以 `--no-build-isolation` 构建。
  - 文本归一化用 `wetext`，不需要 pynini。
- **为实时做的取舍**（`server/tts.py`）：
  - 每个角色的提示音频只提取一次特征并缓存（`add_zero_shot_spk`），每次省下约 1.3 s 的 CPU 计算。
  - CosyVoice3 自带的流式合成不支持变速，首包也要 2.5 s，所以改成按标点逐句合成：每句一出来就推给浏览器，同时附上这一句的 30 fps 口型。
  - CosyVoice3 每次只接受一条指令，方言、情绪、语速三选一。所以四川话、粤语角色只用方言指令，语气靠语速体现；普通话可以带情绪指令。
- **配音方式**：

  | 语言 | 方式 |
  |---|---|
  | 四川话 | `instruct2`，指令「请用四川话表达。」 |
  | 粤语 | `instruct2`，指令「请用广东话表达。」 |
  | Pierre 的法式口音 | 用他的法语参考音频做跨语种克隆 |

## 结构

| 路径 | 作用 |
|---|---|
| `DESIGN.md` | 设计规范：参考系统、设计令牌、组件、数据展示与实时交互规则 |
| `CONTRACT.md` | agent 资产契约：字段、通用模板、生成四步、「我」与多选引用 |
| `agents/` | 生成的 agent 契约（`<id>.json`）和「我」的设定（`me.json`） |
| `voices/` | 8 种音色模板，以及按需生成的外国口音提示音（`<音色>__<语言>.wav`） |
| `server/agents.py` | 店铺信息 + logo → agent：解析、四步 Jev 决策和规则回退、契约读写 |
| `server/voices.py` | 音色模板：WORLD 变调变共振峰 + CosyVoice3 重念；外国口音提示音 |
| `web/data/catalog.json` | 角色人设和全部动作词表。资产描述、Jev 的选项、旁听反应的判断标准都出自这里 |
| `server/llm.py` | 普通话改写成方言或口音（OpenAI 兼容接口，few-shot 例句取自原片） |
| `server/jev.py` | 组装 Jev 的 state 与 13 个问题、调用 Jev，以及关键词基线 |
| `server/tts.py` | CosyVoice3：缓存说话人、逐句合成、打字时预合成、后台队列 |
| `server/lipsync_bake.py` | `tools/lipsync.py` 的单句版本 |
| `server/app.py` | 接口：`status`、`settings`（含两个测试接口）、`decide`、`localize`、`prefetch`、`tts`、`tts/stream`、`voices`、`agents`（列表、生成、删除、我）、`sessions`（列表、读取、保存、删除），以及静态资源 |
| `web/js/live.js` | 实时引擎：回合队列、插话、改写与决策并行、Web Audio 逐句调度、口型和逐字时间随音频增长 |
| `web/js/plan.js` | 把 Jev 答案转成表演，分 prepare / intent / perform 三段；置信度门控；按站位解算手势方向 |
| `web/js/roster.js` | 名单：我、台上店主、小选；站位与缩放；为任意角色创建 rig |
| `web/js/rigkit.js` | 参数化角色：体型 × 部件 × 胸牌 logo，套用原片 rig 的 DOM 契约和渲染器 |
| `web/js/agentgen.js` | 「+」对话框：logo 缩放与主色测量、示例店铺；「我」的设定 |
| `web/js/stage.js` | 舞台：rig、剪影占位与亮相、重新排布、气泡（含「我」的气泡）、聚光灯、吃瓜值、心动指数、主持光球 |
| `web/js/console.js` | 演播界面：智能体坞与「+」、生成进度卡、会话、撰写区（多选引用）、改写预览、检视器 |
| `web/js/library.js` | 资产库：总览（模板 → 原片 → 生成），标本卡片直接播放，部件、档案、详情抽屉 |
| `web/js/system.js` | 随名单重画的架构图、agent 名单、一致性检验 |
| `web/js/settings.js` | 设置：Jev、改写模型、配音状态 |

## 回归检查

- `tools/shot.py`：用无头 Edge 驱动界面并截图，覆盖实时发言、改写、会话、资产库和系统页。运行方式：

  ```bash
  uv run --with playwright python tools/shot.py http://127.0.0.1:8770/ out home live rewrite sessions library system
  ```

- `tools/validate.py`：把原片 13 句台词交给 Jev，与原片编排对比一致性，需要服务在运行。
- `tools/e2e_agents.py`：端到端跑一遍以下流程，并截图到 `out/`：
  1. 「我」一次回复两人；
  2. 「+」生成店主 agent；
  3. 新 agent 说开场白，再接导演写的一句；
  4. 资产库：总览、模板、档案；
  5. 系统页。

  结束时删掉自己生成的 agent。运行方式：

  ```bash
  uv run --with playwright python tools/e2e_agents.py http://127.0.0.1:8770/ 0 out
  ```
