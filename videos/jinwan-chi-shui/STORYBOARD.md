---
format: 1920x1080
duration: 86s
message: "让餐馆吵一架，你只管吃瓜：每家餐馆一个角色 agent，轮番推销、互相拆台，帮你治好选择困难"
arc: 选择困难 → 无形象 agent 收集模糊需求 → 地图筛选 top-3 → 角色集结 → 路演互怼 → 吃瓜中发现潜在需求 → 选定预订 → 片尾
audience: 黑客松评委与现场观众
mode: autonomous
---

## Frame 1 — 选择困难

- scene: 餐馆卡片三列高速滚动，“今晚吃什么？”压字，“选择困难”印章砸下
- duration: 4.2s
- transition_in: cut
- status: animated
- src: index.html#sc-hook
- rules: waterfall-entry, kinetic-beat-slam, motion-blur-streak

几百张餐馆卡片同时滚动，制造信息过载；印章落下后画面虚化，中间亮起 agent 光球。

## Frame 2 — 无形象 agent 收集需求

- scene: 呼吸光球 + 聊天面板；光球随语音包络起伏；需求从消息里飞成标签卡
- duration: 10.6s
- transition_in: crossfade
- status: animated
- src: index.html#sc-agent
- voiceover: O1, O2a
- rules: spring-pop-entrance, ambient-glow-bloom, gsap-effects(typewriter), sine-wave-loop

## Frame 3 — 小镇地图筛选

- scene: 星露谷式小镇；图钉落下；三轮筛选（3 公里 / 氛围 / 人均），计数 128→37→9→3
- duration: 8.0s
- transition_in: anchored panel morph (聊天面板收成侧栏)
- status: animated
- src: index.html#sc-agent
- voiceover: O2b
- rules: spring-pop-entrance, svg-path-draw, counting-dynamic-scale, viewport-change

## Frame 4 — 角色集结

- scene: 三个图钉炸开弹出角色，互看对视，沿小路跑到中心路演帐篷，镜头推进帐篷门
- duration: 8.6s
- transition_in: cut-on-action
- status: animated
- src: index.html#sc-agent
- rules: spring-pop-entrance, viewport-change, motion-blur-streak

## Frame 5 — 路演开场

- scene: 幕布拉开、三束聚光、木牌名牌依次弹出、吃瓜值与心动指数行情条
- duration: 5.8s
- transition_in: curtain (registry curtain-reveal 改色)
- status: animated
- src: index.html#sc-stage
- rules: curtain-reveal, spring-pop-entrance, stat-bars-and-fills

## Frame 6 — 推销与互怼

- scene: 11 句台词；头顶 3D 气泡逐字打出；被怼者震惊/流汗/生气，拆台者坏笑；行情条涨跌；agent 洞察卡
- duration: 37s
- transition_in: none (continuous)
- status: animated
- src: index.html#sc-stage
- voiceover: R1 H1 R2 P0 P1 H2 P2 R3 P3 O3 R4 H3 P4
- rules: spring-pop-entrance, depth-of-field-blur, counting-dynamic-scale, particle-burst

## Frame 7 — 选定与预订

- scene: 光标点选蓉姐、彩带、胜者欢呼、落选者嘟嘴与祝福、预订卡片
- duration: 6.4s
- status: animated
- src: index.html#sc-stage
- voiceover: O4
- rules: cursor-click-ripple, particle-burst, spring-pop-entrance

## Frame 8 — 片尾

- scene: 「今晚吃谁？」立体字标，三个角色从下方探头，标语
- duration: 5.6s
- transition_in: crossfade
- status: animated
- src: index.html#sc-end
- rules: 3d-text-depth-layers, spring-pop-entrance
