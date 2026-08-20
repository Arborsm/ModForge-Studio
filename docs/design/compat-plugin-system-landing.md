# 模组兼容插件系统：落地实施文档

配套文档：[compat-plugin-system.md](compat-plugin-system.md)（架构决策与方案论证）。本文档是可执行的实施规格：字段级契约、文件级改动清单、代码骨架、测试清单、验证命令。五个阶段（0–4）各自是可独立合并的纵切片。

文中所有路径相对仓库根目录；前端路径省略 `apps/desktop/src/` 前缀，后端路径省略 `apps/desktop/src-tauri/` 前缀。

## 0. 总览

```
阶段 0  后端 manifest 链路（ScaleUp 迁移，行为等价）     ── 纯后端，零前端改动
阶段 1  清单暴露 + registry 合并 + 插件 locale           ── 插件导航项可见
阶段 2  schema 渲染器 + AT 数据包                        ── 第一个真实可用插件页面
阶段 3  代码包机制（plugin:// + ESM + SDK）              ── 外部作者可写自定义页面
阶段 4  插件管理界面 + assetSchema/conditionSyntax       ── 生态闭环
```

阶段 0→1 串行；2 与 3 可并行；4 依赖 2、3。

---

## 阶段 0：后端 manifest 链路

**目标**：`AttachedApiRegistry` 的数据来源从硬编码 Rust descriptor 切换为磁盘 manifest 文件，全部现有行为不变。

### 0.1 manifest 完整字段规范（format 1）

```jsonc
{
  // ── 元信息（必填）──
  "format": 1, // manifest 格式版本；未知版本拒绝加载
  "id": "arborsm.scaleup-unofficial", // 插件 id，全小写点分，目录名必须与之相同
  "name": "ScaleUp (Unofficial) 兼容", // 展示名（插件管理界面用）

  // ── 代码包专用（本阶段不使用，校验器需识别）──
  "sdkVersion": "1", // 有 entry 时必填；无 entry 时禁止出现
  "entry": "index.js", // 相对插件目录的 ESM 入口；数据包禁止出现

  // ── 兼容锚点（必填，至少一个）──
  "targets": ["Arborsm.ScaleUpUnofficial"], // 模组 UniqueID 列表，声明"我兼容谁"

  // ── 贡献（至少一项非空）──
  "contributions": {
    "attachedApi": {
      // 阶段 0 唯一实现的贡献类型
      "providerUniqueId": "Arborsm.ScaleUpUnofficial",
      "providedUniqueIds": ["Platonymous.ScaleUp", "BleakCodex.SpritesInDetail"],
      "targets": [
        { "assetPath": "Assets", "assetKind": "json" },
        { "assetPath": "PreviewTexture", "assetKind": "image" },
      ],
    },
    // "pages": [...]          阶段 2
    // "capabilities": [...]   阶段 1（引用校验）
    // "assetSchemas": [...]   阶段 4
    // "conditionSyntax": [...] 阶段 4
  },
}
```

### 0.2 校验规则表

校验器在加载时对每个 manifest 独立执行；任一规则失败 → 该插件整体拒绝，错误进加载报告，**不影响其他插件**。

| #   | 规则                                                                                                                                                | 失败行为                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| V1  | `format` 为整数且 ∈ {1}                                                                                                                             | 拒绝，报"未知 manifest 版本"                    |
| V2  | `id` 匹配 `^[a-z0-9][a-z0-9.-]*$` 且与目录名一致                                                                                                    | 拒绝                                            |
| V3  | `targets` 非空，每个 UniqueID 非空白                                                                                                                | 拒绝                                            |
| V4  | `entry` 与 `sdkVersion` 必须同时出现/同时缺失                                                                                                       | 拒绝                                            |
| V5  | `entry` 指向的文件存在且扩展名为 `.js`                                                                                                              | 拒绝                                            |
| V6  | `contributions` 至少一个键非空；**有 `entry` 的代码包视为已满足**（页面由 `activate` 运行时注册，manifest 不重复声明 `pages`，否则前端双注册撞 id） | 拒绝                                            |
| V7  | `attachedApi.providerUniqueId` 非空；`assetKind` ∈ {json, image, map}（复用 `normalize_asset_kind`）                                                | 拒绝                                            |
| V8  | `capabilities` 引用的 id 在宿主 capability 表中存在                                                                                                 | 拒绝（阶段 1 起生效）                           |
| V9  | 未知顶层字段                                                                                                                                        | 警告不拒绝（对齐 SMAPI ExtraFields 的宽容策略） |

### 0.3 后端改动清单

**新增 `src/domain/modding/compat_plugin.rs`**：

```rust
//! Compat plugin manifest model and validation (format 1).

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginManifest {
    pub format: u32,
    pub id: String,
    pub name: String,
    pub sdk_version: Option<String>,
    pub entry: Option<String>,
    pub targets: Vec<String>,
    pub contributions: CompatPluginContributions,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginContributions {
    pub attached_api: Option<AttachedApiContribution>,
    // pages / capabilities / assetSchemas / conditionSyntax 后续阶段加入
}

// load_plugin_manifests(roots: &[PathBuf]) -> PluginLoadReport
//   逐目录扫描 */manifest.json → 解析 → 校验 → 成功进 manifests、失败进 errors
//   跨根去重：同一 id 出现在多个根（内置同步会把插件复制进数据目录，而 dev
//   源码树也在扫描）时按根优先级取第一个，其余记 compatPlugin.duplicateId 警告
```

**修改 `src/domain/content_patcher/attached.rs`**：

```rust
pub(crate) fn load_attached_api_registry(
    plugin_root_override: Option<&str>,
) -> AttachedApiRegistry {
    let report = domain::modding::compat_plugin::load_plugin_manifests(&resolve_plugin_roots(plugin_root_override));
    // attached_api 贡献 → AttachedApiDescriptor → from_descriptors 聚合
    // report.errors 写入日志（support/logging），本阶段无前端可见性
}
```

**目录解析规则**（`resolve_plugin_roots`）：

| 场景                                | 根目录                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `plugin_root_override = Some(path)` | 仅该路径（测试与 dev 调试）                                                             |
| dev 构建                            | `<repo>/apps/desktop/compat-plugins/`                                                   |
| 打包产物                            | `<resource_dir>/compat-plugins/` + `<app_data_dir>/compat-plugins/`（用户目录，可为空） |

dev 路径的锚定机制：用编译期 `env!("CARGO_MANIFEST_DIR")`（指向 `apps/desktop/src-tauri`）向上拼 `../compat-plugins`，不依赖运行时 cwd——sidecar 模式下进程工作目录不可控。打包侧 `resource_dir` / `app_data_dir` 走 Tauri path API（Linux 由 sidecar 的启动参数传入，Electron main 只转发路径不掺策略）。

**资源打包**：`src-tauri/tauri.conf.json` 的 `bundle.resources` 由 `["target/release/gmcm-probe/*"]` 改为 `["target/release/gmcm-probe/*", "../compat-plugins/*"]`（以 conf 文件位置为基准的相对路径，以实际构建验证为准）。

**删除** `src/domain/content_patcher/attached/scaleup.rs`，`attached.rs` 移除 `mod scaleup;`。

### 0.4 阶段 0 测试清单

| 测试                  | 位置                                                   | 断言                                     |
| --------------------- | ------------------------------------------------------ | ---------------------------------------- |
| manifest 解析合法样例 | `src/tests/unit/domain/modding/compat_plugin_tests.rs` | 9 条校验规则各一组正反样例               |
| 坏文件隔离            | 同上                                                   | 目录中一坏一好 → 好的加载、坏的进 errors |
| attachedApi 等价      | `src/tests/integration/attached_api_tests.rs`          | 从 fixture 目录加载，断言全部保留原断言  |
| 现有回归              | `mods_tests.rs`、`assets_tests.rs`                     | 原样通过（行为等价证明）                 |

### 0.5 阶段 0 验证命令

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml compat_plugin
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml attached
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mods_tests
```

---

## 阶段 1：清单暴露 + registry 合并 + 插件 locale

**目标**：前端启动时拿到插件清单；manifest 声明的页面出现在工作台导航；插件文案有运行时 locale 通道。

### 1.1 后端：新 command

**新增 `src/domain/modding/commands.rs`**（domain 当前无 commands.rs，新建并父模块 `pub(crate) mod commands;` 接线）：

```rust
//! Host command bindings for the modding domain (compat plugin listing).

use crate::AppHandle;
use crate::domain;
use crate::domain::modding::compat_plugin::CompatPluginSummary;
use host_command_macros::host_command;

#[host_command(io)]
pub async fn list_compat_plugins(app: AppHandle) -> Result<Vec<CompatPluginSummary>, String> {
    domain::modding::compat_plugin::list_summaries()
}
```

`CompatPluginSummary`（wire 类型，`camelCase` serde）：`{ id, name, format, hasCodeEntry, targets, pageIds, i18n, loadError? }`。其中 `i18n: Partial<Record<LocaleCode, Record<string, string>>>` 内联返回插件 `i18n/<locale>.json` 的条目（1.6 的插件 locale store 以此为数源，避免阶段 1 依赖阶段 3 的 `plugin://` 协议）。清单在后端进程内缓存，`reload_compat_plugins`（阶段 4）出现前启动时加载一次。

之后必须运行 `vp run --filter @modforge/desktop gen:host-commands` 生成三份产物（前端 `HOST_COMMANDS`、lib.rs handler、sidecar arm）；`build.rs` 会兜底校验。

### 1.2 前端 feature 结构

```
features/compat-plugins/
├── index.ts                      # 公共出口（registration object + 类型）
├── api/
│   ├── listCompatPlugins.ts      # HostCommandClient 封装
│   └── types.ts                  # CompatPluginSummary 等 wire 类型
├── model/
│   ├── compatPluginStore.ts      # zustand：插件清单 + 加载状态
│   └── pluginLocaleStore.ts      # zustand：插件 locale bundles
└── lib/
    ├── buildCompatRegistrations.ts   # manifest → WorkbenchModuleRegistration[]
    └── resolveModuleLabel.ts         # label 解析链（内置 typed → 插件 lookup → key 回退）
```

**api 范式**（对齐 [cpMakerDesktopApi.ts](../../apps/desktop/src/features/cp-maker/api/cpMakerDesktopApi.ts)）：

```ts
/** Lists installed compat plugins with load errors; result cached for app lifetime. */
export function listCompatPlugins() {
  return readCached(compatPluginCache, 'default', () =>
    invokeDesktop<CompatPluginSummary[]>(HOST_COMMANDS.listCompatPlugins, undefined, { kind: 'latest' }),
  )
}
```

### 1.3 registry 契约改动

**`shared/contracts/registry.ts`**：

```ts
navigation: {
  section: WorkbenchNavigationSection
  order: number
  icon: WorkbenchNavigationIcon
  /** Built-in module label key; mutually exclusive with pluginLabel. */
  labelKey?: WorkbenchModuleLocaleKey
  /** Plugin-provided label, resolved through the plugin locale store. */
  pluginLabel?: { pluginId: string; key: string }
}
```

`labelKey` 从必填改可选会影响 25 处现有注册（[module-registrations.ts](../../apps/desktop/src/pages/workbench/module-registrations.ts)，与 `WorkbenchModuleLocaleKey` 联合的 25 个 key 一一对应）——**不改旧字段语义**，注册对象二选一由 `buildCompatRegistrations` 保证（插件模块只填 `pluginLabel`，内置模块只填 `labelKey`），`createAppRegistry` 的 `validateWorkbenchModules` 增加一条校验：两者必须恰好出现一个（现有校验已覆盖重复 id、未知 section、browser+write 拒绝，新增校验贴在同一处）。

### 1.4 bootstrap 合并点

[AppShell.tsx `importWorkbenchPage()`](../../apps/desktop/src/app/app-shell/AppShell.tsx#L86) 内，`import('@app/registry-setup')` 之后：

```ts
const plugins = await listCompatPluginsSafe() // 失败 → 空数组 + 诊断事件，不阻塞启动
const appRegistry = createAppRegistry({
  workbenchModules: [...registrySetupModule.staticWorkbenchModules, ...buildCompatRegistrations(plugins)],
})
```

`registry-setup.ts` 的 `appRegistry` 常量导出改为导出 `staticWorkbenchModules` 数组 + `appRegistry`（保留，供无插件场景/测试）。加载失败的降级路径：与今天行为完全一致（纯静态 registry）。

### 1.5 侧栏 label 解析

[WorkbenchSideNav.tsx:210](../../apps/desktop/src/widgets/workbench-shell/ui/WorkbenchSideNav.tsx#L210) 的 `navCopy.moduleLabels[labelKey]` 改为调用 `resolveModuleLabel(registration)`（来自 features/compat-plugins——widgets 组合 features 的 hook 是允许方向）。内置模块解析结果与今天逐字节一致。

### 1.6 插件 locale store

```ts
/** Plugin locale bundles; runtime-lookup escape hatch confined to compat-plugins. */
type PluginLocaleStore = {
  bundles: Record<string, Partial<Record<LocaleCode, Record<string, string>>>>
  registerBundle: (pluginId: string, locale: LocaleCode, entries: Record<string, string>) => void
}
```

`usePluginText(pluginId)` 返回 `(key) => bundle[key] ?? (dev ? console.warn : key)`。bundle 数据在 bootstrap 时经 `plugin://<id>/i18n/<locale>.json`（阶段 3 的协议之前，走 `list_compat_plugins` 内联返回 i18n 条目——避免阶段依赖倒置：**i18n 内容并入 list_compat_plugins 响应**）。

### 1.7 阶段 1 测试清单

| 测试                       | 类型         | 断言                                                                                                                              |
| -------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `buildCompatRegistrations` | unit         | id 前缀 `compat-`、section 白名单外值 clamp 到 `tools`、browser+write 被 registry 校验拒绝、重复 id 拒绝                          |
| `resolveModuleLabel`       | unit         | 内置 typed 路径、插件命中、缺失回退 key 原文                                                                                      |
| runtime locale 豁免        | architecture | 源码扫描：`usePluginText`/`pluginLocaleStore` 的 import 仅允许出现在 `features/compat-plugins/**` 与 `widgets/workbench-shell/**` |
| 现有 architecture 测试     | architecture | 全绿（contracts 改动不破坏依赖方向）                                                                                              |

---

## 阶段 2：schema 渲染器 + AT 数据包

**目标**：Alternative Textures 兼容页真实可用——浏览内容包、编辑 texture.json 字段、保存。

### 2.1 page descriptor 完整规范

manifest `contributions.pages[]` 的元素：

```jsonc
{
  "id": "at-texture-editor",
  "navigation": { "section": "tools", "order": 900, "icon": "images" },
  "titleKey": "at.page.title", // 插件 locale key
  "presentation": "standalone",
  "projectAccess": "read",
  "source": {
    "kind": "directory-pack",
    "params": {
      "entryFile": "texture.json", // 每个条目目录的入口文件
      "entryImage": "texture.png", // 可选配图
      "rootSubdir": "Textures", // 包内条目根目录
    },
  },
  "layout": "two-column", // two-column | single
  "sections": [
    {
      "titleKey": "at.section.identity",
      "fields": [
        { "id": "itemName", "path": "ItemName", "type": "text", "labelKey": "at.field.itemName", "required": true },
        {
          "id": "type",
          "path": "Type",
          "type": "choice",
          "allowValues": ["Crop", "Craftable", "Building", "FruitTree", "Grass"],
          "labelKey": "at.field.type",
          "required": true,
        },
        {
          "id": "variations",
          "path": "Variations",
          "type": "number",
          "min": 1,
          "max": 64,
          "interval": 1,
          "labelKey": "at.field.variations",
        },
        {
          "id": "enableWinter",
          "path": "Seasons",
          "type": "bool",
          "labelKey": "at.field.enableWinter",
          "visibleWhen": { "kind": "field-eq", "field": "type", "value": "Crop" },
        },
      ],
    },
  ],
}
```

**field 类型**（基础六种对齐 GMCM option 类型）：`bool | number | text | choice | keybind | keybind-list`。
**集合/嵌套类型**（超出 GMCM，JA/AT 的真实格式需要，见附录 A 核对）：`string-list`（字符串数组，如 JA `PurchaseRequirements`）、`record-list`（对象数组 + 子 schema，如 JA `Recipe.Ingredients`、AT `ManualVariations`）、`object`（嵌套对象 + 子字段，如 AT `Animation`）。
**校验声明**：`required`、`min`/`max`/`interval`、`allowValues`、`validate[]`（`range` / `pattern` / `cross-field`）。
**条件显隐**：`visibleWhen`（`field-eq` / `field-in`），渲染器实时求值。

### 2.2 控件映射表（全部复用现有组件，零新样式）

| field type           | 组件                                                                                                                                                                                                                  | 来源             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| bool                 | 现有开关控件                                                                                                                                                                                                          | 工作台设置页同款 |
| number（有 min/max） | slider / 数字输入                                                                                                                                                                                                     | 现有表单控件     |
| text                 | 文本输入                                                                                                                                                                                                              | 现有表单控件     |
| choice               | [CompactSelect.tsx](../../apps/desktop/src/shared/ui/CompactSelect.tsx)                                                                                                                                               | shared/ui        |
| 页面骨架             | [WorkspaceSplitView.tsx](../../apps/desktop/src/shared/ui/WorkspaceSplitView.tsx) + [PanelFrame](../../apps/desktop/src/shared/ui/PanelFrame.tsx) / [PanelSection](../../apps/desktop/src/shared/ui/PanelSection.tsx) | shared/ui        |
| 空态/错误态          | [EmptyStateCard.tsx](../../apps/desktop/src/shared/ui/EmptyStateCard.tsx)                                                                                                                                             | shared/ui        |
| 图片预览             | 现有 asset 预览组件（entities/map 或 resource-browser 复用）                                                                                                                                                          | entities         |

### 2.3 source adapter 接口

```ts
/** Reads and writes pack entries for a declared source kind. Implementations are core code. */
interface CompatSourceAdapter {
  listEntries(source: CompatSourceDecl, context: CompatPageContext): Promise<CompatEntrySummary[]>
  loadEntry(source: CompatSourceDecl, entryId: string): Promise<Record<string, unknown>>
  saveEntry(source: CompatSourceDecl, entryId: string, value: Record<string, unknown>): Promise<void>
}
```

`CompatPageContext`（v1 语义，字段 additive only）：

```ts
type CompatPageContext = {
  /** 兼容锚点模组的 UniqueID（manifest targets[0] 或页面级覆盖）。 */
  targetModUniqueId: string
  /** 该模组的已安装根目录，由后端按 UniqueID 从 Mods 目录解析；未安装时页面进空态。 */
  targetModRoot: string | null
  /** 当前活动项目根目录；projectAccess 为 none 时恒为 null。 */
  projectRoot: string | null
}
```

即：`directory-pack` 默认读写**已安装锚点模组**的目录（AT 的 `Textures/`、JA 的 `Objects/` 都住在游戏 Mods 文件夹下），不依赖打开项目；`projectAccess: "read"` 仅用于页面内引用项目资产（如迁移目标）。

v1 只实现 `directory-pack`；`mod-config`、`cp-assets` 留接口不实现（出现真实消费者再补）。读写走现有 Io/Mutation command（`scan_mod_asset_index` / 项目资产读写族），不新增后端 command。

### 2.4 AT 插件包内容

`compat-plugins/peacefulend.alternative-textures/`：`manifest.json`（page descriptor 按 2.1）+ `i18n/zh-CN.json`、`i18n/en-US.json`。这是第一个"真实插件"，同时充当 manifest schema 的表达力验证——**如果 AT 的 texture.json 有字段表达不了，回头修 schema，不是绕过**。

### 2.5 阶段 2 测试与验证

- 单元：`CompatModuleRuntime` 的字段映射与求值逻辑（`visibleWhen`、validate、默认值填充）——纯逻辑 `.ts`，不渲染组件
- 单元：`directoryPack` adapter 的数据变换
- Playwright：新增 `apps/desktop/scripts/verify-compat-plugin-page.mjs`（mock launcher + settings），断言导航项出现、页面打开、字段渲染、校验错误态；截图归档
- `vp run lint`、`vp run build`、受影响 vitest

---

## 阶段 3：代码包机制（ESM + SDK）

**目标**：外部作者分发的代码插件可加载、可渲染自定义页面、能力与风险被 SDK 面收敛。

### 3.1 `plugin://` 自定义协议

双宿主都要实现，语义保持一致：

| 宿主                   | 实现                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri（macOS/Windows） | `register_uri_scheme_protocol("plugin", ...)`，映射到插件根目录                                                                                                                                                                                                                              |
| Electron（Linux）      | `protocol.registerSchemesAsPrivileged`（app ready 前注册，声明 `stream: true, supportFetchAPI: true, corsEnabled: true`）+ app ready 后 `protocol.handle("plugin", ...)`；路径解析委托 sidecar 的同一解析函数，Electron main 只做 transport（读文件流/转发字节），不掺安全策略判断之外的逻辑 |

两条宿主共用同一份路径安全规则（由后端 Rust 侧单处实现，Electron 经 sidecar 调用，避免双份实现漂移）：

| 规则         | 说明                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| 路径解析     | `plugin://<pluginId>/<relativePath>` → `<plugin_root>/<pluginId>/<relativePath>`               |
| 路径安全     | 规范化后必须以插件目录为前缀；`..` 逃逸、绝对路径、UNC 一律 404                                |
| 扩展名白名单 | `.js .json .png .jpg .webp .svg .css`；其余 404                                                |
| 响应头       | `.js` → `application/javascript`；设置 `Access-Control-Allow-Origin: *`（webview import 需要） |

### 3.2 React 单例：import map

宿主 bootstrap 在任何代码包加载前注入（`pluginImportMapHtmlPlugin`，见 `apps/desktop/vite.config.ts`）：

```html
<script type="importmap">
  {
    "imports": {
      "react": "./vendor/react.js",
      "react-dom": "./vendor/react-dom.js",
      "react/jsx-runtime": "./vendor/react-jsx-runtime.js",
      "@modforge/plugin-sdk": "./vendor/plugin-sdk.js"
    }
  }
</script>
```

`./vendor/*` 是宿主构建产物中的**固定文件名 facade 入口**（`rolldownOptions.input` + `entryFileNames: vendor/[name].js`）。两个实现要点（都是实测得出的硬约束，不要回退）：

- **不能指向内部 chunk**：`assets/react-vendor-*.js` 是 rolldown 模块注册表格式，没有 export 语句，import map 指过去会让插件 `import React from 'react'` 链接失败。facade 入口必须从宿主模块图 re-export，保证插件与宿主共享同一个 React 实例（否则 dual-React → invalid hook call）。
- **CJS 包需要显式具名 re-export**：react / react-dom / react-jsx-runtime 是 CJS，rolldown 无法静态枚举 `export *` 的名字；且 app 构建会 treeshake 入口导出。因此生产入口由 `pluginVendorFacadePlugin` 生成虚拟模块（构建时从已安装包读取导出名，React 升级自动跟随），并设 `preserveEntrySignatures: 'exports-only'`。dev 模式由 `pluginVendorDevMiddleware` 把 `/vendor/*.js` 302 到静态 `apps/desktop/vendor/*.ts`（dev 预打包产物本身是完整 ESM，`export *` 足够）。

**注入失败（webview 不支持 import map）→ 全部代码包拒绝加载**，数据包不受影响。WebView2（Chromium）与 WKWebView 16.4+ 均支持 import map；Linux webkitgtk 需要实测，不支持则该平台仅数据包。

### 3.3 Plugin SDK 契约

`packages/plugin-sdk/`（独立 npm 包，`@modforge/plugin-sdk`）：

```ts
export interface PluginContext {
  /** Registers a workbench page: declarative descriptor or own component. */
  registerPage(page: PluginPageContribution): void
  /** Design-system component subset (token-styled). */
  components: { CompactSelect; PanelFrame; PanelSection; EmptyStateCard /* ... */ }
  /** Allowlisted host commands; paths scoped to mod/project roots and the game directory. */
  commands: { invoke<T>(name: PluginCommandName, args?: unknown): Promise<T> }
  /** Built-in capability lookup by id. */
  capabilities: { get(id: string): unknown }
  /** Plugin locale lookup (bundle registered from manifest i18n). */
  i18n: { t(key: string): string }
  /** Host notification surface (ids namespaced per plugin, retracted on dispose). */
  notifications: PluginNotifications
  /** Registers cleanup run on plugin unload/reload. */
  onDispose(fn: () => void): void
}
export interface PluginModule {
  activate(ctx: PluginContext): void
}
```

semver 纪律：SDK 面只增不改；破坏性变更升主版本，宿主按 manifest `sdkVersion` 精确匹配主版本，不符拒绝加载。

`PluginCommandName` 是显式字符串联合，由宿主侧白名单表实现——**不是通用 invoke 透传**。当前白名单：

| 命令                                                | 说明                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `resolveTargetModRoot`                              | 按 UniqueID 解析已安装模组根目录                                                          |
| `listModDirectory` / `readModFile` / `writeModFile` | 目标模组目录包的列举/读/写（路径锁定在模组根内）                                          |
| `readPluginAsset`                                   | 读插件自身目录内的资源（`plugin://`）                                                     |
| `resolveGameRoot`                                   | 解析游戏安装目录（无则 null），结果按插件缓存                                             |
| `loadGameDataAsset`                                 | 按 CP 资产键读取游戏数据（`Data/Objects` → `Content/Data/Objects.xnb`，XNB 已解析为文本） |
| `loadGameImage`                                     | 解码 Content 下的贴图 XNB 为 PNG data URL（后端有磁盘缓存）                               |
| `scanGameAudio`                                     | 列出游戏音频 cue（music/sound 分类）                                                      |
| `loadGameAudioCue`                                  | 解码 XACT cue 为可播放 data URL                                                           |

`capabilities` 内置 id：`plugin.id`、`plugin.targets`、`host.sdkVersion`、`host.locale`。`notifications.publish` 的 id 自动以 `plugin:<pluginId>:` 为前缀，level 收敛到 success/info/warning/error，插件 dispose 时宿主统一撤回其全部通知。

### 3.4 加载器流程

```
bootstrap（import map 注入成功）
 └─ list_compat_plugins → 筛出 hasCodeEntry
 └─ for each: import(host 解析后的 plugin 资源 URL)
     ├─ sdkVersion 主版本不符 → 拒绝，进诊断
     ├─ import/activate 抛错 → 该插件禁用，其余继续
     └─ activate(ctx)：ctx.registerPage 产物经 buildCompatRegistrations 同款校验进 registry
reload：全部 onDispose → 清空插件注册 → 重新执行上述流程（整树重建，不做单插件热替换）
```

> 运行时重载的落地计划见 [compat-plugin-hot-reload.md](./compat-plugin-hot-reload.md)。

`plugin://` 的具体 URL 形态因宿主而异，前端**禁止手拼字符串**，一律走 `FileSystemPort.resolvePluginUrl`（Tauri Windows → `http://plugin.localhost/<id>/<path>`，Tauri macOS/Linux → `plugin://localhost/<id>/<path>`，Electron → `plugin://<id>/<path>`；与 Rust/Electron handler 的解析一一对应）。

### 3.5 CSP 的诚实评估

`tauri.conf.json` 当前 `"csp": null`（无 CSP），Electron 侧也未设置 session CSP。引入 `connect-src` 白名单会改变全应用网络行为，可能误伤 Nexus 封面图、SMAPI API、图片 CDN 等现有远程加载。**v1 不引入 CSP**（两个宿主都不动）；代码包信任模型按 VS Code 扩展式全信任处理并在插件管理界面明示（阶段 4）。CSP 收敛单独立项评估，不与本方案捆绑。

### 3.6 作者脚手架

`packages/plugin-sdk/template/`：`package.json`（esbuild，react/react-dom/SDK external）、示例 activate、示例页面组件、本地调试说明（把构建产物软链进 dev 插件目录）。

---

## 阶段 4：插件管理界面 + 扩展型贡献

- **插件管理页**（内置模块，`tools` section）：插件列表（数据包/代码包徽标）、加载错误详情、手动重载按钮、"打开插件目录"（走现有 open-path control command）
- **assetSchema 贡献**：CP 编辑器合并插件声明的资产字段元数据（SpaceCore 的 `spacechase0.SpaceCore/*` 资产字段认知）
- **conditionSyntax 贡献**：When/GSQ 编辑器条件 key 自动补全并入插件声明的 key 集（EPU）
- 回归门槛：`vp run --filter @modforge/desktop test` 全量 + `cargo test` 相关模块

---

## 5. 排期与优先级矩阵

各库的落地阶段、贡献类型、优先级与依赖关系。格式细节与字段覆盖核对见附录 A；本节关注“什么时候做、为什么这个顺序”。

| 库                   | 落地阶段 | 贡献类型                                | 优先级               | 前置依赖                            | 验收角色                 |
| -------------------- | -------- | --------------------------------------- | -------------------- | ----------------------------------- | ------------------------ |
| ScaleUp (Unofficial) | 0        | attachedApi + capability                | P0（机制验证）       | 无                                  | 阶段 0 行为等价证明      |
| Alternative Textures | 2        | page（directory-pack）                  | P1（第一个真实页面） | 阶段 0、1                           | 阶段 2 schema 表达力验收 |
| Json Assets          | 2+       | page（directory-pack + 迁移）           | P1（存量最大）       | 阶段 0、1；AT 先行验证 schema       | 集合/嵌套字段类型验证    |
| Custom Companions    | 2+       | page + capability（spritesheet-player） | P2                   | 阶段 2 schema 稳定                  | 动画预览 capability 验证 |
| Fashion Sense        | 3        | manifest + 代码包（画布页）             | P2                   | 阶段 0、1、3 机制就绪               | 阶段 3 代码包验收插件    |
| SpaceCore            | 4        | assetSchema                             | P3                   | 阶段 4 开工前 spike CP 编辑器消费点 | 扩展型贡献验证           |
| EPU                  | 4        | conditionSyntax                         | P3                   | 阶段 4                              | 数据量极小，并入自动补全 |

**排期原则**：

1. **先验证机制再上量**：ScaleUp（纯数据）→ AT（真实页面）→ JA（存量最大），每步只新增一类复杂度。
2. **schema 表达力先行**：AT 和 JA 都依赖集合/嵌套字段类型（`string-list` / `record-list` / `object`），这些类型在阶段 2 的 AT 页面中首次落地；JA 在同一阶段紧随其后，复用已验证的 schema。
3. **代码包机制不阻塞数据包**：阶段 3 与阶段 2 可并行——代码包机制（`plugin://` + SDK + import map）的基建与 schema 渲染器无文件级冲突，两人并行时阶段 3 的加载器/SDK/协议注册独立于阶段 2 的渲染器/adapter。
4. **扩展型贡献最后做**：assetSchema 和 conditionSyntax 需要修改现有 CP 编辑器和条件编辑器的消费点，属于侵入性改动，放在机制全部稳定后的阶段 4。

### 5.1 capability 表初始定义

capability 是核心代码中 `id → 纯函数/组件实现` 的显式映射。插件 manifest 以 id 引用，加载时校验 id 存在性（V8 规则）。v1 capability 表：

| capability id        | 实现来源                                                            | 消费者                                                  | 引入阶段 |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | -------- |
| `scaleup-frame-math` | 现 `pages/workbench/workspaces/mod/state/scaleup/scaleup.ts` 纯函数 | ScaleUp 插件 + character 工作区（薄转发保持现有导出面） | 0        |
| `spritesheet-player` | 新增核心组件：精灵表动画播放预览                                    | Custom Companions、Alternative Textures、Fashion Sense  | 2+       |
| `ja-to-cp-migration` | 新增核心转换逻辑：JA 对象 → CP 内容包                               | Json Assets 插件（迁移 action 管道触发）                | 2+       |

**纪律**：capability 必须服务 ≥2 个插件或明确是通用能力，不为单一插件写一次性 capability（那是代码包的信号）。新增 capability 需同步更新本表和后端校验器的 capability 白名单。

---

## 6. 验证门槛汇总

每阶段的“完成”定义：以下门槛全部通过才可合并该阶段切片并进入下一阶段。

| 阶段 | 门槛                                                                                    | 命令 / 验证方式                                                                                        |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0    | manifest 校验器 9 条规则正反样例全过；坏文件隔离；attachedApi 行为等价                  | `cargo fmt` → `cargo test ... compat_plugin` → `cargo test ... attached` → `cargo test ... mods_tests` |
| 1    | 插件导航项可见；label 解析内置模块逐字节一致；architecture 测试全绿                     | `vp test run --configLoader runner`（含新增 unit + architecture）→ `vp run lint` → `vp run build`      |
| 2    | AT 页面全程点选可用（浏览→编辑→保存）；schema 覆盖 AT 全部字段类型；Playwright 截图归档 | 单元测试 + `verify-compat-plugin-page.mjs` + `vp run lint && vp run build`                             |
| 3    | 示例代码包在 dev 环境完整走通安装→加载→渲染→重载；import map 缺失时整体拒绝代码包       | 手动验证 + loader 单元测试（sdkVersion 拒绝、onDispose 回收、import map 降级）                         |
| 4    | 全量前端测试 + 后端 cargo test 相关模块通过；插件管理页功能完整                         | `vp run --filter @modforge/desktop test` + `cargo test` 相关模块                                       |

**跨阶段不变式**（每阶段合并后都须成立）：

- `vp run lint` 零 error
- `vp run build` 成功
- `check:backend-architecture`（`--strict` 白名单不新增条目）
- 前端架构测试全绿（依赖方向、平台 API 泄漏、feature 横向依赖、locale 运行时豁免范围）
- 无新增 `TODO` / `FIXME` / 占位 UI / 假数据（完整性要求）

---

## 7. 阶段依赖与并行计划

### 7.1 依赖图

```
阶段 0（后端 manifest 链路）
  └─ 阶段 1（清单暴露 + registry 合并 + 插件 locale）
       ├─ 阶段 2（schema 渲染器 + AT 数据包）
       └─ 阶段 3（代码包机制：plugin:// + ESM + SDK）
            └─ 阶段 4（插件管理界面 + assetSchema / conditionSyntax）
```

### 7.2 串行/并行关系

| 关系         | 说明                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 → 1 串行   | 阶段 1 的 `list_compat_plugins` command 依赖阶段 0 的 manifest 加载链路；没有后端清单就没有前端合并                                                                                                                                                                                                                                                                                            |
| 1 → 2 串行   | 阶段 2 的 `CompatModuleRuntime` 需要阶段 1 的 registry 合并点和 plugin locale store                                                                                                                                                                                                                                                                                                            |
| 1 → 3 串行   | 阶段 3 的代码包加载器需要阶段 1 的 `list_compat_plugins` 筛选 `hasCodeEntry` 和 registry 合并点                                                                                                                                                                                                                                                                                                |
| 2 ∥ 3 可并行 | 阶段 2（schema 渲染器 + source adapter + AT 数据包）与阶段 3（`plugin://` 协议双宿主实现 + SDK + import map + 加载器）无文件级冲突：阶段 2 改 `features/compat-plugins/runtime/` 下的渲染器和 adapter，阶段 3 改 Tauri 协议注册、`electron/main.ts` 的 protocol transport、`packages/plugin-sdk/`、`features/compat-plugins/runtime/codePluginLoader.ts`。两人并行时各自独立分支，合并时无冲突 |
| 2 ∧ 3 → 4    | 阶段 4 的插件管理页需要同时展示数据包（阶段 2 产物）和代码包（阶段 3 产物）；assetSchema/conditionSyntax 贡献的接入点在现有编辑器中，需要 schema 渲染器（阶段 2）和插件清单（阶段 1）都稳定                                                                                                                                                                                                    |

### 7.3 关键路径

```
阶段 0 → 阶段 1 → 阶段 2 → 阶段 4
```

阶段 3 不在关键路径上（与阶段 2 并行），但阶段 4 必须等阶段 3 完成。若阶段 3 延期，阶段 4 的插件管理页可先做数据包部分（代码包徽标/错误展示留占位逻辑——但占位必须有真实数据来源和完整错误态，不是空壳）。

### 7.4 阶段间契约稳定性

每阶段对外暴露的契约一旦发布，后续阶段不得破坏性修改（只允许加字段）：

| 阶段 | 对外契约                                                                                   | 稳定性保证                                                       |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 0    | manifest format 1 字段规范、`AttachedApiRegistry` 聚合结果                                 | format 版本递增策略；现有 descriptor 行为等价                    |
| 1    | `CompatPluginSummary` wire 类型、`WorkbenchModuleRegistration.navigation.pluginLabel` 字段 | wire 类型 additive only；pluginLabel 可选字段不破坏现有 labelKey |
| 2    | page descriptor 字段规范（2.1）、`CompatSourceAdapter` 接口                                | 字段类型 additive only；新 source kind 不破坏现有 kind           |
| 3    | `PluginContext` / `PluginModule` SDK 面、`plugin://` 协议                                  | SDK semver 纪律：破坏性变更升主版本，宿主按 sdkVersion 拒绝不符  |

---

## 8. 跨阶段风险与回退

| 风险                                       | 阶段 | 缓解 / 回退                                                           |
| ------------------------------------------ | ---- | --------------------------------------------------------------------- |
| 打包后 resource 路径解析错误               | 0    | dev/打包双路径都有测试 fixture；打包验证进 release checklist          |
| `labelKey` 可选化影响现有注册              | 1    | `validateWorkbenchModules` 新增"二选一"校验；现有 25 个模块的测试锁定 |
| import map 在某平台不可用                  | 3    | 注入失败整体拒绝代码包、数据包不受影响；Linux webkitgtk 实测先行      |
| React 双实例                               | 3    | import map 单例是唯一通道；脚手架构建配置 external 化默认正确         |
| 代码包任意 JS 风险                         | 3    | SDK 白名单命令面 + 管理界面明示信任模型；CSP 单独立项                 |
| schema 表达力不足（AT 页面有字段表达不了） | 2    | 修 schema 而不是绕过；表达力验证是阶段 2 的验收标准之一               |

## 9. 明确不做（本方案范围内）

- 运行中单插件热增删（只有整树手动重载）
- 插件修改已有核心页面（需要时走核心页面显式插槽，单独立项）
- 后端插件代码加载（dylib/WASM）
- 插件市场/索引服务（v1 分发靠用户手动放目录；索引是独立产品决策）
- mod-provided token 贡献类型（CP `DynamicTokens` 引用外部库提供的 token 时，宿主当前只能标 indeterminate、回退游戏基础资产——例如 Dynamic Windows 的 `Esoterick.DynamicWindows/SelectedSunroomPack`）。这是后续候选贡献类型，需要 CP apply 管线的 token 解析点支持插件注入，单独立项

## 附录 A：示例库逐字段覆盖核对

用调查得到的各库真实格式逐字段核对 schema 表达力。格式细节来自官方文档（见各库调研来源），实施时以真实包文件二次核对为准。

### A.1 ScaleUp（Unofficial）— ✅ 已覆盖

attachedApi 贡献是纯数据（provider + provided ids + 两个资产目标），帧数学是 capability。阶段 0 的迁移本身就是覆盖证明。

### A.2 Json Assets — ✅ 覆盖，依赖集合类型

以 `Objects/<item>.json` 为例逐字段：

| JA 字段                                         | 类型                | 表达                                                                        |
| ----------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `Name` / `Description` / `EnableWithMod`        | 文本                | `text` ✅                                                                   |
| `Price` / `PurchasePrice` / `Edibility` 等      | 数值                | `number` ✅                                                                 |
| `CanPurchase` 等                                | 布尔                | `bool` ✅                                                                   |
| `PurchaseRequirements`                          | 字符串数组          | `string-list` ⚠️ 集合类型（已补入 schema）                                  |
| `Recipe`（含 `Ingredients: [{Object, Count}]`） | 嵌套对象 + 对象数组 | `object` + `record-list` ⚠️ 集合类型（已补入）                              |
| 配套 `<item>.png`                               | 图片绑定            | `entryImage` 声明 + 图片预览 ✅（替换/裁剪经 SheetRegionPicker 类现有组件） |

JA 的主要价值在**迁移页**：JA→CP 的转换逻辑是真实代码，走 capability（`ja-to-cp-migration`）+ manifest 声明的 action 管道触发，不是页面字段问题。

### A.3 Alternative Textures — ✅ 覆盖，依赖集合类型

`texture.json` 逐字段：

| AT 字段                                                                   | 类型             | 表达                                                   |
| ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| `ItemName` / `ItemId` / `CollectiveNames` / `CollectiveIds`（四选一必填） | 文本或字符串数组 | `text` / `string-list` + cross-field 校验"至少其一" ✅ |
| `Type`                                                                    | 枚举             | `choice`（Crop/Craftable/Building/…） ✅               |
| `TextureWidth` / `TextureHeight` / `Variations` / `ChanceWeight`          | 数值             | `number` ✅                                            |
| `Seasons`                                                                 | 字符串数组       | `string-list` ✅                                       |
| `ManualVariations`（含 Keywords/ChanceWeight）                            | 对象数组         | `record-list` ⚠️（已补入）                             |
| `Animation` / `Tints`                                                     | 嵌套对象         | `object` ⚠️（已补入）                                  |
| `texture.png` / `texture_N.png`                                           | 图片             | `entryImage` ✅                                        |

AT 是阶段 2 的验收插件：这组字段全表达出来才算 schema v1 合格。

### A.4 Custom Companions — ✅ 基本覆盖，预览依赖 capability

`companion.json`：`Type`（choice）、`FrameSizeWidth/Height`（number）、`TileSheetPath`（text）、`UniformAnimation`（object）、`ManualFrames`（number 数组，可并入 record-list 退化形态）。**动画预览**需要 `spritesheet-player` capability（核心组件，通用性成立：FS/CC/AT 的动画预览都能用）。

### A.5 Fashion Sense — ⚠️ 纯 manifest 不够，走代码包

`hair.json` 的四个朝向 HairModel 各含 `StartingPosition`/`HeadPosition`/`HairSize` 像素坐标——表单能填数字但**不可用**，核心价值在画布上拖框定位。这是第三层（外部代码包）的标定用户：画布是插件自己的 React 代码，SDK 提供面板/组件/命令白名单。结论：FS 插件 = manifest（锚点 + i18n + 导航）+ `index.js`（画布页）。**它同时是阶段 3 的验收插件。**

### A.6 SpaceCore — ⚠️ 机制存在，集成点未验证

SpaceCore 无独立包格式，贡献类型是 assetSchema（把 `spacechase0.SpaceCore/*` 资产的字段元数据并入 CP 编辑器）。机制在方案里，但 **CP 编辑器当前是否有可注入字段元数据的消费点未验证**——阶段 4 开工前先花一个 spike 确认，没有消费点就先补消费点再接插件。

### A.7 Expanded Preconditions Utility — ✅ 覆盖但价值低

conditionSyntax 贡献是纯 key 列表，并入条件自动补全。机制简单，但 EPU 是"被别的库消费的条件语法"，单独做页意义不大，按附录价值排最后。

### A.8 核对结论

| 库                   | 覆盖判定       | 依赖                                       |
| -------------------- | -------------- | ------------------------------------------ |
| ScaleUp              | ✅             | 阶段 0 即证明                              |
| Json Assets          | ✅             | 集合/嵌套字段类型（已补入 schema v1）      |
| Alternative Textures | ✅             | 同上；阶段 2 验收                          |
| Custom Companions    | ✅             | 集合类型 + `spritesheet-player` capability |
| Fashion Sense        | ✅（经代码包） | 阶段 3 机制；阶段 3 验收                   |
| SpaceCore            | ⚠️ 未验证      | 阶段 4 开工前 spike CP 编辑器消费点        |
| EPU                  | ✅             | 数据量极小                                 |

唯一在核对中发现并修复的 schema 缺口：**集合/嵌套字段类型**（`string-list` / `record-list` / `object`），JA 的 `Recipe.Ingredients` 和 AT 的 `ManualVariations` 都是硬需求，已补入 2.1 的字段模型。

---

## 10. 复审补缺计划

首次实施（commit `9fa0f8f9`–`4858a945`）后的逐项核验结论：阶段 0/1 完整，阶段 2 主体可用但有表达力与验证缺口，阶段 3 是空壳（协议仅 Tauri 侧、loader 未接线、SDK 面全占位），阶段 4 管理页在但扩展贡献无消费端。本节是补齐这些缺口的执行计划，分四批：A 批小修（独立可合）、B 批阶段 2 收尾、C 批阶段 3 重做、D 批阶段 4 收尾。A → B → C 串行，D 的 spike 可与 C 并行。

### 10.1 A 批：小修（无设计争议，直接做）

| #   | 问题                                                                                                                                  | 改动                                                                                                                                                    | 验证                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A1  | `registry-setup.test.ts` 模块矩阵快照漏 `plugin-manager`，vitest 红                                                                   | 已修（待提交）                                                                                                                                          | `vp exec vitest run --configLoader runner src/tests/unit/app/registry-setup.test.ts` |
| A2  | `CompatModuleRuntime` 框架文案硬编码 `at.*` 插件 key（save 按钮、空态、条目列表标题、加载态），第二个数据包插件会显示 AT 文案或裸 key | 框架文案（保存/空态/列表/未选择/错误）迁入宿主 typed locale bundle（model + zh-CN + en-US 三处同步）；`at.*` 只留 AT 插件自己的字段/区块文案在插件 i18n | `vp run lint` + 架构测试（locale 硬编码扫描）                                        |
| A3  | `CompatModuleRuntime` 手写 `useMemo`/`useCallback`（违反 React Compiler 规则）、本地重复实现 `cx`                                     | 删除手写 memo 化；`cx` 改用共享工具（与 WorkbenchSideNav 同源）                                                                                         | 架构测试全绿                                                                         |
| A4  | `reload_compat_plugins` 挂 `control` lane 但扫盘读文件                                                                                | 改 `#[host_command(io)]`，跑 `gen:host-commands` 重新生成                                                                                               | `cargo check` + build.rs 漂移校验                                                    |
| A5  | 代码包 sdkVersion 从 `module.sdkVersion` 读取，与文档"宿主按 manifest `sdkVersion` 匹配"不符                                          | wire 类型 `CompatPluginSummary` 增加 `sdkVersion`/`entry` 字段，loader 改从 manifest 校验                                                               | codePluginLoader 单测更新                                                            |

### 10.2 B 批：阶段 2 收尾（schema 表达力验收补完）

| #   | 问题                                                                                                                                                                   | 改动                                                                                                                                                          | 验证                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| B1  | AT manifest 未覆盖文档自定的验收矩阵：缺 `object`（Animation/Tints）、`bool` + `visibleWhen`、cross-field 校验（ItemName/ItemId/CollectiveNames/CollectiveIds 四选一） | 补全 AT manifest 字段与 i18n key；`schemaEvaluator` 若缺 cross-field 求值则补实现                                                                             | schemaEvaluator 单测覆盖新增规则 |
| B2  | `verify-compat-plugin-page.mjs` 缺失，AT 页面无 UI 证据                                                                                                                | 新增 Playwright 脚本（mock launcher + settings，fixture 一个含 Textures/ 条目的假 AT 包），断言导航项出现、页面打开、字段渲染、校验错误态、保存回写；截图归档 | 脚本本地跑通，截图入档           |
| B3  | 加载态误用空态文案（`at.empty.*` 同时充当中 loading）                                                                                                                  | 随 A2 一并迁宿主 locale，loading 用真实加载文案                                                                                                               | B2 脚本断言加载态                |

### 10.3 C 批：阶段 3 重做（代码包机制真实化）

现状：Tauri 侧 `plugin://` 协议已注册且路径安全有测试（保留），其余全部要补。

| #   | 事项                 | 改动要点                                                                                                                                                                                                                                                                                                                            | 验证                                                                                  |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| C1  | vendor facade 入口   | vite `rolldownOptions.input` 为 `react`、`react-dom`、`react/jsx-runtime`、`@modforge/plugin-sdk` 注册固定文件名 facade 入口（`vendor/[name].js`；CJS 包用 `pluginVendorFacadePlugin` 生成的显式具名 re-export 虚拟模块 + `preserveEntrySignatures: 'exports-only'`，dev 由 `pluginVendorDevMiddleware` 服务；机制与硬约束见 §3.2） | 构建产物 `dist/vendor/*.js` 含真实 ESM 导出；浏览器 `import('react')` 命中 import map |
| C2  | import map 注入      | `index.html` 注入 importmap；宿主 bootstrap 探测注入失败（webview 不支持）→ 整体拒绝代码包、数据包不受影响；Linux webkitgtk 实测记录结论                                                                                                                                                                                            | 手动验证 + loader 单测（降级路径）                                                    |
| C3  | Electron `plugin://` | `registerSchemesAsPrivileged`（app ready 前，`stream/supportFetchAPI/corsEnabled`）+ `protocol.handle`；路径解析经 sidecar 复用 Rust `resolve_plugin_protocol_path`，Electron main 只做字节转发                                                                                                                                     | Linux 构建手动验证；路径安全用例复用 Rust 侧测试                                      |
| C4  | bootstrap 接线       | `importWorkbenchPage` 在 `listCompatPlugins` 后调用 `loadCodePlugins`，其 registrations 与数据包一起进 `createAppRegistry`；diagnostics 进插件管理页数据源                                                                                                                                                                          | 单元测试（mock import）+ 手动验证                                                     |
| C5  | SDK 面真实实现       | `components` 映射真实 shared/ui 组件；`commands` 白名单表（`readModFile`/`writeModFile`/`listModDirectory` 映射现有 host command，路径限 mod/project 根）；`capabilities.get` 接宿主 capability 表；`i18n.t` 接 pluginLocaleStore；`onDispose` 已在，补 reload 全流程（dispose → 清注册 → 重建）                                    | 每面至少一个单测；占位 throw 全部移除                                                 |
| C6  | 验收代码包           | `packages/plugin-sdk/template/` 出最小可用示例页（或直接做 FS 画布页雏形），走通 放置目录 → 加载 → 渲染 → 管理页重载 全流程                                                                                                                                                                                                         | 手动验证 + 截图                                                                       |

### 10.4 D 批：阶段 4 收尾（扩展贡献接消费端）

| #   | 事项                 | 改动要点                                                                                      | 验证                 |
| --- | -------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| D1  | SpaceCore spike      | 确认 CP 编辑器是否有字段元数据注入消费点；没有则先补消费点（这是附录 A.6 本就标注的前置动作） | spike 结论写入本文档 |
| D2  | assetSchema 消费     | CP 编辑器合并插件声明的资产字段元数据                                                         | 针对消费点的单元测试 |
| D3  | conditionSyntax 消费 | When/GSQ 编辑器条件 key 自动补全并入插件声明的 key 集                                         | 补全逻辑单元测试     |
| D4  | 管理页代码包列       | 代码包徽标、loadDiagnostics 展示依赖 C4/C5 落地                                               | C6 手动验证覆盖      |

### 10.5 补缺批次的合并门槛

- A 批：`vp run lint` 零 error + 受影响 vitest 全绿 + `cargo check`
- B 批：A 批门槛 + `verify-compat-plugin-page.mjs` 跑通且截图归档
- C 批：`vp run build` 产物含固定名 vendor chunk + loader/SDK 单测全绿 + 示例代码包三平台中至少 Windows（WebView2）全流程手动验证，Linux（webkitgtk import map 实测）记录结论
- D 批：消费点单元测试 + `vp run --filter @modforge/desktop test` 全量
- 每批收尾同步删除占位代码（C 批完成前 `codePluginLoader.ts` 的 stub 面是已知的唯一例外，合并 C 批时必须清零）
