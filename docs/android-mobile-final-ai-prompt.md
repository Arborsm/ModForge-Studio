# AI 实施 Prompt — ModForge 安卓移动端终稿 UI

> 用法：新开 AI 会话（可执行代码的 agent），把本文件全文作为任务指令投喂。实施前先读一遍「必读文件」。
> 定稿设计：`docs/mockups/android-mobile-final-mock.html`（视觉与交互的唯一依据）；批次细节：`docs/android-mobile-final-implementation.md`。

---

## 任务

把 ModForge Studio 桌面前端（`apps/desktop/src`）的**安卓宿主移动端 UI**按定稿原型实施到位。仓库：`E:\Arbor\ModForge Studio`（分支 `feat/android-host`）；安卓壳仓库：`E:\Arbor\modforge-android`（分支 `feat/modforge-shell`）。桌面端（>640px 或非 `isAndroidHost()`）行为必须零变化。

## 必读文件（动手前）

1. `AGENTS.md`（仓库规则：FSD 分层、locale 强制、禁硬编码色、验证命令）
2. `docs/mockups/android-mobile-final-mock.html`（终稿原型——视觉与交互唯一依据，8 屏 + 3 弹层全部可点）
3. `docs/android-mobile-final-implementation.md`（分批实施文档 P1–P10 + 硬指标 + 验收清单）
4. `docs/HANDOFF.md` §2.4（模拟器/CDP 调试手段）

## 已定稿的设计规格（不得偏离）

- **顶栏（库/发现）**：`[🔍 搜索框（页语义 placeholder + 蓝色筛选小钮）] [下载][通知][设置]`；brand 隐藏；全局动作组在所有顶层页面一致。
- **顶栏（更新/诊断）**：`[左对齐标题] … [页专属钮] [下载][通知][设置]`。
- **底部导航**：模组库 / 发现 / 更新 / 诊断（4 项目录，soft pill 选中）。功能入口一律不进底导。
- **库页**：内容第一行起直接 2 列网格；**贴底毛玻璃启动条**（播放钮 + 「启动游戏 / SMAPI 版本·模组数」+ 箭头→**启动预检底部面板**：游戏版本/SMAPI/已装模组/依赖冲突/上次启动 + 开始启动）；**筛选底部面板**（过滤/排序/显示开关）；**下拉刷新**（自实现，重扫库）。
- **发现页**：顶栏搜索 + **筛选底部面板**（时间/排序/分类/语言/大小 chips + 应用）；**下拉刷新**；筛选侧栏退役；分页极简。
- **更新页**：正文只有状态行（N 个可更新 · 全选）+ 勾选行（checkbox + 单个「更新」文字钮）；**底部「更新所选 N 个」贴底按钮在底部导航上方**（bottom: 导航高度 + 间距，不得遮挡）。
- **诊断页**：标题 + 右侧「查看日志」（安卓开日志页）；SMAPI Update 卡、GMCM 探针隐藏；路径面板仅 Mods/Download。
- **Mod 详情**（三入口共用）：hero 紧凑（72px 封面 + 名称/作者 + 可更新/已启用 pill）；**属性侧表隐藏**（字段在 Details tab）；版本条（已装 → 最新 + 更新钮）在描述下方；底部胶囊操作栏（文件夹/清单/Update Now）。
- **设置两层**：分类列表页（多色图标行）→ 二级页（行式主题/语言/开关）；`view` 分类安卓隐藏。
- **通知/下载中心/日志**：页面化（返回箭头头部 + 全宽列表）。
- **通知 toast**：顶部全宽横幅、常显关闭、最新一条；历史在通知页。
- **贴底元素铁律**：任何贴底 CTA/启动条的 `bottom` 必须在底部导航之上（nav 高度 + 间距），禁止遮挡。

## 设计规范硬指标

1. 触摸目标 ≥48dp（顶栏钮视觉 38–40px + 命中区补足）。
2. 正文字号 ≥12px；辅助信息 ≥11px。
3. 颜色全部走 `tokens.css`（深色主题自动）；禁止硬编码。
4. 页面转场 280ms 横滑；`prefers-reduced-motion` 禁用动效。
5. 图标 lucide，线宽 2。

## 实施约束（踩过的坑，必须遵守）

1. **lightningcss 会把 `backdrop-filter: none` + `-webkit-backdrop-filter:none` 压缩成只剩 `-webkit-`**，部分 WebView 不认 → 含 backdrop-filter 的规则只能出现在 `@media (min-width: 641px)`；移动端从根本上不写该属性（含 fixed 后代包含块陷阱：顶栏有 blur 会把 fixed 底栏钉在顶栏下）。
2. **grid 行压缩陷阱**：固定高度网格容器里的 `auto` 行会被 `min-height: 0` 压缩导致内容溢出重叠（详情页 hero 属性表压 tabs 的根因）——溢出重叠先查祖先链的 min-height/overflow。
3. **结构性门控用 `androidHost`（isAndroidHost）prop 下传**（AppShell → LauncherPage → 各页）；纯样式用 ≤640px 媒体查询；移动专属组件集中 `pages/launcher/ui/mobile/`；移动 CSS 集中 `styles/features/launcher/mobile.css`。
4. `locale` 双语（en-US/zh-CN）同步，禁止硬编码文案；locale 类型在 `locales/model/**`。
5. 协议/桥变更必须跑：`vp run --filter @modforge/desktop gen:host-commands` + `gen:android-bridge`（本任务预期无新命令；`read_launcher_log` 已存在）。
6. 改 Rust 后：`cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml` + `cargo check`（有跨模块影响才跑全量测试）。
7. 桌面回归：>640px 行为零变化是硬验收；`vp test run` 全量绿。
8. **验证循环**：每批 = `vp run lint` + `vp test run`（相关）+ `vp run build` → `cp -r apps/desktop/dist/. ../modforge-android/SMAPIGameLoader/Assets/www/` → `dotnet build ../modforge-android/SMAPIGameLoader/SMAPIGameLoader.csproj -c Release -p:AndroidSdkDirectory="E:\Android\Sdk"`（JAVA*HOME=`C:/Program Files/Eclipse Adoptium/jdk-21.0.7.6-hotspot`）→ `adb install -r`（adb 在 `E:/Android/Sdk/platform-tools/`）→ `monkey -p com.modforge.android -c android.intent.category.LAUNCHER 1` 启动 → CDP 截图核对（`adb forward tcp:9333 localabstract:webview_devtools_remote*<pid>`，注意 Activity CRC 每次构建变化，用 monkey 启动）。
9. 模拟器预览也可用 `vp run web:dev` + `?mfAndroidMock=1&mfLauncherMock=1`（发现页搜索已由 mock 假数据支持）。
10. 提交：Conventional Commits + scope，分批提交；APK/CI 收尾时推送双仓库并确认 `gh run list --repo Arborsm/modforge-android` 绿色。

## 批次顺序（每批独立提交）

按 `docs/android-mobile-final-implementation.md` 的 P1→P10 顺序执行；每批完成必须在模拟器截图核对该批验收点后提交。已完成不需要重做：工作台锁定、诊断 SMAPI/GMCM 隐藏、日志页面化、通知 toast 顶部全宽、发现筛选默认收起、库页 2 列网格密度。

## 验收

- `docs/android-mobile-final-implementation.md` 末尾「回归验收清单」10 项逐条过。
- 终稿原型逐屏对照（桌面 >640px 截图对比零变化）。
- 重建 APK 交付 + CI（modforge-android 仓库 push 自动构建）绿色。
