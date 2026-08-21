# 地图编辑器 UI 与操作逻辑改进方案

## 背景

地图编辑器当前存在操作不直观、功能入口分散、交互不一致等问题，导致新手难以完成地图编辑制作。本方案基于对 MapAssetEditor / MapPatchEditor / MapTilesSessionEditor / CentralWorkspace 及其子组件的完整审查，给出分阶段改进路径。

## 设计原则

1. **操作前置条件必须可见**：按钮 disabled 时用 tooltip 说明原因
2. **一个功能一个主入口**：消除多入口重叠，辅助入口降级为快捷方式
3. **场景切换有过渡**：编辑器之间切换时用 header 标识当前模式
4. **Inspector 分区不堆叠**：用标签页或折叠分区替代单列滚动
5. **新手可发现**：调色板/对象库默认可见，关键操作有引导

---

## 阶段一：操作前置条件可见化

**优先级**：高 | **改动量**：小 | **依赖**：无

### 1.1 工具/按钮 disabled 原因提示

**现状**：

- brush/stamp/fill 在无调色板选区时 disabled，无提示（`MapAssetEditorToolbar.tsx:75`）
- 传送门 + 按钮在无选中格子时 disabled，无提示（`MapAssetMapCards.tsx:495`）
- TileData + 按钮在无选中格子时 disabled，无提示（`MapAssetEditorInspector.tsx:335`）
- 传送门载体选项（touch/action）disabled 时无解释（`MapAssetMapCards.tsx:484-488`）

**方案**：

- 所有 disabled 按钮补充 `title` 显示原因：
  - 画笔工具 disabled：`title="先在调色板选择图块"`
  - 传送门 + 按钮 disabled：`title="先在画布上点击一个格子作为传送门起点"`
  - TileData + 按钮 disabled：`title="先在画布上点击一个格子"`
- 载体选项 disabled 时在 label 后加 inline hint：`"(该格子在 Back/Buildings 层无图块)"`

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorToolbar.tsx`：disabled 按钮的 title 动态化
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetMapCards.tsx:495`：addDisabled 时 title 传原因
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx:335`：同上
- locale bundle 补充原因文案

### 1.2 保存阻止条件提示

**现状**：有 TBin/图层名/TSX 问题时保存直接 return，无提示（`MapAssetEditor.tsx:457`）。

**方案**：

- 保存前检查不通过时，`setSaveState({ status: 'error', message: ... })` 并在 header 显示具体原因
- 用 `useNotificationPublisher` 弹出错误通知，列出具体问题（TBin 问题 N 条、图层名问题 N 条、无效 TSX 源 N 条）

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapAssetEditor.tsx:456-457`：补充错误消息和通知
- locale bundle 补充保存错误文案

---

## 阶段二：调色板与对象库分离

**优先级**：高 | **改动量**：中 | **依赖**：无

### 2.1 调色板默认可见，与对象库分离

**现状**：

- 调色板（`MapTilesetPalette`）藏在左侧"对象库"标签页里（`MapAssetEditor.tsx:634-659`）
- 工具栏有调色板开关按钮（`MapAssetEditorToolbar.tsx:97-111`），但默认关闭
- 用户打开编辑器后看不到调色板，不知道怎么选图块

**方案**：

- 左侧面板改为三标签页：**图层** | **调色板** | **对象库**
- **调色板**标签页默认激活，让用户一进来就能选图块
- 调色板标签页只放 `MapTilesetPalette`，对象库标签页只放 `MapObjectLibraryPanel`
- 工具栏的调色板开关按钮改为"切换到调色板标签"的快捷方式

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapAssetEditor.tsx:566-660`：左侧标签页从 2 个变 3 个，调色板独立标签
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorToolbar.tsx`：调色板开关按钮改为切换标签
- `apps/desktop/src/styles/features/map-asset-shell.css`：标签页样式调整
- locale bundle 补充标签页文案

### 2.2 画图块引导提示

**现状**：新手不知道该在哪个图层画、怎么选图块。

**方案**：

- 画布空状态（无调色板选区 + brush 工具）时，画布中央显示引导卡片：
  ```
  1. 选择图层 → 2. 在调色板选图块 → 3. 在画布上拖拽绘制
  ```
- 图层列表每行加 `data-guide` anchor，配合 GuideTour 做新手引导
- 图层名旁加简短用途标签（从 locale bundle 读取）：
  - Back = "地面/背景"
  - Buildings = "建筑/家具"
  - Front = "前景遮挡"
  - AlwaysFront = "最前景"
  - Paths = "路径"

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapViewport.tsx`：空状态引导卡片
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：图层用途标签
- locale bundle 补充图层用途文案
- guide 定义文件补充地图编辑器引导步骤

---

## 阶段三：Inspector 分区重构

**优先级**：高 | **改动量**：中 | **依赖**：无

### 3.1 Inspector 标签页化

**现状**：Inspector 堆叠 10+ 功能区在一个滚动面板（`MapAssetEditorInspector.tsx`）：

- MapCards（传送门/门/昼夜/音乐）
- 选中对象详情（光源标记编辑）
- 单元格动画编辑
- 标记器列表
- 非标记器对象列表
- 已放置家具列表
- Tileset 管理（选择/替换/TSX/属性/动画）
- Raw Properties（图层属性/地图属性）
- 诊断信息

**方案**：Inspector 顶部加标签页：

| 标签页     | 内容                                                                  |
| ---------- | --------------------------------------------------------------------- |
| **地图**   | MapCards（传送门/门/昼夜/音乐）+ 音乐/光照快捷编辑 + "所有属性"折叠区 |
| **对象**   | 选中对象详情 + 标记器列表 + 非标记器对象列表 + 家具列表               |
| **图块集** | Tileset 管理（选择/替换/TSX/属性/动画）                               |
| **高级**   | Raw Properties（图层属性/地图属性）+ 诊断信息                         |

标签页根据当前选中状态智能切换：

- 选中对象 → 自动切到"对象"
- 选中 tileset → 自动切到"图块集"
- 默认 → "地图"

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：重构为标签页布局
- `apps/desktop/src/styles/features/map-asset-shell.css`：Inspector 标签页样式
- locale bundle 补充标签页文案

### 3.2 属性编辑主入口统一

**现状**：

- 音乐在顶部栏 chips（`MapAssetTopBarChips`）
- 传送门在 Inspector MapCards
- 原始属性在 Inspector 底部折叠区
- 同一属性（如 Music）可在多处编辑

**方案**：

- **顶部栏 chips 保留**作为快捷编辑（音乐/室内外/光照），但加 tooltip "在 Inspector > 地图 标签页可编辑更多属性"
- **Inspector > 地图**标签页作为属性编辑的主入口，包含：
  - MapCards（传送门/门/昼夜/音乐卡片）
  - 音乐/光照的完整编辑（与顶部栏 chips 同步）
  - "所有属性"折叠区（替代原 Raw Properties）
- 顶部栏 chips 和 Inspector 编辑同一属性时，通过现有 `updateMapProperties` + mergeKey 保证历史合并

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：地图标签页整合属性编辑
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetTopBarChips.tsx`：加 tooltip 指向 Inspector
- 无需删除顶部栏 chips（保留快捷方式）

---

## 阶段四：编辑器关系透明化

**优先级**：中 | **改动量**：中 | **依赖**：无

### 4.1 编辑器模式标识

**现状**：用户不知道自己在补丁编辑器还是资产编辑器。

**方案**：每个编辑器 header 加模式徽章：

| 编辑器                | 徽章文案                                         |
| --------------------- | ------------------------------------------------ |
| MapPatchEditor        | `补丁编辑 — 修改游戏地图的 Content Patcher 补丁` |
| MapAssetEditor        | `资产编辑 — 编辑地图文件（TMX/TBin）`            |
| MapTilesSessionEditor | `图块绘制 — 编辑补丁的图块改动`                  |

徽章用 `data-guide` anchor，可被引导引用。

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapPatchEditor.tsx`：header 加徽章
- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapAssetEditor.tsx`：header 加徽章
- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapTilesSessionEditor.tsx`：header 加徽章
- locale bundle 补充徽章文案

### 4.2 MapCatalog 入口区分

**现状**：点击地图卡片创建 EditMap 补丁，"添加地图"按钮进资产库——两个入口指向不同编辑器但不透明。

**方案**：

- 地图卡片改为双按钮：
  - 主按钮："创建补丁"（现有行为，创建 EditMap）
  - 次按钮："导入并编辑文件"（导入资产库后打开 MapAssetEditor）
- 卡片 tooltip 说明两者区别：`补丁 = 轻量修改，不替换地图文件；编辑文件 = 完整编辑地图文件`

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/ui/MapCatalog.tsx:261-267`：openEntry 改为双按钮
- locale bundle 补充文案

### 4.3 TilesSession 进入/退出过渡

**现状**：进入 TilesSession 无过渡，退出后 diff 粒度跳变无提示。

**方案**：

- 进入时 header 显示：`图块绘制模式 — 完成后将生成图块改动回补丁`
- 完成按钮 tooltip：`完成并将所有绘制改动作为一个补丁步骤`
- 完成后回到补丁编辑器时，弹 notification：`已将图块绘制改动写入补丁（Ctrl+Z 可撤销整个会话）`

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapTilesSessionEditor.tsx`：header 补充说明
- `apps/desktop/src/pages/workbench/ui/module-runtimes/AuthoringRuntime.tsx`：完成回调后发 notification
- locale bundle 补充文案

---

## 阶段五：交互一致性

**优先级**：中 | **改动量**：大 | **依赖**：阶段一~四

### 5.1 统一快捷键注册表

**现状**：

- 快捷键散落在 `MapAssetEditor.tsx:188-233`、`MapTilesSessionEditor.tsx:112-150`、`MapCatalogEditor.tsx` 各自监听
- CentralWorkspace 无任何快捷键监听
- 无统一注册表，维护和发现困难

**方案**：

- 新建 `apps/desktop/src/pages/workbench/workspaces/map/model/mapShortcuts.ts`
- 集中定义快捷键映射：`{ key, ctrl, shift, action, description }`
- 各编辑器用 `useMapShortcuts(editor, { onSave, onExport })` 统一订阅
- CentralWorkspace 也接入，补充浏览模式快捷键（工具切换/网格/导出）

**改动范围**：

- 新建 `apps/desktop/src/pages/workbench/workspaces/map/model/mapShortcuts.ts`
- 新建 `apps/desktop/src/pages/workbench/workspaces/map/editors/core/useMapShortcuts.ts`
- 三个编辑器替换各自 keydown 监听
- locale bundle 补充快捷键描述

### 5.2 能力禁用反映到 UI

**现状**：

- `MapAssetEditorToolbar` 注释明确说"does not take capability gates"（`MapAssetEditorToolbar.tsx:30-39`）
- MapTilesSessionEditor 把图层管理按钮设为 no-op（`MapTilesSessionEditor.tsx:215-218`），但按钮看起来可用
- 用户点击无反应但不知道为什么

**方案**：

- `MapAssetEditorLayersPanel` 接收 `capabilities` 后，禁用按钮设 `disabled` + `title="图块绘制模式不支持图层管理"`
- `MapAssetEditorToolbar` 改为接收 capabilities，flipRotate 等工具在禁用时 disabled
- `MapTilesSessionEditor` 移除 no-op 回调，改为依赖 disabled

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：capabilities 禁用时按钮 disabled
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorToolbar.tsx`：接收 capabilities，禁用对应工具
- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapTilesSessionEditor.tsx`：移除 no-op 回调
- locale bundle 补充禁用原因文案

### 5.3 浏览/编辑场景工具栏对齐

**现状**：

- CentralWorkspace 只有 select/pan（`CentralWorkspace.tsx:264-289`）
- MapAssetEditor 有 8 工具 + 覆盖模式 + 调色板开关
- 工具栏位置、样式、工具集完全不同

**方案**：

- CentralWorkspace 工具栏保持精简（浏览不需要画笔），但样式与编辑器工具栏统一（用相同的 `workspace-viewport-toolbar` 样式类）
- CentralWorkspace 补充网格开关（已有）+ 光照预览（已有），确保位置和样式与编辑器一致
- 不强求工具集相同，但视觉风格和位置统一（都浮动在画布左上/右上）

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/view/CentralWorkspace.tsx`：工具栏样式对齐
- `apps/desktop/src/styles/features/map-asset-shell.css` + `apps/desktop/src/styles/workspace/layout.css`：统一工具栏样式

### 5.4 右键菜单一致性

**现状**：

- CentralWorkspace：MapViewport 默认右键菜单
- MapAssetEditor：`contextMenuEnabled` + `contextMenuExtraItems`（`MapAssetEditor.tsx:702-759`）
- MapTilesSessionEditor：`contextMenuEnabled={false}`（`MapTilesSessionEditor.tsx:243`），完全禁用

**方案**：

- MapTilesSessionEditor 启用右键菜单，但只保留画布导航项（适配/1:1/放大/缩小/居中/重置），隐藏编辑项（添加 TileData 等）
- 三个场景的右键菜单基础项保持一致，编辑项按能力开关显示/隐藏

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapTilesSessionEditor.tsx:243`：`contextMenuEnabled` 改为 `true`
- `apps/desktop/src/entities/map/ui/MapViewport.tsx`：右键菜单项按 props 动态显示
- `apps/desktop/src/entities/map/ui/MapViewportChrome.tsx`：菜单项条件渲染

---

## 阶段六：概念引导

**优先级**：低 | **改动量**：小 | **依赖**：阶段一~四

### 6.1 新手引导步骤

**现状**：无地图编辑器引导。

**方案**：利用现有 GuideTour 机制（`widgets/guide-tour/GuideTourOverlay.tsx`，通过 `data-guide` anchor 定位），新增地图编辑器引导：

| 步骤 | anchor                | 内容                                |
| ---- | --------------------- | ----------------------------------- |
| 1    | `map-catalog-card`    | 选择要编辑的游戏地图                |
| 2    | `map-layer-list`      | 选择要编辑的图层                    |
| 3    | `map-tileset-palette` | 在调色板选择图块                    |
| 4    | `map-canvas`          | 在画布上拖拽绘制                    |
| 5    | `map-inspector-map`   | 在 Inspector 地图标签页添加传送门等 |
| 6    | `map-save-button`     | Ctrl+S 或保存按钮保存               |

**改动范围**：

- guide 定义文件（`apps/desktop/src/features/guide/`）补充地图编辑器步骤
- 各组件加 `data-guide` anchor
- locale bundle 补充引导文案

### 6.2 概念说明 tooltip

**现状**：图层、载体、对象 vs 图块、世界图集等概念无解释。

**方案**：

- 图层名旁加 info icon，hover 显示用途说明
- 传送门载体选项旁加 info icon，说明三种载体的触发条件：
  - property：`地图属性，玩家走到指定格子触发`
  - touch：`Back 层图块，玩家踩上去触发`
  - action：`Buildings 层图块，玩家交互门触发`
- 世界图集标签页加 tooltip：`Stardew Valley 的世界地图由多个地图拼接而成`
- 对象库标签页顶部加说明：`对象库里的对象是预定义的图块选区，放置后即为普通图块`

**改动范围**：

- 各组件加 info icon + tooltip
- locale bundle 补充概念说明文案

---

## 实施路径

| 阶段                   | 优先级 | 改动量 | 依赖  | 建议顺序 |
| ---------------------- | ------ | ------ | ----- | -------- |
| 一：操作前置条件可见化 | 高     | 小     | 无    | 1        |
| 二：调色板与对象库分离 | 高     | 中     | 无    | 2        |
| 三：Inspector 分区重构 | 高     | 中     | 无    | 3        |
| 四：编辑器关系透明化   | 中     | 中     | 无    | 4        |
| 五：交互一致性         | 中     | 大     | 一~四 | 5        |
| 六：概念引导           | 低     | 小     | 一~四 | 6        |

每个阶段可独立合并。建议按顺序实施，阶段一改动最小、收益最高，优先做。

## 验证规则

- 每个阶段完成后跑 `vp run lint` + `vp run build` + 受影响的测试
- UI/布局变更需要截图或浏览器预览证明（AGENTS.md 要求）
- 新增文案必须走 `@locales/provider` typed hooks，禁止硬编码
- 配色走 `tokens.css` 主题变量，禁止写死颜色字面量
- 新增组件遵循现有分层规则（pages → features → entities → shared）
- 阶段五的快捷键统一注册表需要补充单元测试（纯逻辑测试，放 `src/tests/unit/`）
