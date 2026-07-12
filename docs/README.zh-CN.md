# ModForge Studio

> [English README](../README.md)

ModForge Studio 是面向《星露谷物语》（Stardew Valley）的桌面端模组创作与管理工作台。

它把模组库管理、游戏资源查看、Content Patcher 项目创作和桌面启动流程放在同一个
桌面应用中。当前主要产品工作区是 `apps/desktop`。

## 功能概览

- 管理 Stardew Valley 游戏目录、启动器设置、模组库和安装流程。
- 查看游戏资源、地图、事件、角色、物品、建筑、存档和模组项目数据。
- 使用结构化编辑器创建 Content Patcher 草稿、事件项目和工作台项目。
- 诊断 Nexus Mods 连接，并支持面向下载流程的模组管理能力。
- 构建 Linux、macOS 和 Windows 桌面发布包。

## 技术栈

- 桌面外壳：Linux 使用 Electron；macOS 和 Windows 继续使用 Tauri v2；桌面能力仍由 Rust 后端提供。
- 前端：React 19、TypeScript 6、Vite+ / Vite 8、Tailwind CSS 4。
- UI/运行时库：Radix UI、Floating UI、lucide-react、React Resizable Panels、
  TanStack Virtual、XYFlow、Zustand。
- 测试：Vite+ Test、jsdom、Testing Library、Playwright 验证脚本。
- 包管理工作流：Vite+ 命令封装 pnpm 11.5.1，并保留 `pnpm-lock.yaml`。

## 快速开始

```bash
vp install --frozen-lockfile
vp run dev
```

`vp run dev` 默认运行完整桌面应用。只启动前端 Vite+ dev server 时使用：

```bash
vp run web:dev
```

常用检查：

```bash
vp run format:check
vp run lint
vp run build
vp run --filter @modforge/desktop test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 当前状态

ModForge Studio 仍处于早期活跃开发阶段。仓库以 Vite+ 作为主要开发入口，并使用
pnpm 支撑 workspace 与锁文件；当前只有 `apps/desktop` 是活跃产品工作区。

Linux 构建使用 Electron 包。发布自动化已经接入，但平台签名和分发凭证需要由 CI 或本地发布环境提供。

## 文档入口

- [前端架构](frontend-architecture.md) - 分层边界和依赖规则。
- [产品设计](DESIGN.md) - 产品形态、视觉语言与设计目标。
- [页面设计规范](design/page-design-spec.md) - 工作区视觉规则与工作台壳 / 主页 IA。
- [工作台壳迁移计划](design/workbench-shell-migration.md) - 将 shell mock 落到现产品的分阶段计划。
- [维护指南](maintenance.md) - 开发命令、发布、CI、签名和仓库清理说明。
- [Nexus Mods GraphQL 快照](nexusmods-graphql/SUMMARY.md) - 生成的 API 参考快照。

## 许可证

ModForge Studio 使用 [GPL-3.0-or-later](../LICENSE) 许可证。
