# 素材库：分类修正、框选多选、分组展示、从游戏导入全资源

> 状态：已交付（2026-08-01，切片 1-3 由 fast 模型执行：89042582 / c543d833 / 2d0aa1bc / d9627acf；切片 4：a0d9ff85）
> 背景：2026-08-01 用户反馈四个问题：①导入的 TMX 显示为「其他」；②网格无法框选；③素材没有分类展示；④「从游戏复制」只有地图，没有其他资源。
> 铁律：文案全走 typed locales（model + zh-CN + en-US 三处同步）；颜色全走 tokens.css 变量；操作失败全走 `@shared/ui/notifications`（title 为通用失败文案，description 带原始 error.message，禁止吞错误）；禁止最小实现；每片收尾 `vp test run --configLoader runner` + `vp lint .` + `vp fmt .`，Playwright 真实页面验证（dev server 已在 http://127.0.0.1:5179 运行，mock query `/?mfLauncherMock=1&mfSettingsMock=1`）。

## 根因分析

1. **TMX 归类错误**：`asset-library/model/projectAssets.ts` 的 `classifyProjectAsset(mediaType)` 只看 MIME。TMX/TBIN 无标准 MIME（浏览器 `File.type` 为空 → `application/octet-stream`）→ 落入 `other`。同文件已有 `isProjectMapAssetPath()` 可判定地图格式。
2. **无框选**：网格就是平铺按钮列表，未接选择系统。仓库已有现成模式：`pages/launcher/library/ui/LauncherLibraryGrid.tsx` 用 `@air/react-drag-to-select` 的 `useSelectionContainer`（见该文件 266-300 行与 595 行附近），依赖已装。
3. **无分组**：`AssetLibraryWorkspace.tsx` 的网格只按 filter 过滤，无分组渲染。`map-catalog.css` 的 virtual-header（小标题+计数）是现成的分组头风格参照。
4. **从游戏复制只有地图**：toolbar 的 ResourcePicker 只喂 `toMapResourceBrowserOptions(mapCatalog.assets,…)`。宿主侧现状：`scan_audio_assets` / `load_audio_data_url` / `load_image_data_url` / `load_text_asset` 命令已存在（`entities/game/api/gameAssets.ts` 有对应封装）；**没有**枚举游戏图片/数据文件的命令，需要新增 Rust 命令，镜像 `scan_audio_assets`（`src-tauri/src/commands/assets.rs`、`src-tauri/src/domain/assets.rs` 的 `scan_audio_assets` 约 1197 行）。

## 切片 1：地图类素材分类（纯前端，小）

- `projectAssets.ts`：`ProjectAssetKind` 增加 `'map'`；`classifyProjectAsset` 增加第二参数 `relativePath`，开头判断 `isProjectMapAssetPath(relativePath)` → 返回 `'map'`。
- 全仓 grep `classifyProjectAsset(` 改掉所有调用点（主要在 `AssetLibraryWorkspace.tsx`：filter 过滤、卡片 kind、AssetGlyph、详情预览两处）。
- `AssetGlyph`：`'map'` → `MapIcon`。
- locales：`filters` 增加 `map`（zh `'地图'`、en `'Maps'`、`locales/model/workbench/asset-library.ts` 类型同步）。下拉选项由 `copy.filters` 驱动，自动出现。
- 单测：扩展 `src/tests/unit/pages/workbench/workspaces/asset-library/projectAssets.test.ts`（tmx/tbin → map，png → image，json → data，无 MIME → 按扩展名兜底）。
- Playwright：`scripts/verify-asset-library-ui.mjs` 种子加一张 `.tmx` 素材，断言其 meta 行以「地图」开头且不显示「其他」。

## 切片 2：网格按类型分组（纯前端）

- 网格视图且 `filter === 'all'` 时：visibleAssets 按 `map → image → audio → data → other` 分组，每组渲染 `.asset-library-kind-header`（类型名 + 数量，风格参照 map-catalog virtual-header：12px 小标题、次要色、hairline 间距），组内仍按路径排序；`filter !== 'all'` 或列表视图保持平铺不分组。
- CSS 加在 `styles/workspace/asset-library.css`，禁止写死颜色。
- Playwright：断言分组头按预期顺序出现、数量与卡片数一致；列表视图下无分组头。

## 切片 3：框选多选 + 批量删除（纯前端）

- 严格照抄 `LauncherLibraryGrid.tsx` 的 `useSelectionContainer` 接入方式（selection 计算、DragSelection 渲染位置、卡片可选标记），容器为 `.asset-library-browser`，仅网格视图启用。
- selection 为 `Set<relativePath>`；出现非空选择时网格上方/下方显示批量操作条：「已选 N 项」、全选（当前 visibleAssets）、清除、删除。Esc / 切 section / 切 filter / 搜索词变化时清空选择。
- 删除：复用现有确认 Dialog（新增批量文案 keys），确认后顺序 `project.deleteProjectAsset` 逐个执行；单条失败继续，结束后有失败则 `publishNotification` 报失败数，成功则清选择。复选中的卡片加选中态样式（accent 边框，复用 is-selected 系列变量）。
- locales 新增：`selectionCount`、`selectAll`、`clearSelection`、`deleteSelectedAction`、`deleteSelectedTitle`、`deleteSelectedMessage(count)`、`deleteSelectedPartialFailed(count)`（三处同步）。
- Playwright：鼠标拖拽框选两张卡 → 断言批量条出现、计数正确 → 走通批量删除并断言卡片数减少。

## 切片 4：从游戏复制扩展到 图片/音频/数据（Rust + 前端，最大）

- **Rust**：新增 `scan_image_assets`、`scan_data_assets` 两个 host command，实现镜像 `scan_audio_assets`：
  - image：遍历游戏 Content 下 `.xnb`，排除 `Maps/`、`Data/` 前缀；返回 `{ name, relativePath, absolutePath, sizeBytes }`（name 为去扩展名的 CP asset key，正斜杠）。
  - data：遍历 `Content/Data` 下 `.xnb` 与 `.json`。
  - 在 invoke_handler 注册后运行 `vp run --filter @modforge/desktop gen:host-commands` 重新生成前端 HOST_COMMANDS（禁止手写）。
  - `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` 必过；若 `scan_audio_assets` 有 Rust 测试则镜像补测试。
- **前端 api**：`entities/game/api/types.ts` + `gameAssets.ts` 增加 `GameImageAssetSummary` / `GameDataAssetSummary` 与 `scanImageAssets` / `scanDataAssets`（镜像 `scanAudioAssets` 的缓存写法）。
- **导入管线**：新建 `asset-library/model/importGameAsset.ts`：
  - 图片：`loadImageDataUrl(name)` → 拆 dataURL → `allocateProjectAssetPath` 落到 `assets/<末段名>.png` → `project.writeProjectAssets(..., 'generated')`。
  - 音频：`loadAudioDataUrl(absolutePath)` → 同上，mediaType 从 dataURL mime 解析。
  - 数据：`loadTextAsset(gameRootPath, name, locale)` → 文本转 base64 → 写 `.json`。
  - 任何失败 `publishNotification`（title 用新增 `importGameAssetFailed`，description 带原始错误）。
- **toolbar**：「从游戏复制」改为小型分段入口（地图/图片/音频/数据四项，可用 CompactSelect 或参照 load-family picker 的小卡片弹层），每项打开对应 ResourcePicker；图片/音频/数据的扫描加载/错误态与地图扫描一致（错误同样走通知）。
- **dev mock**：在 `devLauncherMockCpMaker.ts`（或合适的 mock 文件）补 `scan_image_assets` / `scan_data_assets` / `load_image_data_url` / `load_audio_data_url` / `load_text_asset` 的假实现，保证 Playwright 能真实走通四种导入。
- **Playwright**：`verify-asset-library-ui.mjs` 增加四种类型各导入一次，断言素材出现在网格正确分组、通知无错误。

## 明确不做

- 不做跨目录移动/批量移动素材（批量操作只有删除）。
- 不改 ResourcePicker 内部结构。
- 不给音频做波形预览、不给数据文件做 JSON 预览（超范围）。
- 不动 `docs/design/map-asset-ui-polish.md` 已交付的切片 A/B/C 代码。
