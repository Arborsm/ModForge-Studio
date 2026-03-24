# ModForge Studio 项目计划书

## 1. 项目定义

### 1.1 项目名称
ModForge Studio

### 1.2 产品定位
面向《星露谷物语》模组创作者的可视化内容编辑器，目标是提供接近 Unity / 虚幻编辑器的工作流体验，让作者能以“导入 -> 可视化编辑 -> 校验 -> 导出”的方式制作和维护模组。

### 1.3 首发目标
首发版本完整支持 Content Patcher（以下简称 CP）内容制作、反向加载与导出。

### 1.4 第一阶段落地目标
先实现从本机 `Stardew Valley` 游戏目录读取地图，并在编辑器中完成地图加载与渲染。

当前已确认的本机资源路径：

- 游戏根目录：`E:\SteamLibrary\steamapps\common\Stardew Valley`
- 原始地图资源：`E:\SteamLibrary\steamapps\common\Stardew Valley\Content\Maps\*.xnb`
- 已解包地图资源：`E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Maps\*.tmx`

已确认的真实资源形态：

- `Content\Maps` 下为游戏运行时使用的 `.xnb`
- `Content (unpacked)\Maps` 下存在 `.tmx + .png`
- `.tmx` 中包含地图级属性、图层、对象层、tileset 引用、tile 属性与动画

这意味着第一阶段不应该直接从浏览器读取文件，也不建议一开始就硬啃 `.xnb`。更稳妥的路径是：

1. 使用桌面应用壳获得本地文件系统访问能力。
2. 第一阶段优先读取 `Content (unpacked)` 中的 `TMX` 地图。
3. 第二阶段引入 .NET 地图桥接层，补齐对游戏原始 `.xnb`、CP 补丁结果和游戏加载逻辑兼容。

## 2. 核心目标与成功标准

### 2.1 核心目标

- 导入星露谷原始素材与现有 CP 模组包，并进行可视化编辑。
- 通过拖放与节点化方式制作地图、人物剧情、本地化、物品内容。
- 一键导出合法 CP 模组包，并提供完整校验与诊断。
- 提供插件机制，扩展到其他模组框架。

### 2.2 首发版本成功标准

- 能读取用户本机游戏目录并建立项目索引。
- 能导入现有 CP 模组包并识别其目标资源、补丁内容、条件与本地化。
- 能以图形化方式编辑地图、对话、本地化和部分数据表内容。
- 能导出合法 CP 包，并通过基础规则校验。
- 能对常见错误给出明确诊断。

### 2.3 第一阶段成功标准

- 启动编辑器后选择或自动发现游戏目录。
- 正确识别 `Content (unpacked)\Maps` 中的地图列表。
- 至少能打开 `Farm.tmx`、`Town.tmx`、`Forest.tmx` 等大型地图。
- 能正确显示基础图层、前景图层、对象层、地图属性与 tile 属性。
- 支持缩放、拖拽平移、图层显隐、属性面板查看。
- 为后续 CP 贴图替换、地图 patch、导出提供统一内部数据结构。

## 3. 用户画像与典型场景

### 3.1 新手作者

- 想替换一张贴图或改一小块地图。
- 不熟悉 CP 语法，不想手写 `content.json`。
- 需要“能看到结果”的编辑方式。

### 3.2 进阶作者

- 需要维护多个地图版本、季节贴图、条件剧情、多语言文案。
- 需要节点化编辑器组织复杂逻辑。
- 需要反向读取已有模组，避免从零重做。

### 3.3 技术作者

- 希望扩展导入器、导出器、校验器。
- 希望支持额外模组框架或自定义规范。
- 需要稳定的插件 API、资源模型和诊断系统。

## 4. 产品范围

### 4.1 首发版本范围

- 地图导入与可视化编辑
- CP 包导入
- CP 资源替换与地图 patch 编辑
- 文本、本地化、基础数据表编辑
- 导出 CP 包
- 校验与诊断

### 4.2 暂不纳入首发

- 全量支持所有模组框架
- 完整等价复刻游戏运行时全部渲染和脚本行为
- 联机协同编辑
- 云端仓库托管与发布市场

## 5. 总体技术路线

## 5.1 架构结论

前端使用 `React + TypeScript`，但产品形态必须是桌面应用，而不是纯 Web 页面。

原因很直接：

- 浏览器无法稳定直接访问用户本机游戏目录。
- 产品需要长期监听本地文件变化、导入/导出模组包、访问大体积贴图资源。
- 后续若要“通过游戏代码”还原地图加载和资源解析，需要与 .NET 游戏程序集交互。

因此推荐采用三层架构：

1. UI 层：`React + TypeScript`
2. 桌面宿主层：`Tauri`
3. 游戏兼容桥接层：`.NET sidecar / worker`

## 5.2 推荐技术栈

### 前端

- `React 18`
- `TypeScript 5`
- `Vite`
- `Zustand`：编辑器状态与 UI 状态管理
- `TanStack Query`：异步资源索引、缓存与加载状态
- `React Router`：多工作区 / 编辑页路由
- `React Hook Form + Zod`：属性面板与表单校验
- `PixiJS`：地图渲染、缩放、拖拽、图层绘制
- `React Flow`：后续剧情/条件节点编辑

### 桌面宿主

- `Tauri 2`
- `Rust` 仅负责轻量宿主能力：
  - 文件系统访问
  - 对话框
  - 配置目录管理
  - 文件监听
  - 启动和管理 .NET sidecar

### 游戏兼容桥接层

- `.NET 8`
- 可选组件：
  - 直接引用 `Stardew Valley.dll`
  - 引用 `xTile.dll`
  - 必要时引用 `MonoGame.Framework.dll`

桥接层职责：

- 读取并解析地图资源
- 在后续版本中补齐 `.xnb` 读取、CP patch 应用、资源归一化
- 输出前端可消费的 JSON 结构
- 提供诊断与校验结果

## 5.3 为什么不是纯 Electron / 纯前端

纯前端方案的问题：

- 本地目录访问受限
- 无法稳定复用游戏 .NET 侧类型
- 资源量大时性能与权限都不稳定

纯 Electron 方案可行，但不优先：

- 体积更重
- 安全边界更松
- 若后续仍需 .NET 进程桥接，Electron 并没有减少核心复杂度

Tauri + React + .NET sidecar 的组合更适合这个项目：

- UI 保持 `React + TypeScript`
- 本地权限清晰
- 后续可无缝接入“通过游戏代码”的需求

## 6. 系统架构设计

## 6.1 分层结构

### 1. Presentation Layer

负责：

- 界面布局
- 编辑器视口
- 资源浏览器
- 属性面板
- 诊断面板
- 命令系统与快捷键

### 2. Application Layer

负责：

- 打开项目
- 导入游戏目录
- 打开地图
- 保存编辑状态
- 导出模组
- 执行校验

### 3. Domain Layer

负责核心领域模型：

- Map
- Layer
- TileSet
- Tile
- Patch
- LocalizationEntry
- CP Patch Graph
- ValidationIssue
- PluginManifest

### 4. Infrastructure Layer

负责：

- 文件访问
- 资源缓存
- 目录监听
- .NET sidecar 通讯
- 模组包导入导出

## 6.2 模块划分

建议模块如下：

- `app-shell`
  - 启动、窗口、配置、系统菜单
- `project-system`
  - 项目目录、工作区、最近项目、资源索引
- `asset-pipeline`
  - 游戏资源、模组资源、导入、缓存、版本识别
- `map-editor`
  - 地图读取、渲染、图层、选区、属性、刷子
- `cp-engine`
  - CP 补丁解析、应用、导出
- `story-editor`
  - 剧情、条件与节点图
- `localization-editor`
  - 多语言文本编辑
- `validator`
  - 规则校验、诊断、修复建议
- `plugin-host`
  - 插件加载、扩展点、隔离与权限

## 7. 代码仓库建议结构

```text
ModForge Studio/
  apps/
    desktop/
      src/                    # React + TypeScript 前端
      src-tauri/              # Tauri Rust 宿主
  packages/
    ui/                       # 通用 UI 组件
    editor-core/              # 编辑器公共状态、命令、事件总线
    domain/                   # 领域模型与 schema
    map-renderer/             # PixiJS 地图渲染能力
    cp-domain/                # CP 数据模型与规则
    validation/               # 校验规则
    shared/                   # 工具函数与通用类型
  services/
    sdv-bridge/               # .NET 8 桥接服务
  docs/
    project-plan.zh-CN.md
```

## 8. 核心数据模型设计

## 8.1 MapDocument

```ts
type MapDocument = {
  id: string;
  name: string;
  sourcePath: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  properties: Record<string, string | boolean | number>;
  layers: MapLayer[];
  tilesets: MapTileset[];
  objects: MapObjectLayer[];
  diagnostics: ValidationIssue[];
};
```

## 8.2 MapLayer

```ts
type MapLayer = {
  id: string;
  name: string;
  kind: "tile" | "object" | "image" | "group";
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  properties: Record<string, string | boolean | number>;
  tiles?: Uint32Array;
};
```

## 8.3 MapTileset

```ts
type MapTileset = {
  id: string;
  firstGid: number;
  name: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  tileProperties: Record<number, Record<string, string | boolean | number>>;
  animations: Record<number, { tileId: number; duration: number }[]>;
};
```

## 8.4 CP Patch Document

后续需要统一成中间层模型，不要让前端直接绑定 CP 原始 JSON 结构。原因是：

- 可视化编辑需要归一化数据
- 不同模组框架的表达方式不同
- 插件扩展需要稳定内部协议

## 9. 第一阶段实现方案：读取游戏地图并在编辑器中加载

这是当前最重要的里程碑。

## 9.1 阶段目标

实现从本机游戏目录读取地图资源，并在编辑器中以可视化方式展示。

## 9.2 技术结论

第一阶段采用“双轨输入”：

### 轨道 A：开发优先路径

优先读取：

- `E:\SteamLibrary\steamapps\common\Stardew Valley\Content (unpacked)\Maps\*.tmx`

原因：

- 文件已是标准 TMX
- 对接前端地图渲染最快
- 便于验证视口、图层、tileset、属性解析是否正确

### 轨道 B：后续兼容路径

后续通过 `.NET sidecar` 支持：

- `Content\Maps\*.xnb`
- 通过游戏相关程序集或兼容逻辑还原地图资源
- 叠加 CP patch 后输出最终地图结构

这条路径应该在第一阶段后半段开始设计接口，但不阻塞 MVP。

## 9.3 地图加载流程

### 步骤 1：发现游戏目录

来源优先级：

1. 用户手动选择目录
2. 读取上次使用目录
3. Windows 常见 Steam 路径自动探测
4. 校验是否存在 `Stardew Valley.exe`

### 步骤 2：识别资源形态

检查：

- `Content (unpacked)\Maps` 是否存在
- `Content\Maps` 是否存在

策略：

- 若存在 `Content (unpacked)`，优先走 TMX 路径
- 若只有 `Content\Maps`，提示当前版本暂需解包资源，或切换到 `.NET sidecar` 兼容模式

### 步骤 3：建立地图索引

扫描：

- `Maps/*.tmx`
- 关联 tileset 图像引用

生成索引字段：

- 地图名
- 文件路径
- 地图尺寸
- 图层数
- tileset 列表
- 是否有对象层
- 是否有动画 tile
- 诊断状态

### 步骤 4：解析 TMX

解析内容：

- 地图基础信息
- 地图属性
- tileset
- 图层
- 对象层
- tile 属性
- tile 动画

注意点：

- `image source` 可能省略扩展名，需要补全 `.png`
- 大地图应支持懒加载和纹理缓存
- 后续要兼容季节贴图、区域贴图和国际化贴图

### 步骤 5：加载纹理

前端渲染层读取 tileset 图片：

- `spring_outdoorsTileSheet.png`
- `paths.png`
- `townInterior.png`
- 其他地图引用贴图

应建立纹理缓存：

- 相同 tileset 只加载一次
- 切换地图时保留热点纹理
- 释放非活跃大型纹理

### 步骤 6：渲染到地图视口

地图视口最小能力：

- 平移
- 缩放
- 图层开关
- 网格开关
- 鼠标悬停 tile 坐标
- 属性查看

### 步骤 7：生成内部标准模型

无论来源是 `.tmx`、`.xnb` 还是 CP patch，最后都转换为统一 `MapDocument`，避免 UI 和具体资源格式耦合。

## 9.4 第一阶段建议实现边界

本阶段先做“读和看”，不做完整编辑闭环。

必须完成：

- 目录选择
- 地图列表
- 地图打开
- 图层渲染
- 属性查看
- 基础诊断

可以延后：

- 地图笔刷编辑
- 撤销重做
- 对象拖放编辑
- 保存 TMX
- 导出 CP patch

## 9.5 第一阶段 UI 方案

建议采用经典编辑器布局：

- 左侧：项目资源树 / 地图列表
- 中央：地图视口
- 右侧：属性检查器
- 底部：诊断面板 / 日志 / 资源加载状态

关键页面：

- Welcome / 打开项目
- Game Path Setup
- Workspace
- Map Editor

## 9.6 第一阶段接口设计

### 前端到宿主

- `selectGameDirectory()`
- `validateGameDirectory(path)`
- `scanMaps(path)`
- `openMap(mapId)`

### 宿主到 .NET sidecar

- `parseTmx(path)`
- `parseXnb(path)` 后续预留
- `resolveTilesets(map)`
- `buildMapDocument(path, options)`

返回值统一为 JSON DTO，不把 .NET 类型直接暴露到前端。

## 10. 后续核心功能路线

## 10.1 地图编辑器

第二阶段扩展：

- tile 笔刷
- 选区复制粘贴
- 图层编辑
- 对象层编辑
- 碰撞/属性辅助标注
- 地图差异视图

## 10.2 CP 导入与反向加载

目标：

- 读取 `manifest.json`
- 读取 `content.json`
- 识别 `Changes`
- 对目标资源构建 patch 视图
- 支持已有模组包反向重建为编辑器工程

难点：

- 条件表达式
- 多目标 patch
- 优先级与顺序
- `Include`、`FromFile`、`EditMap`、`Load` 等指令兼容

## 10.3 导出

导出内容包括：

- `manifest.json`
- `content.json`
- 贴图资源
- 地图资源
- 本地化文件

导出要求：

- 结构合法
- 引用完整
- 资源路径正确
- 生成诊断报告

## 10.4 诊断与校验

首发必须具备的校验能力：

- 缺失资源
- 非法路径
- 未引用资源
- CP 基础字段缺失
- patch 目标不存在
- 地图 tileset 丢失
- 本地化 key 冲突

## 10.5 插件机制

插件扩展点建议包括：

- 资源导入器
- 资源导出器
- 校验器
- 新编辑器面板
- 新模组框架适配器

插件 API 要求：

- 基于稳定 schema
- 明确版本号
- 有权限边界
- 插件崩溃不应拖垮主编辑器

## 11. 研发阶段规划

以下周期按 1 人主导开发估算；多人并行可压缩。

## 阶段 0：项目初始化

周期：1 周

交付：

- Monorepo 初始化
- `React + TypeScript + Vite + Tauri` 框架搭建
- `.NET sidecar` 工程初始化
- 日志、配置、错误处理基础设施
- CI 基础流程

## 阶段 1：地图读取与加载 MVP

周期：2 到 3 周

交付：

- 游戏目录选择与校验
- TMX 地图扫描
- TMX 解析
- tileset 图片加载
- 地图视口渲染
- 属性检查器
- 基础诊断

验收地图建议：

- `Farm.tmx`
- `Town.tmx`
- `Forest.tmx`
- `Mountain.tmx`

## 阶段 2：地图编辑基础能力

周期：2 到 4 周

交付：

- 选区
- tile 笔刷
- 图层编辑
- 撤销重做
- 资源缓存优化

## 阶段 3：CP 导入与反向工程

周期：3 到 5 周

交付：

- 解析 `manifest.json`
- 解析 `content.json`
- 构建 patch 中间模型
- 工程树展示 CP 资源关系

## 阶段 4：导出与校验

周期：2 到 4 周

交付：

- 导出 CP 模组包
- 资源路径整理
- 校验器
- 诊断结果面板

## 阶段 5：节点化剧情与高级编辑

周期：4 到 6 周

交付：

- 节点图编辑器
- 对话、剧情、条件流设计
- 本地化联动编辑

## 12. 非功能需求

## 12.1 性能

- 大地图首次打开时间控制在可接受范围
- 常用贴图缓存命中率高
- 视口拖拽与缩放流畅
- 切换地图不出现明显卡死

## 12.2 可维护性

- 前端只依赖内部标准模型
- 文件格式解析与 UI 解耦
- 规则校验模块可独立扩展

## 12.3 可扩展性

- 为 CP 之外的模组框架预留接口
- 为 `.xnb` / TMX / JSON / 本地化文件统一抽象
- 为插件机制预留 capability 模型

## 12.4 稳定性

- 地图解析失败不应导致应用崩溃
- 缺失 tileset 时应进入降级渲染和诊断模式
- sidecar 崩溃后可重启并恢复会话

## 13. 主要技术风险与应对

## 13.1 资源格式不完全统一

风险：

- 一部分用户只有 `.xnb`
- 一部分用户使用已解包资源
- 不同版本或 MOD 工具可能引入差异

应对：

- 内部标准模型统一输入
- 第一阶段优先支持 `TMX`
- 第二阶段再补齐 `.xnb`

## 13.2 “通过游戏代码” 的兼容复杂度

风险：

- 游戏程序集并不是为外部编辑器公开设计的 API
- 直接复用游戏加载流程可能涉及初始化依赖

应对：

- 初期不强依赖完整游戏运行时
- 先实现“兼容结构解析”
- 仅在必要处引入 `Stardew Valley.dll`、`xTile.dll`

## 13.3 地图渲染性能

风险：

- 大地图、多层、高分辨率贴图会拉高内存与渲染开销

应对：

- 使用 `PixiJS`
- 做纹理缓存
- 支持按视口裁剪和分块渲染

## 13.4 CP 规则复杂

风险：

- `EditMap`、条件系统、多文件引用会带来反向工程复杂度

应对：

- 定义中间模型
- 先覆盖高频场景
- 复杂指令走“部分支持 + 明确诊断”

## 14. 测试策略

## 14.1 单元测试

- TMX 解析器
- tileset 解析
- 路径解析
- CP schema 校验
- 导出器规则

## 14.2 集成测试

- 游戏目录扫描
- 地图打开流程
- 贴图加载链路
- sidecar 通讯

## 14.3 回归测试样本

建立样本集：

- 原版地图
- 含对象层地图
- 含动画 tile 地图
- 大尺寸地图
- 含国际化 tileset 的地图
- CP 修改后的地图

## 15. 近期执行清单

这是建议的下一步执行顺序。

### 第 1 周

- 初始化 `Tauri + React + TypeScript` 桌面工程
- 初始化 `.NET 8` `sdv-bridge`
- 完成游戏目录选择与校验
- 自动读取默认路径 `E:\SteamLibrary\steamapps\common\Stardew Valley`

### 第 2 周

- 完成 `Content (unpacked)\Maps` 扫描
- 完成 `TMX` 解析器
- 建立 `MapDocument` DTO
- 在 UI 中展示地图列表

### 第 3 周

- 接入 `PixiJS` 地图渲染
- 加载 tileset 图片
- 实现缩放、平移、图层开关
- 打通 `Farm.tmx` / `Town.tmx` 打开流程

### 第 4 周

- 增加属性检查器
- 增加基础诊断
- 优化大地图加载性能
- 设计 `.xnb` / CP 兼容接口

## 16. 项目结论

ModForge Studio 的正确起步方式不是先做“全量 CP 编辑器”，而是先把地图资源读取、标准化和可视化这条链路打通。

在当前条件下，最稳妥的技术方案是：

- 前端：`React + TypeScript`
- 桌面宿主：`Tauri`
- 地图渲染：`PixiJS`
- 游戏兼容桥接：`.NET 8 sidecar`

第一阶段明确以 `Content (unpacked)\Maps\*.tmx` 为入口，优先实现“从游戏文件夹读取地图并在编辑器中加载”。等这条链路稳定后，再扩展到 `.xnb`、CP patch 叠加、反向工程与导出。

这条路线的优点是：

- 能尽快看到真实可运行结果
- 不把 UI 和资源格式耦死
- 为后续“通过游戏代码”和插件化留下足够空间
