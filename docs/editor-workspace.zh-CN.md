# ModForge Studio 编辑器工作区说明

## 当前界面结构

当前桌面端前端已经重构为固定式编辑器工作台，而不是网页式长页面。

主结构：

- 顶部：自绘标题栏、模块切换、主题切换、语言切换、窗口控制按钮
- 左侧：项目导航与地图资源浏览器
- 中央：主地图视口与视口工具栏
- 右侧：Inspector、图层、对象组、悬停探针、诊断
- 底部：状态栏

布局特征：

- 外层窗口无页面滚动
- 滚动只发生在左侧列表、右侧面板和局部内容区
- 左、中、右三栏支持拖拽调整宽度
- 顶部模块切换负责角色 / 建筑 / 物品 / 事件编辑器入口，因此不再保留左下角扩展位

## 当前视觉与交互方向

当前 UI 的目标不是网页 dashboard，而是更接近 Unity / Rider / VS Code 一类桌面创作工具。

已落实：

- 浅色 / 深色双主题
- `zh-CN / en-US` 双语文案
- 基于 CSS 变量的统一编辑器视觉 token
- 统一按钮、输入框、卡片、状态条、右键菜单、拖拽分栏样式
- Tauri 无边框窗口
- 自定义最小化 / 最大化 / 关闭按钮
- 顶部可拖动标题栏空白区

## 当前已实现能力

- 自动检测或手动选择 Stardew Valley 安装目录
- 验证游戏目录结构
- 扫描 `TMX / XNB` 地图资产
- 优先自动打开 `Town` 地图
- 主视口渲染 Tile Layer
- 主视口叠加渲染 TMX Object Group 边界与标签
- 图层显隐切换
- 对象组显隐切换
- 鼠标悬停查看 Tile 坐标、像素坐标、GID、Tileset、Tile 属性、命中对象
- 右键弹出自定义编辑器菜单
- 视口拖拽平移
- 工具栏 / 右键菜单 / 鼠标滚轮缩放
- `Fit` 与 `1:1` 视口比例切换

## 当前不再适用的旧描述

以下描述已经过时，不应继续作为实现方向：

- 底部大 Dock 作为角色 / 建筑 / 物品 / 事件的主入口
- 左下角扩展位
- `App.css` / `index.css` 作为主要样式入口
- 旧的单体 `i18n.ts` 文案结构

当前应以这些文件为准：

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/styles/globals.css`
- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/components/LeftDock.tsx`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/RightDock.tsx`
- `apps/desktop/src/components/StatusBar.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/editor-shell.ts`

## 后续适合继续实现的方向

### 1. 对象编辑

优先补齐：

- 点击选择对象
- 选中高亮
- Inspector 写回
- 数值编辑或控制柄

### 2. 专用模块编辑器

继续沿用顶部模块切换，不再新增底部模块入口：

- 角色编辑器
- 建筑编辑器
- 物品编辑器
- 事件图编辑器

### 3. 事件图

事件编辑器建议继续放在中央主工作区中，以图编辑器方式呈现，而不是回退成普通表单页。

### 4. XNB 路径

当前只支持扫描，不支持真正加载和解析。后续要么在 Tauri / Rust 内补，要么接回 `.NET bridge` 做解码。

## 开发与热载

Rider 中推荐直接运行根目录脚本：

- `desktop:dev`

行为：

- `apps/desktop/src` 下的 React / TS / CSS 改动走 Vite HMR
- `apps/desktop/src-tauri` 下的 Rust 改动会重编并重启桌面宿主
- `tauri.conf.json`、capability、依赖、Tailwind / PostCSS 配置改动通常需要手动重启
