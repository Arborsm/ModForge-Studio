# Dev Mock 与可视化验证

> 适用范围：工作台页面的浏览器端开发调试与 UI/布局变更验证。
> 关联：验证纪律见 `AGENTS.md` 验证规则节；页面视觉规范见 `docs/design/page-design-spec.md`。

## 1. 浏览器 dev mock

桌面宿主不可用时，前端可以在纯浏览器里跑：`vp run web:dev -- --host 127.0.0.1 --port 5175`，URL 带查询参数开启 mock：

- `?mfLauncherMock=1` — 启动器数据 mock
- `?mfSettingsMock=1` — 设置/外观 mock（中文界面）
- 两个一起用是工作台验证的常规组合：`/?mfLauncherMock=1&mfSettingsMock=1`

实现位置：`apps/desktop/src/platform/tauri/devLauncherMock.ts`（启动器/设置/AI）+ `devLauncherMockCpMaker.ts`（项目草稿与项目资产）。

### 1.1 项目资产 mock 约定

`devLauncherMockCpMaker.ts` 为每个草稿维护内存资产字节库，支持 `read/write/rename/delete_cp_maker_project_asset(s)`。约定：

- 资产字节按原样往返；`sha256` 用确定性伪哈希，仅供缓存键使用。
- `load_cp_maker_project_map_asset` 约定：种子地图资产的字节**直接是序列化的 MapDocument JSON**（真实宿主会把 TMX/TBin 归一化成同样的 JSON 形状返回），mock 只解析校验后原样返回。
- 状态只活一个页面生命周期——刷新页面即清空。验证脚本里改完 mock 数据后通过「顶栏项目菜单重新选择项目」让前端重读草稿，不要刷新页面。

### 1.2 游戏资源 mock

`scan_maps` 返回两张假游戏地图（Town/Farm），`scan_image_assets` / `scan_data_assets` / `scan_audio_assets` 与 `load_image_data_url` / `load_audio_data_url` / `load_text_asset` 都有假实现，可以真实走通「从游戏复制」四类导入。新增 host command 时同步补 mock，否则浏览器验证会撞上 `Unhandled dev launcher mock command`。

## 2. Playwright 验证脚本模式

UI/布局变更必须配 Playwright 验证（`apps/desktop/scripts/verify-*.mjs`），并在 `apps/desktop/package.json` 注册 `test:*` 脚本。以 `verify-asset-library-ui.mjs` / `verify-map-patch-ui.mjs` / `verify-map-asset-editor-ui.mjs` 为模板：

- **走真实产品路径**：用 UI 建项目、点导航进页面；需要预置数据时通过 `window.__TAURI_INTERNALS__.invoke` 直接调 mock 命令种子（如 `write_cp_maker_project_assets`），再经 UI 触发前端重读。
- **数值断言优先**：`getBoundingClientRect()` 测对齐/溢出/栏宽，`getComputedStyle` 测字号与去装饰（预览图无框、危险按钮无底色）。截图只做观感辅助，不能替代几何断言。
- **双宽度双主题**：1440 与 1680 宽各验证一次，明暗主题各截一帧。
- **引导层**：页面切换后调 `skipGuides()`（引导会挡点击）；点击关键按钮用带重试的 helper。
- **折叠导航**：侧导航收成图标轨时用 `.workbench-side-nav-item[data-tip="页面名"]` 定位，label 文本在折叠态不可见。
- **失败要列清单**：收集所有断言失败最后一并报，不要第一个失败就退出。

## 3. 消息系统约定

操作失败与任务结果统一走 `@shared/ui/notifications` 的 `publishNotification`（组件内用 `useNotificationPublisher()`）：

- 失败：`level: 'error'`，`title` 为通用失败文案（locale key），`description` 带原始 `error.message`——禁止吞错误，禁止回退到页内内联错误横幅。
- 用稳定 `id` 让同类通知替换而不是堆叠；成功/恢复后用 `dismissNotification` 清掉对应错误。
- 页面级状态（整页加载失败、文档校验 banner 这类上下文警示）仍可内联展示；瞬时操作结果一律走通知。
