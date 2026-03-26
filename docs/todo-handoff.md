# ModForge Studio 交接与待办

## 当前状态

项目当前是一个以桌面端为主的《星露谷物语》可视化创作工具原型，仓库结构如下：

- 前端：`React 19 + TypeScript + Vite + Tailwind CSS 4`
- 桌面宿主：`Tauri 2`
- 兼容桥接：`.NET 8` 控制台项目，当前仍是占位骨架

主要入口：

- 根工作区：`package.json`
- 桌面应用：`apps/desktop`
- Tauri 宿主：`apps/desktop/src-tauri`
- .NET 桥接：`services/sdv-bridge`

## 已完成内容

### 1. 工作区与运行骨架

已落地：

- 根级 npm workspace
- `@modforge/desktop` 桌面应用
- Tauri 无边框桌面窗口
- `.NET 8` 侧车项目骨架

已验证过的命令：

- `npm run lint --workspace @modforge/desktop`
- `npm run build --workspace @modforge/desktop`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- `dotnet restore services\sdv-bridge\ModForge.Studio.SdvBridge.csproj`
- `dotnet build services\sdv-bridge\ModForge.Studio.SdvBridge.csproj --no-restore`

### 2. 游戏目录、地图与文本资源访问

主要文件：

- `apps/desktop/src/lib/desktop.ts`
- `apps/desktop/src-tauri/src/lib.rs`

已实现能力：

- 自动探测常见 `Stardew Valley` 安装目录
- 手动选择并校验游戏目录
- 优先使用 `Content (unpacked)\Maps`
- 扫描地图资源摘要
- 扫描 `Content (unpacked)\Data\Events` 下的事件 JSON
- 读取任意文本资源
- 读取图片并转成 Data URL
- 扫描默认存档目录中的存档槽位

当前事实：

- 地图资源优先格式仍是 `TMX`
- 如果本地只有 `XNB`，当前只能扫描，不能真正载入

### 3. TMX 地图解析与世界地图 Atlas

主要文件：

- `apps/desktop/src/lib/maps/types.ts`
- `apps/desktop/src/lib/maps/tmx.ts`
- `apps/desktop/src/lib/maps/world.ts`
- `apps/desktop/src/lib/app/useMapWorkspace.ts`

已实现能力：

- 将 `TMX` XML 解析为内部 `MapDocument`
- 解析地图属性、图块层、对象组、对象、Tileset、Tile 属性、Tile 动画
- 构建主世界与远程区域的 `World Atlas`
- 通过 Warp 关系自动追踪关联地图
- 优先打开 `World Atlas`，而不是只打开单张地图
- 从 Atlas 视图跳转到具体地图，或在 Atlas 主/远程视图之间切换
- 地图以文档标签页形式打开、聚焦、关闭、拖拽排序

当前解析范围：

- 支持 `TMX`
- 支持 CSV 图层数据
- 不支持压缩图层数据
- 不支持外部 `.tsx` tileset
- 不支持无限地图
- 尚未实现 `XNB -> MapDocument`

### 4. 地图工作区与视口

主要文件：

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/components/StatusBar.tsx`
- `apps/desktop/src/components/panels/left/*`
- `apps/desktop/src/components/panels/right/*`

已实现能力：

- 中央 Canvas 视口渲染可见 Tile Layer
- 渲染对象组边界、标签与 Warp 路径
- 鼠标悬停检查 tile 坐标、像素坐标、gid、tileset 与命中对象
- 图层显隐切换
- 对象组显隐切换
- 从对象面板定位并高亮对象
- 右键编辑器风格上下文菜单
- 拖拽平移、滚轮缩放、`Fit`、`1:1`
- 当前活动文档路径显示在底部状态栏

当前性质：

- 地图对象仍是只读检查态
- 没有真正的对象编辑、拖拽修改、属性写回

### 5. 事件工作区

主要文件：

- `apps/desktop/src/lib/app/useEventWorkspace.ts`
- `apps/desktop/src/lib/events/parser.ts`
- `apps/desktop/src/lib/events/timeline.ts`
- `apps/desktop/src/components/EventStageWorkspace.tsx`
- `apps/desktop/src/components/panels/left/EventBrowserPanel.tsx`
- `apps/desktop/src/components/panels/right/EventDirectoryPanel.tsx`
- `apps/desktop/src/components/panels/right/EventCommandInspectorPanel.tsx`
- `apps/desktop/src/components/panels/bottom/EventTimelinePanel.tsx`

已实现能力：

- 扫描事件文件并支持按名称过滤
- 读取基础事件文件与本地化事件文件
- 解析事件前置条件、场景初始化和命令序列
- 构建事件目录、命令检查器和时间线视图
- 在事件舞台中回放场景、角色、对话与分支
- 支持部分事件命令的可视化演出与跳转

当前性质：

- 事件工作区已经不是占位蓝图，而是可操作的真实模块
- 角色、建筑、物品三个顶栏模块目前仍以蓝图/占位为主

### 6. 玩家外观窗口

主要文件：

- `apps/desktop/src/components/PlayerAppearanceWindow.tsx`
- `apps/desktop/src/lib/app/playerAppearance.ts`
- `apps/desktop/src/lib/app/farmerAppearanceRenderer.ts`

已实现能力：

- 独立玩家外观配置窗口
- 多个玩家外观配置槽位
- 从默认存档槽导入外观
- 预览基础农夫身体、发型、帽子等分层结果
- 当前激活配置可直接用于事件舞台中的 `player / farmer`

当前限制：

- 已补齐核心分层，但仍未完全做到和游戏本体逐像素一致

### 7. IDE 风格工作区系统

主要文件：

- `apps/desktop/src/components/WorkspaceLayout.tsx`
- `apps/desktop/src/lib/app/workspacePanels.tsx`
- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/styles/globals.css`

已实现能力：

- 左右图标栏
- 左侧 / 右侧 / 底部停靠面板
- 浮动窗口
- 拖拽停靠目标
- 布局持久化
- 预设保存、加载、删除
- 视图菜单管理面板显隐和布局重置
- 无边框窗口的最小化、最大化、关闭与拖动

## 当前用户可见流程

从桌面应用 UI 出发，用户现在可以：

1. 自动探测或手动选择《星露谷物语》目录。
2. 校验目录结构。
3. 扫描地图与事件资源。
4. 优先打开 `World Atlas`，并在主世界/远程区域之间切换。
5. 打开单张地图为文档标签页并切换标签。
6. 查看 Tile Layer、对象组、Warp 路径与悬停信息。
7. 切换到事件工作区，查看事件列表、事件目录、命令检查器与时间线。
8. 在事件舞台里预览事件演出，并使用玩家外观配置。
9. 切换主题、语言、强调色与工作区布局预设。

## 关键文件

### 产品与文档

- `docs/project-plan.zh-CN.md`
- `docs/editor-workspace.zh-CN.md`
- `docs/todo-handoff.md`

### 前端入口

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/lib/editor-shell.ts`
- `apps/desktop/src/styles/globals.css`

### 工作区与面板系统

- `apps/desktop/src/components/WorkspaceLayout.tsx`
- `apps/desktop/src/lib/app/workspacePanels.tsx`
- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/components/LeftPanels.tsx`
- `apps/desktop/src/components/RightPanels.tsx`

### 地图模块

- `apps/desktop/src/lib/app/useMapWorkspace.ts`
- `apps/desktop/src/lib/app/mapWorkspace.ts`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/maps/tmx.ts`
- `apps/desktop/src/lib/maps/world.ts`
- `apps/desktop/src/lib/maps/assets.ts`
- `apps/desktop/src/lib/maps/types.ts`

### 事件模块

- `apps/desktop/src/lib/app/useEventWorkspace.ts`
- `apps/desktop/src/components/EventStageWorkspace.tsx`
- `apps/desktop/src/components/EventWorkspace.tsx`
- `apps/desktop/src/lib/events/parser.ts`
- `apps/desktop/src/lib/events/timeline.ts`
- `apps/desktop/src/lib/events/types.ts`

### 玩家外观

- `apps/desktop/src/components/PlayerAppearanceWindow.tsx`
- `apps/desktop/src/lib/app/playerAppearance.ts`
- `apps/desktop/src/lib/app/farmerAppearanceRenderer.ts`

### Tauri 宿主

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src-tauri/Cargo.toml`

### .NET 桥接

- `services/sdv-bridge/ModForge.Studio.SdvBridge.csproj`
- `services/sdv-bridge/Program.cs`

## 已知限制

### 地图与资源格式

- `TMX` 是当前唯一真正可加载的地图格式
- `XNB` 还没有解析与回写路径
- 外部 `.tsx` tileset 未支持
- 压缩图层数据未支持
- 无限地图未支持

### 编辑能力

- 地图对象编辑尚未开始
- 目前更偏向“浏览、检查、回放、定位”
- 角色、建筑、物品模块仍是蓝图态而非完整编辑器

### 事件与农夫渲染

- 事件舞台已可用，但并非所有事件命令都已完整还原
- 农夫外观渲染尚未完全对齐游戏原版

### 基础设施

- `.NET bridge` 仍是占位项目，尚未接入真实业务
- 当前核心能力主要由 `React + Tauri + Rust` 直接支撑

## 建议的下一步优先级

1. 地图对象选择与编辑
2. 地图对象的分类检查器与属性写回
3. 事件舞台命令覆盖率继续补齐
4. 农夫渲染逻辑继续向原版靠齐
5. `XNB` 兼容路径与 `.NET bridge` 真正接入
6. 角色 / 建筑 / 物品模块从蓝图升级为真实编辑器

## 测试清单

手动桌面测试建议：

1. 运行 `npm run desktop:dev`
2. 自动探测或手动选择游戏目录
3. 校验目录
4. 扫描地图并确认首先进入 `World Atlas`
5. 切换主世界与远程区域 Atlas 视图
6. 打开若干地图标签页并验证拖拽排序、关闭、重新聚焦
7. 验证图层显隐、对象组显隐、对象定位
8. 验证悬停信息、缩放、平移、右键菜单
9. 切换到事件工作区，确认能扫描事件文件
10. 打开事件并检查事件目录、命令检查器、时间线、舞台回放
11. 打开玩家外观窗口并尝试导入默认存档
12. 切换中英文、明暗主题、强调色和布局预设
13. 验证无边框窗口按钮和标题栏拖动

构建验证：

- `npm run lint --workspace @modforge/desktop`
- `npm run build --workspace @modforge/desktop`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- `dotnet build services\sdv-bridge\ModForge.Studio.SdvBridge.csproj --no-restore`

## Farmer 渲染后续交接

当前实现主要在：

- `apps/desktop/src/lib/app/farmerAppearanceRenderer.ts`
- `apps/desktop/src/components/EventStageWorkspace.tsx`

已经对齐或移植的内容：

- 从 `HairData.json` 读取发型元数据
- 从 `hats.json` 读取帽子元数据，并处理发型绘制模式
- 身体 / 面部 / 发型 / 帽子的近原版分层顺序
- 正面朝向的眼睛覆盖层绘制
- 基础眨眼状态机
- 游泳与浴衣分支的核心逻辑
- `FarmerSprite.getAnimationFromIndex()` 动画表数量已对齐
- 空闲移动计时与部分眼部状态近似逻辑

已核对状态：

- `buildFarmerSingleAnimationFrames()` 的 case 数量已与原版 `FarmerSprite.getAnimationFromIndex()` 一致
- 当前实现 case 数：`87`
- 从反编译原版代码中找到的 case 数：`87`

仍缺失或只部分移植：

- `FarmerRenderer.draw()` 中剩余会影响头部和面部输出的分支
- 工具使用时会抑制或改变眼睛表现的分支
- 鱼竿特殊分支
- 弹弓及其他工具相关的图层顺序分支
- 游泳水圈覆盖层及其他仅水域生效的效果
- 通过 `rotationAdjustment` 的非零旋转处理
- `isInBed` 的显式状态推导
- 体力耗尽或低体力面部逻辑的显式状态推导
- 仍靠推断而不是原始字段驱动的事件态覆盖逻辑

推荐后续顺序：

1. 先补完 `FarmerRenderer.draw()` 的缺失分支，再增加经验性修补。
2. 优先从 `Farmer` 字段补齐状态输入，不要依赖截图猜测。
3. 用真实事件数据和真实动画索引逐条比对。
4. 保持 `EventStageWorkspace.tsx` 只负责提供渲染状态，不要继续堆叠重复渲染逻辑。

## 如何查原版逻辑

事实来源：

- 游戏程序集：`E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll`
- 反编译工具：`C:\Users\26537\.dotnet\tools\ilspycmd.exe`

常用反编译命令：

```powershell
& 'C:\Users\26537\.dotnet\tools\ilspycmd.exe' -t StardewValley.FarmerRenderer 'E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll'
& 'C:\Users\26537\.dotnet\tools\ilspycmd.exe' -t StardewValley.FarmerSprite 'E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll'
& 'C:\Users\26537\.dotnet\tools\ilspycmd.exe' -t StardewValley.Farmer 'E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll'
& 'C:\Users\26537\.dotnet\tools\ilspycmd.exe' -t StardewValley.Event 'E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll'
& 'C:\Users\26537\.dotnet\tools\ilspycmd.exe' -t StardewValley.Objects.Hat 'E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll'
```

推荐本地流程：

1. 把目标类型反编译到临时文件。
2. 用 `rg` 搜状态字段、绘制分支和辅助方法。
3. 继续向上追溯到 `Farmer`、`FarmerSprite`、`Event` 或装备类。
4. 确认原始代码路径后，再移植到 `farmerAppearanceRenderer.ts`。

示例：

```powershell
& 'C:\Users\26537\.dotnet\tools\ilspycmd.exe' -t StardewValley.Farmer 'E:\SteamLibrary\steamapps\common\Stardew Valley\Stardew Valley.dll' | Set-Content -Path '.tmp_farmer_dump.cs'
rg -n "currentEyes|blinkTimer|isInBed|swimming|timerSinceLastMovement|Stamina" .tmp_farmer_dump.cs
```

仓库根目录目前已经有这些临时反编译文件：

- `tmp.FarmerRenderer.cs`
- `tmp.FarmerSprite.cs`
- `tmp.Event.cs`

定位事件侧行为的方式：

- 查看 `E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Data\Events`
- 搜索会影响动画或游泳状态的脚本 token

常用搜索：

```powershell
rg -n "farmerAnimation|eyes |swimming farmer|stopSwimming farmer" "E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Data\Events"
```

当渲染结果和游戏不一致时，不要先拍脑袋修图，先确认这几件事：

1. 当前帧索引与朝向是否正确。
2. 原始逻辑是在 `FarmerRenderer.draw()` 里，还是在上游状态准备阶段。
3. 事件脚本是否在渲染前改写了 farmer 状态。
4. 只有在确认匹配到真实代码路径之后，才做修正。
