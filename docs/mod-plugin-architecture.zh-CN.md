# ModForge Studio 插件 API 与 Content Patcher 架构方案

## 1. 目标

本轮实现需要同时满足三类目标：

1. 为编辑器建立可扩展的插件 API，而不是继续把每个工作区硬编码进 `App.tsx` 和 `workspacePanels.tsx`。
2. 先落地一个完整的 `Content Patcher` 内建插件，支持导入、查看、编辑、保存、导出，并具备基础诊断。
3. 让后续能力可以沿同一套边界扩展，包括：
   - 其他模组类型编辑器
   - 地图编辑插件
   - Content Patcher 附属 API / 内容包制作
   - 更细的验证、打包和发布流程

## 2. 当前代码库约束

当前桌面端是 `Tauri 2 + React + TypeScript + Rust` 架构，并且已有一套成熟的工作区装配机制：

- 顶层状态集中在 `apps/desktop/src/App.tsx`
- 各工作区状态通过 `useMapWorkspace / useEventWorkspace / useCharacterWorkspace / useBuildingWorkspace / useItemWorkspace` 提供
- 面板装配集中在 `apps/desktop/src/lib/app/workspacePanels.tsx`
- Rust 侧负责本地文件系统、游戏资源扫描和内容读取

这意味着新增“插件生态”时，不应该引入第二套 UI 容器，而应复用现有工作区壳层，只把“模块定义”和“模块状态 contract”插件化。

## 3. 目标架构

### 3.1 分层

实现采用四层：

1. `Desktop Host Layer`
   - Rust 命令负责真实文件系统读写、模组扫描、导入、保存、导出、诊断。
   - 这一层不关心 React 组件，只返回稳定 DTO。
2. `Plugin Domain Layer`
   - TypeScript 定义插件元数据、能力声明、诊断结构、工作区状态接口。
   - `Content Patcher` 的文档模型、Patch 摘要、JSON 编辑帮助函数也在这一层。
3. `Plugin Application Layer`
   - `useModWorkspace` 负责扫描模组、打开项目、维护脏状态、驱动保存/导出。
   - 这一层组合 Rust DTO 和前端编辑状态。
4. `Plugin Presentation Layer`
   - 通过 `workspacePanels.tsx` 装配新的插件工作区面板。
   - `TopMenuBar` 允许切换到插件工作区。

### 3.2 插件 API 形态

第一阶段不做外部动态加载，而是做“内建插件注册表”：

- 插件定义通过 TypeScript 注册
- 每个插件声明：
  - `id`
  - `displayName`
  - `description`
  - `capabilities`
  - `supportedProjectKinds`
  - `futureScopes`
- 插件工作区通过统一状态对象驱动 UI

这样做的原因是：

- 当前项目还没有安全、版本、隔离、沙箱和外部包协议
- 先把宿主边界做对，比引入外部脚本系统更重要
- 未来如果真要支持第三方插件，可以把当前注册表接口升级为 manifest + bundle 加载，而不是推翻重做

## 4. Content Patcher 插件方案

### 4.1 范围

本轮交付的 `Content Patcher` 插件包含：

- 从已验证游戏目录的 `Mods` 目录扫描可识别项目
- 手动选择任意模组目录导入
- 检测 `manifest.json + content.json`
- 识别 Content Patcher 内容包
- 查看 Manifest 元数据
- 查看和选择 `Changes` 中的 Patch
- 编辑 Manifest 常用字段
- 编辑 Patch 常用字段
- 直接编辑 `manifest.json / content.json` 原始 JSON
- 保存到原目录
- 导出到目标目录
- 导出时保留原模组的其他文件
- 返回结构化诊断

### 4.2 非本轮范围

以下只留接口和架构位置，不在本轮实现：

- 地图可视化编辑器作为插件
- CP pack 向导式生成器
- i18n、图片、地图等资源级可视编辑
- 语义级 CP 条件构建器
- 发布包压缩、版本签名和 Nexus/ModDrop 发布

## 5. 数据流

### 5.1 扫描

1. 前端把已验证游戏目录传给 Rust
2. Rust 扫描 `Mods/*/manifest.json`
3. Rust 读取摘要并判断项目类型
4. 前端显示模组浏览器列表

### 5.2 导入

1. 选择模组项目
2. Rust 读取 `manifest.json` 和 `content.json`
3. Rust 生成：
   - 项目摘要
   - 插件类型
   - Patch 列表摘要
   - 诊断列表
   - 原始 JSON 文本
4. 前端建立可编辑状态

### 5.3 编辑

编辑状态分两条线：

- 结构化编辑
  - Manifest 字段表单
  - Patch 字段表单
- 原始 JSON 编辑
  - 直接修改 `manifest.json`
  - 直接修改 `content.json`

两者都回写到同一个内存模型，统一以格式化 JSON 作为保存源。

### 5.4 保存 / 导出

1. 前端把当前 JSON 文本发给 Rust
2. Rust 校验 JSON
3. Rust 写回：
   - 原目录保存
   - 或复制整个模组目录到目标目录后覆写 `manifest.json` / `content.json`
4. Rust 返回写入结果与目标路径

## 6. API 设计

### 6.1 Rust 命令

新增三类命令：

- `scan_mod_projects(rootPath)`
  - 扫描模组项目摘要
- `load_mod_project(path)`
  - 加载单个模组项目
- `save_mod_project(request)`
  - 保存或导出当前项目

### 6.2 DTO 原则

Rust 侧 DTO 必须：

- 仅暴露稳定 JSON 结构
- 不泄漏内部实现细节
- 可以直接被 TypeScript 类型镜像
- 对未来其他插件保留统一字段

统一返回字段至少包含：

- `pluginKind`
- `summary`
- `diagnostics`
- `capabilities`

`Content Patcher` 专属内容放在 `contentPatcher` 字段下。

## 7. 前端插件 API

前端新增 `lib/plugins/*` 作为插件层，包含：

- `types.ts`
  - 插件定义、诊断、能力枚举、项目类型
- `registry.ts`
  - 内建插件注册表
- `contentPatcher.ts`
  - CP 文档解析、Patch 摘要生成、JSON 更新辅助

新增 `useModWorkspace.ts` 作为插件应用层：

- 扫描模组
- 打开项目
- 维护脏状态
- 管理当前选中的 Patch
- 触发保存和导出
- 汇总状态消息

## 8. UI 结构

新增一个顶层工作区 `mods`，包含四个面板：

1. 左侧 `mods-browser`
   - 模组列表
   - 手动导入
   - 刷新扫描
2. 中央 `mods-workspace`
   - 项目概览
   - Manifest 常用字段
   - Patch 列表
   - 原始 JSON 编辑器
3. 右侧 `mods-inspector`
   - 当前 Patch 结构化字段编辑
4. 右下 `mods-diagnostics`
   - 诊断
   - 保存/导出结果
   - 项目路径与能力摘要

## 9. 可扩展性约束

为了支持未来地图编辑插件和 CP 包制作，本轮代码必须遵守下面约束：

- 不把 Content Patcher 逻辑直接塞进 `App.tsx`
- 不把 Content Patcher 的 UI 直接写死进通用组件
- 插件工作区必须通过统一 contract 接入 `workspacePanels.tsx`
- Rust 命令命名采用“模组项目”抽象，不局限于 CP
- DTO 中预留 `pluginKind / capabilities / diagnostics`

## 10. 测试策略

### 10.1 Rust 测试

Rust 侧必须覆盖：

- 模组扫描与类型识别
- Content Patcher 项目加载
- Patch 摘要提取
- 诊断生成
- 保存到原目录
- 导出到新目录并保留其他文件

### 10.2 前端验证

前端至少通过：

- TypeScript 编译
- Vite 构建

这能保证：

- 新工作区接线完整
- 新类型与 DTO 一致
- UI 组件无静态构建错误

## 11. 实施顺序

1. 新增架构文档
2. Rust 模组项目命令与测试
3. 前端插件 API 和 Content Patcher 文档模型
4. `useModWorkspace`
5. 插件工作区 UI 与现有工作区装配接线
6. 构建与测试修正

## 12. 完成标准

满足以下条件视为本轮完成：

- 可以从 `Mods` 目录看到 Content Patcher 项目
- 可以手动导入任意 CP 项目目录
- 可以查看并编辑 Manifest 和 Patch
- 可以保存回原目录
- 可以导出到新目录
- Rust 相关测试通过
- 前端构建通过
- 方案文档已落库
