> 2026-10-16 更新：用户已授权进入 Hyper3D 生成与驱动。三套 GLB、Blender 骨骼与本地网页已实现，见 [角色排练室](../../avatar-lab/README.md) 和 [当前接口](../../avatar-lab/INTEGRATION.md)。下文原有规划保留为设计背景；最新状态以样机文档和 asset-manifest.json 为准。

# 餐馆小剧场 · 3D 资产筹备包

状态：需求与设计提案 / 2D 概念待用户批准。尚未提交 Hyper3D 生成，尚未制作绑定、动画、网页或性能测试。

已确认：桌面网页优先，黑客松窗口约 48 小时，k = 3；角色为四川餐馆老板娘、粤菜馆老板、法式餐馆厨师长。“法师”为笔误。

- [标准化需求与角色设计](01-brief.md)
- [技术栈、资产数量、48 小时制作流程与验收](02-production-plan.md)
- [动画事件与团队接口](03-integration-contract.md)
- [资产和动画清单](asset-manifest.json)
- [虚构餐馆与文字测试脚本](fixtures/demo-dialogue.json)
- [2D 设定图与审阅记录](concepts/REVIEW.md)
- [图像生成提示词](concepts/prompts.json)

建议审阅顺序：先看三人合照，决定整体风格和比例；再看三张角色设定表，检查服装、身份和表情；批准后固定角色版本，进入独立单视图整理和 Hyper3D 小样。

计划中的工时、面数、包体和帧率都是制作目标，尚无实测结果。资料核对和本地检查表明：Hyper3D 工具已加载，本地 Blender 5.1.2、Node 和 FFmpeg 可用。
