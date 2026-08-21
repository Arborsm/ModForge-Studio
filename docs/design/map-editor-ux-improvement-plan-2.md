# 地图编辑器 UX 改进方案（第二轮）

## 背景

第一轮（`map-editor-ux-improvement-plan.md`）解决了操作前置条件可见化、调色板默认可见、Inspector 标签页化、模式徽章、统一快捷键等"表面油漆"问题。但实际使用后，编辑器的核心交互模型仍然很糟糕：

- **找图块费劲**：sheet 选取要点开下拉、滚动找；具体图块要在整张 sheet 缩略图里肉眼扫 16×16 小格，没有 hover 大图预览
- **图层属性割裂**：图层名、不透明度这些核心属性不能在图层列表直接改，要跑到 Inspector > 高级标签页
- **Inspector 检查体验差**：inspect 工具点格子后信息散在多个标签页，要手动切才能看到
- **昼夜/动画编辑繁琐**：昼夜要先选格、开卡片、选图层、确认；动画要在 Inspector 里逐帧填数字 ID，没有可视化预览

本方案针对这四个核心痛点，按"低风险高收益 → 高风险重做"分四阶段。

## 设计原则

1. **就近编辑**：属性在它被看到的地方编辑，不要"看在 A 处、改在 B 处"
2. **所见即所得**：画布上的操作直接产生结果，不要"先填表再确认"
3. **hover 即预览**：鼠标悬停就看到放大效果，不要靠眯眼看 16px 缩略图
4. **信息聚合**：一个选中动作触发后，相关信息在同一视野呈现，不要跨标签页跳转

---

## 阶段一：调色板体验（hover 大图 + sheet 快速切换）

**优先级**：高 | **改动量**：中 | **依赖**：无

### 1.1 hover 放大预览

**现状**：`MapTilesetPalette` 渲染整张 sheet 图，zoom 默认 1x（16px/tile），用户要眯眼找图块。没有 hover 放大。`RecentCell` 也只有 2.125rem 的迷你缩略图。

**方案**：

- sheet 图区域加 hover 放大镜：鼠标悬停在某格上时，在指针旁弹出一个 4×4 或 6×6 tile 的放大预览（pixelated，scale 4x），高亮当前格
- 放大镜用绝对定位浮层，跟随鼠标移动，不抢占 sheet 滚动
- `RecentCell` hover 时也弹同款放大镜（显示该选区的放大图）
- 放大倍数跟随 palette zoom：zoom=1 时放大镜 4x，zoom=2 时 3x，zoom≥3 时不弹（已经够大）

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapTilesetPalette.tsx`：新增 `TilesetHoverMagnifier` 子组件，sheet image 区加 `onPointerMove` 追踪 + 浮层渲染
- `apps/desktop/src/styles/workspace/map-tileset-palette.css`：`.map-tileset-magnifier` 样式
- locale bundle：放大镜无障碍 label

### 1.2 sheet 标签条（替代下拉）

**现状**：`MapTilesheetPicker` 是一个下拉触发器，点开后显示 attached / game-maps / game-tilesheets / project 四组。切换 sheet 要：点触发器 → 滚动找 → 点行。已 attached 的 sheet 也要在下拉里找。

**方案**：

- 已 attached 的 sheet 改为**水平标签条**（类似浏览器标签），直接显示 sheet 名 + 缩略图 icon，单击切换
- 标签条横向滚动，溢出时两端加滚动指示
- 下拉只保留"添加 sheet"入口（+ 按钮），不再承担已 attached sheet 的切换
- 标签条右键菜单：替换图片 / 删除 sheet（capabilities.tilesetManagement 关闭时隐藏）
- 当前 active sheet 标签高亮 + 底部 accent 条

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapTilesetPalette.tsx`：head 区改为标签条 + 添加按钮
- `apps/desktop/src/entities/map/ui/MapTilesheetPicker.tsx`：保留为"添加 sheet"专用下拉，移除 attached 切换行
- `apps/desktop/src/styles/workspace/map-tileset-palette.css`：`.map-tileset-tabs` 标签条样式
- locale bundle：标签条 tooltip、右键菜单文案

### 1.3 图块搜索（可选增强）

**现状**：找具体图块只能肉眼扫整张 sheet。Stardew 的 sheet 动辄几百格，很难找。

**方案**：

- 调色板顶部加搜索框（sheet 标签条下方）
- 搜索范围：当前 sheet 的 tile properties 里有没有匹配的 key/value；以及 vanilla tilesheet catalog 里有没有预定义的 tile 名（如果 `vanillaTilesheets` 元数据包含 tile 命名）
- 命中时高亮对应格子 + 自动滚动到该格；多命中时用快捷键跳转下一个
- 如果没有 tile 级元数据，降级为"按 sheet 名搜索并跳转"（已有，在 picker 里）

**注意**：这一项依赖 tilesheet 是否有 tile 级命名元数据。需要先调研 `vanillaTilesheets.ts` 的 catalog 是否包含 tile 名。如果不包含，先做 1.1 + 1.2，1.3 标记为"需要元数据扩展"留后续。

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapTilesetPalette.tsx`：搜索框 + 高亮逻辑
- `apps/desktop/src/entities/map/model/vanillaTilesheets.ts`：如有 tile 命名元数据则暴露
- locale bundle：搜索占位符

---

## 阶段二：图层行内编辑

**优先级**：高 | **改动量**：小 | **依赖**：无

### 2.1 双击重命名

**现状**：图层名在 Inspector > 高级 > layer details 里用 `<input>` 改（`MapAssetEditorInspector.tsx:635`）。图层列表行里只显示名字，不能直接改。

**方案**：

- 图层列表的图层名 `<button>` 加 `onDoubleClick`：进入行内编辑模式，变成 `<input>`，Enter 提交 / Esc 取消 / 失焦提交
- 提交时调 `onUpdateDocument` + `renameLayer` mergeKey（已有 `updateActiveLayer({ name })` 和 `copy.renameLayer` label）
- TBin 图层名校验：重命名时如果触发 `layerNameIssues`，input 边框变红 + tooltip 显示原因（复用现有 diagnostics 文案）
- 编辑期间禁止拖拽排序和删除

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：行内编辑状态 + 双击逻辑
- `apps/desktop/src/styles/features/map-asset-shell.css`：行内 input 样式
- locale bundle：无新增（复用 `renameLayer` / diagnostics 文案）

### 2.2 不透明度行内滑块

**现状**：不透明度在图层行里只读显示百分比（`MapAssetEditorLayersPanel.tsx:98`），不能调。`MapLayer.opacity` 字段存在，`updateActiveLayer` 支持更新。

**方案**：

- 图层行的百分比 `<span>` 改为可交互：hover 时变成迷你水平滑块（range input），拖动实时调 opacity
- 滑块宽度紧凑（~3rem），不破坏行布局
- 调整时实时更新文档（用 mergeKey `map-layer:{id}:opacity` 合并连续拖动为一个历史步骤）
- opacity = 1 时不显示滑块，只显示 100%（减少视觉噪音）；hover 才出现滑块

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：opacity 交互
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/useMapDocumentEditor.ts`：`updateActiveLayer` 的 mergeKey 对 opacity 单独处理（`map-layer:{id}:opacity`）
- `apps/desktop/src/styles/features/map-asset-shell.css`：迷你滑块样式
- locale bundle：无新增

### 2.3 图层缩略图 hover 放大预览

**现状**：图层行里的 `MapLayerThumbnail`（`MapLayerThumbnail.tsx:92`）只有 64×48 CSS px，缩略图按内容 bounds 裁切后缩到这个尺寸，图层内容基本看不清。用户要判断"这个图层画了什么"得切到画布切可见性来回看。

**方案**：

- 图层缩略图 hover 时弹出放大预览浮层：
  - 浮层尺寸根据图层内容 bounds 按比例计算，最大不超过视口 40%×40%，保持像素比（pixelated）
  - 浮层跟随鼠标定位，不抢占图层列表交互
  - 复用 `renderLayerThumbnail` 的 rasterize 逻辑，但用更大的 targetWidth/targetHeight（如 256×192 或按 bounds 比例计算），不重新实现渲染
  - 放大图只在 hover 时渲染（按需），离开即销毁，避免所有图层同时渲染大图卡顿
- 缩略图本体保持 64×48，只是 hover 时"放大镜"看全貌
- 空图层（`nonEmptyTiles === 0`）不弹浮层

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapLayerThumbnail.tsx`：导出 `renderLayerThumbnail` 或新增 `renderLayerPreview(document, layer, locale, gameRootPath, targetSize)` 支持自定义尺寸
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：缩略图 hover 浮层
- `apps/desktop/src/styles/features/map-asset-shell.css`：`.map-asset-layer-preview-pop` 浮层样式
- locale bundle：浮层无障碍 label

### 2.4 图层行信息增强

**现状**：图层行显示缩略图 + 名字 + tile 数 + opacity + 可见性 + 锁定。没有图层用途标签。

**方案**：

- 图层名下方加用途小标签（从 `layerPurposeHint` 读取，已有 locale）
- 标签只对 vanilla 标准图层名显示（Back/Buildings/Front/AlwaysFront/Paths），自定义图层名不显示
- 标签是只读的 `<small>`，不增加交互

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：渲染用途标签
- `apps/desktop/src/styles/features/map-asset-shell.css`：标签样式
- locale bundle：已有 `layerPurposeHint`

---

## 阶段三：Inspector 检查体验

**优先级**：高 | **改动量**：中 | **依赖**：无

### 3.1 inspect 工具信息浮层

**现状**：inspect 工具点格子后（`clickTile`，`useMapDocumentEditor.ts:461`），只 `setSelectedTile`，不切 Inspector 标签页。用户要手动切到"对象"标签页看选中对象详情，或切到"图块集"看 tile 定义属性。信息散在四个标签页。

**方案**：

- inspect 点格子后，在画布右下角弹一个**信息浮层**（不是 Inspector 标签页），聚合显示：
  - 坐标 (x, y)
  - 当前图层名
  - 该格 tile：sheet 名 + tile index + 缩略图（16px 放大到 32px）
  - 该格对象（如果有）：对象名 + 类型
  - 该格 cell properties（如果有，如 walkable/water）
  - 该格 cell animation（如果有）：帧数 + 首帧缩略图
- 浮层是只读的，点"在 Inspector 编辑"按钮跳转到对应标签页
- 浮层不抢占画布交互，可拖动或固定位置

**改动范围**：

- 新建 `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetInspectPopover.tsx`
- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapAssetEditor.tsx`：渲染浮层，传 selectedTile / activeLayer / document / selectedObject
- `apps/desktop/src/styles/features/map-asset-shell.css`：浮层样式
- locale bundle：浮层各字段 label

### 3.2 Inspector 标签页智能跳转优化

**现状**：已有"选中对象自动切到 objects 标签页""选中 tileset 自动切到 tilesets 标签页"（`MapAssetEditorInspector.tsx:157-169`）。但 inspect 点空格子时不会切到 map 标签页，用户停留在上次的标签页。

**方案**：

- inspect 点格子后：
  - 如果该格有对象 → 切到 objects（已有）
  - 如果该格无对象但选中了 tileset → 保持当前
  - 如果该格无对象且无 tileset 选中 → 切到 map 标签页（显示 MapCards）
- 加"手动切走后不再自动跳转"的保护（已有 `lastSelectedObjectIdRef` 机制，扩展到 selectedTile）

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：扩展 auto-switch 逻辑
- 无 locale 新增

### 3.3 选中状态跨标签页保持

**现状**：切标签页不会丢失选中状态，但用户不知道其他标签页里有跟当前选中相关的内容。

**方案**：

- 标签页标签上加角标：objects 标签页有选中对象时显示小圆点；tilesets 标签页有选中 tileset 时显示小圆点
- 角标用 accent 色，提示"这里有跟当前选中相关的内容"
- 点击带角标的标签页直接跳转

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：标签页角标
- `apps/desktop/src/styles/features/map-asset-shell.css`：角标样式
- locale bundle：角标无障碍 label

---

## 阶段四：昼夜 & 动画编辑重做

**优先级**：中 | **改动量**：大 | **依赖**：阶段一~三

### 4.1 昼夜区域画布直接刷

**现状**：`DayNightCard`（`MapAssetMapCards.tsx:778`）的编辑流程：

1. 在画布上点一个格子（inspect 工具）
2. 切到 Inspector > 地图标签页
3. 找到昼夜卡片，点 +
4. 选图层（下拉）
5. day tile 自动取当前格子的 tile
6. night tile 取当前 palette 选区
7. 点确认

一次只能加一个格子。要刷一片区域得重复 N 次。区域选择完全靠"先在画布点格子再在卡片确认"，没有画布直接框选。

**方案**：

- 新增"昼夜画笔"工具模式（tool rail 加一个 `daynight` 工具，或复用 overlay 模式的交互）
- 进入昼夜模式后：
  - 画布顶部浮一个提示条："在 Back/Buildings 层拖拽刷选区域，night tile = 当前调色板选区"
  - 拖拽时实时高亮选中的格子（半透明 accent 覆盖）
  - 松开时把区域内每个格子的 day tile（取当前图层已有 tile）+ night tile（取 palette 选区）写入 DayTiles/NightTiles 属性
  - 已有昼夜替换的格子用边框高亮（复用 `cellOverlay` 机制，新增一个 `daynight` overlay rule）
- 昼夜卡片保留为"列表 + 删除 + 单格编辑"入口，但新增入口从画布直接刷
- 批量写入用单个 mergeKey，Ctrl+Z 一次撤销整片

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/useMapDocumentEditor.ts`：新增 `commitDayNightStroke(points)` action
- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapAssetEditor.tsx`：tool rail 加昼夜工具 / overlay rule 加 daynight
- `apps/desktop/src/entities/map/lib/cellProperties.ts`：`CellOverlayRule` 加 `daynight`
- `apps/desktop/src/entities/map/ui/MapViewport.tsx`：cellOverlay 支持 daynight 高亮
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetMapCards.tsx`：DayNightCard 加"从画布刷入"的同步
- locale bundle：昼夜工具 label、提示条文案
- 单元测试：`dayNightStroke` 写入逻辑

### 4.2 动画可视化编辑

**现状**：动画编辑有两个入口：

- **cell animation**（`MapAssetCellAnimationsEditor`，Inspector > objects 标签页）：逐帧填 `tileId` 数字 + `duration` 数字，没有预览
- **tileset animation**（`AnimationEditor`，Inspector > tilesets 标签页）：同样逐帧填数字

用户要记住 tile ID 对应哪个图块，完全不可视化。

**方案**：

- 动画编辑器改为**帧条 + 缩略图**布局：
  - 每帧显示为一个卡片：tile 缩略图（从 sheet 图裁切）+ duration input + 拖拽排序手柄 + 删除按钮
  - 帧条上方实时播放预览（按 duration 循环播放帧序列，显示当前帧缩略图）
  - "添加帧"改为从当前 sheet 点击选 tile（弹出 mini palette picker，不用手填 ID）
- cell animation 和 tileset animation 共用同一个 `AnimationFrameEditor` 组件，只是数据源不同
- 帧的 tileId 输入框保留（高级用户用），但默认交互是点缩略图选

**改动范围**：

- 新建 `apps/desktop/src/pages/workbench/workspaces/map/editors/core/AnimationFrameEditor.tsx`：帧条 + 预览 + mini picker
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：替换 `MapAssetCellAnimationsEditor` 和 `AnimationEditor`
- `apps/desktop/src/styles/features/map-asset-shell.css`：帧条 + 预览样式
- locale bundle：帧条文案、预览播放 label
- 单元测试：帧排序、duration 解析逻辑

### 4.3 昼夜画布预览

**现状**：画布上看不到哪些格子有昼夜替换，要切到 Inspector 昼夜卡片 hover 列表项才高亮。

**方案**：

- 画布加"昼夜高亮"开关（tool rail 或顶部 chips）：
  - 开启后，有昼夜替换的格子用紫色边框高亮（区别于 overlay 的 walkable/water 等规则色）
  - hover 高亮格子时弹 mini tooltip 显示 day tile / night tile 缩略图
- 开关默认关闭，避免画布太花
- 复用 `cellOverlay` 机制，但作为独立开关（不和 walkable/block 等 overlay 冲突）

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapViewport.tsx`：新增 daynight highlight overlay
- `apps/desktop/src/pages/workbench/workspaces/map/editors/MapAssetEditor.tsx`：开关 + overlay 数据计算
- `apps/desktop/src/styles/features/map-asset-shell.css`：昼夜高亮色
- locale bundle：开关 label

---

## 阶段五：右键菜单补全

**优先级**：中 | **改动量**：中 | **依赖**：无（可与一~三并行）

### 现状

只有画布有右键菜单（`MapViewportContextMenu` + `contextMenuExtraItems`），提供：

- 画布导航：适配/1:1/放大/缩小/居中/重置
- 导出 PNG
- 在此添加对象
- inspect/brush/erase/addTileData（MapAssetEditor 扩展项）

以下区域**完全没有右键菜单**：

- 图层列表行
- 调色板 sheet 标签 / recent 缩略图 / sheet 图区域
- Inspector 对象列表项 / 家具列表项 / 昼夜列表项 / 传送门列表项
- 对象库面板
- tileset 管理区的 tileset 选择

用户在这些列表项上想操作（删除/复制/定位/编辑）只能找按钮，按钮还分散在不同位置。

### 5.1 图层列表右键菜单

**方案**：图层行右键弹出：

- 重命名（触发双击编辑模式，复用 2.1）
- 复制图层（`onDuplicateLayer`，capabilities.layerManagement 关闭时隐藏）
- 删除图层（`onRequestDeleteLayer`，同上）
- 上移 / 下移（`onMoveLayer`，同上）
- 切换可见性（复用可见性 toggle）
- 切换锁定（复用锁定 toggle，capabilities.layerManagement 关闭时隐藏）
- ---分隔---
- 在画布定位此图层（如果有 selectedTile，居中到该格；否则只切 activeLayer）

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorLayersPanel.tsx`：每行包 `ContextMenu.Root`
- locale bundle：右键菜单项文案（部分复用 `duplicateLayer`/`deleteLayer`/`moveLayerUp`/`moveLayerDown`/`hideLayer`/`showLayer`/`lockLayer`/`unlockLayer`，新增"定位此图层"）

### 5.2 调色板右键菜单

**方案**：

- **sheet 标签**右键（阶段一标签条）：
  - 替换图片（`onAddProjectImage(path, name)`，capabilities.tilesetManagement 关闭时隐藏）
  - 删除 sheet（新增 `removeTileset` action，capabilities.tilesetManagement 关闭时隐藏；删除前确认）
  - 在 Inspector 编辑此 sheet（切到 tilesets 标签页 + 选中该 tileset）
- **recent 缩略图**右键：
  - 恢复此选区（复用 `restoreRecent`）
  - 从最近用列表移除（新增 `removeRecent` preference action）
- **sheet 图区域**右键：
  - 当前选区 → 设为画笔（复用 `commitSelection`）
  - 当前选区 → 设为昼夜 night tile（切到昼夜工具 + 用此选区）
  - 当前选区 → 设为动画帧（如阶段四动画帧条已实现）

**改动范围**：

- `apps/desktop/src/entities/map/ui/MapTilesetPalette.tsx`：标签/recent/sheet 图区包 ContextMenu
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/useMapDocumentEditor.ts`：新增 `removeTileset` action
- `apps/desktop/src/shared/lib/app-state`：`removeRecentSelection` preference action
- locale bundle：右键菜单项文案

### 5.3 Inspector 列表项右键菜单

**方案**：统一给 Inspector 内所有列表项加右键菜单，项类型不同菜单不同：

- **对象/标记器列表项**：
  - 定位到画布（`onLocateObject`）
  - 删除（`onDeleteSelectedObject`）
  - ---分隔---
  - 在画布高亮（hover 高亮，复用 `onHighlightInspector`）
- **家具列表项**：
  - 定位到画布（`onLocateTile`）
  - 在画布高亮
- **昼夜列表项**：
  - 定位到画布（居中到该格）
  - 删除此昼夜替换（复用 `removeEntry`）
  - 编辑此替换（打开编辑表单，预填该 rect 数据）
- **传送门列表项**：
  - 定位到画布
  - 删除（复用 `deleteEntry`）
  - 编辑（复用 `openEdit`）

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：对象/家具列表项包 ContextMenu
- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetMapCards.tsx`：昼夜/传送门/门列表项包 ContextMenu（`CollapsibleEntryList` 加 `onContextAction` 或每行包 ContextMenu）
- locale bundle：右键菜单项文案（部分复用 `locateObject`/`deleteEntry`）

### 5.4 对象库右键菜单

**方案**：对象库面板的对象项右键：

- 放置到当前选中格（`onPickObject`，如已选格）
- 查看对象详情（展开对象元数据，如有）
- ---分隔---
- 在画布定位已放置的此对象实例（如有，调 `onLocateObject`）

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapObjectLibraryPanel.tsx`：对象项包 ContextMenu
- locale bundle：右键菜单项文案

### 5.5 tileset 管理右键菜单

**方案**：Inspector > tilesets 标签页的 tileset 选择区右键：

- 替换图片
- 删除 sheet（同 5.2）
- 编辑 TSX 源（如已启用外部 TSX）
- ---分隔---
- 在调色板切换到此 sheet

**改动范围**：

- `apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx`：tileset 详情区包 ContextMenu
- locale bundle：右键菜单项文案

---

## 实施路径

| 阶段                          | 优先级 | 改动量 | 依赖  | 建议顺序 |
| ----------------------------- | ------ | ------ | ----- | -------- |
| 一：调色板体验                | 高     | 中     | 无    | 1        |
| 二：图层行内编辑 + hover 预览 | 高     | 小     | 无    | 2        |
| 三：Inspector 检查体验        | 高     | 中     | 无    | 3        |
| 四：昼夜 & 动画重做           | 中     | 大     | 一~三 | 5        |
| 五：右键菜单补全              | 中     | 中     | 无    | 4        |

阶段一、二、三、五可并行（改动文件基本不重叠）。阶段四依赖前三阶段的 UI 基础设施（hover 预览、行内编辑、信息浮层）。阶段五建议在四之前做——右键菜单是低风险高收益，能立即改善"找按钮难"的问题。

## 验证规则

- 每阶段完成后跑 `vp run lint` + `vp run build` + 受影响的测试
- UI/布局变更需要浏览器预览证明（AGENTS.md 要求）
- 新增文案走 `@locales/provider` typed hooks，禁止硬编码
- 配色走 `tokens.css` 主题变量
- 新增纯逻辑（昼夜 stroke 写入、帧排序）补充单元测试放 `src/tests/unit/`
- 新增组件遵循分层规则（pages → features → entities → shared）

## 风险

- **1.3 图块搜索**依赖 tile 级命名元数据，可能需要先扩展 `vanillaTilesheets` catalog。如无元数据则降级或跳过。
- **4.1 昼夜画刷**改动 `CellOverlayRule` 类型和 `MapViewport` overlay 渲染，影响面较大，需充分测试不破坏现有 walkable/water 等 overlay。
- **4.2 动画帧条**的 mini palette picker 需要复用 `MapTilesetPalette` 的 sheet 图裁切逻辑，注意性能（大 sheet 图裁切）。
