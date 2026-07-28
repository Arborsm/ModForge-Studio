# 内容包创建的 GUI 完备性方案

目标：把一个 Content Patcher 内容包能写进 `manifest.json` / `content.json` 的**每一个字段与可选值**，都在工作台里做成可编辑的 GUI，不需要作者退回手写 JSON。

范围是"项目创建"链路：项目库 → 新建 / 属性对话框 → 各制作页的内容编辑 → 补丁设置对话框 → 项目设置页 → 导出。资产内容本身（`Data/Objects` 有哪些字段之类）由 `workbench-authoring-rework.md` 负责，本方案只管**包结构与补丁语义**。

> **状态：切片 A–E 已全部实施**（2026-07，含创建流程模板化与 patch 自动化）。下文矩阵保留为字段归属速查，GUI 列即当前落点。

## 1. 字段覆盖矩阵（实施后）

以 `buildManifestJson` / `buildContentJson`（`features/cp-maker/state/useCpMaker.ts`）能产出的字段为准，标注 GUI 落点。

### manifest.json

| 字段                                                       | 模型 | 导出 | GUI                                                                   |
| ---------------------------------------------------------- | ---- | ---- | --------------------------------------------------------------------- |
| `Name` / `Author` / `Version` / `Description` / `UniqueID` | ✓    | ✓    | ✓ 新建对话框 + 属性对话框 + 项目设置页（共用 `ManifestMetadataForm`） |
| `ContentPackFor.UniqueID`                                  | ✓    | ✓    | ✓ 高级折叠区（默认 `Pathoschild.ContentPatcher`）                     |
| `ContentPackFor.MinimumVersion`                            | ✓    | ✓    | ✓ 高级折叠区                                                          |
| `MinimumApiVersion`                                        | ✓    | ✓    | ✓ 高级折叠区                                                          |
| `UpdateKeys`                                               | ✓    | ✓    | ✓ 高级折叠区（每行一个，形状校验）                                    |
| `Dependencies`                                             | ✓    | ✓    | ✓ 依赖编辑器（手填 UniqueID/最低版本/必需）                           |

`CpMakerDraft.overlayTargets`（搁浅脚手架）已随本轮删除（前端模型 + Rust `CpMakerOverlayTarget` 系列），依赖直接写 `projectMetadata.dependencies`；旧草稿经 serde 默认值兼容。

### content.json 顶层

| 字段              | 模型         | 导出                               | GUI                                                                                                                                 |
| ----------------- | ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Format`          | 固定 `2.9.0` | ✓                                  | ✓ 项目设置页只读展示 + 说明                                                                                                         |
| `Changes`         | ✓            | ✓ 按 workspace 拆 `changes/*.json` | ✓ 各制作页（内容导向，patch 自动建/复用）+ 项目内容页权威列表                                                                       |
| `ConfigSchema`    | ✓            | ✓                                  | ✓ 项目设置页（`ConfigSchemaEditor`，`Default` / `AllowValues` / `AllowBlank` / `AllowMultiple` / `Description` / `Section` 全覆盖） |
| `DynamicTokens`   | ✓            | ✓                                  | ✓ 项目设置页（Name / Value 带令牌补全 / When 条件编辑器）                                                                           |
| `CustomLocations` | ✓            | ✓                                  | ✓ 项目设置页（Name / FromMapFile / MigrateLegacyNames）                                                                             |
| `AliasTokenNames` | ✓            | ✓                                  | ✓ 项目设置页（别名 → 目标令牌，目标存在性校验）                                                                                     |

### Change 通用字段（PatchConfig）

| 字段                                         | 导出 | GUI                                                                    |
| -------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `Action` / `Target` / `LogName` / `FromFile` | ✓    | ✓ 编辑器头部 / 补丁设置对话框（LogName）                               |
| `Enabled`（布尔或 token 字符串）             | ✓    | ✓ 补丁设置对话框常用区                                                 |
| `When`                                       | ✓    | ✓ 条件编辑器（token 目录补全 + 输入参数 + 值域建议 + 未知 token 提示） |
| `Update`                                     | ✓    | ✓ 三选一下拉（高级折叠区）                                             |
| `Priority`                                   | ✓    | ✓ 按 action 切换候选（高级折叠区）                                     |
| `TargetLocale`                               | ✓    | ✓ 高级折叠区                                                           |
| `LocalTokens`                                | ✓    | ✓ 键值行 + 值令牌补全（高级折叠区）                                    |
| `TargetField`                                | ✓    | ✓ 高级折叠区（`/` 分隔路径段）                                         |

### 按 Action 的专有字段

| Action      | 字段                                                                                                         | GUI                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `Load`      | `FromFile`                                                                                                   | ✓                                                                               |
| `EditImage` | `FromFile` / `FromArea` / `ToArea` / `PatchMode`                                                             | ✓ `ImagePatchEditor`                                                            |
| `EditMap`   | `FromFile` / `FromArea` / `ToArea` / `PatchMode` / `MapProperties` / `AddWarps` / `AddNpcWarps` / `MapTiles` | ✓ `MapPatchEditor`                                                              |
| `EditData`  | `Entries`                                                                                                    | ✓ 各结构化编辑器                                                                |
| `EditData`  | `Fields`                                                                                                     | ✓ 编辑器底部"高级操作"折叠区                                                    |
| `EditData`  | `MoveEntries`                                                                                                | ✓ 同上（BeforeId / AfterId / ToPosition 三选一）                                |
| `EditData`  | `TextOperations`                                                                                             | ✓ 同上（Append / Prepend / RemoveDelimited + Delimiter / Search / ReplaceMode） |
| `Include`   | `FromFile` / `LocalTokens`                                                                                   | ✓                                                                               |

### 校验与预检

- 项目级校验 `collectDraftIssues` 汇总：manifest（UniqueID 形状、semver、UpdateKeys 形状、依赖形状）、顶层三件套（动态令牌重名 / 撞内置或配置名、CustomLocations 缺 FromMapFile、别名指向不存在令牌）、patch 级（资产 schema、事件、缺 FromFile、Entries 与 Fields/TextOperations 重叠）。
- 仪表盘健康度接同一份 `collectDraftIssues` 计数。
- 导出对话框预检清单：错误阻断导出、警告放行。
- token 目录：`entities/content-patcher/model/tokens.ts`（CP 2.9 内置 70 token，含输入参数规则、值域、`When` 键注意事项），条件语法在 `entities/content-patcher/model/whenConditions.ts`。

## 2. 实施记录（原切片计划，均已完成）

- **切片 A · manifest 完整化**：`projectMetadata` 补 `contentPackForMinimumVersion`、`dependencies`（Rust 侧字段本已存在，serde 默认兼容旧草稿）；`overlayTargets` 删除；新建/属性对话框共用 `ManifestMetadataForm`；manifest 校验入 `collectDraftIssues`。
- **切片 B · content.json 顶层三件套**：`DynamicTokens` / `CustomLocations` / `AliasTokenNames` GUI 落在新的 `project-settings` 模块；`ConfigSchema` 从编辑模式对话框迁入同页；`Format` 只读展示。
- **切片 C · token 目录与条件编辑器**：`entities/content-patcher/` 建成（70 token 目录 + When 解析/序列化）；`WhenConditionEditor` 带补全与未知 token 提示；`TokenValueInput` 用于 LocalTokens / DynamicTokens 值。
- **切片 D · EditData 高级操作**：`Fields` / `MoveEntries` / `TextOperations` GUI 在编辑器底部折叠区；`TargetField` 入补丁设置对话框；与整条 `Entries` 覆盖的重叠给警告。
- **切片 E · 项目级校验与导出预检**：`collectDraftIssues` 汇总进仪表盘与 `ExportDialog` 预检（错误阻断、警告放行）。

### 同期完成的创建链路易用性改造

- 新建对话框 v2：内容模板（空白 / NPC / 物品 / 建筑 / 地图 / 事件 / 邮件），模板预建无歧义单例 patch 并落到对应制作页；UniqueID 由 作者.名称 自动派生（直接编辑优先）；高级字段全部收进折叠区。
- patch 自动化：`WORKSPACE_CONTENT_ENTRY` 声明各工作区内容入口——characters / buildings / items 单例 patch 自动 ensure 直达编辑器；map 为地图目标清单（原版地图 / 位置数据 / 新建地图）；events 保留事件卡片 hub（位置选择器自动建 patch）；`AddPatchDialog` 仅保留在 project-content 作为专家入口（架构测试锁定）。
- 角色 / 建筑 / 物品编辑器的贴图卡片自动 ensure 对应 `EditImage` / `Load` patch 并跳转图像编辑器。
- 渐进披露原语 `shared/ui/Disclosure.tsx`，应用于创建对话框、补丁设置对话框与高级操作区。

## 3. 验证约束

- 前端测试 `vp test run --configLoader runner`；`src/tests/unit/**` 只放纯逻辑 `.ts`。
- UI 变更用截图 / Playwright `getBoundingClientRect()` 证明，按 ≥1440 / ≥1680 验证；本轮的验证脚本是 `apps/desktop/scripts/verify-workbench-authoring.mjs` 与 `verify-workbench-project-flow.mjs`。
- 改 Rust 侧跑 `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`。
- 新增 host command 后跑 `vp run --filter @modforge/desktop gen:host-commands`（本轮未新增）。

## 4. 明确不在本方案范围

- 资产字段本身的编辑器覆盖（归 `workbench-authoring-rework.md`）。
- CP 的 `Action: Include` 之外的多文件组织策略；导出目录结构维持现状。
- 翻译页与 `i18n/*.json` 的编辑流程（已有 GUI）。
- 依赖编辑器的"从已装模组选择"picker（手填为完整功能；`scanModProjects` 接入选择器留作后续增强）。
