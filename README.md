# ModForge Studio

ModForge Studio 是一个面向《星露谷物语》（Stardew Valley）的 Tauri v2 桌面工作台，用于模组创作、资源查看、Content Patcher 项目编辑、模组管理与游戏启动。

当前主产品位于 `apps/desktop`：前端使用 React + TypeScript，桌面端能力由 Rust / Tauri 提供。

当前前端主结构已经收敛到 FSD + Clean Architecture：`components/`、`lib/`、`processes/` 不再作为源码根存在。剩余架构债务集中在平台边界：`app/providers/*`、`app/app-shell/AppShell.tsx`、`platform/desktop/index.ts`、`platform/desktop/index.test.ts` 是批准边界，launcher、workbench 和 `entities/event/model/stage/eventStageShared.ts` 中仍有需要继续收口的 `@platform/desktop` 直连。后续新增代码、查找入口、重构清理，都优先按下面的目标结构定位。

## 目录总览

```text
.
├─ apps/
│  └─ desktop/                         # 主桌面产品
│     ├─ src/                          # React / TypeScript 前端
│     │  ├─ app/                       # 应用装配、Provider、全局壳层、registry setup
│     │  │  ├─ app-shell/              # 全局 App Shell、设置窗口、应用级 chrome
│     │  │  └─ providers/              # DI Provider、事件总线、命令分发器
│     │  │  └─ webview-surfaces/       # 子 webview 承载的本地应用 surface
│     │  ├─ pages/                     # 页面骨架与 view 分发
│     │  │  ├─ launcher/               # 启动器页面入口
│     │  │  └─ workbench/              # 工作台页面入口与页面级 runtime
│     │  │     └─ workspaces/          # 各 workspace 的 UI、model、editors、entities
│     │  ├─ widgets/                   # 复用 smart container 与跨页面区块
│     │  │  ├─ top-navigation/         # 顶栏与菜单
│     │  │  └─ status-bar/             # 底部状态栏
│     │  ├─ features/                  # 业务能力与用户工作流
│     │  │  ├─ cp-maker/      # Content Patcher 草稿构建器与 Edit Mode UI
│     │  │  └─ launcher/               # 启动器功能 UI 与 feature-owned 行为
│     │  ├─ entities/                  # headless 领域模型、状态、selector、查询
│     │  │  ├─ event/
│     │  │  ├─ map/
│     │  │  └─ mod/
│     │  ├─ shared/                    # 合同、纯类型、UI 原语、纯工具
│     │  │  ├─ contracts/              # registry、events、commands、platform ports
│     │  │  ├─ ui/                     # 无业务归属的共享 UI 与通用弹窗
│     │  │  ├─ lib/                    # 纯工具函数
│     │  │  └─ workspace/              # 工作台布局纯模型与 layout view
│     │  ├─ platform/                  # 宿主 adapter 与插件注册
│     │  │  ├─ desktop/                # 前端可见的桌面能力 facade
│     │  │  ├─ plugins/                # 静态 workspace / editor 注册
│     │  │  └─ tauri/                  # platform ports 的 Tauri 实现
│     │  ├─ locales/                   # 类型化中英文文案
│     │  ├─ styles/                    # CSS 入口与分层样式系统
│     │  ├─ assets/                    # 静态资源
│     │  └─ test/                      # 架构测试、回归测试、共享测试辅助
│     └─ src-tauri/                    # Rust / Tauri 后端
│        ├─ src/
│        │  ├─ commands/               # Tauri command wrapper
│        │  ├─ domain/                 # 业务 / 领域逻辑
│        │  ├─ infrastructure/         # 格式解析、文件系统、webview 抽象等技术细节
│        │  ├─ support/                # 横向支撑代码
│        │  └─ tests/                  # Rust 模块 / 单元测试
│        └─ tests/                     # Rust 集成 / 回归测试
├─ docs/                              # 长期维护的架构与设计文档
├─ .cargo/                            # Cargo 环境配置与 Windows Tauri 测试兼容项
├─ AGENTS.md                          # 仓库约束与 Agent 工作规则
├─ package.json                       # 根脚本入口
└─ pnpm-workspace.yaml                # pnpm workspace 配置
```

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

## 功能索引

### App Shell

- App wrapper：`apps/desktop/src/app/App.tsx`
- 全局壳层：`apps/desktop/src/app/app-shell/`
- 子 webview surface：`apps/desktop/src/app/webview-surfaces/`
- Platform Provider：`apps/desktop/src/app/providers/PlatformProvider.tsx`
- 事件总线与命令分发：`apps/desktop/src/app/providers/`
- Approved platform bridge boundaries：`apps/desktop/src/app/providers/`、`apps/desktop/src/app/app-shell/AppShell.tsx`、`apps/desktop/src/platform/desktop/index.ts`、`apps/desktop/src/platform/desktop/index.test.ts`
- 静态 registry：`apps/desktop/src/app/registry-setup.ts`

### Launcher

- 页面入口：`apps/desktop/src/pages/launcher/LauncherPage.tsx`
- 页面级 UI：`apps/desktop/src/pages/launcher/ui/`
- Launcher shell：`apps/desktop/src/pages/launcher/ui/LauncherShell.tsx`
- Launcher shell 辅助 UI：`apps/desktop/src/pages/launcher/ui/`
- Launcher feature public API：`apps/desktop/src/features/launcher/index.ts`
- Launcher 可复用 feature UI：`apps/desktop/src/features/launcher/ui/`
- Launcher 运行时能力：`apps/desktop/src/features/launcher/model/`
- Launcher adapter/provider：`apps/desktop/src/app/providers/launcherPortAdapter.ts`
- 顶栏：`apps/desktop/src/widgets/top-navigation/ui/TopMenuBar.tsx`
- 状态栏：`apps/desktop/src/widgets/status-bar/ui/StatusBar.tsx`
- Launcher 样式：`apps/desktop/src/styles/features/launcher/`
- NexusMods 后端线路：`apps/desktop/src-tauri/src/domain/nexusmods/`，其中 GraphQL 在 `graphql/`，REST API 在 `rest_api/`，线路诊断与共享传输分别在 `diagnostics.rs`、`routes.rs`、`http.rs`

### Workbench

- 页面入口：`apps/desktop/src/pages/workbench/ui/WorkbenchPage.tsx`
- 工作台 runtime 组装：`apps/desktop/src/pages/workbench/model/`
- view host：`apps/desktop/src/pages/workbench/ui/WorkbenchViewHost.tsx`
- layout host：`apps/desktop/src/pages/workbench/ui/WorkbenchLayoutHost.tsx`
- workspace panels：`apps/desktop/src/pages/workbench/model/workspace-panels/` 与 `apps/desktop/src/pages/workbench/ui/workspace-panels/`
- workspace 目录：`apps/desktop/src/pages/workbench/workspaces/`
- 顶栏：`apps/desktop/src/widgets/top-navigation/`
- 状态栏：`apps/desktop/src/widgets/status-bar/`
- 工作台编排：`apps/desktop/src/app/providers/workbenchOrchestration.ts`
- 工作台样式：`apps/desktop/src/styles/workspace/`

### 领域工作区

- 地图领域：`apps/desktop/src/entities/map/`
- 事件领域：`apps/desktop/src/entities/event/`
- 事件工作区：`apps/desktop/src/pages/workbench/workspaces/event-stage/`
- 地图工作区：`apps/desktop/src/pages/workbench/workspaces/map/`
- 角色工作区：`apps/desktop/src/pages/workbench/workspaces/character/`
- 建筑工作区：`apps/desktop/src/pages/workbench/workspaces/building/`
- 物品工作区：`apps/desktop/src/pages/workbench/workspaces/item/`
- 模组工作区：`apps/desktop/src/pages/workbench/workspaces/mod/`
- 图像补丁编辑器：`apps/desktop/src/pages/workbench/workspaces/image-patch/`
- 模组领域：`apps/desktop/src/entities/mod/`
- 工作区编辑器：`apps/desktop/src/pages/workbench/workspaces/*/editors/`
- 工作区 panel 组装：`apps/desktop/src/pages/workbench/model/workspace-panels/` 与 `apps/desktop/src/pages/workbench/ui/workspace-panels/`

### Cp Maker Builder

- feature public API：`apps/desktop/src/features/cp-maker/index.ts`
- 状态与草稿生命周期：`apps/desktop/src/features/cp-maker/state/`
- 路由辅助：`apps/desktop/src/features/cp-maker/routing/`
- Studio Desk、Edit Workspace Content 与 Edit Mode UI：`apps/desktop/src/features/cp-maker/ui/`
- 模型辅助：`apps/desktop/src/features/cp-maker/model/`
- 后端生成项目领域：`apps/desktop/src-tauri/src/domain/cp_maker/`

### Desktop 与 Platform

- platform contracts：`apps/desktop/src/shared/contracts/platform.ts`
- Tauri adapter：`apps/desktop/src/platform/tauri/`
- Desktop facade：`apps/desktop/src/platform/desktop/`
- Approved desktop facade entrypoints：`apps/desktop/src/platform/desktop/index.ts`、`apps/desktop/src/platform/desktop/index.test.ts`
- 插件注册：`apps/desktop/src/platform/plugins/`
- App 注入入口：`apps/desktop/src/app/providers/`
- Rust command wrapper：`apps/desktop/src-tauri/src/commands/`
- Rust domain：`apps/desktop/src-tauri/src/domain/`
- Rust webview 基础设施：`apps/desktop/src-tauri/src/infrastructure/webview/`

### 文案与样式

- 文案 schema：`apps/desktop/src/locales/schema.ts`
- 英文文案：`apps/desktop/src/locales/en-US.ts`
- 中文文案：`apps/desktop/src/locales/zh-CN.ts`
- CSS 总入口：`apps/desktop/src/styles/index.css`
- 基础样式原语：`apps/desktop/src/styles/primitives/`
- 工作台样式：`apps/desktop/src/styles/workspace/`
- feature 样式：`apps/desktop/src/styles/features/`

### 测试

- 架构测试：`apps/desktop/src/test/architecture/`
- 回归测试：`apps/desktop/src/test/regressions/`
- 前端共享测试辅助：`apps/desktop/src/test/`
- Rust 模块测试：`apps/desktop/src-tauri/src/tests/`
- Rust 集成测试：`apps/desktop/src-tauri/tests/`

## 常见改动路径

- 改应用启动、模式恢复、全局设置、Provider：
  - `apps/desktop/src/app/app-shell/`
  - `apps/desktop/src/app/providers/`
  - `apps/desktop/src/app/webview-surfaces/`
  - `apps/desktop/src/app/App.tsx`
- 改 registry、view 分发、workspace 注册：
  - `apps/desktop/src/app/registry-setup.ts`
  - `apps/desktop/src/shared/contracts/registry.ts`
  - `apps/desktop/src/platform/plugins/`
- 改 Launcher UI：
  - `apps/desktop/src/pages/launcher/`
  - `apps/desktop/src/features/launcher/`
  - `apps/desktop/src/styles/features/launcher/`
- 改 NexusMods 请求、下载链接、线路诊断：
  - `apps/desktop/src-tauri/src/domain/nexusmods/graphql/`
  - `apps/desktop/src-tauri/src/domain/nexusmods/rest_api/`
  - `apps/desktop/src-tauri/src/domain/nexusmods/diagnostics.rs`
  - `apps/desktop/src-tauri/src/domain/nexusmods/http.rs`
- 改工作台布局或 panel：
  - `apps/desktop/src/pages/workbench/`
  - `apps/desktop/src/shared/workspace/`
  - `apps/desktop/src/shared/contracts/types/`
- 改 workspace editor 行为：
  - `apps/desktop/src/pages/workbench/workspaces/*/editors/`
  - `apps/desktop/src/pages/workbench/workspaces/*/entities/`
  - `apps/desktop/src/entities/<domain>/`
  - `apps/desktop/src/pages/workbench/model/workspace-panels/`
- 改 cp-maker 草稿、编辑、预览、导出：
  - `apps/desktop/src/features/cp-maker/`
  - `apps/desktop/src-tauri/src/domain/cp_maker/`
- 改平台、文件系统、桌面能力：
  - `apps/desktop/src/shared/contracts/platform.ts`
  - `apps/desktop/src/platform/tauri/`
  - `apps/desktop/src/platform/desktop/`
  - `apps/desktop/src-tauri/src/commands/`
  - `apps/desktop/src-tauri/src/domain/`
  - `apps/desktop/src-tauri/src/infrastructure/webview/`
- 改批准桥接边界：
  - `apps/desktop/src/app/providers/`
  - `apps/desktop/src/app/app-shell/AppShell.tsx`
  - `apps/desktop/src/platform/desktop/index.ts`
  - `apps/desktop/src/platform/desktop/index.test.ts`
- 改文案：
  - `apps/desktop/src/locales/schema.ts`
  - `apps/desktop/src/locales/en-US.ts`
  - `apps/desktop/src/locales/zh-CN.ts`

## 常用命令

从仓库根目录运行。

- `uv run pnpm dev`：启动前端开发服务器。
- `uv run pnpm desktop:dev`：启动完整 Tauri 桌面应用。
- `uv run pnpm lint`：前端 lint。
- `uv run pnpm build`：前端构建。
- `uv run pnpm --filter @modforge/desktop test`：前端测试。
- `uv run cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`：格式化 Rust 后端。
- `uv run cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`：Rust 检查。
- `uv run cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`：Rust 测试。

## 首次接手建议阅读顺序

1. `AGENTS.md`
2. `docs/frontend-architecture.md`
3. `apps/desktop/src/app/App.tsx`
4. `apps/desktop/src/app/app-shell/`
5. `apps/desktop/src/app/registry-setup.ts`
6. `apps/desktop/src/pages/launcher/LauncherPage.tsx`
7. `apps/desktop/src/pages/workbench/WorkbenchPage.tsx`
8. `apps/desktop/src/pages/workbench/model/workspace-panels/`
9. `apps/desktop/src/platform/tauri/`

## 维护规则

新增顶层目录、重要功能目录，或会改变开发者找代码路径的新入口时，同步更新本 README。README 应描述目标架构，不记录迁移期残留入口。
