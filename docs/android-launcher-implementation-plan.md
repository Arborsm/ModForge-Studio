# 安卓启动器实施计划

> 派发给执行代理。前置决策：fork SMAPILoader 壳 + 内嵌 ModForge 前端 + C# 重写 launcher 业务层。Rust 不进 APK。
> 范围：只产出代码与接线，不写测试、不做真机验证、不跑构建验证——验收由用户完成。
> 依据文档：`docs/android-launcher-feasibility.md`（技术事实）、`docs/frontend-architecture.md`（前端分层）、`AGENTS.md`（仓库硬规则）。

## 仓库布局

- **本仓库**：`E:\Arbor\ModForge Studio`（前端改造与生成器脚本所在，下称"主仓库"）。
- **安卓仓库**：本地检出位置 `E:\Arbor\modforge-android`（与本仓库平级）。fork `NRTnarathip/SMAPILoader` 到 GitHub 账号 `Arborsm` 名下，仓库名 `modforge-android`，clone 到上述路径。
- 不放进主仓库子目录：.NET Android 工具链（dotnet CLI + Android SDK）与主仓库的 pnpm/Rust 工具链、CI 完全不通用。
- 生成器脚本 `generate-android-bridge.mjs` 的输出路径默认指向 `..\modforge-android\SMAPIGameLoader\Bridge\Generated\`（相对主仓库根目录），支持 `--out` 参数覆盖。
- 前端产物拷入安卓仓库的路径：`E:\Arbor\modforge-android\SMAPIGameLoader\Assets\www\`（由 `LauncherActivity` 伺服）。手动流程：主仓库跑 `vp run build`（即 `build:web.cjs`），产物目录整体拷贝覆盖 `Assets\www\`。

## 分支与提交

- 主仓库：当前在 `pages` 分支，前端改造从 `pages` 切新分支 `feat/android-host`。
- 安卓仓库：从上游 release tag 切 `feat/modforge-shell`（见任务 5.3）。
- 两仓库各自独立提交，遵循 Conventional Commits 带 scope。

## 环境前置

执行代理开始前确认：

- 主仓库：`vp install --frozen-lockfile` 已跑过。
- 安卓仓库：本机已装 .NET 9 SDK（9.0.318，满足上游 `global.json` pin 9.0.312 + latestFeature）与 .NET 10 SDK。**android workload 必须装在 .NET 9 的 SDK band 下**（global.json 把工程 SDK 解析到 9.0.318）；直接跑 `dotnet workload install android` 会装到 10.0 band 导致 NETSDK1147。正确做法（已验证）：在任意空目录放一个 pin 9.0.318 的 `global.json`，于该目录下执行 `dotnet workload install android`，workload 即落位 9.0 band。装完后 `dotnet restore SMAPILoader.sln` 全部四个工程还原成功。上游 `docs/building.md` 所述定制 `libmonosgen-2.0.so` 需按其文档就位（先用上游分发的二进制）。
- 本机 PATH 注意：Git Bash 里 `dotnet` 可能解析到其他位置，显式 `export PATH="$PATH:/c/Program Files/dotnet"` 后再操作。
- GitHub CLI `gh` 已登录（已确认账号 Arborsm）。

## 前期准备（已完成，2026-09-17）

- 主仓库已切分支 `feat/android-host`（基于 `pages`）。
- 已 fork `NRTnarathip/SMAPILoader` → `Arborsm/modforge-android`，clone 至 `E:\Arbor\modforge-android`，upstream remote 已加。
- 安卓仓库已从上游 tag `1.1.7`（注意：无 v 前缀）切分支 `feat/modforge-shell`。
- 主仓库已建目录 `apps/desktop/src/platform/android/` 与 `shared/protocol/`（仓库根 `shared/` 目前只有 `protocol/`，为本次新建）。
- 上游工程结构确认：主工程 `SMAPIGameLoader/SMAPIGameLoader.csproj`（net9.0-android），解决方案 `SMAPILoader.sln`；`SMAPIGameLoader/` 下现有 `Game/`、`Launcher/`、`Tool/`、`LibsPatch/`、`Resources/` 目录——任务 8 的 `Services/` 与桥代码按此层级新增。

---

## 第一部分：本仓库（ModForge Studio）前端改造

### 任务 1：安卓 platform adapter

新建目录 `apps/desktop/src/platform/android/`，含 `index.ts` 与 `devAndroidMock.ts`。

**`index.ts` 必须实现 `createAndroidPlatformPorts(): PlatformPorts`**，对照 `apps/desktop/src/platform/tauri/index.ts` 的现有模式，契约定义在 `apps/desktop/src/shared/contracts/platform.ts`（共 24 方法）：

- **宿主检测**：`typeof window !== 'undefined' && 'modforgeBridge' in window`（对齐 tauri 侧 `__TAURI_INTERNALS__` 模式）；`assertAndroidHost()` 守卫。
- **`fileSystem.invokeCommand`**：调 `window.modforgeBridge.invokeCommand(command, JSON.stringify(args ?? {}), callbackId)`，JS 侧维护 `Map<callbackId, {resolve, reject}>`，Promise 化。结果由 C# 侧回调 `window.__modforgeDispatch(json)` 送达，帧格式 `{id, ok, payload}`——在模块顶层挂一次全局 dispatch 函数。
- **`fileSystem.toAssetUrl`**：映射到 `https://appassets.androidplatform.net/` 前缀。
- **`fileSystem.resolvePluginUrl`**：同 scheme 映射，保留 `epoch` 时 `__v<N>/` 段语义（照 tauri 实现注释）。
- **`desktopWindow`（10 方法）**：全部 stub——`minimize/close/forceClose/hide/show/setFullscreen` resolve 空；`toggleMaximize/isMaximized/isFullscreen/toggleFullscreen` resolve `false`。
- **`storage`（3 方法）**：复用 `../adapter-shared` 的 `createBrowserStorage`。
- **`dialog`（4 方法）**：`openFile` 走桥（`invokeCommand` 一个内部命令 `android:pick_file`，C# 侧触发 SAF）；`openDirectory` 同通道；`saveFile` 走 SAF 创建文档；其余按契约。
- **`hostEvents`（4 方法）**：`listen` 注册进模块内事件表，C# 事件帧（`{event, payload}`）由同一个 `__modforgeDispatch` 分发；`canUseHost` 返回宿主检测值；`listenWindowCloseRequest`/`listenWindowDragDrop` 返回 no-op unlisten。

**`devAndroidMock.ts`**：对照 `apps/desktop/src/platform/tauri/devLauncherMock.ts` 模式——mock `window.modforgeBridge` 对象，command 回包复用 devLauncherMock 的数据源，使 `vp run web:dev` 下前端能以安卓宿主模式运行。

### 任务 2：PlatformProvider 接线

改 `apps/desktop/src/app/providers/PlatformProvider.tsx:19`：三分支——`ports ?? (isAndroidHost() ? createAndroidPlatformPorts() : isElectronHost() ? createElectronPlatformPorts() : createTauriPlatformPorts())`。`isAndroidHost` 从 `@platform/android` 导出。

### 任务 3：移动端 UI 裁剪

- 启动器四路由内定位依赖 `DesktopWindowPort` / 拖拽安装 / GMCM probe 的 UI 入口。
- 安卓宿主下：隐藏自绘标题栏与窗口控制区；拖拽安装区替换为"选择文件"按钮（走 `DialogPort.openFile`）；GMCM probe 入口隐藏（保留纯 JSON config 表单路径）。
- 裁剪判定用 `@platform/android` 导出的 `isAndroidHost()`，禁止 UA 嗅探。
- 所有新增/改动文案走 `apps/desktop/src/locales` 类型化 bundles，禁止组件内硬编码字符串；配色只引用 `tokens.css` 变量。

### 任务 4：协议 manifest 与生成器

1. 新建 `shared/protocol/launcher-commands.json`：launcher 域全部 command 的清单——`name`、参数/返回的 TypeScript 类型表达式。来源：扫描 `apps/desktop/src-tauri/src/domain/launcher/commands.rs` 的 `#[host_command]` 绑定 + `features/launcher/api/launcherDesktopApi.ts` 的 55 个包装函数。
2. 改造 `apps/desktop/scripts/gen/generate-host-commands.mjs`：launcher 域改为从 manifest 读取（其余域维持扫描不动）。先跑一次确认生成物与现状一致再提交改造。
3. 新增 `apps/desktop/scripts/gen/generate-android-bridge.mjs`：从同一 manifest 生成 C# 源文件——每 command 一个 DTO record + 一个 dispatch switch 分支 + JSON 反序列化。输出路径参数化（指向 modforge-android 仓库检出位置）。

---

## 第二部分：modforge-android 仓库（fork SMAPILoader）

### 任务 5：fork 与合规

1. fork `NRTnarathip/SMAPILoader` 到 GitHub 账号 `Arborsm` 名下，仓库名 `modforge-android`；clone 到 `E:\Arbor\modforge-android`；`git remote add upstream https://github.com/NRTnarathip/SMAPILoader`。
2. 根目录：LICENSE（GPL-3.0 沿用）、NOTICE（上游版权 + fork 声明）、README 注明与 ModForge 关系。
3. 检出基线：上游 tag `1.1.7`（无 v 前缀），从该 tag 切工作分支 `feat/modforge-shell`。

### 任务 6：WebView 宿主 Activity

1. 新增 `LauncherActivity`（启动器主 Activity，设为 LAUNCHER）：全屏 `WebView` + `androidx.webkit` 的 `WebViewAssetLoader`，伺服 `SMAPIGameLoader/Assets/www/`（前端 `build:web.cjs` 产物拷入此处，见"仓库布局"）。
2. `WebSettings`：`JavaScriptEnabled`、`DomStorageEnabled`。
3. 返回键行为：WebView 可后退则后退，否则退到桌面。
4. 包名：沿用上游包名会导致与已装 SMAPILoader 冲突——改为 `com.modforge.android`；上游代码中所有引用 mods 目录/包可见性（`<queries>` 两个游戏包名不受影响）处同步检查，mods 目录随之变为 `Android/data/com.modforge.android/files/Mods`。
5. `AndroidManifest.xml`：INTERNET 权限保留；上游与原生 UI 绑定的 Activity 声明在任务 9 剥离时清理。

### 任务 7：JS 桥 `ModForgeBridge`

1. `[JavascriptInterface]` 注解类，方法 `invokeCommand(String command, String argsJson, String callbackId)`。
2. 线程模型：入口仅 enqueue；单串行队列 + 后台 worker 执行 handler；结果经 `EvaluateJavascript("window.__modforgeDispatch(...)")` 回推，帧 `{id, ok, payload}` / `{event, payload}`。
3. Dispatch：switch on command 名（任务 4.3 的生成物替换手写 switch）。
4. SAF 文件选择：`android:pick_file` handler 起 `ActivityResultContracts.OpenDocument`，结果 URI 读内容/拷入沙盒后回推路径。

### 任务 8：C# 业务层

对照 Rust 规格逐文件移植语义（规格文件 = 主仓库 `apps/desktop/src-tauri/src/domain/launcher/`），放 `SMAPIGameLoader/Services/` 目录：

1. **`LibraryService.cs`** ← `library.rs`：扫描 `Android/data/com.modforge.android/files/Mods`；解析每 mod 的 `manifest.json`（`System.Text.Json`）；构建依赖健康图；`.` 前缀目录重命名实现启停。
2. **`InstallService.cs`** ← `install_manager.rs` + `archive/extract.rs` + `archive/inspect.rs`：zip 解压（`System.IO.Compression`）、安装预检、备份、JSON 合并。
3. **`SmapiService.cs`** ← `smapi_update/release.rs`：SMAPI-Android-1.6 release zip 的下载、版本比较、SHA-256 校验、解压到程序集目录。PC 安装器执行逻辑不移植。
4. **`ModConfigService.cs`** ← `mod_config/schema.rs` 的纯 JSON 路径：`fields_from_config_json` / `fields_from_options_schema` 语义。probe 路径不实现。
5. **版本门槛**（游戏 ≥ 1.6.15.3、SMAPI ≥ 4.0）抽成远端 JSON（GitHub raw），启动拉取、失败回退内置默认。
6. 游戏检测/启动沿用上游 `StardewApkTool.cs` 与 `SMAPIActivity`，仅包 command 壳；启动 = `StartActivity(typeof(SMAPIActivity))`。

### 任务 9：剥离上游原生 UI

删除上游原生 mod 管理器/日志页面与其导航入口；保留 `SMAPIActivity`、`GameCloner`、`GameAssemblyManager`、`LibPatcher`、`ModInstaller`（其逻辑被任务 8 吸收后去重）、SMAPI 加载链。不碰 IL 重写与 runtime 补丁代码。

---

## 代码规范

**前端（AGENTS.md 为准）**：

- 依赖方向 `app -> pages -> widgets -> features -> entities -> shared/contracts`；`platform` 由 `app/providers` 注入。
- 业务层禁止直接 import `@tauri-apps/api`、禁止直接引用 `window.modforgeBridge`——桥对象只允许出现在 `platform/android/` 内。
- React Compiler 已启用：不新增手写 `useMemo`/`useCallback`。
- 配色只用 `tokens.css` 主题变量；文案只用 locale bundles。
- 公共 API 写简洁 JSDoc（用途/边界/副作用，不复述实现）。

**C#（modforge-android）**：

- 风格对齐上游 SMAPILoader 现有代码（缩进、命名、`var` 使用习惯）。
- JSON 统一 `System.Text.Json` source-generated serializer context。
- 桥 handler 只做参数解析与调度，业务进 `Services/`。
- 禁止在桥入口线程做 IO/网络。

**通用**：

- 不分发任何游戏文件；仓库与 APK 零游戏资源。
- 错误经前端 `publishNotification` 呈现，禁止静默 catch。
- Conventional Commits 带 scope：`feat(android): ...`、`refactor(platform): ...`。

---

## 交付物

1. 主仓库分支 `feat/android-host`：`platform/android/` 两文件、Provider 接线、UI 裁剪、`shared/protocol/launcher-commands.json` + 两个生成器脚本。
2. 安卓仓库 `E:\Arbor\modforge-android` 分支 `feat/modforge-shell`：合规文件、LauncherActivity + 桥、5 个 Service、上游 UI 剥离。
3. `HANDOFF.md`（放主仓库 `docs/`）：未验证项清单、验收操作顺序（构建命令、APK 安装、走查路径）、已知风险点。
