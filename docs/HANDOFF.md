# 安卓启动器 HANDOFF — 未验证项、验收步骤与已知风险

> 交付基线：主仓库 `feat/android-host` 分支 + 安卓仓库 `E:\Arbor\modforge-android`（`feat/modforge-shell` 分支，fork 自 NRTnarathip/SMAPILoader tag `1.1.7`）。
> 按实施计划约定：本批交付只产出代码与接线，未做真机验证、未跑 .NET 构建验证；主仓库前端验证与 APK 构建由验收人执行。

## 1. 交付物清单

### 主仓库（ModForge Studio）

| 交付                                                                | 位置                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安卓 platform adapter（24 方法 `PlatformPorts`）                    | `apps/desktop/src/platform/android/index.ts`                                                                                                                              |
| 安卓 dev mock（`?mfAndroidMock=1`）                                 | `apps/desktop/src/platform/android/devAndroidMock.ts`                                                                                                                     |
| dev launcher mock IPC handler 抽取复用                              | `apps/desktop/src/platform/tauri/devLauncherMock.ts`（`createDevLauncherMockIpcHandler`）                                                                                 |
| PlatformProvider 三分支接线（android → electron → tauri）           | `apps/desktop/src/app/providers/PlatformProvider.tsx`                                                                                                                     |
| 安卓宿主 UI 裁剪（窗口控制 / GMCM probe / 拖拽安装替代入口）        | `AppShell.tsx`、`LauncherPage.tsx`、`LauncherShell.tsx`、`LauncherLibraryPageContent.tsx`、`LauncherLibraryHeader.tsx`、`LauncherConfigurationPage.tsx`、`TopMenuBar.tsx` |
| 协议 manifest（47 条 launcher 命令）                                | `shared/protocol/launcher-commands.json`                                                                                                                                  |
| 生成器改造（launcher 域改读 manifest，其余域维持扫描）              | `apps/desktop/scripts/gen/generate-host-commands.mjs`                                                                                                                     |
| 安卓桥生成器（每命令 DTO record + dispatch switch + JSON 反序列化） | `apps/desktop/scripts/gen/generate-android-bridge.mjs`（脚本 `vp run --filter @modforge/desktop gen:android-bridge`）                                                     |

### 安卓仓库（modforge-android）

| 交付                                                                     | 位置                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 合规文件（GPL-3.0 LICENSE 沿用、NOTICE、README fork 声明）               | `LICENSE`、`NOTICE.md`、`README.md`                                                                                                                                                                                                                                                                 |
| WebView 宿主 Activity（WebViewAssetLoader + 三个自定义 path handler）    | `SMAPIGameLoader/Launcher/LauncherActivity.cs`                                                                                                                                                                                                                                                      |
| JS 桥（`window.modforgeBridge`，单串行队列 + 后台 worker，SAF 文件选择） | `SMAPIGameLoader/Bridge/ModForgeBridge.cs`、`Tool/SandboxFileTool.cs`                                                                                                                                                                                                                               |
| 生成的协议桥（47 条 DTO + dispatch，23 条已接 handler）                  | `SMAPIGameLoader/Bridge/Generated/LauncherBridge.g.cs`（生成物，勿手改）                                                                                                                                                                                                                            |
| C# 业务层 5 服务                                                         | `SMAPIGameLoader/Services/`：`LibraryService.cs`、`InstallService.cs`、`SmapiService.cs`、`ModConfigService.cs`、`LauncherRuntimeService.cs`（+ 模型/上下文/门槛：`LauncherModels.cs`、`LauncherJsonContext.cs`、`LauncherJsonHelper.cs`、`LauncherRequirements.cs`、`LauncherCommandServices.cs`） |
| 版本门槛远端 JSON                                                        | `version-gates.json`（仓库根；启动拉取，失败回退内置默认 1.6.15.3 / 4.0.0）                                                                                                                                                                                                                         |
| 上游原生 UI 剥离                                                         | 删除 `ModManagerActivity.cs`、`ModAdapter.cs`、`ModItemView.cs` 与 `Resources/Layout/*` 三个布局                                                                                                                                                                                                    |
| 包名                                                                     | `ApplicationId`/manifest package = `com.modforge.android`；Mods 目录 = `Android/data/com.modforge.android/files/Mods`                                                                                                                                                                               |

## 2. 验收操作顺序

### 2.1 主仓库前端

```bash
vp install --frozen-lockfile
vp run lint
vp test run --configLoader runner        # 前端单元 + 架构测试
vp run --filter @modforge/desktop test   # 完整 JS gate（可选）
```

开发态走查（安卓宿主模式，无需 APK）：

1. `vp run web:dev`
2. 打开 `http://localhost:<端口>/?mfLauncherMock=1&mfAndroidMock=1`（mock 复用 launcher mock 数据源）
3. 核对：顶栏无最小化/最大化/关闭按钮组；设置页无 GMCM probe 面板与启动 probe 通知（完成度步骤显示“不可用”）；库页头部出现“安装压缩包”图标按钮（替代拖拽）。

APK 前端产物：

```bash
vp run build        # 产物在 apps/desktop/dist/
# 拷贝 dist/ 目录内容 → modforge-android/SMAPIGameLoader/Assets/www/（整体覆盖）
```

### 2.2 安卓仓库（构建 APK）

> **2026-09-17 已实机构建通过**：以下步骤已在本机跑通并产出签名 APK：
> `E:\Arbor\modforge-android\SMAPIGameLoaderin\Release
et9.0-android\com.modforge.android-Signed.apk`（约 62MB，debug.keystore 签名，包名 `com.modforge.android`，minSdk 28 / target 35；已验证 APK 内含 `assets/www/` 前端产物与**定制反射补丁** `libmonosgen-2.0.so`（3,117,424 字节））。
> 构建命令：`dotnet build SMAPIGameLoader/SMAPIGameLoader.csproj -c Release -p:AndroidSdkDirectory="E:\Android\Sdk"`（Git Bash 先 `export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21.0.7.6-hotspot"`、`export PATH="$PATH:/c/Program Files/dotnet"`）。
> 构建前已完成一次性环境准备：① 本机补装 Android SDK（commandline tools → `E:\Android\Sdk`，platform-35 + build-tools 35.0.0 + licenses）；② 定制 `libmonosgen-2.0.so` 覆盖进 `Microsoft.NETCore.App.Runtime.Mono.android-arm64/{9.0.16,9.0.20}`（原版备份为 `*.stock.bak`，需管理员权限）；③ 游戏 DLL 按上游 building.md 从本机游戏 APK（`D:\BaiduNetdiskDownload\星露谷物语安卓手机版1.6.15.apk`）用仓库自带 AssemblyStore 库提取到 `E:\Arbor\SMAPI-Android-1.6\src\DependenciesDll\`（csproj 硬引用路径，游戏文件不入任何 git 仓库；提取器脚本在 modforge-android `.tmp-extract/`，已 gitignore 其数据文件）。前端构建产物（`vp run build` 的 `dist/`）已整体拷入 `SMAPIGameLoader/Assets/www/` 并随仓库提交。

1. 环境前置：.NET 9 SDK（9.0.318 band）+ android workload 9.0 band；Android SDK（本机 `E:\Android\Sdk`，需 JAVA_HOME 指向 JDK 17+，本机用 Temurin 21 验证通过）；定制 `libmonosgen-2.0.so` 就位（见上）；`E:\Arbor\SMAPI-Android-1.6` 检出（csproj 引用其 DependenciesDll 下三个游戏 DLL）。
2. 前端产物更新：主仓库 `vp run build` → 拷贝 `apps/desktop/dist/` 内容到 `SMAPIGameLoader/Assets/www/`（覆盖）。
3. `dotnet build SMAPIGameLoader/SMAPIGameLoader.csproj -c Release -p:AndroidSdkDirectory="E:\Android\Sdk"`。
4. 产物 APK 安装到 arm64 真机（已装正版游戏 ≥ 1.6.15.3）：`adb install -r com.modforge.android-Signed.apk`。

### 2.3 真机走查路径

1. 启动 App → 全屏 WebView 加载 ModForge 前端（www 未拷入时显示“前端构建产物尚未拷入”占位页）。
2. 库页扫描 `Android/data/com.modforge.android/files/Mods`；mod 卡片启停（`.` 前缀重命名）；依赖健康提示。
3. “安装压缩包”→ SAF 选 zip → 拷入沙盒 `files/Picked/` → 预检/备份/安装。
4. SMAPI 更新：检查 SMAPI-Android-1.6 最新 release → 下载（进度事件）→ SHA-256 → 解压进程序集目录；或用本地已拷入的 zip 安装。
5. mod 配置：纯 JSON 表单（CP ConfigSchema / options.json / config.json）。
6. 启动游戏：版本门槛校验 → SMAPIActivity 拉起游戏。
7. 返回键：WebView 可后退则后退，否则回到桌面（App 保活）。

### 2.4 协议再生成流程

launcher 命令变更（主仓库 `commands.rs` + `shared/protocol/launcher-commands.json` 同步改）后：

```bash
vp run --filter @modforge/desktop gen:host-commands     # HOST_COMMANDS + lib.rs + sidecar
vp run --filter @modforge/desktop gen:android-bridge    # 重新生成 LauncherBridge.g.cs（输出到 modforge-android 检出）
```

`build.rs` 在 cargo 构建时对三份产物跑 `--check`；manifest 与 Rust 绑定双向漂移会直接报错。新增命令要在 manifest 里补 `android: {service, method}` 才会在安卓桥生成真实 dispatch 分支，否则默认返回 unavailable 错误帧。

## 3. 未验证项清单（按计划范围，验收人执行）

1. **前端**：`vp run lint`、`vp test run`、`vp run build` 未执行（实施计划明确不跑构建验证）。已执行：`tsc -p tsconfig.app.json` 无错误、`generate-host-commands` 生成器 node 测试 21/21 通过、改造后 `gen:host-commands` 生成物与现状零漂移。
2. **C# 已编译通过（Release，android-arm64）**：构建中修复了 6 处绑定差异——`WebViewAssetLoader.IPathHandler.Handle(string)`（非 Uri）、JavascriptInterface 导出用 `Java.Interop.Export`、`JsonTypeInfo<T>` 位于 `System.Text.Json.Serialization.Metadata` 命名空间、`Intent.CategoryOpenable` 常量名、`Android.App.LauncherActivity` 命名冲突（用 using alias）、服务命令返回 `Task<JsonElement?>` 需显式 `Task.Run<T>`。`ZipFileTool.Extract` 签名无误。
3. **真机**：WebView 桥帧时序、SAF 各分支、游戏宿主链路（fork 原有行为，未回归验证）均未验证。
4. **架构测试**：`frontendModuleArchitecture.test.ts` 是否接受新增 `platform/android` 与 `AppShell` 的 `@platform/android` import（app 层 import platform 是既有允许模式），验收时跑一次确认。

## 4. 已知差异与风险点（有意为之的移植取舍）

1. **安卓侧实现 23/47 条命令**：settings、library（scan/state/covers/image-failures/启停）、install/inspect/backups/restore、SMAPI 更新三件套、mod 配置、runtime/launch/open-url。未实现的（Nexus 搜索/下载/更新检查/SSO/图片 CDN/GMCM probe/下载队列）返回 `LauncherCommandUnavailableException` 错误帧，前端以通知呈现——对应可行性报告的 M3 里程碑。
2. **zip-only 解压**：桌面支持 zip/7z/rar/tar；安卓仅 zip（System.IO.Compression），其余格式报“不支持的压缩包”。7z/rar 需要额外原生库，留给后续。
3. **manifest/JSON 为严格解析**：桌面用宽松 JSON（注释/尾逗号/编码探测）；安卓用 `System.Text.Json` 严格解析，坏 manifest 的 mod 会被扫描跳过（不致失败）。
4. **library state 归一化简化**：桌面 `normalize_library_state`（大量去重/排序/环检测）未整体移植；安卓端 load 缺文件回默认、坏 JSON 报错、save 原样持久化 + 保证 unsorted 文件夹存在。状态由前端生成，正常往返不受影响；手改 `library.json` 可能引入脏数据。
5. **inspect 文本 diff 不生成**：added/removed/changed + 尺寸/时间戳齐全，`textDiff` 恒为 null（桌面有统一 diff）。
6. **mod 配置翻译仅本地 i18n**：桌面还有 content-pack 依赖包翻译 BFS 合并；安卓未移植。
7. **SMAPI 更新简化**：不做 prerelease 通道、无游戏↔SMAPI 兼容表（直接 target 最新 release）；下载走 GitHub latest API + 30 分钟磁盘缓存；`requiredByMods` 用 `MinimumApiVersion` 与已装 SMAPI 比较。安装沿上游“剥第一层目录 → 程序集目录”逻辑，并校验 zip 内含 `StardewModdingAPI.dll`、≤10MB（拒 PC 安装器）。
8. **`open_launcher_path` 不可用**：安卓无“打开文件夹”对应物（可行性报告 §6.3 决策）。
9. **目录/文档选择返回 SAF URI**：`android:pick_dir` / `android:create_document` 回推 SAF URI 字符串而非文件系统路径（`pick_file` 会拷入沙盒回推真实路径）。工作台导出类功能在安卓切片上不在范围。
10. **version-gates.json 远端地址**：`https://raw.githubusercontent.com/Arborsm/modforge-android/master/version-gates.json`——需要把该文件推到 fork 的 `master` 分支后才生效；此前/失败时回退内置默认（1.6.15.3 / 4.0.0），不会阻断。
11. **上游保留但休眠的代码**：`ModInstaller.cs`（被 InstallService 吸收上游能力后仍保留版本断言等工具方法，暂无调用方）、`SaveManagerTool.cs`（上游即休眠）、`AdbExtraTool`（ADB 点击启动入口随旧 UI 移除，不再触发）。
12. **桥线程模型**：`InvokeCommand` 仅入队；单 worker 串行执行；结果/事件经 UI 线程 `EvaluateJavascript` 回推 `window.__modforgeDispatch`。帧协议与 Electron sidecar NDJSON 同构（`{id, ok, payload}` / `{event, payload}`）。
13. **workbench 未裁剪**：安卓切片只裁剪 launcher 路由；工作台（地图编辑等）在 WebView 里可加载但依赖桌面能力，未做移动端适配，也不在验收路径内。
