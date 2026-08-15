# ModForge Studio — Agent Guide

面向 AI 编码助手的仓库规则。先读本文件；需要背景时再读 `README.md`、`docs/frontend-architecture.md`、`docs/maintenance.md` 或对应源码。

## 事实来源

- 项目概览、平台支持和启动方式以 `README.md` 为准。
- 前端分层、依赖方向和 HostCommandClient 边界以 `docs/frontend-architecture.md` 为准。
- 构建、发布、CI、签名和维护命令以 `docs/maintenance.md` 为准。
- Nexus Mods GraphQL 事实以 `docs/nexusmods-graphql/**` 的生成快照为准。
- 后端分层、域间依赖与共享内核规则以 `docs/backend-architecture.md` 为准。
- 不要在本文件维护长目录树、依赖清单或迁移流水账；这些内容容易过期。

## 快速定位

- 活跃产品代码在 `apps/desktop`。
- 安装器应用在 `apps/installer`。
- 前端源码在 `apps/desktop/src`。
- Rust/Tauri 后端在 `apps/desktop/src-tauri`。
- Linux Electron 宿主在 `apps/desktop/electron`。
- 产品引导在 `apps/desktop/src/features/guide` 和 `apps/desktop/src/widgets/guide-tour`；工作台壳在 `apps/desktop/src/widgets/workbench-shell`。
- 资源选取与素材浏览在 `apps/desktop/src/features/resource-browser`；AI 翻译编辑在 `apps/desktop/src/features/translation-editor`。
- 地图编辑器（素材编辑/图块会话/改动卡片）在 `apps/desktop/src/pages/workbench/workspaces/map/editors/`，编辑器核心 hook 在 `editors/core/useMapDocumentEditor.ts`，画布与调色板在 `entities/map/ui/`；地图工作区浏览器在 `pages/workbench/ui/workspace-panels/map/`。
- 工作台各工作区（对话、邮件、素材库等）在 `apps/desktop/src/pages/workbench/workspaces/`；本地化中心在 `apps/desktop/src/pages/workbench/translation/localization-center`。
- 结构性问题优先用 CodeGraph：理解功能/bug 用 `codegraph_context`，查文件用 `codegraph_files`，找 symbol 用 `codegraph_search`，看影响面用 `codegraph_impact`。
- 原生搜索只用于字面量：文案、日志、注释、配置 key、错误字符串等。

## 常用验证

所有命令默认从仓库根目录运行。

```bash
vp install --frozen-lockfile
vp run dev
vp run web:dev
vp run build
vp run lint
vp run format:check
# 前端单元测试：必须用 `test run`，裸 `vp test` 会进入 watch 模式并在非交互式 shell 中挂起
vp test run --configLoader runner
# 完整 JavaScript gate（Vitest + 独立 Node tests）
vp run --filter @modforge/desktop test
# 后端架构规则检查（CI 同款；--strict 会把白名单遗留耦合也报出）
vp run --filter @modforge/desktop check:backend-architecture
```

Rust 后端命令必须显式指定 manifest：

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
# 只编译依赖本机游戏数据的 ignored regression 和 report examples
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --no-run
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --examples
```

Host command 调度追踪：

```bash
MODFORGE_COMMAND_TRACE=1 vp run dev
```

该变量放行 `HostRuntime` command start/finish/failure debug 日志；应用 debug diagnostics toggle 不应放行 command trace，但仍应放行其他 backend debug/trace。

## 前端硬规则

- 目标依赖方向是 `app -> pages -> widgets -> features -> entities -> shared/contracts`；`platform` 是外部 adapter，由 `app/providers` 注入。
- `shared` 不允许 import `app`、`pages`、`widgets`、`features`、`entities`、`platform`。
- `shared` 内部分层见 `docs/frontend-architecture.md`：`shared/lib` 保持纯通用，`shared/infra` 只收 game-format/asset-format helper，宿主桥在 `platform/host`。
- `entities` 不允许 import `pages`、`widgets`、`features`，也不允许引用 panel/layout UI 类型。
- `features` 不允许横向 import 其他 feature；跨特性联动必须通过 typed event 或 typed command。
- `widgets` 可以组合 `features` / `entities` 暴露的 hooks、selectors、commands，但不能定义领域数据结构，不能直接调用宿主平台。
- `pages` 只做页面骨架、view host、route/view 分发，不要集中拉取所有业务状态。
- `app/registry-setup.ts` 是静态 registry 的组合点；feature/widget 只能 export registration object，不能运行时自注册。
- 业务层禁止直接 import `@tauri-apps/api`、直接调用 `invoke(`、直接依赖 Electron preload/global API、直接调用 `fileSystem.invokeCommand`；宿主能力必须通过 typed API、`HostCommandClient` 或 platform contracts。
- `HostCommandClient` 负责前端 command policy；业务 API 必须声明 `latest`、`keyedLatest`、`exclusiveMutation`、`queuedMutation`、`parallelPool` 或 `serviceGate` 等策略。
- 不要用散装 `cancelled`、`requestId`、`versionRef` 替代 Task Runtime 能表达的所有权规则。DOM、timer、animation cleanup 可以保留局部 cleanup。
- React Compiler 已启用；不要为默认渲染性能新增手写 `useMemo` / `useCallback`。只在 provider value、effect 依赖稳定性、external store、virtualizer、拖拽或第三方 callback identity 需要时保留稳定引用。
- 前端测试集中到 `apps/desktop/src/tests/`，按 `unit/`、`architecture/` 分组；共享测试基础设施放 `src/tests/support/`（`setup.ts`、`sourceScan.ts`、类型声明），通过 `@test/*` 引用。源码目录禁止存放 `*.test.ts` / `*.test.tsx`。
- 前端**只保留纯逻辑测试 + 架构测试**：`unit/` 一律用 `.ts`（无 `.tsx`/`.spec.tsx`），不渲染组件、不用 `renderHook`；只测解析器、数据变换、reducer、命令路由、状态逻辑等不依赖 DOM 结构的行为。UI 渲染/样式断言（类名、内联样式、DOM 层级）一律不写——它们任何 UI 重构都会挂，已由 `architecture/` 的源码扫描器和人工/截图验证覆盖。

## 前端实现规则

- UI 文案必须通过 `apps/desktop/src/locales` 的类型化 locale bundles 消费；禁止在组件里硬编码用户可见字符串。
- 样式入口是 `apps/desktop/src/styles/index.css`；工作台专属样式通过 `styles/workbench.css` 懒加载。
- 样式按 `styles/primitives`、`styles/workspace`、`styles/features` 落位；不要跨目录重复规则。
- 配色必须走 `tokens.css` 暴露的主题变量；禁止写死 `#fff`、`#xxxxxx`、`rgba()` 或在 `color-mix` 里混入字面白/黑。非主题装饰、封面/分类标识和低 alpha 高光例外。
- 主题是 `[data-theme]` + `.dark` 正交；新增/调整颜色只改 `tokens.css` 源 token，不要用零散 `.dark` 覆盖补丁。
- 公共 API 必须有简洁 JSDoc，说明用途、边界、缓存或副作用，不复述实现。
- Props 是组件的最小必要接口：父组件只传业务数据、业务上下文和业务回调。
- locale 文案用 `@locales/provider` typed hooks 自消费；禁止透传 copy / labels 对象或纯静态 `*Label` / `*Description` 字段。
- 响应式用户偏好统一走 zustand preferences store；禁止组件层用散装 `useState` 镜像偏好，禁止为单类偏好新增独立 Provider。
- 重复结构归一为配置数组或子对象，不要逐项平铺成同类 props。

## 后端硬规则

- 后端 command 执行统一走 Host Runtime：Electron sidecar 和 Tauri command wrapper 都必须通过同一套 `host_runtime`（含 Tauri in-process 入口 `host_runtime::execute`）调度，不允许各自绕过 runtime 直接执行耗时业务。
- 每个 command 的"绑定点"是 `#[host_command(...)]` 属性（由 `host-command-macros` proc-macro 单处生成 wire envelope struct、`const NAME`、`impl HostCommand` 和 `#[tauri::command]` wrapper）：属性声明 lane（control/network/io/mutation）、pool（lane/image_cdn/ai/official_indexing/semantic_indexing/semantic_search）、resources（资源锁）、wrap（ok 默认 / ai 走 `ok_ai` / raw 命令式）与 context（`control_with_context`）。函数签名是唯一参数来源（第一参数 `app: AppHandle` 是宿主句柄，其余是 payload）；函数体只写 domain 调用。业务逻辑放 `domain`。
- binding 文件贴在各业务目录下的 `commands.rs`（如 `domain/launcher/commands.rs`、`domain/ai/commands.rs`、`infrastructure/game_formats/xact/commands.rs`、`support/logging/commands.rs`），与所服务的域逻辑同目录；父模块用 `pub(crate) mod commands;` 接线。禁止再建集中式 `commands/` 目录。
- 例外：运行时计算资源锁的命令（resource resolver，如 `save_mod_i18n_files`）保持手写三件套：struct + `impl HostCommand` + `crate::host_runtime::execute(app, <X>Params { .. }).await` wrapper。
- Host command 协议名等于 wrapper 函数名。前端 `HOST_COMMANDS` 和 lib.rs 的 `generate_handler![...]` 块都由 `vp run --filter @modforge/desktop gen:host-commands` 递归扫描 src 树下所有 `commands.rs` 生成；sidecar 路由 match 由脚本生成，arm 为规范指针 `resolve_typed::<crate::<module::path>::<X>Params>(ctx, id, args)`（module::path 即文件相对 src/ 的模块路径，漂移检查对空白不敏感；宏命令的 `<X>Params` 由 `PascalCase(命令名)+"Params"` 派生，脚本与宏的 case 转换必须一致，两侧各有测试钉住）。`build.rs` 在每次 cargo 构建时执行同一脚本的 `--check`，三份产物任一漂移直接编译失败——新增/改名命令必须跑一次 `gen:host-commands` 再构建。禁止手写独立 manifest 或字符串清单，禁止 `State<DebugLoggingState>` 旧式 wrapper。
- `apps/desktop/src-tauri/src/host/sidecar.rs::resolve_command` 只是无策略的路由层：match arm 必须是生成器校验的类型指针，lane/resource/pool 等策略只允许出现在 `#[host_command(...)]` 绑定点；禁止在 sidecar arm 里再写策略。
- lane/pool/resource 选择语义统一在 `host_runtime.rs` 的 typed command binding 段（`HostCommand` trait 提供语义方法：`Self::io` / `Self::mutation_with_resources` / `Self::ai_network` / `Self::mutation_on_semantic_indexing_pool` 等，宏属性映射到这些方法），禁止再建 `dispatch_mode(command)`、`defaultHostCommandPolicy` 这类独立硬编码分类表。
- Host command lane 语义固定：`Control` 处理取消、日志、SSO 状态、打开路径/URL 等轻量控制；`Network` 处理 Nexus/SMAPI/远程图片/下载/更新/API key 等远程请求；`Io` 处理本地读取、扫描、解析、缓存读取和 archive inspect；`Mutation` 处理保存、安装、恢复、清缓存和持久化写入。
- 持久化或破坏性写入必须在绑定点声明资源锁；同资源命令必须串行，不同资源不能被无关网络洪峰饿死。
- `apps/desktop/electron/main.ts` 只做 transport/supervisor：IPC、sidecar 启停、pending promise、stdout frame、stderr log、exit/error reject；禁止在 Electron main 维护 command lane、resource、mutation 或取消策略。
- sidecar stdin 主循环只 parse/enqueue，不能在 read loop 执行业务；blocking HTTP、文件扫描、解压、安装和重试 sleep 必须在 Host Runtime worker 内隔离。
- Host command tracing 只能通过启动环境变量开启，不要做成前端可调用 command，也不要混入应用 debug diagnostics toggle；UI debug 仍应保留其他 backend debug/trace。
- `domain` 按业务边界组织 launcher、mods、assets、content_patcher、cp_maker、saves、ai、localization、modding、nexusmods 等领域逻辑（其中 `mods`、`app_ui` 等以单文件形式存在）。
- `infrastructure` 只放技术实现，如 game formats、filesystem、webview 基础设施；不要混入 launcher/Nexus 等领域规则。
- 后端分层与域间依赖方向以 `docs/backend-architecture.md` 为准（R1–R6，由 `check:backend-architecture` 强制）；白名单语义是迁移清单——修复耦合时同步删条目，删除前先修代码（R4/R5 已清零，机制保留给未来迁移复用）。
- 前端 `shared/infra` 对齐 game-format/asset-format 边界，不承载宿主桥、launcher/Nexus 业务规则。
- 大型 Rust 测试不要新增内联 `#[cfg(test)] mod tests`；单元测试放 `apps/desktop/src-tauri/src/tests/unit/`，跨模块集成测试放 `apps/desktop/src-tauri/src/tests/integration/`，回归测试放 `apps/desktop/src-tauri/tests/`。
- 修改资产解码、解析、安装、启动、路径安全或 fallback 行为时，必须补充或更新回归测试。

## 完整性要求

- 禁止最小实现：不要交付 MVP、占位 UI、空壳 command、假数据、TODO 流程或只覆盖 happy path 的临时实现。
- 新功能必须按真实产品路径完成：数据加载、状态更新、加载态、空态、错误态、持久化、权限/路径校验、国际化文案和测试入口都要按影响范围落地。
- 修复 bug 必须处理真实根因和相邻回归风险；禁止用静默 catch、吞错误、硬编码 fallback 或绕过校验掩盖问题。
- 如果范围过大，拆成可独立合并的完整纵切片；每个切片都要能被真实用户使用。
- 收尾时删除调试代码、临时兼容层、一次性迁移入口和未使用导出。

## 验证规则

- 只跑改动相关的验证、架构测试，不要每次收尾都跑完整前端或 Rust 套件；改动面广或 targeted run 出现无关失败时再回退到全量。
- 前端改动最终至少说明 `vp run lint`、`vp run build`、受影响的测试文件是否已跑；未跑要说明原因。
- Rust 改动先跑 `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`，再跑对应 `cargo check` 或具体测试模块；除非跨模块影响，否则不必全量 `cargo test`。
- 架构迁移必须补充或更新架构测试，覆盖依赖方向、平台 API 泄漏、旧根目录回归、feature 横向依赖和实体层 UI 类型污染。
- 删除 locale 行为级测试后，必须用架构测试静态扫描替代护栏：禁 copy / labels props，禁生产代码直接 import imperative locale getter。
- UI/布局变更需要截图、Playwright 验证脚本或明确手动路径证明；不要只凭静态阅读宣布完成。
- 测试应覆盖当前真实需求、已确认 bug 和合理相邻回归；不要为了“防止未来有人把行为改回来”添加透支未来的投机断言。

## Git 规则

- 使用 Conventional Commits 并带 scope，例如 `feat(workspace): ...`、`fix(i18n): ...`、`refactor(ui): ...`。
- 不要回滚用户未要求回滚的改动，不要用破坏性 git 命令清理工作区。
