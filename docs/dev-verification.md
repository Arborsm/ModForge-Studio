# Dev Mock 与可视化验证

> 适用范围：工作台页面的浏览器端开发调试与 UI/布局变更验证。
> 关联：验证纪律见 `AGENTS.md` 验证规则节；页面视觉规范见 `docs/design/page-design-spec.md`。

## 1. 浏览器 dev mock

桌面宿主不可用时，前端可以在纯浏览器里跑：`vp run web:dev -- --host 127.0.0.1 --port 5175`，URL 带查询参数开启 mock：

- `?mfLauncherMock=1` — 启动器数据 mock
- `?mfSettingsMock=1` — 设置/外观 mock（中文界面）
- `?mfAndroidMock=1` — Android WebView 桥 mock（复用启动器 mock 数据源；SAF 选择器/浏览器跳转/AI 代理都有假实现，与 Tauri mock 二选一安装）
- 两个一起用是工作台验证的常规组合：`/?mfLauncherMock=1&mfSettingsMock=1`

实现位置：`apps/desktop/src/platform/tauri/devLauncherMock.ts`（启动器/设置/AI）+ `devLauncherMockCpMaker.ts`（项目草稿与项目资产）+ `platform/android/devAndroidMock.ts`（Android 桥）。

**mock 覆盖由架构测试强制**（`src/tests/architecture/devLauncherMockCoverage.test.ts`）：每个 host command（含 `android:*` 桥命令）必须有 mock case arm 或落在白名单簇里（debug-bridge / compat-plugins / file-cache / launcher 安装下载归档 / 图片解析 / misc，每簇注释理由）。白名单与后端架构白名单同语义——是迁移清单：给白名单命令补了 mock 就必须同步删条目，新增命令会被测试强制二选一。浏览器 mock 不是 release 依据：无 mock 的命令在浏览器里抛 `Unhandled dev launcher mock command`，真实行为以 `docs/maintenance.md` 的 release gate 冒烟为准。

### 1.1 项目资产 mock 约定

`devLauncherMockCpMaker.ts` 为每个草稿维护内存资产字节库，支持 `read/write/rename/delete_cp_maker_project_asset(s)`。约定：

- 资产字节按原样往返；`sha256` 用确定性伪哈希，仅供缓存键使用。
- `load_cp_maker_project_map_asset` 约定：种子地图资产的字节**直接是序列化的 MapDocument JSON**（真实宿主会把 TMX/TBin 归一化成同样的 JSON 形状返回），mock 只解析校验后原样返回。
- 状态只活一个页面生命周期——刷新页面即清空。验证脚本里改完 mock 数据后通过「顶栏项目菜单重新选择项目」让前端重读草稿，不要刷新页面。

### 1.2 游戏资源 mock

`scan_maps` 返回两张假游戏地图（Town/Farm），`scan_image_assets` / `scan_data_assets` / `scan_audio_assets` 与 `load_image_data_url` / `load_audio_data_url` / `load_text_asset` 都有假实现，可以真实走通「从游戏复制」四类导入。新增 host command 时由 `devLauncherMockCoverage` 架构测试强制补 mock 或进白名单（见 §1），否则会撞上 `Unhandled dev launcher mock command`。

### 1.3 Android WebView 直连 dev server（模拟器/真机 HMR）

安卓宿主的 WebView 可以直接加载本仓库的 Vite dev server，前端改动秒级热更新，不用重走「build → 拷贝 Assets/www → 重装 APK」：

1. 启动 dev server：`vp run web:dev --port 5175`（HMR WebSocket 默认走 5176，即主端口 + 1）。注意 `vp run` 不透传环境变量，`MODFORGE_DEV_PORT=5175 vp run web:dev` 会被静默忽略、仍会起在 5173——端口必须用 `--port` 传。
2. 在 APK 的设置页 →「开发服务器」卡片：模拟器填 `http://10.0.2.2:5175` 点「启用」，宿主立即重建 WebView 并从 dev server 加载；真机先在宿主机执行 `adb reverse tcp:5175 tcp:5175` 和 `adb reverse tcp:5176 tcp:5176`，URL 填 `http://127.0.0.1:5175`。
3. dev server 不可达时 WebView 落到原生恢复页（重试 / 一键回内置资源），不会死胡同；「停用」即回到 APK 内置资源。

宿主侧字段、cleartext 白名单与恢复页实现在 modforge-android 仓库（见其 README「前端开发服务器（HMR）」节）。asset origin 是宿主契约：`@platform/android` 的 `ANDROID_ASSET_ORIGIN` 必须与 `LauncherActivity.AssetHostOrigin` 一致。

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
