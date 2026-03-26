# ModForge Studio 编辑器工作区说明

## 文档目的

这份文档只描述当前桌面端编辑器工作区的真实状态，用于统一对界面结构、交互模型和实现入口的理解。它不是理想设计稿，而是和当前代码同步的说明。

## 2026-03 当前版本概览

当前工作区已经从早期固定三栏布局，演进为接近 IDE 的工具窗口系统，核心特征如下：

- 顶部保留自绘标题栏、模块切换、主题、语言、设置与视图菜单
- 左右两侧是图标轨道，不再是固定写死的 Dock 面板
- 工具窗口支持停靠、收起、浮动、拖拽换位
- 底部信息区也纳入统一布局系统
- 中央区域使用文档型工作区，地图以标签页打开
- `World Atlas` 作为固定首个标签页，普通地图标签页可关闭与拖拽排序
- 当前活动文档路径显示在底部状态栏，而不是继续堆在顶栏

## 顶层布局

当前界面大致由五部分组成：

### 1. 顶部

负责：

- 品牌与标题栏拖拽区域
- 模块切换：`map / events / characters / buildings / items`
- 明暗主题切换
- `zh-CN / en-US` 语言切换
- 视图菜单
- 设置窗口入口
- 无边框窗口控制按钮

主要文件：

- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/lib/editor-shell.ts`

### 2. 左侧轨道

负责：

- 显示左侧面板图标
- 展开与收起左侧工具窗口
- 在拖拽时作为停靠目标

常见面板：

- 项目/目录面板
- 地图资源面板
- 事件文件面板

### 3. 中央工作区

负责：

- `World Atlas` 与地图文档标签页
- 地图视口
- 事件舞台
- 非地图模块的蓝图工作区

主要文件：

- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/components/EventStageWorkspace.tsx`

### 4. 右侧轨道

负责：

- Inspector
- 图层面板
- 对象组面板
- 事件目录
- 命令检查器
- 诊断面板

### 5. 底部区域与状态栏

负责：

- 时间线等底部信息面板
- 当前路径
- 工作区状态
- 地图悬停探针摘要

主要文件：

- `apps/desktop/src/components/StatusBar.tsx`
- `apps/desktop/src/components/panels/bottom/EventTimelinePanel.tsx`

## 工作区交互模型

### 文档标签页

中央区域使用文档式标签页，当前规则是：

- `World Atlas` 固定为第一个标签页
- 普通地图标签页可关闭
- 普通地图标签页支持拖拽排序
- 再次打开已打开地图时，不重复创建，而是直接聚焦现有标签页

这部分逻辑主要在：

- `apps/desktop/src/lib/app/useMapWorkspace.ts`
- `apps/desktop/src/lib/app/mapWorkspace.ts`

### 工具窗口

所有工具窗口都接入统一布局系统，支持：

- 停靠到 `left-top`
- 停靠到 `left-bottom`
- 停靠到 `right-top`
- 停靠到 `right-bottom`
- 停靠到 `bottom-left`
- 停靠到 `bottom-right`
- 停靠到 `center`
- 变成浮动窗口
- 从浮动窗口恢复回边栏
- 隐藏和重新显示

布局状态支持本地持久化，还支持命名预设。

主要文件：

- `apps/desktop/src/components/WorkspaceLayout.tsx`

### 视图菜单

视图菜单已经不只是简单开关，而是工作区管理入口，可用于：

- 切换面板显隐
- 重置布局
- 保存布局预设
- 加载布局预设
- 删除布局预设

## 当前已经实现的工作区体验

### 地图模式

在 `map` 模式下，当前体验是：

- 左侧查看项目与地图资源
- 中央先进入 `World Atlas`
- 可从 Atlas 跳到具体地图
- 具体地图以标签页打开
- 右侧查看图层、对象组与检查信息
- 底部状态栏展示当前路径和悬停信息

### 事件模式

在 `events` 模式下，当前体验是：

- 左侧浏览事件文件
- 中央查看事件舞台
- 右侧查看事件目录和命令检查器
- 底部查看事件时间线
- 可打开玩家外观窗口，为舞台中的 `player / farmer` 提供配置

### 其他模式

`characters / buildings / items` 目前主要是蓝图占位区，目的是先保留模块切换结构和后续扩展入口，并没有进入完整编辑器阶段。

## 当前实现重点

### 1. 工作区布局引擎

实现入口：

- `apps/desktop/src/components/WorkspaceLayout.tsx`

已实现能力：

- 左右图标轨道
- 面板停靠与浮窗
- 拖拽停靠引导
- 侧边与底部尺寸调整
- 浮窗拖拽与缩放
- 面板显隐状态
- 预设持久化

### 2. 面板装配层

实现入口：

- `apps/desktop/src/lib/app/workspacePanels.tsx`

职责：

- 按当前模块生成面板配置
- 为不同模式装配不同内容
- 把地图工作区、事件工作区和布局系统连接起来

### 3. 中央内容切换

实现入口：

- `apps/desktop/src/components/CentralWorkspace.tsx`

职责：

- 决定当前显示地图视口、事件舞台还是蓝图工作区
- 管理文档标签页的呈现
- 提供中央主区域的顶部工具条

## 已经过时的说法

下面这些说法已经不适用于当前项目：

- “当前界面仍是固定三栏布局”
- “左侧入口是 `LeftDock.tsx`，右侧入口是 `RightDock.tsx`”
- “中央区域始终只有单一地图视口”
- “悬停探针是独立右侧面板”

虽然 `LeftDock.tsx` 和 `RightDock.tsx` 还在仓库里，但当前主路径已经切换到新的面板与工作区系统，真实入口应以这些文件为准：

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/WorkspaceLayout.tsx`
- `apps/desktop/src/lib/app/workspacePanels.tsx`
- `apps/desktop/src/components/LeftPanels.tsx`
- `apps/desktop/src/components/RightPanels.tsx`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/StatusBar.tsx`

## 开发与热更新

推荐从仓库根目录运行：

```bash
npm run desktop:dev
```

当前行为：

- `apps/desktop/src` 下的 React / TypeScript / CSS 改动会走 Vite HMR
- `apps/desktop/src-tauri` 下的 Rust 改动会重编译并重启桌面宿主
- `tauri.conf.json`、capabilities、Tailwind/PostCSS 配置或依赖变更通常需要手动重启

## 结论

当前工作区已经是项目里最成熟的一部分。后续新增功能时，应优先复用现有布局系统和面板装配层，而不是再回到固定式的左右栏思路。真正要继续推进的方向，是让这些面板承载更强的编辑能力，而不是继续重复造新的外壳。
