# Agent 资产契约

每个店主 agent 都是一份 JSON 契约，和原片三位店主（`web/data/catalog.json` 的 `characters`）同构。表演层只认这份契约，所以生成的角色和原片角色走同一套 Jev 决策、配音和舞台：
- **决策**：Jev 用同一套问题。
- **配音**：同一个 CosyVoice3。
- **舞台**：同一个 `RIG.Actor`、同一张舞台。

生成的契约存放在 `agents/<id>.json`，服务启动时载入。「我」的设定存放在 `agents/me.json`。

## 字段

| 字段 | 内容 | 由谁决定 |
|---|---|---|
| `id` | `a` + 店名 SHA-1 前 6 位。同一家店重新生成时 id 不变，旧的先下台 | 店名 |
| `kind` | `film` / `agent` / `host`（小选）/ `user`（我） | — |
| `name` `fullName` | 称呼，例如「陈姐 · 湘里人家」：<br>• 店主一栏写了，就用店主一栏<br>• 外国口音用对应国家的名字<br>• 否则「姓 + 姐 / 叔 / 婆婆 / 伯」，或「小 + 姓」 | 规则 |
| `restaurant` `plate` `cuisine` `price` `distanceKm` `shop` | 店铺信息，从原文解析，原文保留在 `shop` 里 | 解析 |
| `rig` | 形象：`body` `gender` `age` `hair` `hairColor` `outfit` `hat` `theme` `skin` `badgeText` `accessories` | ① 形象 |
| `logo` | 店铺 logo（96 px PNG data URL），印在胸牌上 | 上传 |
| `edge` | 界面识别色：主题色提亮到能在深色界面上看清 | logo 主色 |
| `language` | catalog 里 27 种口音之一 | ② 口音 |
| `defaults` `punch` `personality` | 招牌表情、手势、动作，旁听时的默认反应，笑点表情，性格 | ③ 组件 |
| `voice` | `{timbre, speed}`：8 种音色模板之一，语速由说话能量换算 | ④ 声音 |
| `persona` `look` `signature` `voiceDesc` `keywords` `greeting` | 给 Jev 和界面看的文字：<br>• `keywords` 用来识别被点名<br>• `greeting` 是登台时说的开场白 | 模板拼合 |
| `decisions` | 四步各自的 Jev 回答（含概率、耗时、模型）。资产 → 档案页可以逐项查看 | Jev |

## 通用模板

**形象**（`web/js/rigkit.js`）
- 6 种体型：女 · 娇小 / 标准 / 高挑，男 · 矮壮 / 标准 / 高大。
- 可换部件：每种性别 4 种发型，4 种服装，4 种帽子，眼镜 / 耳环 / 小胡子，6 种肤色。
- 店铺决定的部分：
  - 主题色：logo 主色；logo 没有彩色时由 Jev 从色板里选。
  - 胸牌：直接印 logo。
- `rigkit` 生成的 SVG 与原片 `rig.js` 的 DOM 契约相同（`data-k` / `data-m` / `data-eye` / `data-brow` / `data-fx` / `data-h` / `data-arm` / `data-leg`）。它直接复用原片的 `Rig.prototype.render` 和 `RIG.Actor`，所以原片的全部资产不经改动就能用在新角色上：20 表情、26 姿势、10 动作、7+11 口型、8 特效。

**声音**（`server/voices.py`）
- 8 种音色：先用 WORLD 声码器改变原片参考音的音高和共振峰，再让 CosyVoice3 跨语种重念一句固定的普通话，得到带已知文本的提示音。
- 口音：
  - **方言**：CosyVoice3 指令，例如「请用湖南话表达。」。
  - **外国口音**：先让该音色说一句对应的外语，例如 `m_mid__ja.wav`，再用这段作提示音念中文。每个 音色 × 语言 组合第一次用时生成一次（约 6 s），之后缓存。

## 生成：店铺信息 + logo → agent

`POST /api/agents/generate`（NDJSON）依次输出：
- `start`；
- 四步，每步先发 `step run`，再发 `step done`；外国口音的第一次还会多一条 `progress`；
- 最后发 `done {agent}`。

每一步一次 Jev 请求，state 里带着前几步的结果：

1. **形象**：性别、年龄、体型、两种性别各自的发型、服装、帽子、性格，以及眼镜 / 小胡子 / 耳环（是否题）。logo 没有彩色时还要选主题色。发型按定下的性别取。
2. **口音**：在 catalog 的语言里选（选项描述就是各语言的 `region`）。
3. **组件**：招牌表情、笑点表情、手势、动作，旁听时的反应，说话能量（评分）。
4. **声音**：只在同性别的音色里选；语速 = 1.02 + 0.055 × 能量。

这一步还会：
- 外国口音没有提示音时先生成提示音；
- 改写开场白，并在后台预合成。

浏览器只测量 logo 的像素主色，不用视觉模型。没有 Jev key 或调用失败时，每一步回退到关键词规则，契约里标 `source: "rules"`。

## 我 与多选引用

- **「我」**（`kind: "user"`）是台下的顾客：
  - 没有舞台形象，气泡从舞台下方升起，店主们转向镜头。
  - Jev 不为「我」决定表情和手势，只决定每位店主听到后的反应、立场、吃瓜值。
  - 可以选一个音色，默认不配音。
- **多选引用**：一句台词可以同时回应好几条、好几个人的话。
  - 回合数据是 `quotes: [{who, text, src, ref}]`，旧会话的单个 `quote` 照常读取。
  - Jev state 里 `quoted` 是列表，每个被回应的人都标 `is_quoted`。
  - 说话人先看第一个被回应的人，台词过半时转向第二个。

## 舞台排布

- `plan.js` 导出的 `STAGE` / `X` / `EDGE` 由 `roster.js` 原地修改，所有模块无需重新导入就能看到新成员。
- 最多 8 位店主：
  - 3 人站在原片的 440 / 960 / 1480；
  - 人越多越窄、越小（4 人 0.9，6 人 0.72，8 人 0.6），名牌只留名字。
- 生成过程中，新角色先以剪影占位，四步完成后亮相、跳起挥手，再说开场白。

## 接口

| 接口 | 作用 |
|---|---|
| `GET /api/agents` | 生成的 agent（完整契约）、「我」、音色模板 |
| `POST /api/agents/generate` | `{text, logo?, colors?}`，返回 NDJSON |
| `DELETE /api/agents/{id}` | 删除生成的 agent |
| `PUT /api/agents/me` | `{name?, timbre?}`；`timbre: ""` 表示不配音 |
| `POST /api/decide` | 新增参数：<br>• `quotes`：多条引用<br>• `stage`：台上店主的顺序；不传时用全部店主 |
