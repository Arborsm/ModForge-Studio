# ModForge Studio 安装器

Windows 自定义安装/卸载程序（`@modforge/installer`），Tauri 2 + React，无边框深色 UI，流程仿 BitFun 安装器：`语言选择 → 选项 → 进度 → 完成`，同一二进制兼作卸载程序。

## 常用命令

从本目录运行（依赖先在仓库根 `pnpm install`）：

```bash
pnpm run tauri:dev          # 开发模式（debug 构建允许占位 payload）
pnpm run installer:build    # 完整构建：先构建桌面端 exe，再打包安装器
pnpm run installer:build:only  # 跳过桌面端构建，复用已有 exe
```

产物：`src-tauri/target/release/modforge-installer.exe`。

## Payload 流程

1. `scripts/build-installer.cjs` 从 `apps/desktop/src-tauri/target/release/` 收集
   `modforge_studio_desktop.exe`、运行时同目录文件和 `gmcm-probe/`，连同 sha256
   `payload-manifest.json` 写入 `src-tauri/payload/`。
2. `src-tauri/build.rs` 在编译安装器时把 `payload/` 打成 zip 嵌入二进制
   （`EMBEDDED_PAYLOAD_AVAILABLE`）；exe 旁的 `payload/` / `payload.zip` 作为开发期回退。
3. 安装时先校验 payload（主程序存在且大小合理），解压后回滚失败的半成品安装。

## 卸载机制

安装阶段把安装器复制为 `<安装目录>\uninstall.exe`，注册表卸载命令为
`"<安装目录>\uninstall.exe" --uninstall "<安装目录>"`（二进制名为 `uninstall` 时也直接进入卸载模式）。
卸载会移除快捷方式、两个注册表项（HKCU/HKLM 均尝试）、`Run` 自启动项和全部 payload 文件，
最后调度 cmd 清理脚本在退出后删除 `uninstall.exe` 自身。不会删除
`%APPDATA%\ModForge Studio` 下的用户数据。

## 目录结构

```
src/            React 前端（pages/components/hooks/i18n/styles）
src-tauri/      Rust 安装逻辑（commands/extract/registry/shortcut）
scripts/        build-installer.cjs 等构建脚本
```
