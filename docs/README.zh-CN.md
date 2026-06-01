# ModForge Studio

> [English README](../README.md)

ModForge Studio 是面向《星露谷物语》（Stardew Valley）的桌面端模组创作与管理工作台。

它把模组库管理、游戏资源查看、Content Patcher 项目创作和桌面启动流程放在同一个
Tauri 应用中。当前主要产品工作区是 `apps/desktop`。

## 功能概览

- 管理 Stardew Valley 游戏目录、启动器设置、模组库和安装流程。
- 查看游戏资源、地图、事件、角色、物品、建筑、存档和模组项目数据。
- 使用结构化编辑器创建 Content Patcher 草稿、事件项目和工作台项目。
- 诊断 Nexus Mods 连接，并支持面向下载流程的模组管理能力。
- 构建 Linux、macOS 和 Windows 桌面发布包。

## 技术栈

- 桌面外壳：Tauri v2 + Rust 后端。
- 前端：React 19、TypeScript 6、Vite 8、Tailwind CSS 4。
- UI/运行时库：Radix UI、Floating UI、lucide-react、React Resizable Panels、
  TanStack Virtual、XYFlow、Zustand。
- 测试：Vitest、jsdom、Testing Library、Playwright 验证脚本。
- 包管理器：pnpm 10.30.3。

## 快速开始

```bash
pnpm install --frozen-lockfile
pnpm dev
```

运行完整 Tauri 桌面应用：

```bash
pnpm desktop:dev
```

常用检查：

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm --filter @modforge/desktop test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 当前状态

ModForge Studio 仍处于早期活跃开发阶段。仓库采用 pnpm workspace 管理，但当前只有
`apps/desktop` 是活跃产品工作区。

Linux 构建目前使用 Tauri 的实验性 CEF 路径。发布自动化已经接入，但平台签名和分发凭证需要由
CI 或本地发布环境提供。

## 文档入口

- [前端架构](frontend-architecture.md) - 分层边界和依赖规则。
- [维护指南](maintenance.md) - 开发命令、发布、CI、签名和仓库清理说明。
- [Nexus Mods GraphQL 快照](nexusmods-graphql/SUMMARY.md) - 生成的 API 参考快照。

## 许可证

ModForge Studio 使用 [GPL-3.0-or-later](../LICENSE) 许可证。
