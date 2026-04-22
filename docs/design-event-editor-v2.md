# ContentPatcher 事件视觉编辑器设计方案 (V2.0)

> 基于当前代码架构 (`apps/desktop/src/lib/events/`, `apps/desktop/src/components/event-workflow/`) 与「从写代码到编剧本」设计理念的融合重构方案。

---

## 1. 核心设计理念

### 1.1 从「写代码」到「编剧本」

当前编辑器的核心体验仍偏向「参数表单」——开发者需要记住 `move Abigail 0 2 2` 中每个位置的语义（方向编码 0/1/2/3、目标坐标）。新版本的目标是将这些抽象的指令转化为具有叙事感的自然语言流：

```
[Abigail 👤] 向 [下 ⬇️] 移动 [2] 格
```

### 1.2 设计原则

| 原则 | 当前状态 | 目标状态 |
|------|---------|---------|
| **数据驱动** | 硬编码在 `CommandEditor` 的 `switch(command.command)` 中 | 一切 UI 由 `CommandSchema` 定义，新增命令只需改 Schema |
| **所见即所得** | 舞台与命令编辑器分栏，舞台仅展示初始状态 | 舞台实时反映当前选中/编辑的命令效果 |
| **低认知负担** | 方向用数字 0-3，坐标手动输入 | 方向用可视化箭头，坐标支持地图拾取 |
| **流式排版** | 卡片式垂直堆叠，间距大 | 紧凑剧本流，类似 Notion/Timeline 混合体验 |

---

## 2. 系统架构与数据模型

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer (React)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ StageView   │  │ ScriptEditor │  │ CommandPalette      │ │
│  │ (70%)       │  │ (30%)        │  │ (Overlay)           │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                 Schema Layer (Data-Driven)                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ CommandSchemaRegistry → TemplateRenderer → ParamPill    │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│              Domain Layer (保留并增强现有代码)                 │
│  ┌──────────┐  ┌─────────────┐  ┌────────────┐  ┌────────┐ │
│  │ parser.ts│  │commandCatalog│  │commandSummary│  │types │ │
│  │(解析引擎) │  │(命令分类)    │  │(可视化摘要)  │  │(类型) │ │
│  └──────────┘  └─────────────┘  └────────────┘  └────────┘ │
├─────────────────────────────────────────────────────────────┤
│              Runtime Layer (保留现有代码)                      │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │eventStage*   │  │useEventStage │  │EventStageWorkspace │  │
│  │(播放引擎)    │  │Workspace     │  │(只读预览)          │  │
│  └──────────────┘  └─────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 指令定义 Schema (新增)

Schema 是本方案最核心的新增层。它将取代 `CommandEditor` 中硬编码的 `switch-case`，成为所有命令 UI 的单一数据源。

```typescript
// lib/events/commandSchema.ts

export type UIControlType =
  | 'text'           // 单行文本
  | 'textarea'       // 多行文本（对话内容）
  | 'number'         // 数字
  | 'npc_selector'   // NPC 头像选择器（下拉 + 头像）
  | 'tile_picker'    // 地图瓷砖拾取器（点击后进入 Pick Mode）
  | 'direction'      // 方向选择（0/1/2/3 的可视化切换）
  | 'emote'          // 表情选择器（图标网格）
  | 'music'          // 音乐选择（支持预览）
  | 'sound'          // 音效选择（支持预览）
  | 'toggle'         // 布尔开关
  | 'choice'         // 选项列表（question 专用）
  | 'color_rgb'      // RGB 颜色（ambientLight 等）
  | 'raw'            // 原始文本（高级模式）

export type TemplateItem =
  | { type: 'text'; value: string }
  | { type: 'param'; index: number; label?: string; ui: UIControlType; placeholder?: string }
  | { type: 'newline' }  // 换行（复杂命令的参数分组）

export interface CommandSchema {
  key: string                    // 命令名，如 'move'
  label: string                  // 显示名，如 '角色移动'
  labelZh: string                // 中文显示名
  category: CommandCategory      // 分类
  color: SemanticColor           // 语义色
  icon: string                   // Lucide 图标名
  template: TemplateItem[]       // 自然语言模板
  // 高级：用于舞台联动的元数据
  stageMeta?: {
    affectsActorPosition?: boolean   // 是否影响角色位置（move/warp）
    affectsCamera?: boolean          // 是否影响镜头（viewport）
    affectsActorEmotion?: boolean    // 是否触发表情（emote）
    renderPath?: boolean             // 是否在地图上渲染路径
  }
}

export type CommandCategory =
  | 'dialogue'   // 对话类：speak, splitSpeak, message
  | 'movement'   // 移动类：move, warp, faceDirection, jump, speed
  | 'visual'     // 视觉类：emote, fade, screenFlash, glow, ambientLight
  | 'audio'      // 音频类：playMusic, playSound, stopMusic
  | 'logic'      // 逻辑类：fork, switchEvent, question, pause, end
  | 'scene'      // 场景类：changeLocation, viewport, addTemporaryActor
  | 'item'       // 物品类：addItem, removeItem, money, friendship
  | 'animation'  // 动画类：animate, stopAnimation, showFrame
  | 'other'      // 其他

export type SemanticColor =
  | 'blue'       // dialogue
  | 'purple'     // movement
  | 'orange'     // logic
  | 'pink'       // visual
  | 'green'      // audio
  | 'cyan'       // scene
  | 'yellow'     // item
  | 'red'        // animation
  | 'gray'       // other
```

#### Schema 示例：`move` 命令

```typescript
{
  key: 'move',
  label: 'Move',
  labelZh: '角色移动',
  category: 'movement',
  color: 'purple',
  icon: 'Move',
  template: [
    { type: 'text', value: '移动' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector' },
    { type: 'text', value: '向' },
    { type: 'param', index: 2, label: '方向', ui: 'direction' },
    { type: 'text', value: '移动' },
    { type: 'param', index: 3, label: '距离', ui: 'number', placeholder: '格数' },
    { type: 'text', value: '格，最终面向' },
    { type: 'param', index: 4, label: '朝向', ui: 'direction' },
  ],
  stageMeta: { affectsActorPosition: true, renderPath: true }
}
```

#### Schema 示例：`speak` 命令

```typescript
{
  key: 'speak',
  label: 'Speak',
  labelZh: '说话',
  category: 'dialogue',
  color: 'blue',
  icon: 'MessageSquareText',
  template: [
    { type: 'param', index: 1, label: '发言人', ui: 'npc_selector' },
    { type: 'text', value: '说：' },
    { type: 'param', index: 2, label: '内容', ui: 'textarea', placeholder: '输入对话内容...' },
  ],
  stageMeta: { affectsActorEmotion: false }
}
```

#### Schema 示例：`warp` 命令

```typescript
{
  key: 'warp',
  label: 'Warp',
  labelZh: '传送',
  category: 'movement',
  color: 'purple',
  icon: 'MapPin',
  template: [
    { type: 'text', value: '将' },
    { type: 'param', index: 1, label: '角色', ui: 'npc_selector' },
    { type: 'text', value: '传送至' },
    { type: 'param', index: 2, label: 'X', ui: 'tile_picker' },
    { type: 'text', value: ',' },
    { type: 'param', index: 3, label: 'Y', ui: 'tile_picker' },
  ],
  stageMeta: { affectsActorPosition: true }
}
```

### 2.3 数据兼容性

**核心原则：Schema 只描述 UI，不改变底层数据结构。**

现有数据结构完全保留：

- `EventScript` — 事件脚本（`rawScript` / `rawSegments` / `scene` / `commands`）
- `EventCommand` — 单条命令（`raw` / `args` / `kind` / `title` / `detail`）
- `EventSceneSetup` — 场景配置（`musicCue` / `cameraInstruction` / `actors`）
- `ParsedEventAsset` — 解析后的资源对象

Schema 层在**渲染时**将 `EventCommand.args` 映射为 UI 控件，在**编辑时**将 UI 控件的值写回 `args`，最后通过 `args.join(' ')` 生成 `raw`。整个持久化格式与 ContentPatcher 100% 兼容。

```
原始脚本 rawScript
    ↓ parser.ts (不变)
EventScript.commands[i].args[]
    ↓ CommandSchema.template (新增映射层)
ParamPill[] + StaticText[]
    ↓ 用户编辑
更新后的 args[]
    ↓ args.join(' ') (新增反向序列化)
更新后的 raw
    ↓ 持久化到 EditData patch (不变)
```

### 2.4 状态管理 (Zustand Store)

引入一个轻量级 Zustand Store 管理编辑器状态，替代当前散落在 `EventPatchEditor` 中的 `useState`。

```typescript
// lib/events/editorStore.ts

interface EventEditorState {
  // 当前编辑的事件
  currentEventKey: string | null
  currentScript: EventScript | null

  // 选中的命令
  selectedCommandId: string | null
  hoveredCommandId: string | null

  // 舞台交互状态
  pickMode: {
    active: boolean
    targetParam: { commandIndex: number; argIndex: number } | null
    pickType: 'tile' | 'actor' | null
  }

  // 播放状态（与只读预览模式复用同一套 PlaybackState）
  playback: PlaybackState | null
  isPlaying: boolean

  // UI 状态
  scriptEditorScrollY: number
  showRawScript: boolean

  // Actions
  selectCommand: (id: string | null) => void
  enterPickMode: (commandIndex: number, argIndex: number, type: 'tile' | 'actor') => void
  exitPickMode: () => void
  updateCommandArg: (commandIndex: number, argIndex: number, value: string) => void
  insertCommand: (afterIndex: number, schemaKey: string) => void
  deleteCommand: (index: number) => void
  moveCommand: (fromIndex: number, toIndex: number) => void
  togglePlayback: () => void
}
```

---

## 3. 入口流程与导航

本章节补充用户**如何到达**事件编辑器界面的完整流程，涵盖 Workspace 切换、Patch 创建、Patch 选择三个关键环节。

### 3.1 全局入口：Events Workspace

当前应用通过 `WorkspaceMode` 区分不同工作区（`mods` / `map` / `events` / `characters` / `buildings` / `items`）。`events` workspace 在 `builtInWorkspaces.ts` 中注册：

```typescript
// lib/plugins/builtInWorkspaces.ts
const eventWorkspacePlugin: WorkspacePlugin = {
  id: 'events',
  label: 'Events',
  icon: 'Calendar',
  editMode: {
    patchListFields: [
      { key: 'logName', label: 'Name' },
      { key: 'target', label: 'Target' },
      { key: 'action', label: 'Action' },
    ],
    targetPicker: () => null, // TODO
    editor: EventPatchEditor,  // ← 事件编辑器入口
  },
  serializer: { /* ... */ },
}
```

**用户操作流程**：

```
┌─────────────────────────────────────────────────────────────┐
│  WorkbenchExperience (主工作台)                              │
│                                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│  │  Mods  │ │  Map   │ │ Events │ │Chars   │ │ Items  │   │
│  │        │ │        │ │[选中]  │ │        │ │        │   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                             │
│  点击 Events Tab → setWorkspaceMode('events')               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  WorkflowModeShell (events workspace 外壳)                   │
│                                                             │
│  ┌──────────────┬─────────────────────────────────────────┐ │
│  │ PatchList    │                                         │ │
│  │ Sidebar      │  EventPatchEditor (或空状态提示)        │ │
│  │ (w-64)       │                                         │ │
│  │              │  右侧渲染 events workspace 注册的        │ │
│  │  - Patch A   │  editor 组件                             │ │
│  │  - Patch B ✓ │                                         │ │
│  │  + Add Patch │                                         │ │
│  └──────────────┴─────────────────────────────────────────┘ │
│                                                             │
│  切换 workspace 时自动 reset activePatchId                  │
└─────────────────────────────────────────────────────────────┘
```

#### 顶部导航栏的 Workspace Tabs

`WorkbenchExperience` 顶部有一排 Workspace Tabs（当前通过 `TopMenuBar` 或 `WorkspaceLayout` 的 tab bar 渲染）。用户点击 **Events** Tab 后：

1. `setWorkspaceMode('events')` 触发
2. `activeEditPatchId` 自动重置为 `null`
3. `WorkbenchExperience` 根据 `workspaceMode` 渲染对应的 `EditWorkspaceContent`
4. `EditWorkspaceContent` 通过 `getWorkspacePlugin('events')` 获取 `eventWorkspacePlugin`
5. 右侧主区域渲染 `WorkflowModeShell`，其 `children` 为 `EventPatchEditor`

### 3.2 添加 Patch 流程

用户在 Events Workspace 中点击左侧 **+ Add Patch** 按钮，唤起 `AddPatchDialog`：

```
┌────────────────────────────────────────────────────────────┐
│  Add Patch Dialog                                          │
│                                                            │
│  Step 1: Select Action                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ □ Edit Data   → 修改 JSON 数据文件                    │  │
│  │ □ Load        → 替换整个资源文件                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  (events workspace 只允许 EditData / Load 两种 action)      │
│                                                            │
│  Step 2: Select Target                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Data/Events/Town          ◀── 默认过滤出事件相关      │  │
│  │ Data/Events/Beach                                      │  │
│  │ Data/Events/Mountain                                   │  │
│  │ ...                                                    │  │
│  │ ─────────────────────                                  │  │
│  │ [ Custom Target: _____________ ]                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  点击 Add Patch → 创建 DraftPatch → 自动选中该 patch       │
└────────────────────────────────────────────────────────────┘
```

#### 当前 `AddPatchDialog` 的事件目标过滤

```typescript
// components/generated-project/AddPatchDialog.tsx
const WORKSPACE_TARGET_PREFIXES: Record<WorkspaceId, string[]> = {
  events: ['Data/Events'],  // events workspace 只显示 Data/Events/* 目标
}

const COMMON_TARGETS: Record<ActionType, string[]> = {
  EditData: [
    'Data/Events/Town',
    'Data/Events/Beach',
    'Data/Events/Mountain',
    'Data/Events/Forest',
    'Data/Events/Farm',
    // ... 共 10+ 个事件地图
  ],
}
```

**创建后的 Patch 数据结构**：

```typescript
{
  id: 'patch-1234567890-1',
  action: 'EditData',
  target: 'Data/Events/Town',
  enabled: true,
  editorState: {},          // 空状态，等待用户编辑
  targetField: undefined,
}
```

#### 设计优化建议

当前 `AddPatchDialog` 对 Events Workspace 的体验可以优化：

1. **事件目标可视化**：在目标列表旁显示对应地图的缩略图/预览，帮助用户确认选择正确的场景
2. **最近使用目标**：将用户最近编辑过的事件目标置顶
3. **快速创建模板**：提供「新建空白事件」vs「基于现有事件修改」两种模式
4. **TargetPicker 实现**：当前 `targetPicker: () => null` 是 TODO，建议实现一个可视化目标选择器，在游戏地图列表中以网格形式展示所有 `Data/Events/*` 目标

### 3.3 Patch 列表与选择

创建 Patch 后，`WorkflowModeShell` 左侧的 `PatchListSidebar` 显示该 patch，用户点击即可进入编辑器。

```
┌────────────────────────────────────────┐
│  Patch List (Events Workspace)         │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 🔍 Search patches...             │  │
│  └──────────────────────────────────┘  │
│                                        │
│  MyEventMod                            │
│  ├─ □ 修复Abigail生日事件    EditData  │
│  ├─ □ ✨ 新增沙滩剧情        EditData  │
│  │   Target: Data/Events/Beach        │
│  ├─ □ 替换医院事件           Load    │
│  │                                    │
│  └─ + Add Patch                      │
│                                        │
│  ──────────────────────────────────    │
│  [Save Draft]        [3 unsaved]      │
└────────────────────────────────────────┘
```

**当前 PatchListSidebar 字段**：
- `logName` — Patch 名称（用户自定义）
- `target` — 目标路径（如 `Data/Events/Town`）
- `action` — Action 类型（`EditData` / `Load`）

**设计优化建议**：

1. **事件预览缩略图**：在 patch 列表项右侧显示该事件舞台的微型预览（缓存最近一次渲染的地图截图）
2. **事件数量徽章**：显示该 patch 中包含多少个事件条目（entries 的 key 数量）
3. **修改状态指示**：与当前实现一致，已修改但未保存的 patch 显示圆点标记
4. **拖拽排序**：支持拖拽调整 patch 顺序（影响最终 content.json 中 Changes 数组的顺序）

### 3.4 进入编辑器后的初始状态

当用户选中一个 `EditData` patch 且 target 为 `Data/Events/*` 时，`EventPatchEditor` 被渲染，初始状态如下：

```
┌─────────────────────────────────────────────────────────────┐
│ EventPatchEditor 初始状态                                    │
│                                                             │
│  Header: Data/Events/Town  (EditData)                       │
│  Tabs: [Events] [Fields] [TextOps] [MoveEntries]           │
│                                                             │
│  ┌──────────┬──────────────────────┬──────────────┐        │
│  │ Events   │ Stage Preview        │ Properties   │        │
│  │ List     │                      │ Panel        │        │
│  │          │  "Select an event    │              │        │
│  │  (empty) │   to preview stage." │  (empty)     │        │
│  │          │                      │              │        │
│  │ + New    │                      │              │        │
│  └──────────┴──────────────────────┴──────────────┘        │
│                                                             │
│  空状态提示：                                               │
│  - 左侧："No events yet. Click + to add one."              │
│  - 中间："Select an event to preview stage."               │
│  - 右侧：根据 Tab 显示空状态                               │
└─────────────────────────────────────────────────────────────┘
```

**首次进入的引导流程（新增）**：

对于空 patch（`editorState.entries` 为空），建议增加一个**引导浮层**：

```
┌────────────────────────────────────────┐
│  欢迎使用事件编辑器                      │
│                                        │
│  从以下方式开始：                        │
│  ┌──────────────────────────────────┐  │
│  │ [+] 创建空白事件                  │  │
│  │ [📋] 从现有游戏事件复制            │  │
│  │ [📁] 导入事件脚本文件              │  │
│  └──────────────────────────────────┘  │
│                                        │
│  或者查看示例：                          │
│  ┌──────────────────────────────────┐  │
│  │ 📖 示例：简单的对话事件            │  │
│  │ 📖 示例：带分支的选择事件          │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

#### 与上层状态的数据流

```
WorkbenchExperience
    │ setWorkspaceMode('events')
    ▼
EditWorkspaceContent
    │ getWorkspacePlugin('events').editor
    ▼
WorkflowModeShell
    │ props.children = <EventPatchEditor {...editorProps} />
    ▼
EventPatchEditor
    │ patch.editorState.entries / fields / textOperations / moveEntries
    ▼
EventsEditor (内部子组件)
    │ parseEventCommands(selectedEntry) → EventScript
    ▼
EventStagePreview + EventCommandPipeline
```

**关键接口契约**（保持不变）：

```typescript
// EventPatchEditor Props (由 WorkflowModeShell 注入)
interface EventPatchEditorProps {
  patch: DraftPatch                    // 当前选中的 patch
  draft: GeneratedProjectDraft         // 整个项目的 draft 状态
  onPatchChange: (patchId, patch) => void  // 变更回调 → 上层更新
  onAddVirtualAsset: (asset) => void   // 添加虚拟资源
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  gameRootPath?: string | null         // 游戏根目录（用于加载地图 XNB）
}
```

上层通过 `onPatchChange` 将编辑器的变更写回 `DraftPatch.editorState`，最终由 `GeneratedProjectDraft` 序列化为 ContentPatcher 的 `content.json`。这一数据流在 V2 设计中完全保留。

---

## 4. UI 布局方案：70/30 沉浸式布局

### 3.1 当前布局问题

当前 `EventPatchEditor` 采用**三栏布局**：

```
┌──────────┬──────────────────────┬──────────────┐
│ Events   │ Stage Preview        │ Properties   │
│ List     │ (小，被压缩)          │ Panel        │
│ (w-44)   ├──────────────────────┤ (w-72)       │
│          │ Command Pipeline     │              │
│          │ (滚动区域小)          │              │
└──────────┴──────────────────────┴──────────────┘
```

问题：
1. 舞台区被上下分割（Stage + Pipeline），两者都太小
2. 属性面板常驻，但大部分时间空白或重复 Pipeline 中的信息
3. Events 列表占据固定宽度，可通过悬浮面板/下拉选择替代

### 3.2 新布局：70/30 沉浸舞台

```
┌────────────────────────────────────────┬──────────────────────┐
│                                        │                      │
│         STAGE VIEW (70%)               │   SCRIPT EDITOR (30%) │
│                                        │                      │
│    ┌─────────────────────────────┐    │   ┌────────────────┐ │
│    │                             │    │   │  Event Selector │ │
│    │    交互式地图 + 角色渲染      │    │   │  [Abigail] ▼   │ │
│    │                             │    │   └────────────────┘ │
│    │    ┌─────┐  ┌─────┐        │    │                      │
│    │    │ Abi │  │ Emi │        │    │   ┌────────────────┐ │
│    │    └─────┘  └─────┘        │    │   │ speak          │ │
│    │                             │    │   │ [Abigail]说:"...│ │
│    │    ═══════════════════      │    │   ├────────────────┤ │
│    │    → move 路径虚线预览       │    │   │ move           │ │
│    │    ═══════════════════      │    │   │ [Abi]向[下]移[2]│ │
│    │                             │    │   ├────────────────┤ │
│    │    ┌──────────┐             │    │   │ pause [1.0s]   │ │
│    │    │ 拾取坐标  │  ← 悬浮提示 │    │   ├────────────────┤ │
│    │    └──────────┘             │    │   │ warp           │ │
│    │                             │    │   │ [Abi]→[(12,15)]│ │
│    └─────────────────────────────┘    │   ├────────────────┤ │
│                                        │   │      ...       │ │
│  ┌────────────────────────────────┐   │   └────────────────┘ │
│  │ 🎬 ▶ ⏸ ⏮  [Grid] [Zoom] [🏠]  │   │                      │
│  └────────────────────────────────┘   │   [+ Add Command]    │
│                                        │                      │
└────────────────────────────────────────┴──────────────────────┘
```

#### 左侧舞台区 (Stage View - 70%)

复用并增强现有的 `EventStagePreview` 组件：

1. **全尺寸地图**：占据左侧全部空间，不再被 Pipeline 挤压
2. **拾取模式 (Pick Mode)**：
   - 当用户在 Script Editor 中点击一个 `tile_picker` 参数胶囊时，地图进入 Pick Mode
   - 鼠标悬停处显示 `(Tile X, Y)` 浮层
   - 点击瓦片后，坐标自动回填到对应参数，退出 Pick Mode
3. **路径预览**：
   - `move` 指令在地图上渲染虚线箭头轨迹
   - 多条 `move` 指令连接成完整行走轨迹
   - 选中某条 `move` 命令时，对应路径高亮，其他路径变淡
4. **角色位置实时同步与移动预览**：
   - Script Editor 中的命令顺序变化时，舞台实时计算角色最终位置
   - **选中命令预览**：点击某条 `move` 命令，角色在地图上**平滑移动**到该命令执行后的位置（CSS `transition: transform 0.5s cubic-bezier`）
   - **播放模式**：点击「播放」按钮，按顺序逐条执行命令，角色在地图上实时动画移动（复用 `eventStagePlayback.ts` 的 `applyMoveCommand`）
   - **单步模式**：点击「单步」按钮，只执行当前选中命令并更新角色位置
   - **重置**：点击「重置」按钮，所有角色回到场景初始位置
5. **浮动工具栏**（底部）：
   - 播放/暂停/单步/重置（复用 `useEventStageWorkspace`）
   - 网格线开关
   - 缩放滑块
   - 地图层级切换（是否显示建筑遮挡层）
   - 「回到初始位置」按钮

#### 右侧剧本编辑器 (Script Editor - 30%)

取代现有的 `EventCommandPipeline` + 右侧 Properties Panel，采用**剧本卡片**式排版：

```
┌─────────────────────────────────────┐
│ 📄 沙滩剧情 ▼              { } ⚙   │  ← Header
├─────────────────────────────────────┤
│ 🎵 Music: summer1  📷 Camera: (15,12)│  ← Scene Setup Bar
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 对话 01                         │ │  ← 分类标签 + 编号
│ │ 阿比盖尔 面向 正面 说道：        │ │  ← 自然语言句子
│ │ "嘿，你看到那个在墓地附近..."    │ │  ← 台词块（引号 + 斜体）
│ └─────────────────────────────────┘ │
│            +                        │  ← 间隙插入按钮
│ ┌─────────────────────────────────┐ │
│ │ 移动 02                         │ │
│ │ 让 阿比盖尔 向 右方 走动 4 格    │ │
│ │ 到达坐标 42, 18 。               │ │
│ └─────────────────────────────────┘ │
│            +                        │
│ ┌─────────────────────────────────┐ │
│ │ 时序 03                         │ │
│ │ 等待场景静止 1.5s 后，播放音乐   │ │
│ │ Ghost_Theme 。                   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 效果 04                         │ │
│ │ 在 阿比盖尔 头上显示表情 ❓疑惑  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 6 commands               Modified   │  ← Footer
└─────────────────────────────────────┘
```

1. **顶部事件选择器**：下拉选择当前编辑的事件（替代左侧固定 Events 列表）
2. **剧本卡片 (Script Card)**：
   - 每条命令 = 一张圆角卡片，带彩色边框（与命令语义色一致）
   - 卡片头部：左侧**分类标签**（如「对话」）+ **编号**（如「01」）
   - 卡片主体：**自然语言句子**，参数嵌入其中
   - 对话命令额外显示**台词块**：引号包裹、斜体、浅灰背景独立行
3. **参数胶囊 (Param Pill)**：
   - 不同类型参数有不同视觉样式（见 5.1 视觉规范）
   - 点击胶囊原地弹出微型 Popover
   - 修改后立即生效并同步至舞台
4. **命令间隙插入**：
   - 卡片之间的空隙区域 hover 显示 `+` 按钮
   - 点击唤起 Command Palette
5. **原始脚本切换**：
   - 底部提供「Raw」切换按钮，显示底层 `rawScript` 文本（用于高级调试）

---

## 5. 关键交互模块设计

### 4.1 参数胶囊组件 (Param Pill)

```typescript
// components/event-workflow/ParamPill.tsx

interface ParamPillProps {
  value: string
  type: UIControlType
  isActive: boolean       // 是否处于 Pick Mode 或 Popover 打开状态
  isError?: boolean       // 值是否不合法
  onClick: () => void
}
```

#### 视觉规范

参数胶囊采用**圆角按钮**风格，与剧本的自然语言流融为一体：

| 参数类型 | 视觉样式 | 示例 | 点击后行为 |
|---------|---------|------|-----------|
| `npc_selector` | 浅紫色背景 + 紫色文字 | `阿比盖尔` | 下拉列表：搜索 + 头像网格 |
| `direction` | 浅蓝色背景 + 蓝色文字 | `正面` / `右方` | 弹出 4 方向按钮组 |
| `number` | 浅蓝色背景 + 蓝色文字，等宽 | `4` | 原地变为数字输入框 |
| `tile_picker` | 浅紫色背景 + 紫色文字，下划线 | `42, 18` | 进入 Pick Mode，地图高亮 |
| `text` | 浅灰背景 + 深灰文字 | `Hello` | 原地变为输入框 |
| `textarea` | 浅灰背景，宽胶囊（截断预览） | `嘿，你看到那个...` | 弹出多行文本编辑浮层 |
| `emote` | 浅粉色背景 + 红色文字，带图标 | `❓ 疑惑` | 弹出表情图标网格 |
| `music` / `sound` | 浅青色背景 + 青色文字 | `Ghost_Theme` | 下拉列表 + 点击预览 |
| `time` | 浅蓝色背景 + 蓝色文字 | `1.5s` | 原地变为数字输入框 |

```
让 [阿比盖尔] 向 [右方] 走动 [4] 格，到达坐标 [42, 18] 。
      ↑浅紫      ↑浅蓝      ↑浅蓝        ↑浅紫下划线
```

#### 交互细节

- **Hover**：胶囊轻微上浮（`translateY(-1.5px)`）+ 阴影，边框高亮
- **Click**：
  - 简单类型（number/text/direction/emote）：原地弹出微型编辑器
  - 复杂类型（tile_picker/npc_selector）：进入对应交互模式或弹出浮层
  - 所有修改**不保存即生效**（debounced 写回 rawScript）
- **Pick Mode 状态**：对应的 `tile_picker` 胶囊脉冲边框动画（`box-shadow` 呼吸效果），提示用户「在地图上点击」

### 4.2 智能指令添加器 (Command Palette)

替代当前 `EventPatchEditor` 中的分类命令网格：

```typescript
// components/event-workflow/CommandPalette.tsx

interface CommandPaletteProps {
  anchorRect: DOMRect          // 弹出的锚点位置
  onSelect: (schemaKey: string) => void
  onClose: () => void
  contextualActor?: string     // 智能填充：上下文中的默认角色
}
```

#### 唤起方式

1. 命令间隙 hover 出现的 `+` 按钮
2. 选中命令后按 `Enter`
3. 剧本区空白处右键菜单

#### 搜索与匹配

- **模糊搜索**：支持英文命令名、中文标签、拼音前缀
  - 输入 `shuo` → 匹配 `speak / 说话`
  - 输入 `移动` → 匹配 `move / 角色移动`
- **分类标签**：顶部显示可点击的分类标签（对话/移动/视觉/音频/逻辑/场景）
- **最近使用**：最近 5 条使用的命令置顶

#### 智能填充

- 如果上一条命令的 `npc_selector` 是 `Abigail`，新命令的 `npc_selector` 默认填充 `Abigail`
- 如果上一条是 `move`，新命令如果是 `faceDirection`，自动继承同一角色
- `warp` 命令自动填充当前选中角色的位置

### 4.3 坐标与路径联动

#### 双向同步机制

```typescript
// 舞台 → 脚本
function handleStageTileClick(tileX: number, tileY: number) {
  if (pickMode.active && pickMode.targetParam) {
    const { commandIndex, argIndex } = pickMode.targetParam
    updateCommandArg(commandIndex, argIndex, String(tileX))
    // 如果下一个参数也是 tile_picker (Y 坐标)
    if (isNextArgTilePicker(commandIndex, argIndex)) {
      updateCommandArg(commandIndex, argIndex + 1, String(tileY))
    }
    exitPickMode()
  }
}

// 脚本 → 舞台
function handleCommandSelect(commandId: string) {
  const cmd = findCommandById(commandId)
  if (cmd.schema.stageMeta?.renderPath) {
    stage.highlightPathForCommand(cmd.index)
  }
  if (cmd.schema.stageMeta?.affectsActorPosition) {
    stage.previewActorPositionAfterCommand(cmd.index)
  }
}
```

#### 路径渲染

- `move` 指令在地图上渲染虚线箭头（Canvas 或 SVG overlay）
- 箭头起点 = 角色当前位置（考虑前面所有命令执行后的位置）
- 箭头终点 = move 的目标位置
- 多条 move 指令连接成完整轨迹
- 选中某条 move 命令时，对应路径段高亮为实线 + 发光效果

### 4.4 批量逻辑操作

#### 多选与块操作

- **框选**：按住 Shift 点击首尾命令，或按住 Cmd/Ctrl 逐条多选
- **块移动**：拖拽选中的命令块上下移动（改变执行顺序）
- **批量删除**：Delete 键删除所有选中命令
- **批量复制**：Cmd/Ctrl + C / V 复制命令块
- **批量坐标偏移**：选中多个 `move`/`warp` 命令，统一平移 X/Y 坐标（开发调试用）

### 4.5 场景设置面板

场景设置（音乐、镜头、角色列表）不再放在右侧 Properties Panel，而是：

1. **音乐**：在 Script Editor 顶部显示一个小型播放器控件，显示当前 `musicCue`
2. **镜头**：在舞台区用半透明矩形框表示当前镜头区域，支持拖拽调整
3. **角色列表**：折叠在 Script Editor 顶部，显示为横向头像条，点击头像快速定位到该角色的第一条命令

---

## 6. 视觉规范与语义化

### 5.1 色彩编码 (Semantic Color)

为不同类型的指令赋予特定的视觉标签，增强扫描效率：

| 语义色 | 类型 | 命令示例 | CSS Variable |
|--------|------|---------|-------------|
| 🔵 Blue | Dialogue | speak, splitSpeak, message | `--semantic-dialogue` |
| 🟣 Purple | Movement | move, warp, faceDirection, jump | `--semantic-movement` |
| 🟠 Orange | Logic | pause, fork, switchEvent, end, question | `--semantic-logic` |
| 🩷 Pink | Visual | emote, fade, screenFlash, glow, ambientLight | `--semantic-visual` |
| 🟢 Green | Audio | playMusic, playSound, stopMusic | `--semantic-audio` |
| 🔴 Red | Animation | animate, stopAnimation, showFrame | `--semantic-animation` |
| 🟡 Yellow | Item | addItem, removeItem, money, friendship | `--semantic-item` |
| 🔘 Gray | Other | 其余所有 | `--semantic-other` |

#### 应用位置

| 元素 | 应用方式 |
|------|---------|
| **剧本卡片边框** | 卡片整体边框色（hover 加深） |
| **分类标签** | 标签背景 + 文字色 |
| **参数胶囊** | 背景色 + 边框色 + 文字色（见下表） |
| **舞台路径** | `move` 实线轨迹，`warp` 虚线传送线 |
| **台词块** | 左侧 3px 竖线（dialogue 色） |

#### 参数胶囊配色

```css
/* NPC / 角色名 */
--pill-npc-bg: #ede9fe;
--pill-npc-text: #5b21b6;
--pill-npc-border: #c4b5fd;

/* 数值 / 方向 / 时间 */
--pill-value-bg: #dbeafe;
--pill-value-text: #1e40af;
--pill-value-border: #93c5fd;

/* 坐标 */
--pill-coord-bg: #ede9fe;
--pill-coord-text: #5b21b6;
--pill-coord-border: #c4b5fd;

/* 普通文本 */
--pill-text-bg: #f3f4f6;
--pill-text-text: #374151;
--pill-text-border: #d1d5db;
```

### 5.2 字体与排版

- **自然语言部分**：系统无衬线字体（`font-sans: "Noto Sans SC", "PingFang SC", system-ui`），14px，行高 2.0
- **参数胶囊内部**：等宽字体 `JetBrains Mono`，13px，保持数值对齐的专业感
- **剧本卡片**：
  - 圆角 `14px`，白色背景（`--bg-elevated`），`1.5px` 彩色边框
  - 卡片内边距 `16px 18px`，卡片间距 `14px`
  - hover 时轻微上浮（`translateY(-1px)`）+ 阴影
  - 选中时外框高亮（`box-shadow: 0 0 0 3px var(--accent-soft)`）
- **台词块**：
  - 引号包裹（`"..."`），斜体，浅灰背景
  - 左侧 3px 竖线（语义色），圆角 `10px`
  - 与上方句子间距 `10px`
- **命令间距**：
  - 同类型命令之间：标准间距（14px）
  - 间隙插入按钮：默认隐藏，hover 时显示 `+` 圆形按钮

### 5.3 头像标识

- NPC 胶囊左侧显示对应 Portrait 的 16x16 缩略图
- 农民角色显示农民默认头像
- 未知角色显示默认占位图标

---

## 7. 组件拆分与职责

### 6.1 新增/重构组件清单

```
components/event-workflow/
├── EventPatchEditor.tsx          # 主容器（重写：改为 70/30 布局）
├── EventStagePreview.tsx         # 舞台预览（增强：路径渲染、角色移动动画、Pick Mode）
├── ScriptEditor.tsx              # 新增：右侧剧本编辑器容器
│   ├── ScriptCard.tsx            # 新增：单条命令的剧本卡片（标签+编号+自然语言句子+台词块）
│   ├── ScriptTimeline.tsx        # 新增：流式时间轴（卡片列表+间隙插入）
│   ├── ParamPill.tsx             # 新增：参数胶囊（8 种控件变体）
│   └── ParamPopover.tsx          # 新增：参数编辑器浮层
├── CommandPalette.tsx            # 新增：智能指令添加器
├── CommandSchemaRenderer.tsx     # 新增：Template → React 的通用渲染器
├── StagePathOverlay.tsx          # 新增：地图上的路径/轨迹渲染层（SVG）
├── ActorSprite.tsx               # 新增：地图角色精灵（带动画状态）
├── PickModeOverlay.tsx           # 新增：Pick Mode 的地图视觉反馈
├── SceneSetupBar.tsx             # 新增：顶部场景设置条（音乐/镜头/角色）
└── EventSelector.tsx             # 新增：事件选择下拉

lib/events/
├── types.ts                      # 保留现有
├── parser.ts                     # 保留现有
├── commandCatalog.ts             # 保留现有，扩展为 Schema 数据源
├── commandSummary.ts             # 保留现有（向后兼容）
├── commandSchema.ts              # 新增：CommandSchema 定义与 130+ 命令的 Schema 注册
├── commandSchemaRegistry.ts      # 新增：Schema 注册表 + 查询 API
├── templateRenderer.ts           # 新增：Template → 结构化渲染描述
├── editorStore.ts                # 新增：Zustand 状态管理
└── rawSerializer.ts              # 新增：args[] → raw string 反向序列化
```

### 6.2 TemplateRenderer 核心逻辑

```typescript
// lib/events/templateRenderer.ts

import type { CommandSchema, TemplateItem, UIControlType } from './commandSchema'

export type RenderedNode =
  | { type: 'static'; text: string }
  | { type: 'param'; index: number; label: string; control: UIControlType; value: string; placeholder?: string }

export function renderTemplate(
  schema: CommandSchema,
  args: string[],
  locale: 'zh-CN' | 'en-US' = 'en-US'
): RenderedNode[] {
  return schema.template.map((item): RenderedNode => {
    if (item.type === 'text') {
      return { type: 'static', text: item.value }
    }
    return {
      type: 'param',
      index: item.index,
      label: item.label ?? `Arg ${item.index}`,
      control: item.ui,
      value: args[item.index] ?? '',
      placeholder: item.placeholder,
    }
  })
}
```

---

## 8. 技术实现建议

### 7.1 状态管理：Zustand

使用 Zustand 替代当前散落在各组件中的 `useState`：

```typescript
// 单一 Store 管理所有编辑器状态
const useEventEditorStore = create<EventEditorState>((set, get) => ({
  // ... state
  updateCommandArg: (commandIndex, argIndex, value) => {
    const script = get().currentScript
    if (!script) return
    const newCommands = [...script.commands]
    const cmd = { ...newCommands[commandIndex] }
    const newArgs = [...cmd.args]
    newArgs[argIndex] = value
    cmd.args = newArgs
    cmd.raw = serializeRaw(newArgs)  // 反向序列化
    newCommands[commandIndex] = cmd
    // 同步更新 EventScript
    set({ currentScript: { ...script, commands: newCommands } })
    // 触发 patch 变更（通过 callback 通知上层）
  },
}))
```

### 7.2 Schema 解析层

通用渲染组件循环遍历 `template` 数组，根据 `type` 动态分发：

```tsx
// components/event-workflow/ScriptCard.tsx

function ScriptCard({ command, schema, index }: { command: EventCommand; schema: CommandSchema; index: number }) {
  const nodes = renderTemplate(schema, command.args, locale)
  const isDialogue = schema.category === 'dialogue'

  return (
    <div className="script-card" data-kind={schema.category}>
      <div className="card-header">
        <span className={`card-tag ${schema.category}`}>{schema.labelZh}</span>
        <span className="card-number">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="card-sentence">
        {nodes.map((node, i) =>
          node.type === 'static' ? (
            <span key={i}>{node.text}</span>
          ) : (
            <ParamPill
              key={i}
              value={node.value}
              kind={getPillKind(node.control)}
              onClick={() => handleParamClick(command.index, node.index, node.control)}
            />
          )
        )}
      </div>
      {isDialogue && command.text && (
        <div className="dialogue-line">{command.text}</div>
      )}
    </div>
  )
}
```

### 7.3 舞台联动实现

舞台联动复用现有 `eventStagePlayback.ts` 的播放引擎，但改为「预览模式」：

- **静态预览**：Script Editor 滚动时，根据当前视口内的命令计算角色「应该在哪里」，舞台显示最终位置（不播放动画）
- **选中预览**：点击某条 `move` 命令时，角色在地图上**平滑移动**到该命令执行后的位置
  - 使用 CSS `transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)` 实现动画
  - `applyMoveCommand` 计算目标 Tile 坐标，`ActorSprite` 组件将其映射为 `translate()`
- **播放模式**：点击工具栏「播放」按钮，按顺序逐条执行命令
  - 复用 `continuePlayback` 逻辑，每执行一条命令后 `await delay(durationMs)`
  - 角色移动时，路径线段实时高亮当前段
- **单步模式**：点击「单步」按钮，只执行当前选中命令并更新角色位置
- **重置**：点击「重置」按钮，所有角色 `transform` 瞬间回到场景初始位置

### 7.4 反向序列化 (rawSerializer.ts)

```typescript
// lib/events/rawSerializer.ts

export function serializeRaw(args: string[]): string {
  return args
    .map((arg) => {
      if (!arg) return ''
      // 如果参数包含空格或斜杠，需要加引号
      if (/[\s/]/u.test(arg)) {
        return `"${arg.replace(/"/gu, '\\"')}"`
      }
      return arg
    })
    .join(' ')
}
```

### 7.5 与现有代码的兼容性

- `parser.ts` / `commandCatalog.ts` / `commandSummary.ts` / `types.ts` — **完全保留**
- `EventStageWorkspace.tsx`（只读预览页面）— **完全保留**，复用同一套运行时
- `EventStagePreview.tsx` — **增强**，新增 `additionalMapOverlay` 用于路径渲染
- `EventPatchEditor.tsx` — **重写布局**，但保留与上层 `DraftPatch` 的接口契约
- `EventCommandPipeline.tsx` — **废弃**，功能被 `ScriptEditor` 取代

---

## 9. 迁移路径

### Phase 1：Schema 基础设施（1-2 天）

1. 创建 `commandSchema.ts` 与 `commandSchemaRegistry.ts`
2. 为高频命令（move, warp, speak, pause, faceDirection, emote, playMusic 等）编写 Schema
3. 创建 `rawSerializer.ts` 反向序列化器
4. 创建 `templateRenderer.ts`

### Phase 2：ScriptEditor 核心（2-3 天）

1. 实现 `ParamPill` 组件 + 所有控件变体
2. 实现 `ScriptCommandLine` + `ScriptTimeline`
3. 实现 `CommandPalette`（基础搜索 + 分类）
4. 引入 Zustand Store，迁移 `EventPatchEditor` 的状态管理

### Phase 3：舞台联动（2-3 天）

1. 增强 `EventStagePreview`：
   - Pick Mode 视觉反馈
   - `StagePathOverlay`（Canvas/SVG 路径渲染）
   - 选中命令时的位置预览
2. 实现 `PickModeOverlay`
3. 实现 `SceneSetupBar`

### Phase 4：打磨与覆盖（2-3 天）

1. 为剩余命令补充 Schema（130+ 条）
2. 智能填充逻辑（上下文继承）
3. 多选/块移动/批量操作
4. 键盘快捷键（Enter 插入、Delete 删除、↑↓ 导航）
5. 性能优化（大数据量事件的虚拟滚动）

### Phase 5：废弃旧代码

- 删除 `EventCommandPipeline.tsx`
- 清理 `EventPatchEditor` 中废弃的 Properties Panel 代码

---

## 10. 附录：完整 Schema 注册表示例

```typescript
// lib/events/commandSchemaRegistry.ts

import type { CommandSchema } from './commandSchema'

export const COMMAND_SCHEMA_REGISTRY: Record<string, CommandSchema> = {
  speak: {
    key: 'speak',
    label: 'Speak', labelZh: '说话',
    category: 'dialogue', color: 'blue', icon: 'MessageSquareText',
    template: [
      { type: 'param', index: 1, label: '发言人', ui: 'npc_selector' },
      { type: 'text', value: '说：' },
      { type: 'param', index: 2, label: '内容', ui: 'textarea' },
    ],
  },
  move: {
    key: 'move',
    label: 'Move', labelZh: '角色移动',
    category: 'movement', color: 'purple', icon: 'Move',
    template: [
      { type: 'text', value: '移动' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector' },
      { type: 'text', value: '向' },
      { type: 'param', index: 2, label: '方向', ui: 'direction' },
      { type: 'text', value: '移动' },
      { type: 'param', index: 3, label: '距离', ui: 'number' },
      { type: 'text', value: '格，面向' },
      { type: 'param', index: 4, label: '朝向', ui: 'direction' },
    ],
    stageMeta: { affectsActorPosition: true, renderPath: true },
  },
  warp: {
    key: 'warp',
    label: 'Warp', labelZh: '传送',
    category: 'movement', color: 'purple', icon: 'MapPin',
    template: [
      { type: 'text', value: '传送' },
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector' },
      { type: 'text', value: '到' },
      { type: 'param', index: 2, label: 'X', ui: 'tile_picker' },
      { type: 'text', value: ',' },
      { type: 'param', index: 3, label: 'Y', ui: 'tile_picker' },
    ],
    stageMeta: { affectsActorPosition: true },
  },
  faceDirection: {
    key: 'faceDirection',
    label: 'Face Direction', labelZh: '朝向',
    category: 'movement', color: 'purple', icon: 'Compass',
    template: [
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector' },
      { type: 'text', value: '面向' },
      { type: 'param', index: 2, label: '方向', ui: 'direction' },
    ],
    stageMeta: { affectsActorPosition: false },
  },
  pause: {
    key: 'pause',
    label: 'Pause', labelZh: '等待',
    category: 'logic', color: 'orange', icon: 'TimerReset',
    template: [
      { type: 'text', value: '等待' },
      { type: 'param', index: 1, label: '时长', ui: 'number' },
      { type: 'text', value: '毫秒' },
    ],
  },
  emote: {
    key: 'emote',
    label: 'Emote', labelZh: '表情',
    category: 'visual', color: 'pink', icon: 'Smile',
    template: [
      { type: 'param', index: 1, label: '角色', ui: 'npc_selector' },
      { type: 'text', value: '做出' },
      { type: 'param', index: 2, label: '表情', ui: 'emote' },
      { type: 'text', value: '表情' },
    ],
    stageMeta: { affectsActorEmotion: true },
  },
  playMusic: {
    key: 'playMusic',
    label: 'Play Music', labelZh: '播放音乐',
    category: 'audio', color: 'green', icon: 'Music',
    template: [
      { type: 'text', value: '播放音乐' },
      { type: 'param', index: 1, label: '曲目', ui: 'music' },
    ],
  },
  question: {
    key: 'question',
    label: 'Question', labelZh: '选择提问',
    category: 'logic', color: 'orange', icon: 'ListChecks',
    template: [
      { type: 'text', value: '提问：' },
      { type: 'param', index: 1, label: '问题键', ui: 'text' },
      { type: 'param', index: 2, label: '选项', ui: 'choice' },
    ],
  },
  // ... 其余 120+ 条命令
}

export function getCommandSchema(commandKey: string): CommandSchema | null {
  return COMMAND_SCHEMA_REGISTRY[commandKey] ?? null
}

export function getAllSchemas(): CommandSchema[] {
  return Object.values(COMMAND_SCHEMA_REGISTRY)
}

export function searchSchemas(query: string, locale: 'zh-CN' | 'en-US'): CommandSchema[] {
  const q = query.toLowerCase()
  return getAllSchemas().filter((s) => {
    const label = locale === 'zh-CN' ? s.labelZh : s.label
    return s.key.toLowerCase().includes(q) || label.toLowerCase().includes(q)
  })
}
```

---

## 11. 与参考材料的对照

| 参考材料要点 | 本方案实现 | 说明 |
|-------------|-----------|------|
| 数据驱动 Schema | ✅ `commandSchema.ts` + `templateRenderer.ts` | 完全实现，新增命令只需改 Schema |
| 70/30 布局 | ✅ `EventPatchEditor` 重写为左右分栏 | 左侧舞台占 70%，右侧剧本占 30% |
| 参数胶囊 | ✅ `ParamPill.tsx` | 8 种控件变体 |
| 拾取模式 | ✅ `PickModeOverlay.tsx` | 地图 Tile 点击回填坐标 |
| 路径预览 | ✅ `StagePathOverlay.tsx` | move 命令虚线轨迹 |
| 智能指令添加器 | ✅ `CommandPalette.tsx` | 模糊搜索 + 分类 + 最近使用 |
| 坐标联动 | ✅ 双向同步 | 脚本→地图高亮，地图→脚本回填 |
| 色彩编码 | ✅ 9 种语义色 | 增强扫描效率 |
| 状态管理 Zustand | ✅ `editorStore.ts` | 单一 Store 管理 |
| 100% 数据兼容 | ✅ `parser.ts` / `rawSerializer.ts` | 底层格式不变，仅 UI 层映射 |
