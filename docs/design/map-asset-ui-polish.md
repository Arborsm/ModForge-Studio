# 地图制作 & 素材库 UI 打磨方案

> 状态：切片 A/B/C 已交付（A `49eafad1`、B `80a09c32`、C `70a6a727`）；切片 D 未做，按需单开
> 追加要求（已落地）：错误提示统一走项目消息系统（`@shared/ui/notifications`），不再用页内红条
> 依据：`docs/design/page-design-spec.md`、`docs/design-system.md`、`DESIGN.md`
> 涉及代码：
>
> - 素材库 `pages/workbench/workspaces/asset-library/ui/AssetLibraryWorkspace.tsx` + `styles/workspace/asset-library.css`
> - 地图工作区 `pages/workbench/workspaces/map/editors/MapPatchEditor.tsx` + `styles/features/map-patch-workspace.css`
> - 地图文档编辑器 `pages/workbench/workspaces/map/editors/MapAssetEditor.tsx`（四件套）+ `styles/features/map-asset-shell.css` + `styles/workspace/map-tileset-palette.css`

## 现状问题诊断（基于 2026-08 截图逐条核对设计规范）

### A. 素材库页

1. **双行动作区，主 CTA 不唯一**：header 行是「导入素材 / 导入文件夹」，toolbar 行又塞「从游戏复制 / 新建地图」，四颗按钮分散两行（违反规范 §0.4 主按钮唯一主路径）。
2. **素材卡片信息松散**：文件名截断无 tooltip，路径 + 元信息占两行，缩略图容器比例不统一。
3. **tilesheet 缩略图疑似渲染失败**：`AbandonedJojaMart_i/p/u…` 三张 tilesheet 显示灰色占位图标（657 KB / 56 KB PNG 未出图）——先查根因（懒加载失败？尺寸超限？），不做遮掩式 fallback。
4. **详情面板**：预览大图带容器边框 + 灰底（违反规范 §6.2 详情大图去容器装饰）；「依赖 / 被以下素材引用」为空时仍渲染空文案区块（违反规范 §5.3 空区块隐藏）；操作按钮四颗等大并列，删除没有降级。
5. 中部内容少时大片死白（空态可用但卡片少时网格不收缩）。

### B. 地图工作区（MapPatchEditor）

1. **左画布**：预览未做 fit/缩放提示，小地图在大视口里漂移；顶部「目标名 + 之前/结果/差异」switch 视觉权重过低。
2. **右侧改动卡片有「卡片套卡片」感**：白卡（边框 + 阴影）内部再叠浅蓝 header 区块（违反规范 §2.2 / §5.2）；卡片头同时塞图标、标题、副标题、状态徽标、可选标、删除、折叠箭头，层级拥挤。
3. 卡片体内表单字段全宽堆叠，垂直密度低，长滚动（违反桌面端「少滚动」取向）。

### C. 地图文档编辑器（MapAssetEditor）

1. **底部图块素材托盘失控**：托盘高度过大挤压画布；tilesheet 预览溢出左边界，右侧大片灰空；素材 tab 缩略图过小。
2. **中央画布**：地图未 fit 视口，浮动工具栏图标过小、与画布边缘距离随意。
3. **左图层面板**：行高与图标偏小，面板下方大面积空白无收束。
4. 右检查器空态（单元格 tab 无选中时）只有空壳 tab 条。

## 交付切片（每片可独立合并）

### 切片 A：素材库页

- 合并动作区：主 CTA 只留「导入素材」；「导入文件夹 / 从游戏复制 / 新建地图」降为 toolbar 次要按钮，单行排布。
- 卡片收紧：统一缩略图容器比例，文件名单行截断 + Tooltip，元信息合并一行（类型 · 大小）。
- 详情面板：预览图去边框/背景；依赖与被引用为空时整块隐藏；操作按钮主次分级（删除降为低调危险样式）。
- **根因排查 tilesheet 缩略图占位问题并修复**。
- 文案走 locales，新增 key 补类型化 bundle。

### 切片 B：地图工作区改动面板

- 改动卡片去「套娃」：去掉卡内浅蓝 header 底色，改扁平头（标题 + 状态徽标一行，副标题降次要色）。
- 卡片体字段两栏化/紧凑化，减少垂直滚动。
- 左画布预览默认 fit，工具条对齐地图文档编辑器的视觉层级。

### 切片 C：地图文档编辑器

- 底部托盘：固定合理高度（或沿既有折叠模式），tilesheet 预览在容器内裁剪对齐，消除右側灰空；tab 缩略图放大到可辨识尺寸。
- 画布 fit + 浮动工具栏尺寸/对齐收紧。
- 图层面板行高收紧；检查器空态给最小有用提示（locale 文案，非占位 UI）。

### 切片 D（可选）：跨页一致性

- AuthoringRuntime header / 保存状态 / ExpertPanel 入口样式对齐，辐射事件、角色等所有 authoring 页。

## 验证（每切片收尾必做）

- `vp test run --configLoader runner`（前端测试全量）
- `vp run lint` + `format:check`
- 按 page-design-spec §11：Playwright 真实页面验证，稳定 `data-*`/ARIA 选择器 + `getBoundingClientRect()` 数值断言（对齐/溢出/间距），截图只做观感辅助；1440 与 1680 宽各验一帧，明暗主题各过一遍。
- 文案无硬编码；颜色无字面量，全走 tokens.css 变量。

## 明确不做

- 不改交互逻辑、状态机、数据流（纯视觉/布局打磨，tilesheet 缩略图 bug 除外）。
- 不动 ResourcePicker 等跨页共享组件的内部结构。
- 不为「统一规范」给稀疏卡片区硬加彩色虚线（规范 §3.3 禁令）。
