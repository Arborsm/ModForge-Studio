# ModForge Studio

ModForge Studio 是一个面向《星露谷物语》（Stardew Valley）的 Tauri v2 桌面工作台，用于模组创作、资源查看、Content Patcher 项目编辑、模组管理与游戏启动。

当前主产品位于 `apps/desktop`：前端使用 React + TypeScript，桌面端能力由 Rust / Tauri 提供。前端采用 FSD + Clean Architecture，桌面能力通过 platform contracts 和 app providers 注入，业务层不直接依赖 Tauri。

## 项目结构索引

项目结构由 CodeGraph 托管，`.codegraph/` 是当前代码库的结构索引来源。查找文件、符号、调用关系、影响范围、功能入口时优先使用 CodeGraph MCP 工具，而不是维护一份容易过期的手写目录树。

- 文件/目录：`codegraph_files`
- 符号和定义：`codegraph_search`、`codegraph_node`
- 调用关系和影响面：`codegraph_callers`、`codegraph_callees`、`codegraph_impact`
- 功能或架构上下文：`codegraph_context`，必要时再用 `codegraph_explore`
- 使用规则：`.codex/skills/codegraph/SKILL.md`

只有稳定架构原则、公共入口和开发命令需要写进 README；具体文件清单以 CodeGraph 查询结果为准。

## 前端架构方向

前端目标结构是 Feature-Sliced Design + Clean Architecture。

依赖方向：

```text
app -> pages -> widgets -> features -> entities -> shared/contracts
```

`platform` 是外部 adapter 层。平台能力由 `app/providers` 注入；业务层不直接 import Tauri，也不直接调用 `invoke`。`processes` 已不在目标结构中，跨页面 / 跨 feature 的编排放进 `app/` 或对应 `features/`。

分层职责：

- `app/`：应用装配、全局 Provider、全局壳层、启动恢复、registry setup、应用级编排。
- `pages/`：页面骨架、view 分发、只属于单个页面的 runtime。
- `widgets/`：组合 features、entities、shared UI 的复用 smart container。仅单页使用的复杂区块留在对应 `pages/` slice。
- `features/`：边界稳定的用户能力，例如启动器页面、生成项目编辑、工作区编辑器。
- `entities/`：无 UI 依赖的领域逻辑、模型、selector、解析辅助与领域状态。
- `shared/contracts/`：registry、events、commands、platform ports 等跨层合同。
- `shared/contracts/types/`：跨层纯类型。
- `shared/ui/`：无业务归属的 UI 原语。
- `platform/`：桌面 / Tauri adapter 与静态插件注册。

## 公共 API 与 Barrel Hygiene

- 优先保留 slice 级 public API，但不要把一个大 slice 的所有内容都堆进单一 `index.ts`。
- 在已经有 slices 的层里，避免再给 segment 叠 `index.ts`，除非它真的是稳定的对外入口。
- `shared` 以意图拆分的 segment public API 为主，避免单一巨型 `shared/index.ts`。
- 大量 barrel 文件会拖慢开发服务器和 tree-shaking，新增出口前先判断它是不是必须的公共边界。
- 跨层公共 API 需要简洁 JSDoc，覆盖用途、归属边界、缓存或副作用；不要写逐行解释，也不要保留迁移/兼容注释。

## 长期入口

README 只记录长期稳定入口，不维护完整路径地图：

- 产品工作区：`apps/desktop`
- 前端架构约束：`docs/frontend-architecture.md`
- Agent 约束：`AGENTS.md`
- Nexus Mods GraphQL v2 文档快照：`docs/nexusmods-graphql/SUMMARY.md`
- CodeGraph 使用规则：`.codex/skills/codegraph/SKILL.md`

具体代码入口用 CodeGraph 查询：

- 改功能前先用 `codegraph_context` 取任务上下文。
- 查目录用 `codegraph_files`，查符号用 `codegraph_search`。
- 查影响面用 `codegraph_impact`、`codegraph_callers`、`codegraph_callees`。
- CodeGraph 定位到文件后，再打开源码细读。

## 常用命令

从仓库根目录运行。

- `uv run pnpm dev`：启动前端开发服务器。
- `uv run pnpm desktop:dev`：启动完整 Tauri 桌面应用。
- `uv run pnpm format`：用 Prettier 格式化仓库内受支持文件，并自动排序 Tailwind class。
- `uv run pnpm format:check`：检查 Prettier 格式，不写入文件。
- `uv run pnpm lint`：前端 lint。
- `uv run pnpm build`：前端构建。
- `uv run pnpm --filter @modforge/desktop test`：前端测试。
- `uv run pnpm --filter @modforge/desktop test:launcher-drag`：针对 Launcher library 拖拽交互运行 Playwright 性能验证；默认目标为 `http://127.0.0.1:5175/?mfLauncherMock=1`，可用 `MODFORGE_LAUNCHER_DRAG_URL` 覆盖。
- `uv run cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`：格式化 Rust 后端。
- `uv run cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`：Rust 检查。
- `uv run cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`：Rust 测试。

## 首次接手建议

1. 先读 `AGENTS.md` 和 `docs/frontend-architecture.md`，了解硬约束。
2. 用 `codegraph_status` 确认索引健康。
3. 用 `codegraph_context` 查询当前任务区域；需要目录时用 `codegraph_files`，需要符号时用 `codegraph_search`。
4. 只在 CodeGraph 定位到具体文件后，再打开源码细读。

## 维护规则

项目结构由 CodeGraph 托管，README 不维护完整目录清单。只有稳定架构原则、公共入口、开发命令或长期文档位置发生变化时才同步 README；具体文件路径和影响面以 CodeGraph 查询结果为准。
