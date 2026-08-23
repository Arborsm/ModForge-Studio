# 交接：compat 插件 directory-pack 内容包聚合 + AT 编辑器去填表化

> 状态：进行中。工作区有大量未提交改动，**不要回滚、不要 commit**（用户明确要求）。
> 本文是交接快照；事实以代码为准。

## 目标

1. **内容包聚合（已完成主体）**：directory-pack 条目发现除目标模组自身目录外，还要扫描所有
   `ContentPackFor` 指向目标模组的已安装内容包（AT 纹理大多在内容包里，如
   `Mods/[AT] DustBeauty's Industrial Furniture/Textures/Anchor/texture.json`）。
2. **AT 编辑器去填表化（进行中）**：用户对跑起来的页面提了三点意见——
   - 条目列表要**按来源包分组**（"不分哪个项目吗"）；
   - 要有 **texture.png 预览**（用户选了"大图 + 列表缩略图"）；
   - **去除填表**：核心卖点是点选操作，不要一整面输入框。用户选了"扩展 schema 字段类型"方案，
     并确认 schema 骨架 + 定制字段渲染器可以组合（骨架通用，字段类型级 bespoke 控件，
     code-package 页面是全定制兜底）。

## 已定型的设计契约（不要推翻）

- **开关**：directory-pack params 新增 `includeContentPacks?: boolean`（AT manifest 已设 true）。
- **条目身份 = (sourceModRoot, entryId)**。`id` 只在单个模组目录内唯一。
  `CompatEntrySummary` 增加 `sourceModRoot` / `sourceModName`。选中态、读写、脏状态都按
  `compatEntryKey(entry)` 组合键。
- **聚合列出**：`scanDirectoryPackSourceRoots(targetUniqueIds)` =
  `detectDefaultGameDirectory` + `/Mods` + `scanModProjects`（有缓存）→
  `collectDirectoryPackSourceRoots`（目标模组在前，内容包按扫描序在后；目标模组没装 = 空列表，
  维持 no-mod 语义）。目标模组自身缺 `rootSubdir` 不报错（Rust list 对缺失目录返回空）。
- **读写路由**：entry 自带 `sourceModRoot` 直接路由；code-plugin 命令 `readModFile`/`writeModFile`
  的 `sourceModRoot` 参数必须过 `isPathWithinDirectory(modsPath, …)` 前缀校验，read 失败返回 null、
  write 显式拒绝（throw）；不传则回退目标模组 root（旧行为）。
- **归一化**：UniqueID 比较统一 `normalizeUniqueId`（trim + lowercase），路径比较分隔符/大小写归一。
- **game-item 字段类型**（新）：选中物品写内部 `Name` 到 `field.path`，声明了 `idPath` 时同时写
  未限定 id（如 AT 的 `ItemName` + `ItemId`）。物品目录来自 `loadResourceRegistry`（entities/game/api，
  带缓存、locale 感知），Rust 侧已给 item 条目补 `metadata.name`（内部名，label 只有 DisplayName）。
  注意：registry 目前只含原版物品，mod 物品（如 DustBeauty 的家具）不在目录里，picker 必须支持
  自由输入（combobox 形态），不要做成纯下拉。
- **section.collapsed**：schema 区段可加 `"collapsed": true`，默认折叠（AT 的 advanced 区段用）。
- **UI 约束**：扁平行内文本、走 tokens.css 变量、文案走 locales typed bundle（CompatModuleCopy），
  不加 chip/卡片/渐变。

## 已完成改动（未验证，先看 git status/diff 核对）

**Rust**（`apps/desktop/src-tauri/`）：

- `domain/modding/compat_plugin/types.rs`：`PageSourceParams`/`PageSourceParamsWire` 加
  `include_content_packs`；`PageFieldDecl`/`PageFieldWire` 加 `id_path`；`PageSectionDecl`/
  `PageSectionWire` 加 `collapsed`。
- `domain/modding/compat_plugin/summary.rs`：wire 透传上述三个字段。
- `domain/modding/compat_plugin/manifest.rs`：`VALID_FIELD_TYPES` 加 `game-item`；
  新增校验 `idPath` 只允许 `game-item` 类型。
- `domain/resource_registry/mod.rs`：item 条目 metadata 加 `name`（内部名）。
- 测试：`tests/unit/domain/modding/compat_plugin_tests.rs` 新增
  `build_summaries_forwards_include_content_packs_param`、
  `build_summaries_forwards_game_item_field_and_collapsed_section`、
  `rejects_id_path_on_non_game_item_field`；`tests/integration/resource_registry_tests.rs`
  补 metadata.name 断言。

**前端**（`apps/desktop/src/`）：

- `features/compat-plugins/api/types.ts`：params 加 `includeContentPacks`；`CompatPluginField.type`
  加 `'game-item'` + `idPath?`；`CompatPluginSection` 加 `collapsed?`。
- `features/compat-plugins/lib/resolveTargetModRoot.ts`：导出 `normalizeUniqueId` 和
  `ScannedProjectLike`（扩展 name/folderName/contentPackFor 可选字段）。
- `features/compat-plugins/lib/directoryPackSources.ts`（新）：`DirectoryPackSourceRoot`/
  `DirectoryPackEntry`、`directoryPackSourceName`、`collectContentPackRoots`、
  `collectDirectoryPackSourceRoots`、`scanDirectoryPackSourceRoots`、`listTaggedDirectoryPackEntries`、
  `listAggregatedDirectoryPackEntries`、`compatEntryKey`、`groupEntriesBySource`（本轮刚加）、
  `isPathWithinDirectory`。
- `features/compat-plugins/adapters/types.ts`：`CompatEntrySummary` 加来源字段；
  `CompatPageContext` 加 `targetModName?`/`targetUniqueIds?`；`loadEntry`/`saveEntry`
  签名从 entryId 改为整个 `CompatEntrySummary`。
- `features/compat-plugins/adapters/directoryPack.ts`：聚合列出 + 按 entry.sourceModRoot 读写。
- `features/compat-plugins/runtime/codePluginLoader.ts`：三个命令的聚合/校验/回退。
- `features/compat-plugins/runtime/CompatModuleRuntime.tsx`：选中态已改组合键
  （`selectedEntryKey` + `selectedEntry` derived），列表行已加来源 meta（多来源才显示），
  context 已传 `targetModName`/`targetUniqueIds`。**分组渲染、预览、collapsed、game-item
  还没接**。
- `styles/features/compat-plugins.css`：加了 `.compat-entry-list-item-meta`。

**SDK/docs**：

- `packages/plugin-sdk/src/index.ts`：新增 `PluginDirectoryEntry`（含来源字段说明）。
- `packages/plugin-sdk/DESIGN.md`：命令表加 `includeContentPacks?`/`sourceModRoot?` + 路由说明段。
- `docs/design/compat-plugin-system-landing.md`：params 示例、adapter 接口、CompatPageContext、
  段落说明均已同步。
- `apps/desktop/compat-plugins/peacefulend.alternative-textures/manifest.json`：
  params 已加 `"includeContentPacks": true`（game-item/collapsed 还没用上）。

## 剩余工作（按序做）

1. **前端纯逻辑 lib**：`lib/gameItemCatalog.ts`（新）——
   - `buildGameItemOptions(registryEntries)` 纯函数：筛 `kind === 'item'`，映射
     `{ id: metadata.id, qualifiedId: value, name: metadata.name ?? metadata.id, label, category }`；
   - `gameItemSelectionPatches(field, option)` 纯函数：产出 `{ [field.path]: name, [idPath]: id }`；
   - `loadGameItemCatalog()`：detectDefaultGameDirectory + loadResourceRegistry + 上面的 builder。
2. **runtime 组件**：
   - `runtime/CompatEntryImage.tsx`：缩略图/预览共用，IntersectionObserver 懒加载
     （`loadImageDataUrl(entry.entryImagePath)`，entities/game/api，池限 4 带缓存），
     `image-rendering: pixelated`。大图预览挂右侧面板顶部（选中条目有 entryImagePath 时）。
   - `runtime/CompatGameItemPicker.tsx`：combobox（文本输入 + 过滤下拉），自由输入直接写
     `field.path`；从目录选中走 `onChangePaths` 多路径写入。
   - `runtime/CompatFieldRenderer.tsx`：加 `game-item` case + 新 optional prop
     `onChangePaths?: (patches: Record<string, unknown>) => void`。
   - `runtime/CompatModuleRuntime.tsx`：
     - 列表用 `groupEntriesBySource(entries)` 分组渲染（组标题 = sourceModName，扁平文本样式）；
     - 每行加缩略图；右侧编辑器顶部加大图预览；
     - collapsed section 默认折叠（`<details>` 或自管 state，样式走 tokens）；
     - `handleFieldChange` 之外加 `handleChangePaths`（合并多个 path 写入 + setSaveState('idle')）。
3. **locales**：`locales/model/workbench/compat-module.ts` + zh-CN/en-US 两本
   `dictionaries/*/workbench/compat-module.ts` 补 picker/预览/折叠相关 copy（如
   `itemPickerPlaceholder`、`itemPickerNoResults`、`entryPreviewAlt` 等，按需）。
4. **AT manifest**：`itemName` 字段改 `"type": "game-item", "idPath": "ItemId"`；
   `itemId` 文本字段保留（手动覆盖入口）；`at.section.advanced` 加 `"collapsed": true`。
5. **测试**：
   - `src/tests/unit/features/compat-plugins/lib/directoryPackSources.test.ts`（新）：
     collectContentPackRoots 筛选/归一化/去重、collectDirectoryPackSourceRoots 目标缺失返回空、
     compatEntryKey 组合、groupEntriesBySource 顺序与分组、isPathWithinDirectory 前缀/分隔符/大小写。
     import 用 `vite-plus/test`（不是 vitest，lint 会拦）。
   - `gameItemCatalog` 的两个纯函数测试。
6. **docs**：landing 文档补 field 类型表（game-item + idPath）、section.collapsed、预览行为。

## 验证命令（全过才算完成）

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml compat_plugin
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml resource_registry
# 前端（裸 vp test 会挂起，必须 test run）
vp test run --configLoader runner src/tests/unit/features/compat-plugins
vp run lint -- --no-cache
vp run build
# 改动文件
vp fmt --check
```

wire 只加了 serde 字段、没动命令签名，不需要跑 `gen:host-commands`。

## 手动验证路径

`vp run dev` → 工具区打开 "Alternative Textures 兼容" 页 → 应看到按包分组的条目
（DustBeauty 包的 Anchor 等）、行内缩略图、选中后右侧顶部 texture.png 大图预览、
ItemName 变成可搜索的物品选择器（选中自动填 ItemId）、高级区段默认折叠。
