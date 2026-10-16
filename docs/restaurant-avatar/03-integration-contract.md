# 表演事件接口草案 v0.1

状态：完整规划仍待与框架成员对齐；已实现子集及限制见 [当前样机接口](../../avatar-lab/INTEGRATION.md)。接口使后台只描述角色意图，不直接操纵骨骼角度。

## 1. 领域对象

- restaurantId：数据方的餐馆标识，与具体 avatar 造型分离。
- actorId：本版本三种人物实例：sichuan_owner / cantonese_owner / french_chef。
- sessionId：一次筛选和讨论；开始新 session 时清理旧角色状态。
- turnId：一次完整发言，音频、口型、字幕、情绪事件归属同一 turn。
- eventId + seq：幂等去重和排序。重复消息不重复表演；已取消 turn 的迟到事件丢弃。

## 2. 后台 → 视觉层

事件包括 session.start、actors.spawn、actor.move、actor.speak、actor.react、actor.gaze、turn.cancel、host.summary、selection.confirm、session.reset。夹具中的 user.preference 表示页面向编排层提交用户新增条件；它是反向输入，不直接作为角色动作执行。

actor.speak 的输入示例：

```json
{
  "version": "0.1",
  "eventId": "demo-event-004",
  "sessionId": "demo-session",
  "seq": 4,
  "type": "actor.speak",
  "actorId": "sichuan_owner",
  "restaurantId": "fictional-sichuan",
  "turnId": "turn-01",
  "payload": {
    "text": "想吃得热闹一点，我这边很合适；你们今天更想聚餐，还是安静聊一会儿？",
    "emotion": { "name": "welcome", "intensity": 0.6, "transitionMs": 200 },
    "gesture": "present",
    "gazeTarget": "user",
    "speech": { "mode": "text-preview", "estimatedDurationMs": 6500 },
    "evidenceIds": ["fictional-sichuan-environment"]
  }
}
```

音频版本使用 speech.mode = audio，增加 audioUrl 或已解码的 audio handle，并可附带 cues 数组。每个 cue 形如 {"offsetMs": 120, "durationMs": 90, "viseme": "MBP", "weight": 0.9}。offsetMs 相对于本 turn 音频开始；供应商的纳秒/ticks 等单位须在适配器转换。纯文本 estimatedDurationMs 不用于声称精准对口型。

实时流增加 chunkSeq、chunkStartOffsetMs、isLastChunk。实际音频缓冲计划决定播放起点；网络抵达不是口型时钟。暂停/恢复更新音频时间映射；新 turn 不沿用旧时钟。未指定音频供应商时，不冻结其专属字段为公共协议。

actor.react 只调表情/手势/视线，不发声，不移动嘴部到说话循环。默认同一时刻一个活跃语音发言人；后台要求插话时，先取消旧 turn 再开始新 turn。

## 3. 视觉层 → 后台/页面

输出 actor.ready、actor.arrived、speech.started、speech.ended、speech.cancelled、animation.completed、asset.failed、audio.failed、user.interrupted、user.selected。所有输出回带 sessionId、actorId 及适用的 turnId/eventId。

## 4. 角色控制器

概念接口：load、enter、moveTo、playGesture、setEmotion、lookAt、speak、cancelTurn、select、reset、dispose。

配置来自 actor manifest：modelUrl、clipMap、expressionMap、visemeMap、headAnchor、handAnchors、height、stageSlot、themeColor、motionIntensity、fallbackMode。API 层验证已知 actor、枚举、字符串长度、强度范围、音频来源以及当前回合状态；未知动作回退 idle，不直接执行后台任意字符串代码。

## 5. 状态与混合

场景状态：intake → filtering → entering → debating → refining → selected。用户打断可以将 debating 转到 refining；重新搜索回 filtering。

角色状态：loading → hidden → entering → idle；idle 可以进入 speaking、reacting、selected、exiting；被取消的 speaking 回到 idle。情绪、视线和嘴部是并行控制层，不为每种组合增加新的角色状态。

优先级：资源错误/清理 > 用户中断 > 新发言 > 手动表情与反应 > idle。世界位置由路径 wrapper 写入；骨骼 clip 不改 wrapper。FaceController 是所有面部最终权重的唯一写入者。

## 6. 地图与气泡

数据方交出经纬度和 distanceMinutes；场景适配器将其映射为归一化地图坐标，再选择三条无交叉的预设路线。微缩图形距离只作示意，不能假装是精确导航距离。舞台分槽固定，镜头不随每句话大幅移动。

对话气泡锚点在头顶 headAnchor；文字采用 DOM 层，视觉上跟随 3D 人物。主气泡最多两到三行，长句分段；其他角色用短反应或表情。允许跳过、静音、展开全文。Pop-in 约 180 ms、fade-out 约 150 ms，阅读时长随文本和实际音频调整。

## 7. 集成时需确认的三件事

1. 谁维护主网页，以及是否已有 React/Three.js 技术选型。
2. 语音方能否提供准确时间戳、实际播放音频和可中断 turn；若不能，先采用标注为近似的口型。
3. 餐馆证据的唯一 ID、缺失数据表示方式和推荐理由结构。

这些待定项不阻塞 2D 审阅及单角可动样机，但会影响后续接口落地。
