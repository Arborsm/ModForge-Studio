# 地图编辑器 Inspector 改版方案：内容 tab 合并 + 语义编辑工作室化

> 状态：A+B+C 全部实施并验收（lint / vitest 210 文件 1926 测试 / build / tsc 全绿）。来源：2026-08 用户提出「动画和对象 tab 合并，昼夜替换等走动画式方案」。
> 后续：2026-08 用户再要求「地图」并入「内容」，tab 4 → 3（调色板 / 内容 / 高级）；MapAssetMapCards 移至内容 tab 家具列表与动画 section 之间，`inspectorTabMap` key 删除，`map-inspector-map` 引导锚点改挂内容 tab。
> 前置：本轮「地图」tab 重做已完成（空段收纳 + 统一添加入口 + 门/昼夜小对话框 + 扁平行），本方案在其之上演进。

## 1. 现状盘点（代码锚点）

Inspector 现有 5 个 tab：调色板 / 地图 / 对象 / 动画 / 高级（[MapAssetEditorInspector.tsx:273-285](../../apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx#L273-L285)）。

- **对象 tab**：选中对象详情（光源标记的物品/点亮/光形，普通对象的家具匹配信息）、选中格逐格动画帧（AnimationFrameEditor）、标记列表、普通对象列表、已放置家具列表（[L367-660](../../apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx#L367-L660)）。
- **动画 tab**：MapAnimationDialog 入口按钮 + 动画组实时预览列表（AnimationGroupList，[L661-711](../../apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAssetEditorInspector.tsx#L661-L711)）。
- **「动画方案」范式**（本方案要推广的交互）：面板里只放「条目列表（实时预览缩略图 + meta + 快捷动作）」；编辑走 xl 两段式大对话框——先 MapTilesheetGallery 选图块表，再 SheetGridCanvas 框选帧区域 + 右栏帧编辑（[MapAnimationDialog.tsx:34-48](../../apps/desktop/src/pages/workbench/workspaces/map/editors/core/MapAnimationDialog.tsx#L34-L48)）。全程对话框内点选，不依赖「先在画布选中格子」的前置状态。
- **可复用积木**：
  - `WarpDestinationPointPicker` = MapViewport + `onTileClick` 的只读可点选地图画布（[WarpDestinationPointPicker.tsx:62-72](../../apps/desktop/src/pages/workbench/workspaces/map/ui/WarpDestinationPointPicker.tsx#L62-L72)），目前只用于预览目标地图；同样的包法喂当前 `renderDocument` 就是「对话框内点选当前地图格子」。
  - `SheetGridCanvas`（框选图块区域）、`MapTilesheetGallery`（选表）、`AnimatedTilePreview`（实时预览）。

## 2. 方案

### A. tab 合并：动画并入对象，5 → 4

调色板 / 地图 / **内容** / 高级。

「内容」tab 的 section 顺序（自上而下）：

1. 选中对象详情（有选中对象时）
2. 选中格动画帧（有选中格且有内容时）
3. 标记列表（+ 添加）
4. 普通对象列表
5. 已放置家具列表
6. 动画组列表（实时预览）+ 段头「编辑动画」按钮开 MapAnimationDialog

- tab 可见性：`objectGroups || cellProperties || tilesetManagement`；各 section 按现有 capability 自行 gate（session 模式下 tilesetManagement 为 false 时动画 section 隐藏）。
- 选中对象自动切 tab 的逻辑保留，目标 id 改为新 tab。
- tab 命名建议「内容」（`inspectorTabContent`），替代 `inspectorTabObjects` / `inspectorTabAnimations`；动画组 section 标题沿用「动画」。

### B. 昼夜替换工作室化：DayNightStudioDialog（xl）

把刚落地的小对话框升级为动画式工作室，**取消「先在画布点格子、再去调色板选夜图块」的两处前置**：

- 左栏：当前地图只读点选画布（MapViewport 喂 `renderDocument`；已有替换组渲染热区高亮；点选 = 选白天格；框选留到以后）。
- 右栏：图层 CompactSelect → 白天图块预览（自动取点选格当前图块）→ 夜晚图块（内嵌 SheetGridCanvas，锁定白天格所属图块表直接点选）→ 确认。
- 「地图」tab 的添加类型选择里点「昼夜替换」直接开工作室；已有条目支持点击行进入编辑（顺带补上现在没有的编辑能力，现在只能删）。

### C.（已实施）门 / 传送的起点也内嵌点选

- DoorDialog 升 xl 双栏：左栏 CurrentMapCellPicker 点选门格（自动读该格门图块，已有门高亮），右栏去向沿用 WarpDestinationPointPicker。
- WarpDialog 升 xl 双栏：左栏点选起点格（已有传送起点高亮，编辑时可改起点——per-cell 载体改起点=旧格清空+新格写入，带覆盖确认），载体 touch/action 可用性按对话框内点选的起点格校验。
- 画布选格前置解除：MapSemanticAddDialog 三个类型恒可选；`gidAtCell` 下沉 `@entities/map/lib/cells.ts`（解除循环引用）；studio 类名泛化为 `.map-asset-studio*`。

A/B/C 各自独立可合并；B 依赖的「当前地图点选画布」组件做好后 C 几乎是纯接线。

## 3. 文件级改动清单

### 期 1（A，小）

- `MapAssetEditorInspector.tsx`：tab 数组合并；对象 tab 内容末尾追加动画 section（移动现有 AnimationGroupList + 对话框入口）；自动切换目标 id。
- `locales/model/workbench/map.ts` + zh/en 词典：`inspectorTabContent: '内容' / 'Content'`，删 `inspectorTabAnimations`，`inspectorTabObjects` 留作 section 标题或删除。
- 动画入口按钮文案复用现有 `animationDialogTitle`。

### 期 2（B，中）

- 新建 `map/ui/CurrentMapCellPicker.tsx`：薄包 MapViewport（只读、点选回报、热区高亮 props），从 WarpDestinationPointPicker 抽公共部分或直接并列实现。
- 新建 `editors/core/DayNightStudioDialog.tsx`：左 CurrentMapCellPicker + 右（图层 / 白天预览 / SheetGridCanvas 选夜图块）。
- `MapAssetMapCards.tsx`：DayNightCard 接工作室；`addSignal` 的 `'dayNight'` 分支改开工作室；条目行加点击编辑。
- locale：工作室标题、左栏点选提示、夜晚图块选择提示等新增 key（zh/en/model 三处）。
- CSS：`map-asset-cards.css` 或新文件放工作室双栏布局（注意 styleArchitecture 单文件 1000 行上限，cards 已 994 行，需开新 CSS 文件并在 workbench.css 注册 import）。
- DayNightDialog.tsx（本轮刚建的小对话框）删除。

### 期 3（C，小-中）

- DoorDialog / WarpDialog 左栏内嵌 CurrentMapCellPicker；「地图」tab 添加前置（必须先画布选格）随之解除，统一添加工具条的 disabled 逻辑收敛。

## 4. 验证

- 每期：`vp run lint`、`vp run build`、`vp test run --configLoader runner`（architecture + locales 必过）。
- 期 2/3 的对话框走真实产品路径截图验证（dev mock 建项目 → 种子地图 → 开编辑器）。
- 注意 styleArchitecture 的 CSS 单文件行数上限（map-asset-cards.css 已 994/1000）。

## 5. 已确认决策（2026-08）

1. 合并 tab 命名「内容」（`inspectorTabContent`），`inspectorTabAnimations` 保留作动画 section 标题。
2. 昼夜工作室支持编辑已有条目（条目行 hover「修改」进工作室）。
3. 本次实施 A+B；C（门/传送起点内嵌点选）待 B 验证后单独评。

补充事实：`MapViewport` 已暴露 `editing.inspectorHighlight` / `editing.selectedTileRect` / `actions.onTileClick`（MapViewport.tsx:104-182），工作室左栏薄包即可；主画布本来就会绘制昼夜替换热区（mapViewportCanvasDraw.ts:218）。
