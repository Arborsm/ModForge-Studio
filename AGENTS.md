# ModForge Studio — Agent Guide

> 本文档面向 AI 编码助手。如果你第一次接手这个仓库，请先通读本文件，再读 `README.md`，然后按需求进入对应模块。

## 项目概览

ModForge Studio 是一款面向《星露谷物语》（Stardew Valley）的桌面端模组创作与管理工作台。产品形态为 **Tauri v2** 桌面应用：前端使用 React 19 + TypeScript 6 + Vite 8 构建 UI，后端使用 Rust 处理游戏资源解析、文件系统操作、模组安装与启动等桌面级能力。

当前活跃的产品工作区只有一个：`apps/desktop`。仓库采用 pnpm workspace 管理，但现阶段没有独立的 `packages/*` 子包。

## 技术栈与运行时架构

### 前端

- **框架**: React 19（函数组件 + Hooks）
- **语言**: TypeScript 6（严格模式，`verbatimModuleSyntax` 开启）
- **构建工具**: Vite 8（`configLoader runner` 模式）
- **样式**: Tailwind CSS 4 + `@tailwindcss/postcss` + 自定义分层 CSS
- **测试**: Vitest 4 + jsdom + `@testing-library/react` + `@testing-library/jest-dom`
- **UI 库**: Radix UI（`@radix-ui/react-context-menu`）、Floating UI、`lucide-react`
- **虚拟列表**: `@tanstack/react-virtual`
- **流程图/节点编辑**: `@xyflow/react`
- **面板布局**: `react-resizable-panels`
- **桌面桥接**: `@tauri-apps/api` + `@tauri-apps/plugin-dialog`

### 后端

- **框架**: Tauri v2（Rust）
- **关键依赖**:
  - `serde` / `serde_json` — 序列化
  - `image`（PNG）— 图像处理
  - `reqwest` — HTTP 客户端（Nexus / 下载）
  - `zip` / `tar` / `sevenz-rust` / `unrar` — 压缩包处理
  - `lz4_flex` / `lzxd` / `flate2` — 压缩/解压算法
  - `sha2` / `uuid` / `regex` / `semver` / `url` — 通用工具
  - `winreg` — Windows 注册表读取（仅 Windows）

### 构建产物

- 前端静态资源输出到 `apps/desktop/dist`
- Tauri 在构建/开发时自动将 `dist` 作为 `frontendDist`
- Rust 编译产物在 `apps/desktop/src-tauri/target`

## 项目结构索引与关键配置文件

项目结构由 CodeGraph 托管。需要了解文件布局、符号位置、调用关系、影响范围或功能入口时，优先使用 CodeGraph MCP 工具和 `.codegraph/` 索引，不要依赖手写目录树。Codex 使用规则见 `.codex/skills/codegraph/SKILL.md`。

手写文档只保留稳定架构原则、少量关键入口、命令和约束；具体文件清单以 `codegraph_files`、`codegraph_context`、`codegraph_search` 等查询结果为准。

稳定入口仍是：`apps/desktop`（唯一活跃产品工作区）、`README.md`、`AGENTS.md`、`docs/**`、`.devDocs/**`、`.codex/skills/**`。其余结构细节用 CodeGraph 查询。

## 代码组织与模块划分

### 前端（`apps/desktop/src`）

前端采用 `FSD + Clean Architecture + 静态注册表 + Typed Event/Command + Platform DI`。新代码必须按以下目标层级落位：

- **`app/`** — 应用级装配层：全局 Provider、静态 registry 组装、平台 ports 注入、顶层入口。
- **`pages/`** — 页面层：launcher/workbench 页面骨架与 view 分发。页面不集中拉取所有业务数据。
- **`widgets/`** — smart container 层：组合 feature/entity hooks 与 shared UI，承担页面内复杂区块组装。
- **`features/`** — 独立业务能力：cp-maker、具体编辑能力、独立交互流程等。
- **`entities/`** — headless 领域层：map/event/character/building/item/mod 等领域模型、状态、selectors、queries。
- **`shared/contracts/`** — 跨层合同：registry、events、commands、platform ports。
- **`platform/tauri/`** — Tauri / 宿主 adapter 实现。

目标依赖方向：

```text
app -> pages -> widgets -> features -> entities -> shared/contracts
```

`platform` 是外部 adapter，由 `app/providers` 注入；业务层不直接依赖 Tauri。

#### 前端分层硬规则

- `shared/` 和 `shared/contracts/` 不允许 import `app`、`pages`、`widgets`、`features`、`entities`、`platform`。
- `entities/` 不允许 import `pages`、`widgets`、`features`，也不允许引用 panel/layout 类型。
- `features/` 不允许横向 import 其他 feature。跨特性联动必须发 typed event 或 command。
- `widgets/` 可以调用 `features/entities` 暴露的 hooks/selectors/commands，但不能定义领域数据结构，不能直接调用 Tauri/platform。
- `pages/` 只做页面骨架、view host、route/view 分发，不要把所有业务状态集中拉上来。
- `app/registry-setup.ts` 负责静态组合注册表；feature/widget 只能 export registration object，不能运行时自注册。
- registry 的接口和注册项类型必须放在 `shared/contracts/registry.ts`，实例组合不能放在 shared。
- typed events 放 `shared/contracts/events.ts`，typed commands 放 `shared/contracts/commands.ts`。
- 平台 ports 放 `shared/contracts/platform.ts`，Tauri 实现放 `platform/tauri/`，Provider 放 `app/providers/`。
- 业务层禁止直接 import `@tauri-apps/api`，禁止直接调用 `invoke(`。
- 新增或移动模块时，同步补架构测试，防止依赖方向回退。
- 禁止新增 `components/`、`lib/`、`processes/` 这类旧式兜底根目录，也禁止为旧 import 增加 re-export shim。
- 如果一次改动确实需要短期兼容层，必须在同一任务中记录删除条件，并优先在迁移完成时删除兼容层和对应的一次性验收测试。
- 架构测试应优先表达长期边界规则，例如依赖方向、禁止平台泄漏、禁止旧根目录被重新引用；不要长期保留只断言某个旧文件名不存在的一次性测试。
- **`locales/`** — 类型化文案。
  - `en-US.ts`、`zh-CN.ts`：实际文案。
  - `schema.ts`：文案类型结构。
  - `index.ts`：导出与类型守卫。
  - 所有 UI 文案必须通过这里消费，禁止在组件里硬编码用户可见字符串。
- **`styles/`** — 唯一样式入口是 `styles/index.css`。
  - `styles/primitives/`：基础变量、tokens、通用原语。
  - `styles/workspace/`：工作台、顶栏、布局相关样式。
  - `styles/features/`：launcher、editor 等功能样式。
  - `styles/workbench.css`：工作台专属样式（懒加载）。
- **`test/`**
  - `test/architecture/`：架构约束测试（如代码拆分、样式分层、vite 配置验证）。
  - `test/regressions/`：跨模块回归测试。
  - 组件/模块自身测试通常与源文件同目录，后缀为 `*.test.tsx`。

### 后端（`apps/desktop/src-tauri/src`）

- **`commands/`** — Tauri command wrapper。职责仅限于：解析参数、调用 domain、包装错误、返回结果。不允许在这里写业务逻辑。
- **`domain/`** — 领域逻辑，按业务边界组织：
  - `launcher/`：启动器设置、库扫描、下载、安装、备份恢复、Nexus 网络诊断。
  - `mods/` / `modding/`：模组项目管理与扫描。
  - `assets/`：游戏资产扫描与加载。
  - `content_patcher/`：Content Patcher 项目解析、模拟、导出。
  - `cp_maker/`：生成项目草稿/导出。
  - `saves/`：存档槽位扫描。
  - `event_project/` / `workbench_project/`：工作台项目领域逻辑。
  - `app_ui/`：应用 UI 状态持久化。
- **`infrastructure/`** — 技术实现细节：
  - `game_formats/xnb/`：XNB 格式解析。
  - `game_formats/xact/`：XACT 音频格式解析。
  - `fs/`：文件系统路径与底层工具。
  - `webview/`：Tauri webview/window 基础设施抽象；业务模块通过配置使用，不在这里写 launcher / Nexus 领域逻辑。
- **`support/`** — 横向支撑代码，如 logging。
- **`tests/`**（`src/tests/`）— 适合从实现文件中拆分出去的 Rust 模块/单元测试。优先使用 sibling `tests/*.rs` 而非在 `.rs` 文件里写大型 `#[cfg(test)] mod tests { ... }`。

## 构建、测试与开发命令

所有命令默认从仓库根目录运行。

### 前端

```bash
# 仅启动前端 Vite 开发服务器
pnpm dev

# 启动完整 Tauri 桌面应用（含 Rust 后端）
pnpm desktop:dev

# 构建前端生产包
pnpm build

# 前端 lint
pnpm lint

# 格式化前端、配置、文档等 Prettier 支持的文件
pnpm format

# 检查 Prettier 格式，不写入文件
pnpm format:check

# 运行前端 Vitest 测试套件
pnpm --filter @modforge/desktop test
```

### 后端（Rust）

```bash
# 格式化 Rust 后端
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml

# 校验 Rust 后端
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml

# 运行 Rust 回归测试
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

### 环境管理

- 使用 `uv` 进行包管理和命令运行（`uv run pnpm dev` 等）。
- 使用 `pnpm@10.30.3`（在 `packageManager` 字段锁定）。

## 代码风格与命名规范

- 遵循 `.editorconfig`：**UTF-8、LF、空格缩进、`indent_size = 2`**；`*.cs` 文件使用 4 空格。
- Prettier 是 TypeScript、TSX、CSS、JSON、Markdown 等受支持文件的标准格式化入口；使用 `pnpm format` 写入格式，使用 `pnpm format:check` 做只读检查。
- Tailwind class 顺序由 `prettier-plugin-tailwindcss` 处理，不要手动维护一套额外排序规则。
- `eslint-config-prettier` 已在 `apps/desktop/eslint.config.js` 末尾接入，ESLint 负责代码质量与 React Hooks 规则，格式化冲突交给 Prettier。
- `.husky/pre-commit` 通过 `lint-staged` 对暂存文件运行 `prettier --ignore-unknown --write`；不要把未暂存的大范围格式化误认为 hook 行为。
- Zed 的 Tailwind CSS IntelliSense 可使用本地 `.zed/settings.json` 配置；`.zed/` 已被忽略，项目共享配置仍以仓库内 Prettier、ESLint、PostCSS/Tailwind 配置为准。
- React 组件与窗口文件使用 **PascalCase**，如 `WorkspaceLayout.tsx`。
- Hooks 必须以 `use` 开头。
- 辅助模块与解析器使用语言约定的 camelCase（TS）或 snake_case（Rust）。
- 视图状态编排优先放 `src/pages`、`src/widgets` 或对应 `features/entities`；不要新增 `src/processes`、`src/lib/app` 之类 glue 层。
- 渲染层优先按职责放 `shared/ui`、`widgets/*`、`features/*/ui` 或页面私有 `pages/*/ui`；不要新增 `components/`。
- UI 文案通过类型化 locale bundles 与 locale hooks 消费；**禁止**在 React 层通过 `copy` / `locale` props 层层透传。
- 非 React 逻辑可以显式接收 locale 或 copy 参数。
- 公共 API 必须有简洁 JSDoc：包括 slice/entity 的 `index.ts` 对外导出、`features/*/api`、`entities/*/api`、`shared/lib/*` 的跨层工具、`shared/contracts/*` 的核心类型，以及会被多个模块复用的 hook / helper。注释说明“用途、边界、缓存或副作用”，不要写实现逐行复述。
- 新增或移动 API 时，同步补注释；如果删除旧 API，也删除过期注释，不保留兼容说明或迁移历史。
- 提交前端改动前必须运行 `pnpm format:check` 和 `pnpm lint`。

## 测试策略

### 前端

- 使用 **Vitest** + jsdom。
- 组件/模块测试与源码同目录（`*.test.tsx`）。
- 架构约束测试放在 `src/test/architecture/`（如代码拆分验证、vite 配置测试）。
- 前端架构改动必须补充或更新架构测试，覆盖：禁止业务层 import `@tauri-apps/api`、禁止业务层直接 `invoke(`、禁止 `features -> features`、禁止 `entities -> widgets/pages/features`、禁止 `shared -> app/pages/widgets/features/entities/platform`、禁止 `entities` 引用 panel/layout contracts。
- 跨模块回归测试放在 `src/test/regressions/`。
- 共享测试辅助放在 `src/test/`。
- **最低验证要求**：`pnpm format:check` → `pnpm lint` → `pnpm build` → `pnpm --filter @modforge/desktop test`。

### 后端（Rust）

- 测试以**回归风格**为主，例如 `character_data_regression.rs`、`xact_regression.rs`。
- 修改资产解码、解析或 fallback 行为时，必须补充或扩展回归测试。
- 共享测试辅助放在 `apps/desktop/src-tauri/tests/support/`。
- 功能专属的测试辅助仅在真正领域相关时才放在测试模块旁边。
- **优先提取重复测试 setup**，再追加新用例。
- **禁止**在 Tauri 源文件里新增大型内联 `#[cfg(test)] mod tests { ... }` 块；同样覆盖率应放到 sibling `tests/*.rs`。
- 提交 Rust 改动前先运行 `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`，再运行对应 `cargo check` / `cargo test`。

## 国际化与文案

- 支持语言：`en-US`、`zh-CN`。
- 文案文件：`apps/desktop/src/locales/en-US.ts`、`apps/desktop/src/locales/zh-CN.ts`。
- 类型结构：`apps/desktop/src/locales/schema.ts`。
- Locale Context：`apps/desktop/src/locales/localeContext.tsx`。
- 切换 locale 时，组件应清理缓存的本地化数据（如 `clearDesktopLocaleCache`、`clearLocalizedStageMetadataCache` 等）。

## 样式系统

- **唯一样式入口**：`apps/desktop/src/styles/index.css`。
- 分层组织：
  - `primitives/`：基础 token、CSS 变量、通用原语。
  - `workspace/`：工作台、顶栏、布局骨架。
  - `features/`：launcher、editor 等功能页面样式。
- 不要跨目录重复添加样式规则；修改视觉前先确认属于 `workspace` 还是 `features`。
- 工作台样式 `styles/workbench.css` 采用懒加载（`import('./styles/workbench.css')`），减少启动器模式的首屏负担。

## Vite 构建优化

`vite.config.ts` 中配置了 `manualChunks`，将以下代码拆分为独立 chunk：

- `react-vendor`：react + react-dom
- `tauri-vendor`：@tauri-apps 相关
- `ui-vendor`：lucide-react + @radix-ui
- `player-appearance`：PlayerAppearance 相关组件与逻辑
- `event-workspace`：EventWorkspace 相关组件与逻辑
- `map-workspace`：MapViewport 与地图相关逻辑

新增大型功能领域时，考虑是否需要在 `manualChunks` 中添加对应拆分规则，并通过 `test/architecture/viteConfig.test.ts` 等测试验证。

## 安全与桌面权限

- Tauri 配置了 `protocol-asset` 特性，资产协议 scope 为 `**`（开发便利）。
- 窗口无边框（`decorations: false`），由前端自行实现标题栏与窗口控制按钮（最小化、最大化、关闭）。
- Rust 侧负责游戏目录合法性校验（`validate_game_directory`）与路径安全处理。

## Commit 与 Pull Request 规范

- 使用 **Conventional Commits** 并带 scope，例如：
  - `feat(workspace): ...`
  - `refactor(ui): ...`
  - `fix(i18n): ...`
  - `chore(test): ...`
- subject 使用祈使句，并限定在修改区域内。
- PR 应描述用户可见影响，列出验证命令，UI/布局变更需附截图或短录屏。
- 如有相关 issue 或任务，请在 PR 中关联。

## 文档维护规则

- **只允许从以下位置读取文档**：`AGENTS.md`、`README.md`（仓库根）、`.devDocs/**`、`docs/**`。
- **只允许向以下位置写入文档**：`AGENTS.md`、`README.md`（仓库根）、`.devDocs/**`、`docs/**`。
- superpowers 生成的文档必须放在 `.devDocs/superpowers/`。
- **禁止**将 superpowers 生成的文档提交到 git。
- 项目结构由 CodeGraph 托管，README 不再维护完整文件清单。新增目录或移动代码时，优先确保 CodeGraph 索引可更新；只有稳定架构原则、公共入口、开发命令或长期文档位置发生变化时才同步 README。
- **禁止**让迁移/废弃代码存活超过 2 个版本；迁移完成当场删除旧代码、旧入口、兼容 shim，以及只服务迁移验收的旧架构测试。
- **禁止**堆叠兼容性技术债（“屎山”）；优先激进重构与清理，而非无限叠加向后兼容层。
