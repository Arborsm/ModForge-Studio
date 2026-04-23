# 事件编辑器 V2 实施方案 TODO

## Phase 1: 基础设施层

- [x] 1.1 创建 `lib/events/commandSchema.ts` — CommandSchema 类型定义
- [x] 1.2 创建 `lib/events/commandSchemaRegistry.ts` — Schema 注册表 + 查询 API
- [x] 1.3 创建 `lib/events/rawSerializer.ts` — args[] → raw string 反向序列化
- [x] 1.4 创建 `lib/events/templateRenderer.ts` — Template → 结构化渲染描述
- [x] 1.5 创建 `lib/events/editorStore.ts` — Zustand 状态管理
- [x] 1.6 为高频命令编写 Schema（60+ 条命令已注册）

## Phase 2: 核心 UI 组件

- [x] 2.1 创建 `components/event-workflow/ParamPill.tsx` — 参数胶囊（8 种控件变体）
- [x] 2.2 创建 `components/event-workflow/ParamPopover.tsx` — ~~参数编辑器浮层~~（取消：ParamPill 已覆盖所有编辑场景，无需独立浮层）
- [x] 2.3 创建 `components/event-workflow/ScriptCard.tsx` — 剧本卡片（标签+编号+自然语言句子）
- [x] 2.4 创建 `components/event-workflow/DialogueLine.tsx` — ~~对话台词块~~（取消：ScriptCard 模板渲染已覆盖对话场景）
- [x] 2.5 创建 `components/event-workflow/ScriptTimeline.tsx` — 流式时间轴（卡片列表+间隙插入）
- [x] 2.6 创建 `components/event-workflow/ScriptEditor.tsx` — 右侧剧本编辑器容器

## Phase 3: 编辑器容器重写

- [x] 3.1 重写 `EventPatchEditor.tsx` — 改为 70/30 布局
- [x] 3.2 创建 `components/event-workflow/SceneSetupBar.tsx` — 顶部场景设置条
- [x] 3.3 创建 `components/event-workflow/EventSelector.tsx` — 事件选择下拉

## Phase 4: 舞台联动增强

- [x] 4.1 创建 `components/event-workflow/StagePathOverlay.tsx` — 地图路径/轨迹渲染（SVG，支持 move/warp/offset/advancedMove 路径，按 actor 分色，命令选中高亮）
- [x] 4.2 创建 `components/event-workflow/ActorSprite.tsx` — 地图角色精灵（带动画状态、表情、朝向、选中高亮）
- [x] 4.3 创建 `components/event-workflow/PickModeOverlay.tsx` — Pick Mode 视觉反馈
- [x] 4.4 增强 `EventStagePreview.tsx` — 集成 Pick Mode（路径渲染、角色移动动画可在后续迭代中增强）

## Phase 5: 命令添加器

- [x] 5.1 创建 `components/event-workflow/CommandPalette.tsx` — 智能指令添加器

## Phase 6: Schema 填充

- [x] 6.1 为高频命令补充 Schema（60+ 条命令已注册，剩余命令可在使用中逐步补充）
- [x] 6.2 为可枚举参数添加选项列表（角色 40+、地图 50+、音乐 30+、音效 100+、表情/帧/方向等）

## Phase 7: 清理与集成

- [x] 7.1 废弃 `EventCommandPipeline.tsx`（已从新布局中移除，但保留文件供参考）
- [x] 7.2 清理旧 Properties Panel 代码（已替换为 ScriptEditor）
- [x] 7.3 运行测试，修复 TypeScript 错误（仅剩 WorkflowModeShell.tsx 的 2 个预存错误）
- [x] 7.4 更新设计文档中的实现细节
