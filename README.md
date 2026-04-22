# ModForge Studio

项目代码入口比较分散，先看这份结构地图，避免每次都重新找目录。

## Quick Map

```text
.
├─ apps/
│  └─ desktop/                     # 当前主产品，桌面端前后端都在这里
│     ├─ src/                      # React / TypeScript 前端
│     │  ├─ components/            # UI 组件、页面、窗口
│     │  ├─ lib/                   # 领域逻辑、状态、桌面桥接、hooks
│     │  ├─ locales/               # 中英文文案与类型化文案结构
│     │  ├─ styles/                # 全局样式入口与分层样式系统
│     │  ├─ assets/                # 静态资源
│     │  └─ test/                  # 前端共享测试、架构测试、回归测试
│     └─ src-tauri/                # Tauri / Rust 后端
│        ├─ src/                   # Rust 源码
│        └─ tests/                 # Rust 集成/回归测试与共享 support
├─ AGENTS.md                       # 仓库约束、结构规范、命令约定
├─ package.json                    # 根脚本入口
├─ pnpm-workspace.yaml             # pnpm workspace 包范围定义
└─ ModForge.Studio.slnx            # 解决方案入口
```

## Frontend Structure

`apps/desktop/src` 是日常最常看的目录。

- `App.tsx`: 应用总入口，负责 app mode、workspace mode、launcher shell、顶栏和全局窗口协调。
- `components/`: 纯渲染层和窗口层。
  - `components/launcher/`: 启动器模式页面、卡片、浮层、共享块。
  - `components/ui/`: 通用 UI 组件。
  - `components/WorkspaceLayout*`: 工作台布局骨架。
- `lib/`: 逻辑层。
  - `lib/app/`: app shell、workspace orchestration、locale context、共享状态。
  - `lib/launcher/`: 启动器数据流、设置、下载、库管理、运行时逻辑。
  - `lib/desktop.ts`: 前端到桌面宿主/Tauri 的桥接调用入口。
- `locales/`: `en-US.ts`、`zh-CN.ts` 和 schema，所有 UI 文案优先从这里走。
- `styles/`: 只有 `styles/index.css` 是样式入口。
  - `styles/primitives/`: 基础变量、tokens、通用原语。
  - `styles/workspace/`: 工作台、顶栏、布局相关样式。
  - `styles/features/`: launcher、editor 等功能样式。
- `test/`:
  - `test/architecture/`: 架构约束测试。
  - `test/regressions/`: 跨模块回归测试。
  - 组件旁边的 `*.test.tsx`: 组件/模块就近测试。

## Backend Structure

`apps/desktop/src-tauri` 是桌面后端。

- `src/main.rs`: Tauri 程序入口。
- `src/lib.rs`: Rust 侧总装配入口，负责挂接分层模块与 Tauri handler。
- `src/commands/`: Tauri command wrapper，仅处理命令入口、参数接线与错误包装。
- `src/domain/`: 领域逻辑，按业务边界组织，如 launcher、content_patcher、mods、assets、saves、app_ui。
- `src/infrastructure/`: 技术实现细节，如游戏格式解析、文件系统路径与底层工具。
- `src/support/`: 横向支撑代码，如 logging。
- `src/tests/`: 适合拆分出去的 Rust 单元/模块测试。
- `tests/`: Rust 集成测试、回归测试。
- `tests/support/`: Rust 单元测试与集成测试共用的辅助模块。

## Where To Edit

- 做界面和交互：先看 `apps/desktop/src/components` 和 `apps/desktop/src/styles/features`。
- 改页面状态流转：先看 `apps/desktop/src/lib/app` 或 `apps/desktop/src/lib/launcher`。
- 改桌面命令或文件系统行为：先看 `apps/desktop/src/lib/desktop.ts`，再看 `apps/desktop/src-tauri/src`。
- 改文案：看 `apps/desktop/src/locales/en-US.ts` 和 `apps/desktop/src/locales/zh-CN.ts`。
- 找测试：
  - 组件自身测试通常和文件放在一起。
  - 全局/回归测试在 `apps/desktop/src/test`。
  - Rust 回归测试在 `apps/desktop/src-tauri/tests`。

## Feature Index

按需求找代码时，优先从这里进，不要全仓库盲搜。

### Launcher

- Launcher 总入口：`apps/desktop/src/components/launcher/LauncherShell.tsx`
- Launcher 页面：
  - `apps/desktop/src/components/launcher/pages/LauncherLibraryPage.tsx`
  - `apps/desktop/src/components/launcher/pages/LauncherDiscoverPage.tsx`
  - `apps/desktop/src/components/launcher/pages/LauncherUpdatesPage.tsx`
  - `apps/desktop/src/components/launcher/pages/LauncherSettingsPage.tsx`
- Launcher 卡片/浮层：
  - `apps/desktop/src/components/launcher/cards/`
  - `apps/desktop/src/components/launcher/shared/`
- Launcher 状态和数据：
  - `apps/desktop/src/lib/launcher/useLauncherRuntime.ts`
  - `apps/desktop/src/lib/launcher/useLauncherLibrary.ts`
  - `apps/desktop/src/lib/launcher/useLauncherDownloads.ts`
  - `apps/desktop/src/lib/launcher/useLauncherSettings.ts`
- Launcher 样式：`apps/desktop/src/styles/features/launcher/`

### Workbench

- 顶层布局：`apps/desktop/src/components/WorkspaceLayout.tsx`
- 顶栏：`apps/desktop/src/components/TopMenuBar.tsx`
- workspace panel 装配：`apps/desktop/src/lib/app/workspacePanels.tsx`
- app shell 状态：`apps/desktop/src/lib/app/appShell.ts`
- 通用 orchestration：`apps/desktop/src/lib/app/`
- 工作台样式：`apps/desktop/src/styles/workspace/`

### Module Workspaces

- Map: `apps/desktop/src/lib/app/useMapWorkspace.ts`
- Events: `apps/desktop/src/lib/app/useEventWorkspace.ts`
- Characters: `apps/desktop/src/lib/app/useCharacterWorkspace.ts`
- Buildings: `apps/desktop/src/lib/app/useBuildingWorkspace.ts`
- Items: `apps/desktop/src/lib/app/useItemWorkspace.ts`
- Mods: `apps/desktop/src/lib/app/useModWorkspace.ts`

对应的渲染组件通常在 `apps/desktop/src/components/` 下按功能拆分，先从 workspace hook 找状态入口，再顺着组件引用看 UI。

### Generated Project Builder

- 核心重构设计文档：`docs/project-mods-core-driven-refactor.md`（改 Project 模式前必读）
- 重构实施指南：`docs/project-mods-core-driven-refactor-milestones.md`（按 Milestone 执行时对照）
- 全工作台编辑模式总设：`docs/cryptic-churning-journal.md`
- 核心编辑层（ChangeRegistry、CP 生成器、诊断）：`apps/desktop/src/lib/app/editing/`
- 编辑会话与草稿生命周期：`apps/desktop/src/lib/app/editing/useEditProject.ts`、`useGeneratedProjectWorkspace.ts`
- 面板组件（Browser/Editor/Preview/Export/Drafts/ModHub）：`apps/desktop/src/components/project/`
- 面板装配器：`apps/desktop/src/lib/app/workspacePanels/project/buildGeneratedProjectPanels.tsx`
- 生成项目草稿/导出后端：`apps/desktop/src-tauri/src/domain/generated_project/`
- 生成项目桌面桥接入口：`apps/desktop/src/lib/desktop.ts`

如果要改 generated-project 预览或导出，不要从 `useModWorkspace.ts` 盲跳开始，先看 `docs/project-mods-core-driven-refactor.md` 了解当前架构目标，再进 `lib/app/editing/` 看 draft、preview、export helper，最后进 `components/project/` 看 UI 组合。

### Desktop Bridge

- 前端桥接入口：`apps/desktop/src/lib/desktop.ts`
- Rust Tauri 入口：`apps/desktop/src-tauri/src/main.rs`
- Rust command wrappers：`apps/desktop/src-tauri/src/commands/`
- Rust domain 逻辑：
  - `apps/desktop/src-tauri/src/domain/launcher/`
  - `apps/desktop/src-tauri/src/domain/content_patcher/`
  - `apps/desktop/src-tauri/src/domain/mods/`
  - `apps/desktop/src-tauri/src/domain/assets/`
- Rust infrastructure：
  - `apps/desktop/src-tauri/src/infrastructure/game_formats/`
  - `apps/desktop/src-tauri/src/infrastructure/fs/`
- Rust support：`apps/desktop/src-tauri/src/support/`
- Rust test support：`apps/desktop/src-tauri/tests/support/`

### Copy And Locales

- 英文文案：`apps/desktop/src/locales/en-US.ts`
- 中文文案：`apps/desktop/src/locales/zh-CN.ts`
- 文案类型结构：`apps/desktop/src/locales/schema.ts`
- locale context：`apps/desktop/src/lib/app/localeContext.tsx`

### Styles

- 总入口：`apps/desktop/src/styles/index.css`
- primitives：基础 token、变量、原语
- workspace：工作台与公共布局
- features：按功能页面拆分

如果要改视觉，先确认样式是在 `workspace` 还是 `features`，不要两个目录来回加重复规则。

### Tests

- 组件就近测试：和组件文件同目录的 `*.test.tsx`
- 前端架构测试：`apps/desktop/src/test/architecture/`
- 前端回归测试：`apps/desktop/src/test/regressions/`
- Rust 测试共享 support：`apps/desktop/src-tauri/tests/support/`
- Rust 模块/单元测试：`apps/desktop/src-tauri/src/tests/`
- Rust 集成/回归测试：`apps/desktop/src-tauri/tests/`

## Common Change Paths

下面这些是高频改动的最短路径。

- 改 launcher 顶栏、下载、模式切换：
  - `apps/desktop/src/components/TopMenuBar.tsx`
  - `apps/desktop/src/components/launcher/LauncherShell.tsx`
  - `apps/desktop/src/styles/workspace/top-menu.css`
  - `apps/desktop/src/styles/features/launcher/`
- 改 launcher library 卡片、详情、筛选、模组包：
  - `apps/desktop/src/components/launcher/pages/LauncherLibraryPage.tsx`
  - `apps/desktop/src/components/launcher/cards/LauncherModCard.tsx`
  - `apps/desktop/src/components/launcher/cards/LauncherModDetailPanel.tsx`
  - `apps/desktop/src/lib/launcher/useLauncherLibrary.ts`
- 改 launcher 设置自动检测、目录读写：
  - `apps/desktop/src/lib/launcher/useLauncherSettings.ts`
  - `apps/desktop/src/lib/launcher/useLauncherRuntime.ts`
  - `apps/desktop/src/lib/desktop.ts`
  - `apps/desktop/src-tauri/src/commands/launcher.rs`
  - `apps/desktop/src-tauri/src/domain/launcher/`
- 改 app mode、默认进入页、壳层状态：
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/lib/app/appShell.ts`
- 改桌面命令或文件系统行为：
  - `apps/desktop/src/lib/desktop.ts`
  - `apps/desktop/src-tauri/src/commands/`
  - `apps/desktop/src-tauri/src/domain/`
  - `apps/desktop/src-tauri/src/infrastructure/`
- 改 generated-project 预览、导出、草稿同步：
  - `docs/project-mods-core-driven-refactor.md`（先读设计文档）
  - `apps/desktop/src/lib/app/editing/`
  - `apps/desktop/src/components/workbench-project/`
  - `apps/desktop/src/lib/desktop.ts`
  - `apps/desktop/src-tauri/src/domain/generated_project/`
- 改文案：
  - `apps/desktop/src/locales/en-US.ts`
  - `apps/desktop/src/locales/zh-CN.ts`

## Maintenance Rule

如果你新增了：

- 新的顶层目录
- 新的重要功能目录
- 会改变开发者“该去哪里找代码”的新文件或文件夹

就同步更新这份 `README.md` 的 `Quick Map`、`Feature Index` 或 `Common Change Paths`，不要让结构文档过期。

## Common Commands

从仓库根目录运行。

- `uv run pnpm dev`: 仅前端开发。
- `uv run pnpm desktop:dev`: 启动完整桌面应用。
- `uv run pnpm lint`: 前端 lint。
- `uv run pnpm --filter @modforge/desktop test`: 前端测试。
- `uv run pnpm build`: 前端构建。
- `uv run pnpm -r list --depth -1`: 检查 pnpm workspace 是否正确识别根包和各子包。
- `uv run cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`: Rust 检查。
- `uv run cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`: Rust 测试。

## First Files To Read

如果是第一次接手这个仓库，建议按这个顺序看：

1. `AGENTS.md`
2. `README.md`
3. `apps/desktop/src/App.tsx`
4. `apps/desktop/src/components/TopMenuBar.tsx`
5. `apps/desktop/src/components/launcher/LauncherShell.tsx`
6. `apps/desktop/src/lib/app/`
7. `apps/desktop/src/lib/launcher/`
