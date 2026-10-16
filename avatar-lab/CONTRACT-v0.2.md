# 3D业务事件 v0.2

页面加载后先等 `window.avatarStage.state.ready`。`dispatch` 返回Promise；`filter_done` 在汇合与亮相完成后返回，`utterance` 在发言结束后返回，`user_choice` 在结果和退场后返回。顺序调用即可跑完整流程。

可直接回放交付的完整测试脚本：`const events = await fetch('/scenarios/p0-roadshow.json').then(r => r.json()); await window.avatarStage.replay(events);`。无需真实multiagent。

```js
await window.avatarStage.dispatch({
  type:'filter_done',restaurants:[
    {id:'sichuan',name:'川味小馆',pos:[.16,.65]},
    {id:'cantonese',name:'粤来茶楼',pos:[.5,.14]},
    {id:'french',name:'BONJOUR',pos:[.84,.65]}
  ]
});
await window.avatarStage.dispatch({
  type:'utterance',speaker:'sichuan',target:'french',text:'味道够劲，价格也实在。',
  emotion:'smug',gesture:'speakA',reactions:{french:'angry',cantonese:'doubt'}
});
await window.avatarStage.dispatch({type:'user_input',text:'想清淡一点',focus:'cantonese'});
await window.avatarStage.dispatch({type:'user_choice',winner:'cantonese'});
```

角色短ID与 `sichuan_owner`、`cantonese_owner`、`french_chef` 都可用。k固定为3，坐标为0–1的归一化地图坐标，映射到当前风格化街道。模型门面位置固定，传入位置应处于可行走区域；不包含任意真实地图的导航或碰撞规划。

本地裸事件会自动补齐 `eventId/sessionId/seq`。生产接入应显式传入这些字段，以获得可验证的去重、乱序拒绝和跨会话隔离。`utterance` 可显式指定 `turnId`，未指定时使用eventId；取消后的同turnId迟到事件会拒绝。`session.start` 使用新的sessionId清理旧表演，并回到需求阶段。

口型可随utterance传入：

```js
{type:'utterance',speaker:'french',text:'你好。',audio_url:'/audio/french.wav',
 visemes:[{t:0,shape:'X'},{t:.12,shape:'B'},{t:.3,shape:'D'},{t:.65,shape:'X'}]}
```

九种shape：X/A/B/C/D/E/F/G/H；t为相对音频开始的秒数，必须非负、递增。没有visemes时按音量在X/B/C/D之间兜底；没有audio_url时只显示逐字文字和动作，保留表情嘴。示例时间戳仅演示格式，不是这段音频的准确对齐数据。

音频仍限制为同页面 `/audio/` 中的WAV/MP3/OGG。接入真实供应商时应增加明确的可信来源和缓冲适配器；本轮没有扩大音频来源或引入实时语音网络服务。

表情枚举：neutral、smile、smug、disdain、shocked、angry、embarrassed、overjoyed、disappointed、laugh、warm、mysterious、provocative、hurt、thinking、doubt、agree、defiant。旧版welcome/confident/curious/skeptical等名称有兼容映射。

动作枚举：idle、listen、speakA、speakB、emerge、run、arrive、point、recoil、celebrate、disappointed、stomp、scratch、signature、entrance；另保留wave/nod/disagree/present。

`state`公开phase(0–5)、scene、winner、speaking、audioTime、环境加载状态、各角色表情/动作/嘴型。输出事件通过 `window.addEventListener('avatar-stage', e => …)` 监听：phase.changed、actors.gathered、actor.introduced、stage.ready、speech.started/ended/cancelled、user.preference、user.selected、actor.exited、story.completed等。

用户追问当前由本地规则回答，选择结果来自用户操作，不是智能体生成的推荐结论。真实智能体接入后，应由上层消费 `user.preference` 并发出后续utterance，替换本地followup规则。

旧的细粒度 `actor.speak/react/move/gaze`、`turn.cancel` 和 `selection.confirm` 继续保留；原说明见INTEGRATION.md。单次 `turn.cancel` 仅取消指定语音，界面「打断当前表演」会取消整个编排；`reset()` 会回到地图需求阶段。
