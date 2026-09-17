# 安卓端移动化改造计划（launcher-only + Material 3 页面化）

> 状态：已评审通过（2026-09-17）。配套静态预览：`docs/mockups/android-mobile-ux-mock.html`（浏览器打开，缩到手机宽度或直接看内置手机框）。
>
> 背景：安卓端目前是桌面 UI 的窄屏缩放——工作台入口仍在、导航是顶部滚动条、通知是鼠标 hover 驱动的右下角 toast、SMAPI/游戏日志只进 logcat 用户不可见、mod 详情是悬浮模态、Android 返回键不关浮层。本计划按 Material 3 / Apple HIG 把安卓端改成真正的移动应用。

## 总原则

- **结构性门控用 `androidHost`（isAndroidHost）**：工作台锁定、页面化导航；桌面 dev 有 `devAndroidMock` 可本地预览。
- **纯样式适配用 ≤640px 媒体查询**：桌面窄窗口行为不变，>640px 桌面完全不受影响。
- **抽屉全部页面化**（仅 androidHost）：下载中心、通知中心、设置、mod 详情都是全屏页面，头部带返回箭头，由 LauncherPage 内的移动页面栈（zustand store）管理 push/pop。
- 每个 Phase 独立提交（Conventional Commits + scope），独立模拟器截图验收；TopMenuBar 图标 / gooey-nav.css / library responsive 半成品并入 Phase 2。
- 所有新 UI 文案走 typed locale bundles（en-US + zh-CN 同步）。

## Phase 1 — 启动器锁定（移动端只有启动器）

**文件**：`app/app-shell/AppShell.tsx`、`shared/lib/app-state/appShellState.ts`、`widgets/top-navigation/ui/TopMenuBar.tsx`、`pages/launcher/LauncherPage.tsx`、`app/app-shell/settings/SettingsGuidesSection.tsx`

- `appShellState.ts` 新增纯函数：`resolveStartupAppMode(isAndroid, persisted)` 与 `canEnterWorkbench(isAndroid)`，单元测试覆盖。
- AppShell（androidHost 时）：
  - 初始 appMode 与 `initializeAppUiState` 恢复的持久化 `workbench` 一律强制 `launcher`（用户在模拟器切过工作台会被持久化并复现）；
  - `handleAppModeChange` 拒绝 `workbench`；`workbenchLoaded` 恒 false；
  - **跳过 `preloadWorkbenchPage()` 与 workbench.css 预载**（省内存/流量，不下载 workbench chunk）；
  - guide replay 的 workbench 分支忽略。
- TopMenuBar 新 prop `modeSwitchable`（LauncherPage 传 `!androidHost`）：false 时整段模式切换器不渲染。
- SettingsGuidesSection：androidHost 下过滤掉 workbench surface 的引导项。
- 配置页桌面专属面板 androidHost 隐藏/替换：`ConfigPathPanel` 的游戏路径选择（桌面概念）换成安卓相关项（游戏安装检测、Mods 目录、SMAPI 安装/更新入口）；GMCM 探针已隐藏。
- 架构测试涉及 AppShell import 链处同步更新。

**验收**：模拟器冷启动（含旧持久化 workbench 状态）只进启动器；顶栏无工作台入口；`vp test run` 相关单测过。

## Phase 2 — 底部导航栏（Material 3）

**文件**：`styles/workspace/top-menu.css`（≤640px 块重写）、`styles/primitives/gooey-nav.css`、`styles/features/launcher/configuration/shell-and-layout.css`、`library/responsive.css` 微调

- gooey nav ≤640px 固定底部：`position: fixed; bottom: 0` + `env(safe-area-inset-bottom)`，毛玻璃面板；每项图标（lucide，24px）在上、标签（12px）在下，`justify-around` 均布，badge 移到右上，触摸目标 ≥48dp；gooey 粒子特效移动端禁用（性能）。
- 顶栏移动端 slim：品牌 + 右侧工具（下载/通知/设置），居中导航区腾空。
- 路由容器加 `padding-bottom: calc(4.25rem + safe-area)` 防底部遮挡（discover 分页、configuration 面板、updates 列表同步检查）。
- 删除现 top-menu.css 640px 水平滚动条方案。

**验收**：四页模拟器截图——底部导航图标+标签高亮正确、内容无遮挡、横竖屏旋转正常。

## Phase 3 — 通知中心（桌面抽屉 + 移动页面）

**文件**：`shared/ui/notifications/*`（store + 新 NotificationCenter 组件）、`TopMenuBar.tsx`、`styles/features/notifications.css`、locale

- store 扩展：通知上限（~50 条滚动淘汰）、`unread` 标记与 `lastSeenAt`；`markNotificationsSeen()` 在打开中心时调用；铃铛未读徽标 = 未读数。
- 新 `NotificationCenter` 组件：按时间倒序列出最近通知（未读高亮、等级图标、时间、description 全文、操作按钮），空态文案，「全部清除」。
- 桌面：顶栏新增铃铛图标（未读徽标），点击打开控制中心抽屉（复用 `top-menu-float-panel` 定位模式，与下载浮层同层互斥）。
- 移动：铃铛 push 「通知」全屏页面（页面栈头部返回）。
- toast 本体保留两端；≤640px 重排为顶栏下方全宽横幅、常显关闭、点按展开堆叠（去 hover 依赖）。

**验收**：桌面铃铛抽屉列出最近/未读；移动端通知页可达、未读徽标正确；debug 工具通知模拟截图。

## Phase 4 — 移动页面化（下载中心 / 设置 / Mod 详情）

**文件**：`pages/launcher/LauncherPage.tsx`（页面栈宿主）、新 `pages/launcher/ui/mobile/`（页面栈 store + host + 通用页面头）、`TopMenuBar.tsx`、`features/launcher/ui/cards/LauncherModDetailPanel.tsx`、`app/app-shell/SettingsWindow.tsx`、`AppShell.tsx`

- 新 `mobilePageStore`（zustand）：`pushPage({type: 'downloads'|'notifications'|'settings'|'mod-detail', payload?})` / `popPage()`；页面 host 渲染在 launcher 内容区之上（absolute inset-0，滑入动画）。
- **下载中心**：androidHost 下顶栏下载图标改 push 页面（复用 `LauncherDownloadsPopover` 内容组件）；桌面浮层不变。`launcherChrome` 增加 `onOpenDownloads` 回调。
- **设置**：`SettingsWindow` 加 presentation 变体——androidHost 下仍由 AppShell 状态机驱动，但渲染为全屏页面（头部返回箭头 + 分类面板纵向布局），复用现有懒加载 chunk 与未保存守卫；桌面浮动窗口不变。
- **Mod 详情**：`LauncherModDetailPanel` 加 `presentation: 'drawer' | 'page'`——page 模式不 portal、全屏、头部返回箭头+标题、hero 收缩单行、tabs 横向滚动、底部主操作固定；库/更新/发现三入口自动生效。
- `useLauncherOverlayDismissStore` 协调保留（打开页面时关底层浮层）。

**验收**：模拟器上四个入口（下载/通知/设置/mod 详情）均为全屏页面，返回可退；桌面行为截图对比无变化。

## Phase 5 — 日志查看器（接管的日志）

**文件**：`shared/protocol/launcher-commands.json`、`domain/launcher/commands.rs`、modforge-android `LogCapture` + `BootstrapCommands.cs`、`LauncherConfigurationPage.tsx`、locale

- 协议新增 `read_launcher_log`（Io lane）：`{maxLines, afterOffset}` → `{lines[], nextOffset, truncated}`；按 HANDOFF §2.6 跑 `gen:host-commands` + `gen:android-bridge`。
- Tauri 侧：读应用日志文件 tail（复用 support/logging 的日志路径）。
- Android 侧：新增 `LogCapture`——`Console.SetOut` tee writer（logcat + 环形缓冲/文件，含 SMAPI `LogImpl` 前缀与 .NET DOTNET 输出），bridge handler 返回 tail。
- 前端：配置页头部「查看日志」按钮（androidHost 不再只是滚到 debug 测试区）打开日志查看页面/Dialog：tail 展示 + 手动刷新 + 复制；桌面同样可读本机日志文件。

**验收**：模拟器启动游戏后，日志页能看到 SMAPI/mod 加载输出。

## Phase 6 — Android 返回键 + 收尾

**文件**：modforge-android `LauncherActivity.cs`、前端 `mobilePageStore`、`index.html`、styles 收尾

- `OnBackPressed`：dispatch `android:back` 事件 → 前端按序关最上层（移动页面栈 → mod 详情 → 抽屉/菜单）并回执 `android:back_handled`；C# 等待 ~150ms 未回执 → `MoveTaskToBack`（保持现行为兜底）。
- `index.html` 加 `viewport-fit=cover`；safe-area 已在 Phase 2/3 消费。
- 触摸目标、横竖屏、深色主题走查（tokens 变量，无硬编码色）。

## 验证与交付

- 每 Phase：`vp run lint` + `vp test run`（受影响单测/架构测试）+ `vp run build`；涉及协议时 `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`。
- 模拟器回归（`adb install -r` + cdp-eval + 截图）：四页导航、mod 详情三入口、通知中心、下载页、设置页、日志页、返回键行为、深色主题。
- 最终：重建 www + 打 Release APK 交付；主仓库与 modforge-android 分 Phase 提交；顺带确认 LIBS_TOKEN 配好后 CI run 已绿、产物 APK 正常。
