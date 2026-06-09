# ModForge Studio — Agent Guide

> 面向 AI 编码助手的仓库规则。第一次接手时先读本文件，再按任务读取 `README.md`、`docs/frontend-architecture.md`、`docs/maintenance.md` 或对应源码。

## 事实来源

- 项目概览、支持平台和快速启动以 `README.md` 为准。
- 前端分层和依赖方向以 `docs/frontend-architecture.md` 为准。
- 构建、发布、CI、签名和仓库维护命令以 `docs/maintenance.md` 为准。
- Nexus Mods GraphQL 相关事实以 `docs/nexusmods-graphql/**` 的生成快照为准。
- 不要在 `AGENTS.md` 里复制长依赖清单、完整目录树或一次性迁移记录；这些内容容易过期，应放到对应文档或通过 CodeGraph 查询。

## 当前项目状态

- 活跃产品工作区是 `apps/desktop`；仓库是 pnpm workspace，根 `packageManager` 当前锁定 `pnpm@11.5.1`。
- 桌面宿主当前是 Linux 使用 Electron，macOS 和 Windows 使用 Tauri v2；Rust 仍负责桌面能力、解析、文件系统、启动器和打包侧能力。
- 前端主栈是 React 19、TypeScript 6、Vite 8、Tailwind CSS 4；测试使用 Vitest/jsdom、Testing Library 和必要的 Playwright 验证脚本。
- 前端源码在 `apps/desktop/src`，桌面/Rust 代码在 `apps/desktop/src-tauri`，Electron 宿主代码在 `apps/desktop/electron`。

## CodeGraph

- 结构性问题优先用 CodeGraph：找定义用 `codegraph_search`，看调用关系用 `codegraph_callers` / `codegraph_callees`，看影响面用 `codegraph_impact`。
- 需要理解某个功能、架构或 bug 上下文时，先用 `codegraph_context`，再用一次 `codegraph_explore` 查看相关源码。
- 查文件结构用 `codegraph_files`。不要为了找 symbol 先跑 `rg`，也不要用 grep/read 循环重复 CodeGraph 已有的索引工作。
- 原生搜索只用于字面量：用户可见文案、日志、注释、配置 key、错误字符串等。
- 如果 CodeGraph 返回未初始化，先问用户是否运行 `codegraph init -i`。

## 常用命令

所有命令默认从仓库根目录运行。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm desktop:dev
pnpm build
pnpm lint
pnpm format:check
pnpm --filter @modforge/desktop test
```

Rust 后端命令必须显式指定 manifest：

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 前端架构硬规则

- 目标层级是 `app -> pages -> widgets -> features -> entities -> shared/contracts`；`platform` 是外部 adapter，由 `app/providers` 注入。
- `shared` 不允许 import `app`、`pages`、`widgets`、`features`、`entities`、`platform`。
- `entities` 不允许 import `pages`、`widgets`、`features`，也不允许引用 panel/layout UI 类型。
- `features` 不允许横向 import 其他 feature；跨特性联动必须通过 typed event 或 typed command。
- `widgets` 可以组合 `features` / `entities` 暴露的 hooks、selectors、commands，但不能定义领域数据结构，不能直接调用宿主平台。
- `pages` 只做页面骨架、view host、route/view 分发，不要集中拉取所有业务状态。
- `app/registry-setup.ts` 是静态 registry 的组合点；feature/widget 只能 export registration object，不能运行时自注册。
- `shared/contracts/registry.ts`、`events.ts`、`commands.ts`、`platform.ts` 放跨层合同；实例组合不能放在 `shared`。
- 业务层禁止直接 import `@tauri-apps/api`、直接调用 `invoke(`，也禁止直接依赖 Electron preload/global API；宿主能力只能通过 `platform/electron`、`platform/tauri` 和 contracts 暴露。
- 禁止重建旧根目录 `components/`、`lib/`、`processes/` 或为旧 import 新增 re-export shim。迁移完成必须删除旧入口、兼容层和只服务迁移验收的一次性测试。

## 前端实现规则

- UI 文案必须通过 `apps/desktop/src/locales` 的类型化 locale bundles 消费；禁止在组件里硬编码用户可见字符串，禁止通过 `copy` / `locale` props 层层透传 React 文案。
- 样式入口是 `apps/desktop/src/styles/index.css`；工作台专属样式通过 `styles/workbench.css` 懒加载。
- 样式按 `styles/primitives`、`styles/workspace`、`styles/features` 落位；不要跨目录重复规则。
- `src/styles` 下单个 CSS 文件必须保持在架构测试限制内；拆分样式时用薄 `@import` 聚合文件加聚焦子文件。
- 公共 API 必须有简洁 JSDoc，覆盖 slice/entity 的 `index.ts`、`features/*/api`、`entities/*/api`、`shared/lib/*`、`shared/contracts/*`、复用 hook/helper。注释说明用途、边界、缓存或副作用，不复述实现。

## 后端规则

- `apps/desktop/src-tauri/src/commands` 只做 Tauri command wrapper：参数解析、调用 domain、错误包装和返回结果；业务逻辑放 `domain`。
- `domain` 按业务边界组织 launcher、mods、assets、content_patcher、cp_maker、saves、event_project、workbench_project、app_ui 等领域逻辑。
- `infrastructure` 只放技术实现，如 game formats、filesystem、webview 基础设施；不要混入 launcher/Nexus 等领域规则。
- 大型 Rust 测试不要新增内联 `#[cfg(test)] mod tests`；优先放 sibling `tests/*.rs` 或 `apps/desktop/src-tauri/tests` 的回归测试。
- 修改资产解码、解析、安装、启动、路径安全或 fallback 行为时，必须补充或更新回归测试。

## 实现完整性约束

- **禁止最小实现**：不要交付只满足表面验收的 MVP、占位 UI、空壳 command、假数据、TODO 流程或只覆盖 happy path 的临时实现。
- 新功能必须按真实产品路径完成：数据加载、状态更新、错误处理、空态、加载态、持久化、权限/路径校验、国际化文案和测试入口都要按影响范围落地。
- 修复 bug 必须处理真实根因和相邻回归风险；禁止用静默 catch、吞错误、硬编码 fallback 或绕过校验来掩盖问题。
- 如果范围确实过大，必须拆成可独立合并的完整纵切片；每个切片都要能被真实用户使用，不能留下需要后续任务才能工作的半成品。
- 收尾时主动删除调试代码、临时兼容层、一次性迁移入口和未使用导出；不能把“以后再补”作为默认交付策略。

## 验证要求

- 前端改动最低验证：`pnpm lint`、`pnpm build`、`pnpm --filter @modforge/desktop test`。按影响范围可先跑更小测试，但最终交付需说明已跑或未跑的原因。
- Rust 改动先跑 `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`，再跑对应 `cargo check` 或 `cargo test`。
- 架构迁移必须补充或更新架构测试，覆盖依赖方向、平台 API 泄漏、旧根目录回归、feature 横向依赖和实体层 UI 类型污染。
- UI/布局变更需要能用截图、Playwright 验证脚本或明确手动路径证明；不要只凭静态阅读宣布完成。

## 文档和仓库维护

- 文档读取范围：`AGENTS.md`、根 `README.md`、`.devDocs/**`、`docs/**`。
- 文档写入范围：`AGENTS.md`、根 `README.md`、`.devDocs/**`、`docs/**`。
- superpowers 生成的文档必须放在 `.devDocs/superpowers/`，禁止提交到 git。
- 新增顶层目录、重要功能目录或会改变开发者查找路径的入口时，必须同步更新 `README.md` 或 `docs/**` 的导航说明。
- 禁止让迁移/废弃代码存活超过 2 个版本；迁移完成当场删除旧代码、旧入口、兼容 shim 和一次性迁移测试。
- 禁止堆叠兼容性技术债；优先完成清理、重构和边界测试，而不是无限叠加向后兼容层。

## Git 规则

- 使用 Conventional Commits 并带 scope，例如 `feat(workspace): ...`、`fix(i18n): ...`、`refactor(ui): ...`。
- PR 描述应包含用户可见影响和验证命令；UI/布局变更附截图或短录屏。
- 不要回滚用户未要求回滚的改动，不要用破坏性 git 命令清理工作区。
