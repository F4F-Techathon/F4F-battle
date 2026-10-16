# 表演接口 v0.1 · 兼容层记录

当前业务入口已升级，四类事件、阶段和嘴型以 [CONTRACT-v0.2.md](./CONTRACT-v0.2.md) 为准。以下记录原始细粒度接口；其中旧版单一MouthOpen口型说明已由v0.2曲面嘴型控制器接替。

入口 `window.avatarStage.dispatch(event)` 返回 Promise，结果 `{ok, reason?}`。发言事件的 Promise 在播放结束或被取消时完成；监听结果用 `window.addEventListener('avatar-stage', e => ...)`。该入口在本地样机页面内调用，不是已部署服务。

所有事件带 `eventId`、`sessionId`、递增整数 `seq`。角色 ID：`sichuan_owner`、`cantonese_owner`、`french_chef`。重复 eventId、过期 seq、旧 session、已取消 turn 被拒绝。音频默认只允许本页面 `/audio/` 下的 WAV/MP3/OGG 文件；要接实际供应商，应增加明确来源白名单与适配器。

```js
// 建立自己的会话；先等 window.avatarStage.state.ready === true。
await window.avatarStage.dispatch({
  type:'session.start', sessionId:'restaurant-demo', eventId:'start-1', seq:0
});
await window.avatarStage.dispatch({
  version:'0.1', type:'actor.speak', sessionId:'restaurant-demo',
  eventId:'speech-1', seq:1, actorId:'sichuan_owner', turnId:'turn-1',
  payload:{
    text:'来我屋头嘛！正宗川菜，麻辣鲜香，人均才八十五！',
    emotion:{name:'welcome', intensity:0.8}, gesture:'present',
    speech:{mode:'audio', audioUrl:'/audio/sichuan.wav'}
  }
});
```

单次发言仅有一个活跃语音角色；新发言会取消前一回合。语音使用实际播放状态，不根据文字估算发声。`text-preview` 模式可传 `estimatedDurationMs`（限制为 1.5–15 秒），仅用于字幕和手势。

| 事件 | payload / 备注 |
|---|---|
| session.start / session.reset | 使用新 sessionId，清理当前表演并回到站位 |
| actors.spawn | 三位从地图点出现并汇合；当前固定 k=3 |
| actor.move | `{position:[x,y,z], durationMs:1800}`；坐标限制绝对值 ≤5m |
| actor.speak | text、emotion、gesture、speech；需要 turnId |
| actor.react | `{emotion:{name:'skeptical',intensity:.6},gesture:'disagree'}` |
| actor.gaze | `{target:'left'\|'right'\|'user'}`；当前只轻转身体 |
| turn.cancel | 指定 turnId；立即停止当前语音并拒绝该 turn 迟到事件 |
| selection.confirm | 指定 actorId，播放庆祝并发出 user.selected |

输出 `actor.ready`、`actor.arrived`、`speech.started`、`speech.ended`、`speech.cancelled`、`animation.completed`、`asset.failed`、`audio.failed`、`user.selected`。声音取消后 `state.speaking === null`。`window.avatarStage.cancel()` 是本地一键打断；`state` 供只读诊断。

`speech.cues` 可选：`[{offsetMs:120,durationMs:90,viseme:'A',weight:.9}]`。时间相对于音频的 `currentTime`。可接受 rest、MBP、A、EI、O、UW、FV、L，但**本版把这些映射到同一个 MouthOpen 的不同开放度，不能称为音素级口型**。未传 cues 时使用音量包络。当前演示音频没有准确音素时间戳。

未实现：分块流式音频、真实经纬度路线、host.summary、user.preference 后端处理、餐馆证据检索、眼球追视、正式推荐决策。不要直接把规划文档中的全部事件当作当前实现。

前端仅把文本写入 textContent；文本上限 2000 字，手动输入上限 180 字，未知手势回退 idle。前端收到的 restaurantId/evidenceIds 可以随业务层保留，但此样机不验证证据真实性。
