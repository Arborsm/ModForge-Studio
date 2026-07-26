# ModForge Studio 安装器

Windows 自定义安装/卸载程序（`@modforge/installer`），Tauri 2 + React，无边框 UI（深/浅双色，默认跟随系统，标题栏可切换），流程仿 BitFun 安装器：`语言选择 → 选项 → 软件偏好 → 进度 → 完成`，同一二进制兼作卸载程序。

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
最后调度 cmd 清理脚本在退出后删除 `uninstall.exe` 自身。卸载页提供
「同时删除用户数据」复选框（默认不勾选）；勾选时在删除文件后额外删除
`%APPDATA%\ModForge Studio`（设置、工作区状态、缓存、日志），不触碰 mods、游戏目录与用户文档，
删除过程记录到 `%TEMP%\modforge-uninstall-runtime.log`。

## 主题与默认行为

- 主题 token 对齐桌面端 `neutral-tool`（`apps/desktop/src/styles/tokens.css`），`:root` 深色兜底 + `:root.light` 浅色覆盖；`src/theme/useInstallerTheme.ts` 默认跟随 `prefers-color-scheme`，标题栏日/夜切换会固定选择并持久化到 localStorage（`modforge.installer.theme-preference`）。
- 选项页默认行为：安装路径、桌面快捷方式（默认开）、开始菜单（默认开）、开机自启（默认关，写 HKCU `Run` 值）。
- 完成页「立即启动 ModForge Studio」复选框默认勾选；点击「完成」时若勾选则启动已安装主程序再退出安装器。

## 软件偏好页（Options 之后、Progress 之前）

为**主程序**预选配置（卸载模式不出现），离开该页时由 Rust 命令 `persist_app_preferences`
以读-改-写方式合并进 `%APPDATA%\ModForge Studio\app\ui-state.json`（只覆盖下列字段，保留文件其余内容）：

- `appearance.themeId`：8 套配色主题（色板选择器，默认 neutral-tool）。
- `appearance.loadingMotion.styleId`：5 种加载动效（默认 softFadeIn，其余字段由主程序 serde 默认补齐）。
- `shell.windowCloseBehavior`：quit（默认）/minimizeToTray；仅当用户主动改过该单选时才同时写 `shell.rememberCloseChoice: true`（主程序首次关闭不再弹询问）。
- `shell.notificationSoundEnabled`：通知音效（默认开）。
- `shell.appMode`：launcher（默认）/workbench。

各字段默认值与主程序 serde 默认一致，不改动直接下一步写出的配置与现状相同。主程序明暗模式运行时跟随系统，不在预写范围。

## 目录结构

```
src/            React 前端（pages/components/hooks/theme/data/i18n/styles）
src-tauri/      Rust 安装逻辑（commands/extract/registry/shortcut）
scripts/        build-installer.cjs 等构建脚本
```
