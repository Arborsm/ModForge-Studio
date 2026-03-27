# Farmer Render To-Do List

基线来源：

- `docs/todo-handoff.md`
- `tmp.FarmerRenderer.cs`
- `tmp.FarmerSprite.cs`
- `.tmp_farmer_dump.cs`
- `tmp.Event.cs`

已完成：

- [x] 以原版 `FarmerRenderer.draw()` 为基线重构桌面端 farmer render 主路径。
- [x] 身体、裤子、面部皮肤、眼睛、发型、饰品、帽子、手臂的绘制顺序重新按原版分支整理。
- [x] `animationFrame.flip` 与 farmer 自身左右朝向翻转拆开处理，避免事件动画翻转时头部/帽子/眼睛错位。
- [x] 面部眼睛覆盖层改成按原版条件绘制，而不是静态贴图常驻。
- [x] `eyes` 事件命令接入 farmer 渲染状态，并按原版 `currentEyes + blinkTimer` 语义驱动。
- [x] 游泳态接入 farmer 渲染状态。
- [x] 游泳态下的半身裁剪、整体下移、头部继续绘制、水面环覆盖层已接入当前 renderer。
- [x] 浴衣/泳衣态下隐藏衬衫与帽子，保持饰品与头发分支可按原版条件继续工作。
- [x] `rotationAdjustment` 对左右朝向衬衫/饰品偏移的处理已移植。
- [x] 饰品 26 在指定帧号下的特殊 Y 偏移已补齐。
- [x] 帽子 `hairDrawType` 三种模式 `normal / cover / hide` 已接入。
- [x] 原版 `Farmer.getHair()` 的遮挡发型映射规则已移植到资源解析链路。
- [x] `HairData.json` 元数据加载已接入。
- [x] `HairData.json` 指定的替代发型贴图已接入。
- [x] `HairData.json` 的 `usesUniqueLeftSprite` 左向独立贴图已接入。
- [x] `HairData.json` 的 `coveredIndex` 头发遮挡替代索引已接入。
- [x] 正面 `isMask` 帽子的上下半片拆绘分支已接入。
- [x] farmer 渲染改为显式区分“外观资源”和“运行时渲染状态”。
- [x] 事件舞台完成对新版 farmer render 状态接口的接线。
- [x] `swimming` / `stopSwimming` 事件命令不再走纯 fallback，而会真实改写 farmer 渲染状态。
- [x] 项目已通过 `npm run build -w @modforge/desktop`。

待接线：

- [ ] `FarmerSprite.AnimationFrame` 的 `armOffset / xOffset / positionOffset / hideArms` 仍未从原版动画表逐帧接入当前事件舞台。
- [ ] 原版弹弓专用附加绘制分支仍未接入当前 DOM renderer。
- [ ] 原版工具态上游输入仍缺 `pauseForSingleAnimation / UsingTool / tool kind / fishing rod casting / isInBed / timeOfDay` 的真实事件态来源。

备注：

- 当前这轮已经把“已实现的 farmer render 主路径”改成按原版源码驱动，而不是继续堆叠经验性偏移。
- 剩余未勾选项主要不是贴图分层本身的问题，而是事件舞台还没有把原版 `Farmer`/`FarmerSprite` 的上游运行态完整喂给 renderer。
