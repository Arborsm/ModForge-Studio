# ModForge Studio Desktop

`@modforge/desktop` 是 ModForge Studio 当前的主应用，定位为《星露谷物语》内容创作工具的桌面端编辑器原型。

## 技术栈

- `React 19`
- `TypeScript`
- `Vite`
- `Tailwind CSS 4`
- `react-resizable-panels`
- `Radix Context Menu`
- `Tauri 2`

## 当前能力

### 地图工作区

- 自动探测或手动选择游戏目录
- 校验 `Stardew Valley` 目录结构
- 扫描 `TMX / XNB` 地图资源摘要
- 实际加载 `TMX` 到内部 `MapDocument`
- 构建 `World Atlas` 视图，并拆分主世界 / 远程区域
- 地图作为可关闭、可拖拽排序的文档标签页打开
- 渲染 Tile Layer
- 渲染 `TMX Object Group` 边界、标签与 Warp 路径
- 查看悬停 tile 与对象命中信息
- 图层显隐与对象组显隐切换
- 从对象面板定位对象
- 右键视口上下文菜单
- 拖拽平移、滚轮缩放、`Fit`、`1:1`

### 事件工作区

- 扫描 `Content (unpacked)\Data\Events` 下的事件文件
- 读取基础事件文件和本地化事件文件
- 解析事件脚本、场景初始化和命令序列
- 展示事件文件列表、事件目录、命令检查器和时间线
- 在中央舞台中进行事件回放与预览

### 玩家外观与编辑器外壳

- 独立玩家外观配置窗口
- 从默认存档导入外观
- 当前激活玩家配置直接用于事件舞台里的 `player / farmer`
- IDE 风格工作区：侧边栏、停靠面板、浮动窗口、布局预设
- 无边框 Tauri 窗口，自定义最小化 / 最大化 / 关闭按钮
- 明暗主题切换
- `zh-CN / en-US` 双语界面

## 当前限制

- `TMX` 是当前唯一真正可加载的地图格式
- `XNB` 目前只有扫描，没有解析与加载
- 外部 `.tsx` tileset 还不支持
- 压缩图层数据还不支持
- 地图对象编辑还没有落地，当前偏只读检查
- 角色 / 建筑 / 物品模块仍是蓝图占位
- `.NET bridge` 还未接入实际业务
- 玩家外观渲染还没有和游戏本体完全逐像素一致

## 目录重点

- `src/App.tsx`：应用总装配入口
- `src/components/WorkspaceLayout.tsx`：工作区布局引擎
- `src/components/CentralWorkspace.tsx`：中央文档区
- `src/components/MapViewport.tsx`：地图视口
- `src/components/EventStageWorkspace.tsx`：事件舞台
- `src/components/PlayerAppearanceWindow.tsx`：玩家外观窗口
- `src/lib/app/useMapWorkspace.ts`：地图工作区状态
- `src/lib/app/useEventWorkspace.ts`：事件工作区状态
- `src/lib/maps/tmx.ts`：TMX 解析
- `src/lib/maps/world.ts`：世界地图 Atlas 构建
- `src/lib/events/parser.ts`：事件解析
- `src/lib/desktop.ts`：前端到 Tauri 的本地能力封装
- `src-tauri/src/lib.rs`：Tauri 命令实现

## 常用命令

在仓库根目录运行：

```bash
npm run lint --workspace @modforge/desktop
npm run build --workspace @modforge/desktop
```

启动桌面开发环境：

```bash
npm run desktop:dev
```

仅启动前端开发服务器：

```bash
npm run dev
```

## 开发说明

- `apps/desktop/src` 下的前端改动通过 Vite HMR 热更新
- `apps/desktop/src-tauri` 下的 Rust 改动会重编译并重启桌面宿主
- `tauri.conf.json`、权限配置、Tailwind/PostCSS 配置或依赖变更通常需要手动重启

## 下一步重点

- 地图对象选择与编辑
- 更强的对象检查器与属性写回
- 事件工作区命令覆盖率继续补齐
- farmer 渲染继续向原版靠齐
- `XNB` 兼容路径与 `.NET bridge` 接入
