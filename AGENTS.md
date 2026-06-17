# ModForge Studio — Agent Guide

面向 AI 编码助手的仓库规则。先读本文件；需要背景时再读 `README.md`、`docs/frontend-architecture.md`、`docs/maintenance.md` 或对应源码。

## 事实来源

- 项目概览、平台支持和启动方式以 `README.md` 为准。
- 前端分层、依赖方向和 HostCommandClient 边界以 `docs/frontend-architecture.md` 为准。
- 构建、发布、CI、签名和维护命令以 `docs/maintenance.md` 为准。
- Nexus Mods GraphQL 事实以 `docs/nexusmods-graphql/**` 的生成快照为准。
- 不要在本文件维护长目录树、依赖清单或迁移流水账；这些内容容易过期。

## 快速定位

- 活跃产品代码在 `apps/desktop`。
- 前端源码在 `apps/desktop/src`。
- Rust/Tauri 后端在 `apps/desktop/src-tauri`。
- Linux Electron 宿主在 `apps/desktop/electron`。
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
vp run --filter @modforge/desktop test
```

Rust 后端命令必须显式指定 manifest：

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Host command 调度追踪：

```bash
MODFORGE_COMMAND_TRACE=1 vp run dev
```

该变量放行 `HostRuntime` command start/finish/failure debug 日志；应用 debug diagnostics toggle 不应放行 command trace，但仍应放行其他 backend debug/trace。

## 前端硬规则

- 目标依赖方向是 `app -> pages -> widgets -> features -> entities -> shared/contracts`；`platform` 是外部 adapter，由 `app/providers` 注入。
- `shared` 不允许 import `app`、`pages`、`widgets`、`features`、`entities`、`platform`。
- `entities` 不允许 import `pages`、`widgets`、`features`，也不允许引用 panel/layout UI 类型。
- `features` 不允许横向 import 其他 feature；跨特性联动必须通过 typed event 或 typed command。
- `widgets` 可以组合 `features` / `entities` 暴露的 hooks、selectors、commands，但不能定义领域数据结构，不能直接调用宿主平台。
- `pages` 只做页面骨架、view host、route/view 分发，不要集中拉取所有业务状态。
- `app/registry-setup.ts` 是静态 registry 的组合点；feature/widget 只能 export registration object，不能运行时自注册。
- 业务层禁止直接 import `@tauri-apps/api`、直接调用 `invoke(`、直接依赖 Electron preload/global API、直接调用 `fileSystem.invokeCommand`；宿主能力必须通过 typed API、`HostCommandClient` 或 platform contracts。
- `HostCommandClient` 负责前端 command policy；业务 API 必须声明 `latest`、`keyedLatest`、`exclusiveMutation`、`queuedMutation`、`parallelPool` 或 `serviceGate` 等策略。
- 不要用散装 `cancelled`、`requestId`、`versionRef` 替代 Task Runtime 能表达的所有权规则。DOM、timer、animation cleanup 可以保留局部 cleanup。
- React Compiler 已启用；不要为默认渲染性能新增手写 `useMemo` / `useCallback`。只在 provider value、effect 依赖稳定性、external store、virtualizer、拖拽或第三方 callback identity 需要时保留稳定引用。

## 前端实现规则

- UI 文案必须通过 `apps/desktop/src/locales` 的类型化 locale bundles 消费；禁止在组件里硬编码用户可见字符串。
- 样式入口是 `apps/desktop/src/styles/index.css`；工作台专属样式通过 `styles/workbench.css` 懒加载。
- 样式按 `styles/primitives`、`styles/workspace`、`styles/features` 落位；不要跨目录重复规则。
- 配色必须走 `tokens.css` 暴露的主题变量；禁止写死 `#fff`、`#xxxxxx`、`rgba()` 或在 `color-mix` 里混入字面白/黑。非主题装饰、封面/分类标识和低 alpha 高光例外。
- 主题是 `[data-theme]` + `.dark` 正交；新增/调整颜色只改 `tokens.css` 源 token，不要用零散 `.dark` 覆盖补丁。
- 公共 API 必须有简洁 JSDoc，说明用途、边界、缓存或副作用，不复述实现。

## 后端硬规则

- 后端 command 执行统一走 Host Runtime：Electron sidecar 和 Tauri command wrapper 都必须通过同一套 `host_runtime` / `commands/runtime.rs` 调度，不允许各自绕过 runtime 直接执行耗时业务。
- `apps/desktop/src-tauri/src/commands` 只做 Tauri command wrapper：构造 command envelope、调用 shared runtime、错误包装和返回结果；业务逻辑放 `domain`。
- Host command 协议名等于 Tauri wrapper 函数名：Rust wrapper 用 `host_command_name!(function_name)`，sidecar 分发用 `host_command_wire!(function_name)`，前端 `HOST_COMMANDS` 由 `vp run --filter @modforge/desktop gen:host-commands` 扫描 `#[tauri::command] pub fn` 生成；禁止手写独立 manifest 或字符串清单。
- `apps/desktop/src-tauri/src/sidecar.rs::resolve_command` 是 Rust command 的唯一绑定点；command 名称、lane、resources、cancel/mutation 策略、参数解析和执行闭包必须在同一个 match arm 声明。
- 禁止再建 `dispatch_mode(command)`、`defaultHostCommandPolicy` 这类独立硬编码分类表。
- Host command lane 语义固定：`Control` 处理取消、日志、SSO 状态、打开路径/URL 等轻量控制；`Network` 处理 Nexus/SMAPI/远程图片/下载/更新/API key 等远程请求；`Io` 处理本地读取、扫描、解析、缓存读取和 archive inspect；`Mutation` 处理保存、安装、恢复、清缓存和持久化写入。
- 持久化或破坏性写入必须在绑定点声明资源锁；同资源命令必须串行，不同资源不能被无关网络洪峰饿死。
- `apps/desktop/electron/main.ts` 只做 transport/supervisor：IPC、sidecar 启停、pending promise、stdout frame、stderr log、exit/error reject；禁止在 Electron main 维护 command lane、resource、mutation 或取消策略。
- sidecar stdin 主循环只 parse/enqueue，不能在 read loop 执行业务；blocking HTTP、文件扫描、解压、安装和重试 sleep 必须在 Host Runtime worker 内隔离。
- Host command tracing 只能通过启动环境变量开启，不要做成前端可调用 command，也不要混入应用 debug diagnostics toggle；UI debug 仍应保留其他 backend debug/trace。
- `domain` 按业务边界组织 launcher、mods、assets、content_patcher、cp_maker、saves、event_project、workbench_project、app_ui 等领域逻辑。
- `infrastructure` 只放技术实现，如 game formats、filesystem、webview 基础设施；不要混入 launcher/Nexus 等领域规则。
- 大型 Rust 测试不要新增内联 `#[cfg(test)] mod tests`；优先放 sibling `tests/*.rs` 或 `apps/desktop/src-tauri/tests` 的回归测试。
- 修改资产解码、解析、安装、启动、路径安全或 fallback 行为时，必须补充或更新回归测试。

## 完整性要求

- 禁止最小实现：不要交付 MVP、占位 UI、空壳 command、假数据、TODO 流程或只覆盖 happy path 的临时实现。
- 新功能必须按真实产品路径完成：数据加载、状态更新、加载态、空态、错误态、持久化、权限/路径校验、国际化文案和测试入口都要按影响范围落地。
- 修复 bug 必须处理真实根因和相邻回归风险；禁止用静默 catch、吞错误、硬编码 fallback 或绕过校验掩盖问题。
- 如果范围过大，拆成可独立合并的完整纵切片；每个切片都要能被真实用户使用。
- 收尾时删除调试代码、临时兼容层、一次性迁移入口和未使用导出。

## 验证规则

- 前端改动最终至少说明 `vp run lint`、`vp run build`、`vp run --filter @modforge/desktop test` 是否已跑；未跑要说明原因。
- Rust 改动先跑 `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`，再跑对应 `cargo check` 或 `cargo test`。
- 架构迁移必须补充或更新架构测试，覆盖依赖方向、平台 API 泄漏、旧根目录回归、feature 横向依赖和实体层 UI 类型污染。
- UI/布局变更需要截图、Playwright 验证脚本或明确手动路径证明；不要只凭静态阅读宣布完成。

## Git 规则

- 使用 Conventional Commits 并带 scope，例如 `feat(workspace): ...`、`fix(i18n): ...`、`refactor(ui): ...`。
- 不要回滚用户未要求回滚的改动，不要用破坏性 git 命令清理工作区。
