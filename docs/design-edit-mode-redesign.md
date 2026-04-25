# Edit Mode UI 重构设计方案

## 1. 概述

将当前 Edit 模式的布局从「侧边栏嵌入编辑器」改为与 Browse/Preview 模式一致的「列表 → 详情页」多级导航模式，同时保持操作便利性。Event 编辑器不再嵌入在侧边栏右侧，而是选择 Patch 后占据完整页面；Patch 列表作为上级菜单；左上角提供返回按钮；并引入页面导航历史栈以支持鼠标侧键前进/后退。

---

## 2. 视觉风格对齐（PreviewModeShell）

### 2.1 Header 栏

当前 Edit 模式缺少统一的顶部 Header。统一为：

```
┌─────────────────────────────────────────────────────────────────┐
│  [Icon]  Title                              [Tools/Actions...] │  ← Header: h-10, bg-panel, border-b
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        Page Content                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- 高度 `h-10`（`40px`），`bg-[var(--bg-panel)]`，底部 `border-b border-[var(--border-color)]`
- 左侧放置当前页面标题和上下文图标
- 标题使用 `text-xs font-semibold`
- 右侧可放置操作按钮（如切换 View/Edit 模式）

### 2.2 面板底色

- 全局底色：`bg-[var(--bg-app)]`
- 列表面板：`bg-[var(--bg-panel)]`，右侧 `border-r`
- 详情区域：`bg-[var(--bg-app)]` 或 `bg-[var(--bg-panel)]`

### 2.3 列表样式

- Patch 卡片使用 `rounded-lg` 圆角、`bg-[var(--bg-panel)]` 底色
- 悬停：`bg-[var(--bg-active)]`
- 激活态：左侧 `4px` accent 色指示条 + `bg-[var(--bg-active)]`
- 保持当前 PatchListSidebar 的卡片信息密度（缩略图 + 名称 + 类型标签）

### 2.4 滚动条

- 所有滚动区域使用统一的细滚动条样式（与 PreviewModeShell 一致）

---

## 3. 多级导航架构

### 3.1 页面层级

```
Workbench (workspaceMode)
  └── Edit Mode (workspaceViewMode='edit')
        ├── Patch List Page（上级菜单）
        │     └── 显示所有 Patches 的列表
        │     └── 点击 Patch → 进入 Editor Page
        │
        └── Editor Page（详情页）
              ├── 非 Event Patch → 通用编辑器
              └── Event Patch  → EventPatchEditor（全页）
                    ├── 返回箭头 → 回到 Patch List Page
                    └── 内部状态（EventSelector、SceneSetupBar、Stage、Script）
```

### 3.2 路由等价映射

状态驱动（无 React Router）：

| 当前状态 | 页面显示 |
|---------|---------|
| `activeEditPatchId === null` | Patch List Page |
| `activeEditPatchId === '<patch-id>'` | Editor Page（该 Patch 的编辑器） |

---

## 4. 组件重构计划

### 4.1 WorkbenchExperience.tsx（状态管理中心）

**新增状态：**

```tsx
const [editNavHistory, setEditNavHistory] = useState<string[]>([])
const [editNavIndex, setEditNavIndex] = useState<number>(-1)
```

- `editNavHistory`: 历史栈，存储 patchId 序列（`null` 表示 Patch List Page）
- `editNavIndex`: 当前在历史栈中的位置

**导航 API：**

```tsx
function navigateToPatch(patchId: string | null) {
  // 截断 forward 分支，压入新状态
  const newHistory = editNavHistory.slice(0, editNavIndex + 1)
  newHistory.push(patchId ?? '__LIST__')
  setEditNavHistory(newHistory)
  setEditNavIndex(newHistory.length - 1)
  setActiveEditPatchId(patchId)
}

function goBack() {
  if (editNavIndex > 0) {
    const nextIndex = editNavIndex - 1
    setEditNavIndex(nextIndex)
    const target = editNavHistory[nextIndex]
    setActiveEditPatchId(target === '__LIST__' ? null : target)
  }
}

function goForward() {
  if (editNavIndex < editNavHistory.length - 1) {
    const nextIndex = editNavIndex + 1
    setEditNavIndex(nextIndex)
    const target = editNavHistory[nextIndex]
    setActiveEditPatchId(target === '__LIST__' ? null : target)
  }
}
```

**鼠标侧键监听：**

在 Edit Mode 根容器添加全局 `mousedown` 监听：

```tsx
useEffect(() => {
  function onMouseDown(e: MouseEvent) {
    if (workspaceViewMode !== 'edit') return
    if (e.button === 3) { // 侧键 - 后退
      e.preventDefault()
      goBack()
    } else if (e.button === 4) { // 侧键 - 前进
      e.preventDefault()
      goForward()
    }
  }
  window.addEventListener('mousedown', onMouseDown)
  return () => window.removeEventListener('mousedown', onMouseDown)
}, [workspaceViewMode, editNavIndex, editNavHistory])
```

**初始化逻辑：**

切换 `workspaceMode` 时重置导航栈：

```tsx
useEffect(() => {
  setActiveEditPatchId(null)
  setEditNavHistory(['__LIST__'])
  setEditNavIndex(0)
}, [workspaceMode])
```

### 4.2 新增 EditModeShell.tsx

将当前 `WorkflowModeShell.tsx` 的职责拆分：

- **EditModeShell**: Edit 模式的总容器，负责 Header + 内容路由（Patch List / Editor）
- **WorkflowModeShell**: 保留但降级为仅处理 Editor 内部布局（Stage + ScriptEditor），或被吸收进 EditModeShell

**EditModeShell 结构：**

```tsx
<div className="flex h-full flex-col bg-[var(--bg-app)]">
  {/* Header */}
  <div className="flex h-10 items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-4">
    {activeEditPatchId && (
      <button onClick={() => navigateToPatch(null)} className="...">
        <ArrowLeft className="h-4 w-4" />
      </button>
    )}
    <span className="text-xs font-semibold text-[var(--text-primary)]">
      {activeEditPatchId ? 'Edit Patch' : 'Patches'}
    </span>
    <span className="text-xs text-[var(--text-secondary)]">
      {activeEditPatchId && patchName}
    </span>
  </div>

  {/* Content */}
  <div className="min-h-0 flex-1 overflow-hidden">
    {activeEditPatchId === null ? (
      <PatchListPage />
    ) : (
      <EditorPage patchId={activeEditPatchId} />
    )}
  </div>
</div>
```

### 4.3 PatchListPage.tsx（新增）

从 `WorkflowModeShell.tsx` 中提取 Patch 列表逻辑，改为全页展示。

**布局：**

```
┌──────────────────────────────────────────────────────────────┐
│  Patches                                        [View Toggle] │
├────────────────────┬─────────────────────────────────────────┤
│                    │                                         │
│   Patch List       │   Patch Detail / Empty State            │
│   (w-72 panel)     │                                         │
│                    │   未选择 Patch 时显示：                  │
│   - Card 1         │   "Select a patch to edit"              │
│   - Card 2 (active)│                                         │
│   - Card 3         │   选择 Patch 后显示预览信息：            │
│                    │   类型、目标文件、变更摘要等             │
│                    │                                         │
│                    │   [Edit Patch] → 进入全页编辑器         │
│                    │                                         │
└────────────────────┴─────────────────────────────────────────┘
```

- 左侧列表宽度 `w-72`（比原来 `w-64` 略宽，显示更多信息）
- 右侧为预览/操作区，点击「Edit Patch」按钮后进入全页编辑器
- Patch 卡片点击不直接进入编辑器，而是选中并展示详情（防止误触）

**Patch 卡片交互：**

```tsx
// 单击：选中（高亮 + 右侧预览）
// 双击或「Edit」按钮：进入全页编辑器
onClick={() => setSelectedPatchId(patch.id)}
onDoubleClick={() => navigateToPatch(patch.id)}
```

### 4.4 EditorPage.tsx（新增 / 从 WorkflowModeShell 演变）

全页编辑器容器。根据 Patch 类型渲染不同编辑器：

```tsx
function EditorPage({ patchId }: { patchId: string }) {
  const patch = usePatch(patchId)
  if (!patch) return <NotFound />

  switch (patch.type) {
    case 'event':
      return <EventPatchEditor patch={patch} />
    case 'map':
      return <MapPatchEditor patch={patch} />
    default:
      return <GenericPatchEditor patch={patch} />
  }
}
```

**EventPatchEditor 在全页模式下的调整：**

当前 `EventPatchEditor` 已经是 `70/30` 横向分栏，嵌入全页后只需：

- 移除外部容器边距（或继承全页 `h-full`）
- `EventStagePreview` 占 `70%`，`ScriptEditor` 占 `30%`
- 顶部 `SceneSetupBar` + `EventSelector` 作为编辑器内部 Header
- 高度使用 `h-full` 填满可用空间

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Patches  |  Edit Patch  |  [EventSelector] [SceneSetupBar]  │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │                          │
│      EventStagePreview (70%)         │   ScriptEditor (30%)     │
│      - Map Canvas                    │   - ScriptTimeline       │
│      - Actors                        │   - ScriptCards          │
│      - Paths                         │   - CommandPalette       │
│                                      │                          │
└──────────────────────────────────────┴──────────────────────────┘
```

### 4.5 WorkflowModeShell.tsx（废弃 / 精简）

当前 `WorkflowModeShell` 的以下职责迁移后，该组件可废弃或简化为纯 Editor 容器：

| 当前职责 | 迁移目标 |
|---------|---------|
| `PatchListSidebar` 渲染 | `PatchListPage.tsx` |
| Editor/Reference Tab | 集成到 `EditorPage` 或 Header |
| 两栏布局 | `EditModeShell` 统一处理 |

建议：删除 `WorkflowModeShell.tsx`，将其残余逻辑（如 gameRootPath 检查、Reference Tab）移至 `EditorPage`。

---

## 5. 状态管理变更

### 5.1 WorkbenchExperience.tsx 状态扩展

```tsx
type EditNavEntry = string | '__LIST__'

// 在 WorkbenchExperience 组件内
const [editNavHistory, setEditNavHistory] = useState<EditNavEntry[]>(['__LIST__'])
const [editNavIndex, setEditNavIndex] = useState(0)
```

### 5.2 导航上下文（可选优化）

若导航逻辑较复杂，可引入轻量级 Context 避免深层 prop drilling：

```tsx
// 但当前 WorkbenchExperience → EditModeShell → EditorPage 层级不深，
// 可直接通过 props 传递 navigateToPatch / goBack / goForward
```

### 5.3 编辑器内部状态（不变）

`editorStore.ts`（Zustand）管理的事件编辑器内部状态不受影响：

- `selectedCommandIndex`
- `pickModeTarget`
- `commandPaletteOpen`
- `expandedCards`

---

## 6. 具体文件修改清单

### 6.1 新增文件

| 文件 | 说明 |
|------|------|
| `components/workbench/EditModeShell.tsx` | Edit 模式总壳层（Header + 内容路由） |
| `components/generated-project/PatchListPage.tsx` | Patch 列表页（全页，含预览区） |
| `components/generated-project/EditorPage.tsx` | 编辑器路由页（根据类型分发） |

### 6.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/workbench/WorkbenchExperience.tsx` | 1. 新增 `editNavHistory` / `editNavIndex` 状态<br>2. 新增 `navigateToPatch` / `goBack` / `goForward` 函数<br>3. 添加全局鼠标侧键监听<br>4. `EditWorkspaceContent` 改用 `EditModeShell`<br>5. 将 `activeEditPatchId` 和导航函数注入子组件 |
| `components/event-workflow/EventPatchEditor.tsx` | 1. 调整容器为 `h-full`<br>2. 顶部 bar 微调样式匹配新 Header 风格<br>3. 确保 `70/30` 分栏填满父容器 |
| `components/generated-project/WorkflowModeShell.tsx` | **删除**（职责被 `EditModeShell` + `PatchListPage` + `EditorPage` 替代） |

### 6.3 可能调整的组件

| 文件 | 调整内容 |
|------|---------|
| `components/generated-project/PatchListSidebar.tsx` | 1. 提取列表渲染逻辑到 `PatchListPage`<br>2. 或保留作为 `PatchListPage` 的子组件使用 |

---

## 7. 交互流程

### 7.1 进入 Edit Mode

```
用户点击 Workbench 的 Edit 标签
  → workspaceViewMode = 'edit'
  → activeEditPatchId = null
  → editNavHistory = ['__LIST__']
  → 显示 PatchListPage
```

### 7.2 浏览并选择 Patch

```
用户在 PatchListPage 中：
  - 单击 Patch Card → 右侧预览区显示详情
  - 点击「Edit Patch」按钮 或 双击 Card
    → navigateToPatch(patchId)
    → history.push(patchId)
    → 显示 EditorPage（如 EventPatchEditor）
```

### 7.3 返回上级菜单

```
用户在 EditorPage 中点击左上角 ←
  → navigateToPatch(null)
  → history.push('__LIST__')
  → 显示 PatchListPage（保留之前的选中状态）
```

### 7.4 鼠标侧键导航

```
用户在 Edit Mode 任意页面按下鼠标侧键（button 3/4）
  → goBack() / goForward()
  → 在历史栈中移动
  → 切换到对应页面
```

---

## 8. 样式对照表

| 元素 | PreviewModeShell | 当前 Edit Mode | 目标 Edit Mode |
|------|-----------------|---------------|---------------|
| 全局背景 | `bg-[var(--bg-app)]` | 混合 | `bg-[var(--bg-app)]` |
| Header 高度 | `h-10` | 无统一 Header | `h-10` |
| Header 底色 | `bg-[var(--bg-panel)]` | — | `bg-[var(--bg-panel)]` |
| 列表面板 | `w-64`, `bg-panel`, `border-r` | `w-64` | `w-72`, `bg-panel`, `border-r` |
| 卡片圆角 | `rounded-lg` | `rounded-lg` | 保持 `rounded-lg` |
| 激活指示 | 左侧 accent 条 | 背景色变 | 左侧 accent 条 |
| 字体大小 | `text-xs` 主导 | 混合 | `text-xs` 主导 |

---

## 9. 边界情况处理

1. **Workspace 切换重置**: 切换 `workspaceMode` 时清空 `activeEditPatchId` 和历史栈（已有逻辑）
2. **View/Edit 切换**: 从 Edit 切到 Preview 再切回 Edit，应恢复之前状态（当前行为已满足）
3. **无效 patchId**: `EditorPage` 中找不到 Patch 时显示友好错误页 + 「返回列表」按钮
4. **历史栈过长**: 设置最大长度（如 50），超出时从头部移除旧记录
5. **浏览器前进/后退**: 不处理（状态驱动，不涉及 URL）

---

## 10. 实施顺序建议

1. **Step 1**: 在 `WorkbenchExperience.tsx` 中新增导航状态和历史栈逻辑
2. **Step 2**: 创建 `EditModeShell.tsx`，替换 `EditWorkspaceContent` 中的 `WorkflowModeShell`
3. **Step 3**: 创建 `PatchListPage.tsx`，从 `PatchListSidebar` 提取并增强（添加预览区 + Edit 按钮）
4. **Step 4**: 创建 `EditorPage.tsx`，处理 Patch 类型分发
5. **Step 5**: 调整 `EventPatchEditor.tsx` 为全页 `h-full` 布局
6. **Step 6**: 添加鼠标侧键监听
7. **Step 7**: 删除 `WorkflowModeShell.tsx`，清理残余引用
8. **Step 8**: 测试边界情况，修复样式细节
