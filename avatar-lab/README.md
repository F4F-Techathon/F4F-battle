# 今晚吃谁 · 3D 路演 v0.2

当前入口：http://127.0.0.1:5273/ 。已补六阶段本地演示、四类业务事件、曲面五官、18表情/9嘴型、独立道具和Hyper3D高精度街道。以 [IMPLEMENTED-v0.2.md](./IMPLEMENTED-v0.2.md) 为当前实现及交付边界说明，接入方式见 [CONTRACT-v0.2.md](./CONTRACT-v0.2.md)。

运行 `npm run dev`；验证 `npm test` 和 `npm run build`。街道约25.6MB，三个人物原始GLB合计约26.5MB，桌面优先。

以下保留v0.1的原始人物生成、绑定和资产统计记录；其中旧版8表情/单张嘴描述对应原始GLB控制器，已由v0.2的曲面贴图控制器接替。

## v0.1 原始资产链路记录

本地地址：<http://127.0.0.1:5273/>。这是三位餐馆主理人的 **3D 资产与表演接口样机**；餐馆数据、卖点、对话都是测试内容，未连接真实多智能体后端。

## 已完成的实际链路

单视角角色参考 PNG → Hyper3D Rodin Gen-2.5 Medium / Quad → 原始 PBR GLB → Blender 5.1.2 归一化、骨骼、蒙皮、形变键和动作 → 带皮肤与动画的 GLB → Three.js 网页。

| 角色 | 三角形 | 骨骼 | 动作片段 | 面部形变键 | GLB 大小 |
|---|---:|---:|---:|---:|---:|
| 四川老板娘 | 35,232 | 22 | 11 | 7 | 8.20 MB |
| 粤菜老板 | 34,277 | 22 | 11 | 7 | 8.85 MB |
| 法式厨师长 | 36,094 | 22 | 11 | 7 | 9.41 MB |

这是实际导出统计，不是预估。原定 15–25k 三角形、3–6 MB 的单人预算尚未达到；当前优先桌面样机，后续需要减面与纹理压缩。生成参数 18,000 是 Quad 目标面数，不等于最终三角形数。

每个模型含 10 个共同动作类型：idle、run、arrive、wave、present、point、nod、disagree、recoil、celebrate，以及一个角色自己的 signature。共 33 个导出片段，身体动作原地播放，移动由场景根节点负责。

7 个基础形变键：MouthOpen、Smile、Frown、BrowUp、BrowDown、BlinkLeft、BlinkRight。网页组合为 8 种表情，附自动眨眼。它们是几何表面近似变形，**没有口腔、牙齿、眼球骨骼或 8 套独立音素形状**。目前的 gaze 仅轻转身体。

## 运行

```sh
cd /Users/bryan/Documents/project/hackerthon/avatar-lab
npm ci --ignore-scripts
npm run dev
```

打开本地 5273 端口。点击「开一场小辩论」观看三个模型由地图点缩放出现、小跑汇合、轮流发言；右侧可选择角色、动作、表情、文本排练和音频试听。「打断」取消当前排练和语音回合；「重置舞台」恢复站位。折叠面板可显示骨骼或独看一人。桌面优先，窄屏为上下布局。

```sh
npm test
node scripts/check-assets.mjs
npm run build
```

声音来自项目已有的 `videos/jinwan-chi-shui/assets/voice/{R1,H1,P1}.wav`，仅复制测试片段，没有修改该视频项目。浏览器音频使用实际播放时钟与音量包络驱动嘴部；文本模式不驱动嘴部。默认没有外部网络依赖或语音服务请求。

## 文件与复现

- `public/models/*.glb`：可直接用于网页的带骨骼、动作、形变模型。
- `source/*-rigged.blend`：Blender 可编辑源文件；骨骼和所有动作均保留。
- `source/{sichuan_owner,cantonese_owner,french_chef}.glb`：Hyper3D 原始生成结果。
- `source/generation-ledger.json`：生成 ID、正式结果页、参数与提示词；没有令牌或临时签名链接。
- `public/references/*.png`：建模使用的干净单视角参考。
- `public/manifest.json`：已实现的资产配置及质量边界。
- `scripts/rig_actor.py`：角色比例、关节坐标、蒙皮分区、基础面部形变、动作曲线和导出步骤。
- `reports/`：Blender 检查图、统计、GLB 结构校验和浏览器证据。
- `INTEGRATION.md`：供数据/多智能体同学接入的事件说明。

重新导出某个角色（在 avatar-lab 中运行）：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python scripts/rig_actor.py -- sichuan_owner
```

其他 ID 为 `cantonese_owner`、`french_chef`。三个模型总高含发髻/帽子统一为 1.7 m；Blender Z-up、GLB Y-up，面向 +Z。根节点在脚底中心。骨骼数含 root，手部没有独立手指骨骼。

Blender 的自动热扩散在这些生成网格上未成功，最终使用按解剖分区的权重，已修复检查时发现的指尖拉伸。袖口、肩部和围裙在大动作下仍有折叠感；这是可编辑样机，尚未达到动画电影或正式游戏的拓扑/蒙皮标准。

## 后续制作顺序

1. 由你审看角色身份、身材、动作幅度；先修改本地 rig/权重，避免无理由重复付费生成。
2. 针对肩肘、手指、围裙重拓扑和手绘权重；需要真实说话效果时补独立眼球、口腔、牙齿、下颌与音素形状。
3. 把语音供应商的时间戳转成 `cues`，再将当前单一嘴部开放度替换成正式 viseme 映射。
4. 接真实餐馆证据与回合编排；接流式音频需新增缓冲和中断适配器，本版只支持完整音频文件。
5. 减面、纹理压缩和真实目标设备性能测试。当前舞台是程序化微缩场景，不是最终高精度餐馆环境。
