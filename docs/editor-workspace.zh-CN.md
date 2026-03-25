# ModForge Studio 编辑器工作区说明

## 2026-03 Workspace Update

- 中央工作区改为真实文档选项卡，不再使用单个伪标签头。
- `World Atlas` 固定在第一个选项卡，不能关闭。
- 从资源浏览器或世界地图入口打开地图时，会新增或聚焦到对应地图选项卡。
- 普通地图选项卡支持关闭和拖拽排序。
- 当前文档路径从顶部条移到底部状态栏显示。

## 当前界面结构

当前桌面端已经不是固定三栏编辑器，而是更接近 IDE 工具窗口的工作区。

主要结构：

- 顶部：自绘标题栏、模块切换、主题切换、语言切换、窗口控制
- 左侧：工具窗口图标栏，承载 `项目导航`、`资源浏览器` 以及左侧底部分组入口
- 中央：主地图视口与主工作区
- 右侧：工具窗口图标栏，承载 `Inspector`、`图层`、`对象组` 以及右侧底部分组入口
- 底部：可停靠的信息型窗口区域，例如 `诊断`
- 底栏：状态栏与悬停探针摘要

工作区特征：

- 左右侧是 IDE 风格工具窗口栏，不是固定栏位
- 图标支持展开、收起、右键菜单、浮动窗口化
- 面板支持停靠到 `left-top`、`left-bottom`、`right-top`、`right-bottom`、`bottom-left`、`bottom-right`、`center`
- 停靠布局与窗口位置支持本地持久化
- 工具窗口图标支持拖拽，并显示目标落位示意
- 中央视图窗口栏已隐藏，主视图更像纯画布
- 停靠在侧边和底部的信息面板默认隐藏标题栏

## 当前交互模型

当前 UI 目标不是网页式 dashboard，而是接近 Rider / IntelliJ / VS Code 一类的桌面创作工具。

已落地：

- 浅色 / 深色双主题
- `zh-CN / en-US` 双语文案
- Tauri 无边框窗口与自定义最小化 / 最大化 / 关闭按钮
- 顶部标题栏空白区域可拖动窗口
- 视图菜单可控制工作区窗口显隐、重置布局、保存 / 加载预设
- 悬停探针已移入底栏，不再作为独立侧栏面板
- 主视图、信息面板、列表面板已经按不同密度分别布局

## 当前已实现能力

- 自动检测或手动选择 Stardew Valley 安装目录
- 验证游戏目录结构
- 扫描 `TMX / XNB` 地图资产
- 优先自动打开世界地图视图
- 主视口渲染 `Tile Layer`
- 主视口叠加渲染 `TMX Object Group` 边界、标签、Warp 路径
- 通过世界图视图查看主世界与远程区域
- 图层显隐切换
- 对象组显隐切换
- 右侧对象预览点击后在画布中高亮并定位对象
- 鼠标悬停查看 Tile 坐标、像素坐标、GID、Tileset、命中对象摘要
- 右键弹出自定义编辑器菜单
- 视口拖拽平移
- 工具栏 / 右键菜单 / 鼠标滚轮缩放
- `Fit` 与 `1:1` 视口比例切换

## 当前布局实现重点

### 1. 工具窗口系统

由以下文件负责：

- `apps/desktop/src/components/WorkspaceLayout.tsx`
- `apps/desktop/src/styles/globals.css`

当前逻辑：

- 左右两侧是图标工具栏
- 同一停靠槽位只展开一个窗口
- 停靠窗口和浮窗共享同一套布局状态
- 停靠窗口支持右键切换停靠目标
- 图标拖拽会出现左右上下与底部左右的目标区域示意

### 2. 面板拆分

左侧面板：

- `apps/desktop/src/components/LeftPanels.tsx`

右侧面板：

- `apps/desktop/src/components/RightPanels.tsx`

中央工作区：

- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/MapViewport.tsx`

### 3. 当前信息面板优化

信息型面板已做过一轮紧凑化：

- `项目导航`
- `Inspector`
- `诊断`

优化方向：

- 更低默认高度
- 更高信息密度
- 更短的统计卡片
- 更紧凑的键值行

## 已过时描述

以下描述已经不再适用：

- 固定左中右三栏布局
- `LeftDock.tsx / RightDock.tsx` 作为当前主要布局入口
- 独立的悬停探针侧栏窗口
- 主视图始终带完整窗口栏

当前应以这些文件为准：

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/styles/globals.css`
- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/components/LeftPanels.tsx`
- `apps/desktop/src/components/RightPanels.tsx`
- `apps/desktop/src/components/WorkspaceLayout.tsx`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/StatusBar.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/editor-shell.ts`

## 开发与热重载

推荐从仓库根目录运行：

- `npm run desktop:dev`

行为：

- `apps/desktop/src` 下的 React / TS / CSS 改动走 Vite HMR
- `apps/desktop/src-tauri` 下的 Rust 改动会重编译并重启桌面宿主
- `tauri.conf.json`、capabilities、依赖、Tailwind/PostCSS 配置变更通常需要手动重启
