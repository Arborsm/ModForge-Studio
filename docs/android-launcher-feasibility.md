# 安卓端单启动器可行性报告

> 状态：调研报告（2026-09-17，基于 `pages` 分支代码快照与 2026-09 网络调研）。
> 回答三个问题：安卓本机单启动器在技术上怎么做；参考仓库（SMAPILoader 等）"链接过来"够不够用；ModForge 现有资产能复用多少。

## 1. 结论摘要

**可行，且推荐"fork SMAPILoader 壳 + 内嵌 ModForge 前端"的路线。** 关键判断：

1. **启动器壳必须是 .NET Android 应用，不能是 Rust/Tauri。** 手机版星露谷是 MonoGame + Mono/.NET 运行时打包（不是 Il2Cpp），SMAPI 及所有 mods 必须与游戏本体跑在**同一个 .NET 运行时、同一个进程**里。ModForge 的 Rust 后端无论怎么裁剪都无法承载游戏本体，这一点没有绕开方案。
2. **游戏宿主这道最难、风险最高的工序已有活跃维护的开源解**：[NRTnarathip/SMAPILoader](https://github.com/NRTnarathip/SMAPILoader)（GPL-3.0，C#/.NET 9 Android，2026-06 仍在发版）已解决定制 Mono 运行时、游戏程序集提取、IL 重写、SMAPI 加载全链路。本仓库是 GPL-3.0-or-later，**直接 fork 其代码没有许可证障碍**。
3. **ModForge 能复用的是前端，不是 Rust 后端。** 前端宿主耦合被架构测试收口在 `src/platform`，换宿主 = 实现一份 24 方法的 `PlatformPorts` JS 桥；启动器 UI（`LauncherPage` 四路由 + `features/launcher`）与策略层（Task Runtime）可整体保留。Rust 后端不进安卓构建，其中平台无关逻辑作为 C# 重实现的规格参考。
4. **"链接 SMAPI 手机版仓库够吗"——分两层回答**：
   - SMAPI 内核仓库 [NRTnarathip/SMAPI-Android-1.6](https://github.com/NRTnarathip/SMAPI-Android-1.6)（LGPL-3.0）：**够**。SMAPILoader 自己就是在运行时下载它的 release zip 并解压加载，我们的启动器照做即可，保留 LGPL 来源声明。
   - 游戏宿主仓库 SMAPILoader（GPL-3.0）：**只引用不够，fork 够**。它的产出是一个完整 App 而非库，UI 是它自己的，必须 fork 后替换 UI、接管对游戏版本（Assembly Store 格式、runtime 哈希 pin）的持续跟进。

---

## 2. 产品定位与背景

**目标**：一个安装到安卓手机上的独立 App——用户在手机上管理手机版《星露谷物语》的 SMAPI mods（浏览、安装、启停、配置），并在本机直接启动带 SMAPI 的游戏。全程点选，不依赖 PC、不依赖 Termux、不需要 root、不修改游戏 APK。

**与桌面 ModForge 的关系**：桌面版继续是创作与管理工作台（地图编辑、本地化中心、CP Maker 等）。安卓单启动器聚焦"玩家侧"的启动器职责，是独立产品切片，共享 ModForge 的启动器 UI 设计语言与前端代码，但不承载工作台创作功能。

**已确认的范围决策**：产品定位为**本机启动器**（非"PC 远程伴侣"）。远程伴侣路线（手机管理 PC 上的游戏，复用现有 NDJSON 命令协议）协议层已天然支持，若未来需要可另立切片，本报告不展开。

---

## 3. 技术事实基础

这些事实决定了整个方案的形状，均经源码与多方来源交叉验证。

### 3.1 手机版星露谷的运行时结构

- 引擎为 **MonoGame，托管运行时是 Mono/.NET，不是 Il2Cpp**。游戏 APK 的程序集存储（Assembly Store）内含 `StardewValley.dll`、`StardewValley.GameData.dll`、`MonoGame.Framework.dll` 等托管程序集；1.6.15+ 版本对应 .NET 9，此前为 .NET 8。证据：SMAPILoader 从 APK 中实际提取的 DLL 清单（[Game/GameAssemblyManager.cs](https://raw.githubusercontent.com/NRTnarathip/SMAPILoader/master/SMAPIGameLoader/Game/GameAssemblyManager.cs) 及其 [docs/building.md](https://raw.githubusercontent.com/NRTnarathip/SMAPILoader/master/docs/building.md)）。
- Play 商店版为 **split APK**：`base.apk`（Java 壳）+ `split_config.arm64_v8a.apk`（native 库 + 程序集 blob）+ `split_content.apk`（资源）。新格式把程序集放进 `lib/{arch}/libassemblies.{arch}.blob.so` 的 ELF payload 节，XALZ 压缩（Assembly Store v2）。
- **SMAPI 官方（Pathoschild/SMAPI）不支持 Android**：[smapi.io](https://smapi.io/) 与 release notes 从未宣布 Android 支持（唯一相关条目是 4.1.10 修复 PC↔Android 跨平台联机报错）。但社区移植生态成熟且**被星露谷官方 modding wiki 收录**（标注 experimental）：[Modding:Installing SMAPI on Android](https://stardewvalleywiki.com/Modding:Installing_SMAPI_on_Android)。移植沿革：MartyrPher（1.4.x）→ ZaneYork（1.5.x）→ NRTnarathip（1.6.x，即 SMAPI-Android-1.6）。SMAPI Android zip 亦在 [Nexus Mods（mod 44436）](https://www.nexusmods.com/stardewvalley/mods/44436)分发。

### 3.2 SMAPILoader 的核心技术路线（唯一有完整开源实现的路线）

一句话：**启动器自己就是一个 .NET Android 应用，自带"去反射限制"的定制 Mono 运行时；用 PackageManager 公开 API 读取用户已正版安装的游戏 split APK，从 Assembly Store 提取托管程序集，用 Mono.Cecil 做 IL 重写后在自己的 Activity 内加载运行，并反射调用 SMAPI Android fork 的入口。** 不改游戏 APK、不碰游戏进程、不需要 root。

| 源码文件                               | 做了什么                                                                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tool/StardewApkTool.cs`               | 用 `ApplicationInfo.PublicSourceDir` / `SplitSourceDirs` 定位正版游戏（包名 `com.chucklefish.stardewvalley`，三星商店 `com.chucklefish.stardewvalleysamsung`）；硬性要求游戏 ≥ 1.6.15.3                                                                  |
| `Game/GameAssemblyManager.cs`          | 自研 AssemblyStoreExplorer（移植自 dotnet/android 官方 assembly-store-reader 工具）解包托管 DLL 与 native 库到启动器自己的 `GetExternalFilesDir`                                                                                                         |
| `Launcher/GameCloner.cs`               | 按启动器构建号/游戏版本判断是否重新克隆；Mono.Cecil 执行 IL 重写并写回                                                                                                                                                                                   |
| `Game/Rewriter/StardewGameRewriter.cs` | 核心一处 IL 改写：把游戏 `MainActivity` 的静态字段 `instance` 的**字段类型改为 SMAPIActivity**，让游戏代码里所有对原 MainActivity 单例的引用落到启动器自己的 Activity 上；另有音频引擎包装重写                                                           |
| `Game/SMAPIActivity.cs`                | 游戏宿主 Activity（继承 MonoGame `AndroidGameActivity`）：Harmony `PatchAll()` → `Assembly.LoadFrom(StardewValley.dll)` → 反射指向自己 → `Assembly.LoadFrom(StardewModdingAPI.dll)` 并反射调用 `StardewModdingAPI.Program.Main`，由 SMAPI 接管拉起 Game1 |
| `Game/MainActivityPatcher.cs`          | Harmony prefix 补丁 `MainActivity.CheckStorageMigration` 强制返回 false，绕过手机版首次启动的存档迁移                                                                                                                                                    |
| `LibPatcher/LibPatcherArm64.cs`        | 对 Mono 运行时 ARM64 ELF（SHA-256 哈希 pin）打 3 处机器码补丁：`mono_method_can_access_method` NOP、`mono_method_can_access_field` 恒真、`mono_class_from_mono_type_internal` 崩溃修复——关闭 Mono 访问检查，让 SMAPI/mods 能反射访问游戏私有成员         |
| `Launcher/SMAPIInstaller.cs`           | SMAPI 本体来自 SMAPI-Android-1.6 的 release zip（约 1.5MB，用 ≤10MB 校验拒绝 PC 版 40MB 安装器）；用户经 file picker 选 zip 安装；2026-04 起兼容 Nexus 分发的 zip                                                                                        |
| `Launcher/ModInstaller.cs`             | **Mods 目录 = `/storage/emulated/0/Android/data/<启动器包名>/files/Mods`**；支持单 mod zip 与 mod pack zip；要求游戏 ≥ 1.6.0、SMAPI ≥ 4.0                                                                                                                |

前提条件：用户已从 Play/Galaxy Store 购买安装正版游戏；仅 arm64 设备；需 .NET 9 SDK + android workload 工具链，并把"去反射限制"的定制 `libmonosgen-2.0.so` 覆盖进 SDK（[docs/building.md](https://raw.githubusercontent.com/NRTnarathip/SMAPILoader/master/docs/building.md)）。

项目状态：363 stars / 48 forks，2024-11 创建，2026-06-28 推送 v1.1.7（146 commits），截至 2026-09 活跃维护。GPL-3.0。

### 3.3 决定性约束的推导

SMAPI 是一个 .NET 程序集，mods 也是 .NET 程序集，游戏本体是 Mono/.NET 程序集——三者必须在**同一个 Mono 运行时、同一个进程、同一组 AppDomain** 里互相反射调用（SMAPI 通过反射进入 `Game1`，mods 通过 SMAPI 的反射 helper 访问游戏私有成员）。这排除了两类架构：

- **Rust/Tauri/WebView 壳直接当启动器**：无法在进程内承载 Mono 运行时与游戏程序集；
- **双 App 方案**（ModForge 管理器 App + SMAPILoader 启动 App）：可行但违背"单启动器"目标——mods 目录属于宿主 App 的沙盒，跨 App 访问受限，且用户要装两个 App。

因此安卓单启动器 = **一个 .NET Android App**，ModForge 的角色是为它提供 UI 与 mods 管理能力。

---

## 4. "链接那个手机版的仓库够吗"——参考仓库逐层拆解

涉及四个仓库/项目，各自能提供的东西不同：

### 4.1 SMAPI-Android-1.6 —— 够，运行时依赖即可

SMAPI 的 Android 移植**本体**（SMAPI 内核，含 `StardewModdingAPI.Mobile` 等定制命名空间），205 stars，LGPL-3.0，fork 自 Pathoschild/SMAPI。它不是启动器，而是被启动器加载的"内核"。

**结论：够。** SMAPILoader 的做法就是运行时从它的 GitHub Releases（或 Nexus mod 44436）下载 release zip，解压到程序集目录。我们照做，LGPL-3.0 允许此分发方式，需保留协议与来源声明。**不需要 fork 它的代码。**

### 4.2 SMAPILoader —— 引用不够，fork 够

它提供的是启动器最难的部分，全部有可直接复用的实现：

- 去反射限制的定制 `libmonosgen-2.0.so`（GPL-3.0 分发的二进制 + `docs/building.md` 记录的自建方法）；
- Assembly Store v1/v2 提取器（跟随 dotnet/android 官方格式）；
- Mono.Cecil IL 重写（MainActivity 单例改型 + 音频引擎包装）；
- SMAPIActivity 宿主 + Harmony 补丁 + SMAPI 反射加载链路；
- mods 安装器（单 mod / mod pack zip）与版本门槛校验。

**结论：fork 够，但不是"拿来就用"。** 三件事必须自己做：

1. **替换 UI**：它的 UI 是自带的原生 .NET 页面（mod 管理器、日志分享、更新按钮），要换成 ModForge 前端（见 §6）。
2. **接管版本跟进**：游戏版本硬门槛（当前 1.6.15.3）、Assembly Store v1/v2 格式、runtime 哈希 pin 都会随游戏更新失效——SMAPILoader 的活跃维护正是这个工作的价值，fork 后由我们接手（或持续从上游同步）。
3. **接入 Nexus 能力**：它目前只做本地 zip 安装（SMAPI zip 已兼容 Nexus 分发包），Nexus API 下载、SSO 登录要新建。

许可证后果：GPL-3.0 代码并入后，**整个安卓 App 必须以 GPL-3.0-or-later 分发**——与本仓库现状（`LICENSE`、`package.json` 均为 GPL-3.0-or-later）兼容，无障碍。

### 4.3 JunimoGate —— 路线可行性的旁证 + 架构参考

[leontismaro/JunimoGate](https://github.com/leontismaro/JunimoGate)（GPL-3.0-only + linking exception）是 SMAPILoader 路线的**独立重实现**，证明了该方案可复刻，并示范了两个值得借鉴的增强：**隔离的 game-host 进程**（游戏崩溃不拖垮启动器 UI）与**存档导入导出备份**。另有中英文界面。

### 4.4 Cinderbox —— 另一条路线的存在证明，无参考价值

[Ekyso/Cinderbox](https://github.com/Ekyso/Cinderbox)（MIT，仅 README，**无公开源码**）走"在 Android 上跑桌面版星露谷"路线，桌面 SMAPI 直接可用，Companion 负责下载游戏文件与管理 mods。技术细节未知，无法参考；仅在路线对比中记录其存在。

### 4.5 其他路线的排除依据

- **修改版游戏 APK（旧代方案，MartyrPher/ZaneYork 时代）**：对 1.6.x 新 split APK 结构已不适用，且再分发改包 APK 有版权风险。排除。
- **Termux 方案**：未查到任何成熟开源实现（GitHub 搜索 "stardew termux smapi" 为 0）。排除。
- **Tauri 2 mobile 直接移植 ModForge**：技术上 Tauri 2.11 支持 Android（本仓库 `@tauri-apps/api ^2.11.1` 已是 v2 系，`crate-type` 已含 `cdylib`），Rust 后端的 host_runtime/NDJSON 协议也能在移动端进程内跑——**但它承载不了游戏本体**（§3.3）。除非产品改为"远程伴侣"，否则排除。

---

## 5. 实施路线对比

两条都满足"单启动器"目标，差别在游戏宿主的来源：

| 维度                                                                           | R1：fork SMAPILoader 壳 + 内嵌 ModForge UI     | R2：仅依赖 SMAPI-Android-1.6，自研壳                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 游戏宿主工序（Assembly Store 提取 / IL 重写 / 定制 Mono runtime / SMAPI 加载） | 全部继承自 fork，M1 即可跑通原版行为           | 全部自研；`docs/building.md` 披露了方法，但每一步都是深水区（Mono 源码级补丁、ELF 机器码补丁、Assembly Store 格式跟随） |
| 首个可玩版本                                                                   | 快（周级，原版行为即基线）                     | 慢（月级）                                                                                                              |
| 后续游戏版本跟进                                                               | 跟 upstream 同步 + 自修，有参照物              | 独立承担全部失效修复                                                                                                    |
| UI 自由度                                                                      | 需要剥离其原生 UI，工作量集中在桥接            | 从零设计，无历史包袱                                                                                                    |
| 代码质量可控性                                                                 | 继承其技术债（硬编码包名、哈希 pin、版本门槛） | 全部可控                                                                                                                |
| 许可证                                                                         | GPL-3.0（并入即传染，本仓库已兼容）            | GPL 不受影响，但定制 Mono runtime 若参考其补丁仍需 GPL；从 Mono 源码（MIT）自建可规避                                   |
| 主要风险                                                                       | 上游停更或方向分叉                             | 每次游戏更新都可能全线失效且无人排雷                                                                                    |

**推荐 R1。** 理由：R2 的自研工序（尤其定制 Mono runtime 的机器码补丁与 Assembly Store 格式跟随）正是 SMAPILoader 花了一年多迭代出来的部分，自研不产生差异化价值；R1 的主要代价（剥离 UI、接管版本跟进）本来就是我们无论如何都要做的事。R1 起步后若上游停更，届时再评估是否转入 R2 的自研状态——两者不互斥，R1 是 R2 的前置子集。

**R1 的落地形态**：fork SMAPILoader 为独立仓库（或本仓库子目录，倾向独立仓库——.NET Android 工具链与本仓库 pnpm/Rust 工具链完全不同，CI 也不通用），先原样跑通（M1），再剥离其 UI、嵌入 WebView 承载 ModForge 前端（M2）。

---

## 6. ModForge 资产复用清单

### 6.1 前端：可整体复用，这是最大的复用面

**架构前提已验证**：前端宿主耦合被架构测试（`apps/desktop/src/tests/architecture/frontendModuleArchitecture.test.ts`）强制收口在 `src/platform`；浏览器 dev mock（`apps/desktop/src/platform/tauri/devLauncherMock.ts`，`@tauri-apps/api/mocks` 的 `mockIPC`）已证明**整个前端（含启动器）能在零原生宿主的环境里跑通**（`docs/dev-verification.md`）。

| 资产                                                       | 位置                                                                                                                                                                     | 复用方式                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 启动器 UI 四路由（Library/Discover/Updates/Configuration） | `apps/desktop/src/pages/launcher/LauncherPage.tsx` + `LauncherShell.tsx`                                                                                                 | 原样复用，打包为静态 web 资源进 APK（现成的纯 web 构建 `build:web.cjs` 即产物源） |
| 启动器数据层                                               | `features/launcher/`（`model/launcherPort.ts` 60 方法 port、`api/launcherDesktopApi.ts` 55 个命令包装、各 hooks）                                                        | 原样复用；port 的 60 个方法在安卓侧按 §6.3 重映射实现                             |
| UI 策略层                                                  | `platform/host-command-client/index.ts`（latest/keyedLatest/exclusiveMutation/queuedMutation/parallelPool/serviceGate，落在 `@shared/lib/task-runtime`）                 | 原样复用——策略全在前端执行，桥只需要提供一条裸传输通道                            |
| 平台注入点                                                 | `app/providers/PlatformProvider.tsx`                                                                                                                                     | 已接受 `ports` prop 覆盖——新增 `createAndroidPlatformPorts()` 即为换宿主的全部    |
| 桥接口契约                                                 | `shared/contracts/platform.ts` 的 `PlatformPorts`：`FileSystemPort`(3) + `DesktopWindowPort`(10) + `StoragePort`(3) + `DialogPort`(4) + `HostEventPort`(4) = **24 方法** | 作为 C# 侧 JS 桥的实现清单（§6.2）                                                |
| 应用内通知、localStorage、blob 导出                        | `shared/ui/notifications` 等                                                                                                                                             | 天然可移植（无系统通知依赖）                                                      |

### 6.2 桥的设计

- 复用现有 `invokeCommand(command, args)` 单通道语义：C# 侧实现一个 JS 桥（`AndroidWebView.AddJavascriptInterface` / `WebMessage`），事件回推用 `EvaluateJavascript` 推 JSON 帧——与 Electron sidecar 的 NDJSON 帧（`host/sidecar.rs` 的 `RpcRequest`/`RpcEventFrame`）同构，前端零改动。
- 前端静态资源用 `androidx.webkit` 的 `WebViewAssetLoader`（`https://appassets.androidplatform.net`）伺服；`FileSystemPort.toAssetUrl` / `resolvePluginUrl` 映射到该 scheme（现 Tauri 实现里的 WebView2 UA 嗅探需加 Android 分支）。
- UI 开发可以先扩展 dev mock 出一个"安卓 mock"档位，在 C# 后端落地前推进 UI 侧改造。

### 6.3 命令语义重映射（LauncherPort 60 方法中的桌面专属项）

| 桌面行为                                               | 现实现（仓库证据）                                                                                                                                 | 安卓处置                                                                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 游戏目录发现/校验                                      | `infrastructure/fs/pathing.rs`：winreg 读 Steam/GOG 注册表 + VDF 解析（L314-373, L466-571）                                                        | 改为 PackageManager 查询正版包名 + 版本门槛校验（对应 SMAPILoader `StardewApkTool.cs`）                                                                                                             |
| 启动游戏                                               | `domain/launcher/runtime.rs` `spawn_launcher_process`（L112-123）：`std::process::Command::new(path).spawn()` + Windows creation flags             | 改为应用内启动自家 `SMAPIActivity`（Intent 切 Activity）                                                                                                                                            |
| SMAPI 安装/更新                                        | `smapi_update/installer.rs`：解压官方安装器后运行 `SMAPI.Installer --no-prompt --install --game-path`（L215-250），tasklist/pgrep 防热安装（L284） | 改为下载 SMAPI-Android-1.6 release zip 解压加载（对应 `SMAPIInstaller.cs`）；PC 版 .NET 安装器在安卓不可运行                                                                                        |
| mods 安装/启停                                         | `library.rs` `set_mod_enabled_at_path`（L973-1030，`.` 前缀重命名）、`install_manager.rs` 备份/overlay/JSON 合并                                   | C# 重实现同语义：mods 目录 = `Android/data/<pkg>/files/Mods`；`.` 前缀重命名与 manifest.json 解析可直接照规格移植                                                                                   |
| GMCM 配置面板                                          | `mod_config/probe_run.rs`：dotnet 子进程 probe + kernel32 Job Object FFI（L265-393）                                                               | **probe 移除**（安卓无桌面 dotnet）；保留纯 JSON 路径：直接读 mod 的 `config.json` 与 schema 文件生成表单（后端 `fields_from_config_json` / `fields_from_options_schema` 是纯逻辑，作 C# 规格参考） |
| 拖拽安装                                               | `HostEventPort.listenWindowDragDrop`                                                                                                               | WebView 无拖拽，改 SAF 文件选择器（走 `DialogPort`）                                                                                                                                                |
| 窗口控制                                               | `DesktopWindowPort` 10 方法（自绘标题栏、最小化到托盘等）                                                                                          | stub / 空实现；移动端无窗口语义，UI 相应裁剪                                                                                                                                                        |
| 打开路径/URL                                           | `open_path_in_shell`（explorer/xdg-open）、SSO 起本地回调 HTTP + 浏览器（`nexusmods/sso.rs` L580-612）                                             | URL → Custom Tab/Intent；"打开文件夹"无对应物，删；SSO 回调改 deep link 或本地回环 + 前台服务                                                                                                       |
| Nexus 下载/更新检查                                    | `downloads.rs`/`updates.rs`：reqwest + rustls、断点续传、SHA-256                                                                                   | C# HttpClient 重实现；API key 存 Android Keystore（替 keyring）                                                                                                                                     |
| AI/语义栈                                              | `fastembed`+`ort`（directml/coreml/cuda）+ `sqlite-vec`                                                                                            | **不进安卓构建**，无对应后端                                                                                                                                                                        |
| powershell/tasklist/pgrep/explorer/rundll32 等外部进程 | 见 §6.3 各行及 `infrastructure/shell/windows.rs`                                                                                                   | 全部替换或删除（安卓进程模型不允许自由 spawn）                                                                                                                                                      |

### 6.4 Rust 后端：不进安卓构建，作规格参考

后端 ~60-70% 是平台无关逻辑（`library.rs` 扫描/依赖健康图、`install_manager.rs` 备份会话与 JSON 合并、`archive/extract.rs` 纯 Rust 解压、SMAPI zip 文件名解析与 SHA-256 强校验、`smapi_update` 版本比较），但这些能力在 R1 下由 C# 侧实现更顺（与游戏宿主同进程同沙盒）；把 Rust 库通过 NDK 交叉编译再从 C# P/Invoke 会引入双工具链构建复杂度，不推荐。`host_runtime` 的 lane/pool/resource 调度模型与 NDJSON 协议保持为远程伴侣路线（若未来做）的现成资产。

---

## 7. Android 平台专项

- **mods 目录**：`Android/data/<启动器包名>/files/Mods`（app-specific external storage）——无需存储权限、随 App 卸载清理；这是 SMAPILoader 的现行做法（`ModInstaller.cs`）。注意 Android 11+ 对 `Android/data` 的文件管理器访问限制：用户手动放 zip 需走 App 内 SAF 选择器（正与 §6.3 拖拽改造一致）。
- **权限**：参照其 manifest——`INTERNET`、`VIBRATE`（通知震感）、外部存储写仅限 ≤Android 10、`<queries>` 声明两个游戏包名用于包可见性（Android 11+ 必须，否则 PackageManager 查不到游戏）；无 root 相关权限、不声明游戏 Activity（入口 Activity 由 .NET `[Activity]` 构建时生成）。
- **正版检测与版本门槛**：运行时经公开 API 读取用户已安装的 Play/Galaxy 正版；硬门槛游戏 ≥ 1.6.15.3（SMAPILoader 当前值）、SMAPI ≥ 4.0、仅 arm64。
- **API key 安全**：Nexus API key 用 Android Keystore（替换桌面 keyring）。
- **分发渠道**：SMAPILoader 走 GitHub Releases 分发 APK。Play Store 对 modding 启动器类 App 的政策存在不确定性（`<queries>` 游戏包名 + 引导加载第三方代码），首版建议与 SMAPILoader 同渠道（GitHub Releases），Play 上架留作后续评估。

---

## 8. 许可证与分发义务

| 组件                            | 协议     | 义务                                                                                                                                                                 |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMAPILoader（fork 并入）        | GPL-3.0  | 整个安卓 App 以 GPL-3.0-or-later 分发；保留其版权声明。与本仓库现状兼容                                                                                              |
| SMAPI-Android-1.6（运行时下载） | LGPL-3.0 | 保留来源与协议声明；运行时下载分发无修改义务                                                                                                                         |
| 上游 SMAPI                      | LGPL-3.0 | 同上（fork 沿用 LGPL）                                                                                                                                               |
| 游戏本体                        | 商业版权 | **不分发任何游戏代码/资源**——启动器只在运行时经公开 API 读取用户自己设备上已购买安装的游戏；仓库与 APK 内不含游戏文件（SMAPILoader/JunimoGate/Cinderbox 的通行做法） |

## 9. 风险与维护负担

| 风险                                                          | 影响                                                    | 缓解                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 游戏更新破坏 Assembly Store 格式 / runtime 哈希 pin / IL 重写 | 启动器整体失效，最高频风险                              | R1 下跟随 SMAPILoader upstream 同步；其 v1.1.7（2026-06）证明单人可维护该跟进节奏  |
| 上游停更或方向分叉                                            | 失去参照物，滑向 R2 自研状态                            | fork 时即建立完整本地构建能力（`docs/building.md` 已记录自建路径），不依赖上游存活 |
| SMAPI Android 仍是 experimental                               | 部分 mods 不兼容（官方 wiki 表述"most mods supported"） | UI 内呈现兼容性预期；复用 stardewrocks/android-compatible-mods 兼容清单做提示      |
| WebView 桥稳定性/性能                                         | UI 卡顿或桥帧丢失                                       | 单通道 + 前端已有超时/取消策略（Task Runtime）；帧协议与 sidecar 同构，行为可对拍  |
| SSO 本地回调在安卓的后台限制                                  | 登录流程中断                                            | 回调改 deep link（Custom Tab 完成后跳回），避免前台服务依赖                        |
| 版本门槛硬编码随 fork 老化                                    | 误拒可运行的新版本                                      | 把门槛提为远端可配置（现有桌面版 update-check 通道可复用思路）                     |

调研中**未能确认**的点（如实标注）：SMAPI 上游从未正式表态 Android 支持计划；SMAPILoader `LibPatcher` 所补丁的 ELF 是启动器捆绑 runtime 还是游戏提取 runtime 未读到调用点（哈希注释 8.0.21 指向 .NET 8 Mono build，合理推断为捆绑的定制 runtime）；Cinderbox 闭源，其桌面版运行机制未知。

## 10. 里程碑路线图

| 里程碑                        | 内容                                                                                                                                                                               | 规模   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **M0 本报告**                 | 路线与许可决策落定                                                                                                                                                                 | 已完成 |
| **M1 壳跑通**                 | fork SMAPILoader，搭起 .NET 9 + android workload 工具链，在 arm64 真机（正版游戏 ≥1.6.15.3）原样跑通"装 SMAPI → 装 mod → 进游戏"，同步建立 GPL 合规的 NOTICE                       | 中     |
| **M2 WebView 桥 + mods 管理** | 剥离其原生 UI；嵌入 WebView 承载 ModForge 启动器前端；实现 24 方法 `PlatformPorts` JS 桥 + C# 侧 mods 库（扫描/启停/安装/备份，按 §6.3 规格从 Rust 域移植）；dev mock 增设安卓档位 | 大     |
| **M3 Nexus 能力**             | SSO（Custom Tab + deep link 回调）、API key 入 Keystore、Nexus 目录搜索/下载/更新检查（C# HttpClient + SHA-256 校验）                                                              | 中     |
| **M4 打磨发布**               | 日志一键分享、存档导入导出备份（JunimoGate 式）、中文 locale、GitHub Releases 签名分发、崩溃隔离（game-host 进程）评估                                                             | 中     |

M2 结束即得"可真实使用"的纵切片：用户能在手机上用 ModForge 的启动器 UI 管理 mods 并进游戏；M3 补齐 Nexus 闭环。

---

## 附：来源索引

**参考仓库**：[SMAPILoader](https://github.com/NRTnarathip/SMAPILoader)（[building.md](https://raw.githubusercontent.com/NRTnarathip/SMAPILoader/master/docs/building.md)）· [SMAPI-Android-1.6](https://github.com/NRTnarathip/SMAPI-Android-1.6) · [JunimoGate](https://github.com/leontismaro/JunimoGate) · [Cinderbox](https://github.com/Ekyso/Cinderbox) / [Cinderbox-Companion](https://github.com/ObfuscatedVoid/Cinderbox-Companion) · [Pathoschild/SMAPI](https://github.com/Pathoschild/SMAPI)（[smapi.io](https://smapi.io/)）

**SMAPILoader 关键源文件**（raw 前缀 `https://raw.githubusercontent.com/NRTnarathip/SMAPILoader/master/`）：`SMAPIGameLoader/Tool/StardewApkTool.cs` · `Game/GameAssemblyManager.cs` · `Launcher/GameCloner.cs` · `Game/Rewriter/StardewGameRewriter.cs` · `Game/SMAPIActivity.cs` · `Game/MainActivityPatcher.cs` · `LibPatcher/LibPatcherArm64.cs` · `Launcher/SMAPIInstaller.cs` · `Launcher/ModInstaller.cs`

**社区/wiki**：[官方 wiki：Installing SMAPI on Android](https://stardewvalleywiki.com/Modding:Installing_SMAPI_on_Android) · [官方 wiki：Getting Started](https://stardewvalleywiki.com/Modding:Player_Guide/Getting_Started) · [Nexus：SMAPI Android（mod 44436）](https://www.nexusmods.com/stardewvalley/mods/44436)

**仓库内证据**（行号为 2026-09-17 `pages` 分支快照）：`apps/desktop/src-tauri/src/domain/launcher/runtime.rs:112`（游戏 spawn）· `apps/desktop/src-tauri/src/domain/launcher/smapi_update/installer.rs:215`（SMAPI.Installer 调用）· `apps/desktop/src-tauri/src/domain/launcher/mod_config/probe_run.rs:265`（GMCM probe + Job Object）· `apps/desktop/src-tauri/src/infrastructure/fs/pathing.rs:314`（winreg 游戏发现）· `apps/desktop/src-tauri/src/host/host_runtime/mod.rs:48`（lane/pool/resource 模型）· `apps/desktop/src/shared/contracts/platform.ts`（PlatformPorts 24 方法）· `apps/desktop/src/app/providers/PlatformProvider.tsx`（宿主注入点）· `apps/desktop/src/features/launcher/model/launcherPort.ts`（启动器 port 60 方法）· `apps/desktop/src/platform/tauri/devLauncherMock.ts`（零原生宿主运行验证）· `apps/desktop/src/tests/architecture/frontendModuleArchitecture.test.ts`（platform 收口护栏）
