# 模组兼容插件系统设计方案

> 实施规格（字段级契约、文件级改动清单、测试与验证命令）见配套文档 [compat-plugin-system-landing.md](compat-plugin-system-landing.md)。

面向"外部动态加载插件"的可行性方案：把第三方框架库（Json Assets、Alternative Textures、Fashion Sense 等）的兼容支持做成**外部分发、运行时加载的插件包**，不进主仓库、不随主仓 PR 流程。结论先行：**可行**。数据型插件（manifest）零代码加载；需要定制逻辑的插件走**外部 ESM 代码包 + 受控 SDK**——不复用主仓构建链，不污染主仓。

## 1. 现状盘点

### 1.1 ScaleUp 遗留兼容的结构

ScaleUp（`Arborsm.ScaleUpUnofficial`，提供 `Platonymous.ScaleUp` / `BleakCodex.SpritesInDetail` 兼容）是目前唯一的"模组兼容"实现，分两块：

- **后端**：`domain/content_patcher/attached/scaleup.rs` 返回一个纯数据的 `AttachedApiDescriptor`（provider UniqueID + 提供的 UniqueID 列表 + 资产目标列表），由 `attached.rs::load_attached_api_registry` 聚合成 `AttachedApiRegistry`，供 CP apply/assets 和 mods analysis/discovery 消费。**不含任何业务逻辑**。
- **前端**：`pages/workbench/workspaces/mod/state/scaleup/scaleup.ts` 是一组纯函数（帧布局/放大倍数推断），被 character 工作区复用（头像帧数计算）。

### 1.2 已有的动态加载伏笔

`attached.rs::load_attached_api_registry(_plugin_root_override: Option<&str>)` 已经预留了插件根目录参数但尚未使用——后端设计本来就预期从外部目录加载 descriptor。

### 1.3 前端 registry

`app/registry-setup.ts` 是静态组合点，所有工作台模块以 registration object 静态 import。这个形态本身就是"编译期插件树"，缺的只是运行时合并数据驱动注册的入口。

## 2. 核心架构：插件外部分发，按形态分两种包

### 2.1 两种插件包形态

|          | 数据包（manifest-only）                                                    | 代码包（manifest + ESM）                  |
| -------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| 内容     | manifest.json + i18n + schemas                                             | 同左 + 预编译 `index.js`（ESM）           |
| 能做什么 | 声明式页面、attachedApi、assetSchema、conditionSyntax、引用内置 capability | 同左 + 自定义页面组件与命令式逻辑         |
| 加载方式 | 后端扫描读 JSON                                                            | 同左 + 前端经自定义协议动态 `import()`    |
| 分发     | 独立仓库/帖子，丢进用户插件目录即用                                        | 同左                                      |
| 信任模型 | 纯数据，无执行面                                                           | 任意 JS——VS Code 扩展式全信任模型，见 3.5 |

后端仍然不加载插件代码（编译期 Rust 不动）；代码执行面只在前端 webview 内，通过受控 SDK 收敛。

### 2.2 插件包形态

一个插件 = 一个目录：

```
compat-plugins/spacechase0.jsonassets/
├── manifest.json        # 插件声明（见 2.3）
├── index.js             # 可选：预编译 ESM 入口（代码包才有）
├── i18n/
│   ├── zh-CN.json       # 插件自带文案
│   └── en-US.json
└── schemas/             # 可选：该库格式的字段 schema（供校验/表单生成）
    └── object-item.schema.json
```

加载时机：应用启动时由后端从两个位置扫描——`<安装资源>/compat-plugins/`（官方随包发布）和用户插件目录（社区包，外部独立分发，**不进主仓库**）。单插件损坏不拖垮启动，进诊断面板。**v1 不做运行中热增删**；用户目录变更后手动重载。

### 2.3 manifest 的贡献类型（contribution kinds）

对齐 dsh 的"goal → mechanism"思路，插件 manifest 声明它提供哪几类贡献：

```jsonc
{
  "format": 1, // manifest 版本（对齐 CP 的 Format 思路）
  "id": "modforge.compat.json-assets",
  "name": "Json Assets 兼容",
  "sdkVersion": "1", // 代码包必填：编译时使用的 SDK 主版本
  "entry": "index.js", // 代码包必填：ESM 入口（数据包无此字段）
  "targets": ["spacechase0.JsonAssets"], // 兼容的模组 UniqueID 锚点
  "contributions": {
    // ① attachedApi：后端资产目标声明（ScaleUp 现状的直接数据化）
    "attachedApi": {
      "providerUniqueId": "spacechase0.JsonAssets",
      "providedUniqueIds": [],
      "targets": [{ "assetPath": "Objects", "assetKind": "json" }],
    },
    // ② page：schema 驱动的兼容页（表单/列表 UI 描述）
    "pages": [
      {
        "id": "ja-item-browser",
        "titleKey": "page.jaItemBrowser.title",
        "source": { "kind": "directory-pack", "layout": "by-type-directories" },
        "fields": [
          /* 对齐 GMCM option 类型 + CP ConfigSchema 字段模型 */
        ],
      },
    ],
    // ③ capability：引用内置纯逻辑能力
    "capabilities": ["scaleup-frame-math"],
    // ④ assetSchema：扩展 CP 编辑器对某资产命名空间的字段认知（SpaceCore 用）
    "assetSchemas": [{ "assetPrefix": "spacechase0.SpaceCore/", "schemaRef": "schemas/crop-ext.json" }],
    // ⑤ conditionSyntax：扩展 When/GSQ 条件自动补全（EPU 用）
    "conditionSyntax": [{ "prefix": "Cherry.ExpandedPreconditionsUtility", "keys": ["HasMod", "NPCAt"] }],
  },
}
```

五种贡献类型覆盖调查结果中的全部库，不需要第六种机制。

## 3. 需要的 API 调整

### 3.1 后端

| 调整                                                                | 说明                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `AttachedApiDescriptor.provider_unique_id: &'static str` → `String` | 运行时反序列化数据不能用 'static 引用                                                         |
| `attached.rs` 启用 `_plugin_root_override`                          | 扫描插件目录，serde 加载 manifest，每个文件独立校验、失败隔离                                 |
| manifest 校验器                                                     | format 版本、UniqueID 格式、assetKind 枚举（复用 `normalize_asset_kind`）、schema 引用存在性  |
| 新增 host command `list_compat_plugins`（Io lane）                  | 前端 bootstrap 拉取已加载插件清单 + 加载错误                                                  |
| Tauri 自定义协议 `plugin://`                                        | 把插件目录映射进 webview 白名单，供前端动态 import 代码包入口——这是后端为插件做的唯一新增机制 |
| 新增 host command `reload_compat_plugins`（可选，v2）               | 用户目录插件变更后重载                                                                        |
| 回归测试                                                            | manifest 校验、normalize 规则、坏文件隔离、与内置 descriptor 合并去重                         |

### 3.2 前端

| 调整                    | 说明                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app 层 bootstrap 合并   | 启动时经 `list_compat_plugins` 拿到插件 manifest，在 app/registry 组合点把 manifest 驱动的模块合并进静态 registry。组合点仍在 app/ 层，不违反"feature 禁止运行时自注册"——注册动作由 app 统一执行                 |
| 通用 schema 渲染器      | manifest 的 `pages` 由核心渲染器消费：控件类型对齐 GMCM 六种 option（bool / number+min/max/interval / text / choice / keybind / keybind-list），字段模型抄 CP ConfigSchema（约束与 Section 布局分离）            |
| locale 运行时合并入口   | **这是与现有硬规则的唯一冲突点**：核心 bundle 保持编译期类型化不变；插件 key 走运行时 lookup + 缺失 fallback，需要在 locales provider 增加一个明确的合并 API，并在架构测试里限定"仅插件 key 允许走运行时 lookup" |
| capability 表           | `id → 纯函数实现` 的显式映射（如 `scaleup-frame-math` → 现 scaleup.ts 的函数），架构测试钉住"manifest 只能引用存在的 capability id"                                                                              |
| Plugin SDK + import map | `@modforge/plugin-sdk`（ctx 类型 + 组件子集）作为唯一公共面；bootstrap 注入 import map 共享 react/react-dom/SDK 单例                                                                                             |
| 代码包加载器            | `import('plugin://<id>/index.js')` → `activate(ctx)`，sdkVersion 校验、失败隔离、`onDispose` 回收                                                                                                                |
| 样式                    | schema 渲染器只用现有组件与 tokens，插件没有机会写样式，天然满足样式规则                                                                                                                                         |

### 3.2.1 前端工作量拆解：一次性基建 vs 每插件增量

前端承载了这个方案的绝大部分工作量，需要诚实地拆成两层：

**一次性基建（做一遍，所有插件共享）**：

| 基建项                       | 说明                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| schema 表单渲染器            | 六种 GMCM 对齐控件 + Section/Page 布局 + 校验态/空态/错误态，是最大的单件工作 |
| registry bootstrap 合并      | app 层启动时拉 manifest、合并注册、错误兜底                                   |
| locale 运行时合并 + 架构豁免 | provider 合并 API + 限定豁免范围的架构测试                                    |
| capability 表                | id → 实现的映射与校验                                                         |
| 插件诊断面                   | 加载失败/版本不符的可见性（复用现有诊断面板）                                 |

**每插件增量**：取决于该库需要多少"超出通用渲染器"的可视化能力。关键边界是：**manifest 只能表达表单/列表/预览类 UI；任何定制可视化都必须先成为核心 capability（核心代码），插件再以 id 引用**。所以"插件化"覆盖的是数据与常规 UI，真正的定制画布仍然随核心发版——这是有意的取舍，换来的是样式、i18n、架构护栏对插件全量生效。

| 库                   | 前端增量内容                                                               | 增量量级 |
| -------------------- | -------------------------------------------------------------------------- | -------- |
| ScaleUp              | 无新 UI（帧数学已存在，只挪为 capability）                                 | 几乎为零 |
| Json Assets          | 目录包浏览页 = 通用渲染器 + 目录布局 source adapter + 图片预览             | 小       |
| Alternative Textures | 通用渲染器 + 贴图变体列表 + 贴图预览                                       | 小~中    |
| Custom Companions    | 同 AT + 精灵表动画播放预览（可能需要一个 `spritesheet-player` capability） | 中       |
| Fashion Sense        | 像素坐标定位/帧布局校验画布（新 capability，定制画布）                     | 大       |
| SpaceCore            | CP 编辑器消费 assetSchema 贡献（字段元数据合并进现有编辑器）               | 中       |
| EPU                  | 条件 key 自动补全数据并入现有 When/GSQ 编辑器                              | 极小     |

### 3.3 不需要调整的

- Host command 协议、`gen:host-commands` 流程、lane/resource 语义——插件消费现有通用 command。
- Electron main / sidecar——不新增进程边界行为。

## 3.4 落地机制：manifest 如何变成一个真实页面

这一节把"注册新页面"从概念落到现有代码的具体接口上。读完 `app/registry.ts`、`shared/contracts/registry.ts`、`widgets/workbench-shell` 后，链路如下。

### 3.4.1 现有注册契约（真实形状）

`WorkbenchModuleRegistration`（[shared/contracts/registry.ts](../../apps/desktop/src/shared/contracts/registry.ts)）：

```ts
{
  id: string
  navigation: {
    ;(section, order, icon, labelKey)
  } // section/icon/labelKey 都是闭联合类型
  presentation: 'browser' | 'authoring' | 'standalone'
  projectAccess: 'none' | 'read' | 'write'
  createRuntime: () => LazyExoticComponent<ComponentType>
  persistenceKey: string
}
```

`createAppRegistry` 已有的校验（重复 id / 重复 persistenceKey / 未知 section / browser+write 禁止）**自动成为插件护栏**——插件生成的注册对象走同一条校验路径，不合格直接在启动时暴露，不需要另写校验器。

### 3.4.2 插件页面的注册流程（端到端）

```
启动
 └─ 后端扫描 compat-plugins/ → 校验 manifest → AttachedApiRegistry 合并 + 插件清单
 └─ 前端 bootstrap: list_compat_plugins → CompatPluginManifest[]
 └─ app/registry-setup.ts:
      workbenchModules = [...静态模块, ...manifests.flatMap(buildCompatRegistrations)]
 └─ createAppRegistry(...)   // 现有不变式校验对插件模块同样生效
 └─ workbench shell 按 moduleId createRuntime() 渲染
```

每个 page 贡献经工厂函数变成一个标准注册对象：

```ts
function compatPageRegistration(manifest, page): WorkbenchModuleRegistration {
  return {
    id: `compat-${manifest.id}-${page.id}`,        // 前缀防撞内置模块 id
    navigation: {
      section: page.navigation.section,             // 仅限现有五个 section（默认 tools）
      order: page.navigation.order,
      icon: page.navigation.icon,                   // 仅限 WorkbenchNavigationIcon 闭合集
      labelKey: /* 见 3.4.3 的 label 改造 */,
    },
    presentation: page.presentation ?? 'standalone',
    projectAccess: page.projectAccess ?? 'read',
    persistenceKey: `compat-${manifest.id}-${page.id}`,
    createRuntime: () => lazy(() =>
      Promise.resolve({ default: createCompatModuleRuntime(manifest, page) })),
  }
}
```

关键点：`createRuntime` 返回 `LazyExoticComponent`，但**不强制动态 import**——`lazy(() => Promise.resolve({ default }))` 完全合法。插件页面的 runtime 是通用 `CompatModuleRuntime` 闭包绑定该页的 descriptor，零代码加载，且保留 lazy 的失败重试语义。`projectAccess` 等不变式由现有 `validateWorkbenchModules` 兜底。

### 3.4.3 三个闭联合类型是真实的改造点

调查发现 UI 适配的具体卡点都是闭联合类型，插件进不去：

| 卡点                                                                                | 现状                                                                                                                                                                                     | 改造                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation.labelKey: WorkbenchModuleLocaleKey`                                     | 24 个内置模块 id 的闭联合；侧栏用 `navCopy.moduleLabels[labelKey]` 强类型取值（[WorkbenchSideNav.tsx:210](../../apps/desktop/src/widgets/workbench-shell/ui/WorkbenchSideNav.tsx#L210)） | 新增可选字段 `navigation.pluginLabel?: { pluginId, key }`；label 解析收敛为一个 resolver：内置模块走 typed bundle，插件模块走插件 locale 运行时 lookup。**不改** 现有联合，内置模块零影响 |
| `navigation.icon: WorkbenchNavigationIcon`                                          | 闭联合，侧栏 `ICONS[icon]` 映射                                                                                                                                                          | v1 插件只能复用现有图标（manifest 校验时拒绝未知值）；插件自带 SVG 留 v2                                                                                                                  |
| `NAVIGATION_SECTIONS`（[registry.ts:6](../../apps/desktop/src/app/registry.ts#L6)） | 固定五个 section                                                                                                                                                                         | 不扩展；插件页面进 `tools`（或后续视产品需要加 `compat` section，那是产品决策不是技术障碍）                                                                                               |

### 3.4.4 页面内部：schema 渲染器的数据流

`CompatModuleRuntime` 拿到 page descriptor 后的行为：

```
page descriptor
 ├─ source: 数据来源声明（kind + 参数）
 │    ├─ directory-pack   → JA/AT/FS/CC 的目录约定读取（核心 adapter，走现有 Io command）
 │    ├─ mod-config       → 读写某模组 config.json（核心 adapter）
 │    └─ cp-assets        → CP 资产认知（核心 adapter）
 ├─ layout: 页面骨架（two-column / single，复用 panel-surface 等现有样式原语）
 └─ sections[].fields[]: 字段描述 → 通用渲染器映射到现有控件组件
```

**source adapter 是核心代码，manifest 只能选 kind + 传参**——这是插件 UI 能力的真实边界：插件决定"展示哪个数据源的哪些字段、什么布局"，不决定"怎么读数据、怎么画控件"。字段控件全部复用现有组件与 tokens，插件没有样式入口，视觉与全产品自动一致。

### 3.4.5 插件 locale 的运行时合并

locales provider 增加一个明确的扩展入口：

```ts
registerPluginLocaleBundle(pluginId: string, locale: LocaleId, entries: Record<string, string>)
```

解析顺序：typed bundle（内置，编译期类型安全不变）→ 插件 bundle → 缺失时回退为 key 原文 + dev 环境 warning。架构测试新增扫描：生产源码禁止直接 import 运行时 lookup API，仅 compat runtime 目录豁免——防止这个豁免口被核心代码效仿。

### 3.4.6 自定义处理逻辑的三种承载方式

"没有样式入口"只约束视觉轴；**逻辑轴是开放的，但按定制程度分三层**，插件作者按需求落在哪层：

**第一层：声明式逻辑（manifest 内，零代码）**

CP 自己证明了声明式能覆盖多大地面——`When` 条件、token 替换、`TextOperations` 全是"逻辑"，但都是数据。我们的 manifest 提供同样的子集：

```jsonc
{
  "fields": [
    {
      "id": "price",
      "type": "number",
      "min": 0,
      "visibleWhen": { "kind": "field-eq", "field": "enabled", "value": true }, // 条件显隐
      "validate": [
        { "kind": "range", "min": 0, "max": 100000, "messageKey": "err.priceRange" },
        { "kind": "cross-field", "expr": "price <= budget", "messageKey": "err.overBudget" },
      ],
      "transform": { "kind": "round-to", "multiple": 10 }, // 写入前的值变换
    },
  ],
  "actions": [
    {
      // 多步操作声明为管道：读 → 校验 → 变换 → 写
      "id": "migrate",
      "steps": [
        { "kind": "read-directory", "layout": "by-type" },
        { "kind": "validate-schema", "schemaRef": "schemas/object-item.json" },
        { "kind": "write-cp-pack", "targetDir": "generated/" },
      ],
    },
  ],
}
```

条件显隐、字段校验、跨字段约束、值变换、读写管道——兼容页 80% 的"处理逻辑"在这个层级就能表达，且全部可静态校验。

**第二层：capability 引用（核心代码，插件按 id 调用）**

逻辑可以泛化成"某类模组都需要"时，沉为核心 capability：ScaleUp 帧数学、精灵表动画播放、贴图 diff 预览、JA→CP 迁移转换器。capability 是**有类型的核心函数/组件**，插件 manifest 声明引用并传参。这层的关键纪律：capability 必须服务 ≥2 个插件或明确是通用能力，不为单一插件写一次性 capability（那是第三层的信号）。

**第三层：外部代码包（ESM + SDK，不进主仓库）**

真正命令式的 UI 逻辑——Fashion Sense 的像素坐标画布、多步迁移向导的复杂状态机——由插件作者在自己仓库里写真实 React/TS，用 esbuild/rollup 编成单文件 ESM，随 manifest 一起分发。主仓库零 PR、零代码引入。加载机制：

1. **后端经 Tauri 自定义协议暴露插件目录**（`plugin://<pluginId>/index.js`），注册到 webview 的 asset protocol 白名单；这是后端为插件做的唯一一件事。
2. **前端动态 `import('plugin://...')`** 拿到入口模块，调用其默认导出 `activate(ctx)`。
3. **共享依赖经 import map 解决**：宿主在 bootstrap 注入 import map，把 `react` / `react-dom` / `@modforge/plugin-sdk` 映射到宿主实例的 URL；插件构建时把这些标为 external。**React 必须单例**——插件各自打包 React 会导致 hooks 崩溃，这是硬约束，SDK 模板构建配置里默认处理好。
4. **`ctx` 是插件能看到的全部世界**（Plugin SDK 面）：
   - `ctx.registerPage(descriptor | Component)`——声明式页面或自带组件，走与内置模块相同的 registry 校验；
   - `ctx.components`——设计系统组件子集（Panel、Form 控件、Dialog 入口等，全部 token 化）；
   - `ctx.commands.invoke(name, args)`——**白名单制**的 host command 子集（文件读写限定在模组/项目目录，不暴露任意路径）；
   - `ctx.capabilities.get(id)`——引用内置 capability；
   - `ctx.i18n.t(key)`——插件 locale 查询；
   - `ctx.onDispose(fn)`——注册清理，插件卸载/重载时统一回收。
5. **版本协商**：manifest `sdkVersion` 与宿主 SDK 主版本不一致 → 拒绝加载并进诊断面板，不猜测兼容。
6. **生命周期**：v1 启动加载 + 手动重载整树（停用全部插件 → 重新扫描 → 重建 registry），不做单插件热卸载。

插件作者侧的体验：`npm create modforge-plugin` 脚手架（含 SDK 类型、构建模板、本地调试说明），构建产物就是一个可分发目录。SDK 类型包是唯一需要主仓维护发布的公共面，保持小面 + semver 纪律。

**不做的**：插件直接访问 `@tauri-apps/api`、任意文件路径、网络请求旁路（网络能力若出现需求，经 SDK 加白名单命令，不开 `fetch` 自由面——webview 里插件代码理论上能 fetch，v1 通过 CSP `connect-src` 收敛到白名单域）。

三层的选择规则：**能用第一层就不用第二层，能用第二层就不用第三层**；第一层走官方渠道收录时按此判断形态是否合理（第三层包不进主仓、无需 PR，这条规则用于官方推荐形态的引导，而非准入门槛）。

## 4. ScaleUp 迁移为第一个插件（纵切验证）

ScaleUp 是最理想的首个迁移对象，因为它的兼容**已经是纯数据 + 纯逻辑**，迁移不改变任何行为：

1. 后端 `scaleup.rs` 的 descriptor 改写为 `compat-plugins/arborsm.scaleup-unofficial/manifest.json`，字段 1:1 映射（`Arborsm.ScaleUpUnofficial` → providerUniqueId；两个 provided ids；`Assets`=json、`PreviewTexture`=image）。
2. `attached.rs` 从插件目录加载该 manifest，与内置空表合并。
3. 前端 `scaleup.ts` 的纯函数挪为核心 capability（id `scaleup-frame-math`），`workspaces/mod/index.ts` 的导出面保持不变（薄转发），character 工作区无感知。
4. 验证标准：现有 `attached_api_tests.rs`、`assets_tests.rs`、`scaleup.test.ts`、`mods_tests.rs` 全部原样通过——证明迁移是行为等价变换。

## 5. 各库的可行性与排期映射

| 库                       | 贡献类型                         | 可行性             | 备注                                       |
| ------------------------ | -------------------------------- | ------------------ | ------------------------------------------ |
| **ScaleUp**              | attachedApi + capability         | 已验证（现状迁移） | 第一个做，纵切验证机制                     |
| **Json Assets**          | page（directory-pack 浏览/迁移） | 高                 | 存量最大，格式稳定；字段模型清晰           |
| **Alternative Textures** | page（生成/校验）                | 高                 | 活跃、1000+ 包，`texture.json` 字段明确    |
| **Custom Companions**    | page                             | 中                 | 同 AT 模式，存量较小                       |
| **Fashion Sense**        | page + capability（帧布局校验）  | 中                 | 需要像素坐标可视化能力，工作量最大         |
| **SpaceCore**            | assetSchema（不独立成页）        | 中                 | 是 CP 扩展，贡献进 CP 编辑器的资产字段认知 |
| **EPU**                  | conditionSyntax                  | 低                 | 并入条件自动补全即可                       |
| **DGA**                  | —                                | 不做               | 官方已废弃                                 |

建议顺序：ScaleUp（机制验证）→ JA 或 AT（第一个真实 page 贡献）→ 跑通后再评估 SpaceCore/EPU 的扩展型贡献。

## 6. 风险与边界

- **locale 类型安全**：插件 key 运行时 lookup 是刻意的规则豁免，必须有架构测试限定范围，防止生产代码效仿。
- **数据包的信任边界**：manifest 纯数据、无代码执行面，风险面是错误数据导致的 UI 异常，由校验器 + 失败隔离兜底。
- **代码包的信任模型**：外部 ESM = 任意 JS，采用 VS Code 扩展式全信任模型（用户显式安装即授权）。收敛措施：SDK `ctx` 是唯一入口（不暴露 `@tauri-apps/api`）、host command 白名单、文件路径限定模组/项目目录、CSP `connect-src` 白名单。要明确告知用户"安装代码插件 = 信任其作者"，并在插件管理界面区分数据包/代码包。
- **React 单例**：import map 是硬依赖，宿主注入失败时拒绝加载全部代码包（宁可全不可用，不可以用两份 React 半崩溃）。
- **SDK 版本兼容**：`sdkVersion` 主版本不一致拒绝加载；SDK 面保持小，破坏性变更升主版本，旧插件提示"需要更新"。
- **manifest 版本演进**：`format` 字段从 1 开始，破坏性变更递增，加载器拒绝未知版本而不是猜测解析。
- **不承诺的事情**：运行中单插件热增删、插件修改已有核心页面（后者若出现需求，走核心页面显式声明插槽，按页面逐个加，不是本方案范围）。

## 7. 落地实施计划

按可独立合并的纵切片分四个阶段，每阶段都能被真实使用、有明确验证门槛。

### 阶段 0：ScaleUp manifest 化（机制验证，纯后端）

目标：证明"后端兼容声明可以从插件目录加载"这条链路，行为与现状完全等价。

**改动清单**：

| 操作 | 文件                                                                   | 内容                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增 | `src-tauri/src/domain/modding/compat_plugin.rs`                        | `CompatPluginManifest` serde 类型（format/id/name/sdkVersion?/entry?/targets/contributions），校验函数（format 版本白名单、UniqueID 格式、assetKind 枚举复用 `normalize_asset_kind`、entry 存在性检查） |
| 新增 | `apps/desktop/compat-plugins/arborsm.scaleup-unofficial/manifest.json` | 现 `scaleup.rs` descriptor 的 1:1 数据化                                                                                                                                                                |
| 修改 | `src-tauri/src/domain/content_patcher/attached.rs`                     | 启用 `_plugin_root_override`：扫描插件根目录下所有 `*/manifest.json`，逐个解析+校验，失败隔离（记录错误继续），聚合 attachedApi 贡献进 registry                                                         |
| 修改 | `src-tauri/tauri.conf.json`                                            | `bundle.resources` 加入 `compat-plugins/`，打包时随资源分发；dev 模式解析仓库内路径                                                                                                                     |
| 删除 | `src-tauri/src/domain/content_patcher/attached/scaleup.rs`             | 被 manifest 取代（`attached.rs` 的 `mod scaleup` 一并删除）                                                                                                                                             |
| 新增 | `src-tauri/src/tests/unit/domain/modding/compat_plugin_tests.rs`       | manifest 校验：合法样例、坏 format、坏 UniqueID、坏 assetKind、缺失 entry                                                                                                                               |
| 修改 | `src-tauri/src/tests/integration/attached_api_tests.rs`                | 改为从 fixture 目录加载，断言与现断言一致                                                                                                                                                               |

**目录解析规则**：`plugin_root_override` 传入则用传入值（测试/dev）；否则按 `<resource_dir>/compat-plugins` + `<app_data_dir>/compat-plugins` 两个根扫描合并。

**验证**：`cargo fmt` → `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml attached` → `cargo test ... compat_plugin` → 现有 `mods_tests.rs`、`assets_tests.rs` 全绿（行为等价证明）。

### 阶段 1：插件清单暴露 + 前端 bootstrap 合并

目标：前端能拿到插件清单，manifest 驱动的导航项出现在工作台（页面内容可以是通用渲染器的占位骨架——但骨架必须真实可用：标题、空态、错误态完整，不是 TODO）。

**改动清单**：

| 操作 | 文件                                                           | 内容                                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增 | `src-tauri/src/domain/modding/commands.rs`                     | `#[host_command(lane = "io")] list_compat_plugins`：返回插件清单（id/name/version/贡献摘要/加载错误列表）。函数体只调 domain，签名即 payload                                                            |
| 运行 | `vp run --filter @modforge/desktop gen:host-commands`          | 生成前端 HOST_COMMANDS、lib.rs handler、sidecar arm                                                                                                                                                     |
| 新增 | `src/features/compat-plugins/`                                 | 新 feature：`api/listCompatPlugins.ts`（HostCommandClient，策略 `latest`）、`model/compatPluginStore.ts`（zustand）、`lib/buildCompatRegistrations.ts`（manifest → WorkbenchModuleRegistration[] 工厂） |
| 修改 | `src/app/registry-setup.ts` + `src/app/app-shell/AppShell.tsx` | `importWorkbenchPage()` 内：`list_compat_plugins` → `buildCompatRegistrations` → 与静态模块数组合并后 `createAppRegistry`。加载失败降级为纯静态 registry + 诊断事件                                     |
| 修改 | `src/shared/contracts/registry.ts`                             | `navigation` 增加可选 `pluginLabel?: { pluginId: string; key: string }`；JSDoc 说明内置模块必须用 `labelKey`                                                                                            |
| 修改 | `src/widgets/workbench-shell/ui/WorkbenchSideNav.tsx`          | label 解析收敛为 resolver：`pluginLabel` 存在 → 插件 locale lookup；否则走 `navCopy.moduleLabels[labelKey]` 不变                                                                                        |
| 新增 | `src/features/compat-plugins/model/pluginLocaleStore.ts`       | zustand store：`registerPluginLocaleBundle(pluginId, locale, entries)` + `usePluginText(pluginId)` hook；缺失 key 回退 key 原文 + dev warning                                                           |
| 新增 | `src/tests/unit/features/compat-plugins/`                      | 工厂函数测试（id 前缀、section 白名单 clamp、projectAccess 不变式）、label resolver 回退链                                                                                                              |
| 新增 | `src/tests/architecture/pluginRuntimeAccess.test.ts`           | 源码扫描：仅 `features/compat-plugins/**` 可 import plugin locale runtime lookup                                                                                                                        |

**验证**：`vp exec vitest run --configLoader runner` 跑新增测试 + 现有 registry/architecture 测试；`vp run lint`；`vp run build`。

### 阶段 2：schema 渲染器 + 第一个真实数据包页面

目标：Alternative Textures（活跃、格式明确）作为第一个真实 page 贡献，全程点选。

**改动清单**：

| 操作 | 文件                                                                      | 内容                                                                                                                              |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 新增 | `src/features/compat-plugins/runtime/CompatModuleRuntime.tsx`             | 通用页面运行时：消费 page descriptor → 两栏骨架（列表 + 详情表单），加载/空/错误态完整                                            |
| 新增 | `src/features/compat-plugins/runtime/fields/`                             | 六种字段控件映射（bool→开关、number+min/max→slider、text→输入框、choice→下拉、keybind→键位），全部复用 `shared/ui` 组件，无新样式 |
| 新增 | `src/features/compat-plugins/runtime/sources/directoryPack.ts`            | 第一个 source adapter：按目录约定读取内容包（走现有 Io command 列目录/读 JSON/读图片）                                            |
| 新增 | `compat-plugins/peacefulend.alternative-textures/manifest.json` + `i18n/` | AT 的 texture.json 字段模型 → page descriptor                                                                                     |
| 新增 | `src/tests/unit/features/compat-plugins/runtime/`                         | 字段渲染映射、source adapter 数据变换（纯逻辑，不渲染组件）                                                                       |
| 新增 | `apps/desktop/scripts/verify-compat-plugin-page.mjs`                      | Playwright：mock 环境挂载 → 打开 AT 兼容页 → 列表/表单/校验态截图断言                                                             |

**验证**：单元测试 + Playwright 脚本 + `vp run lint && vp run build`。

### 阶段 3：代码包机制（ESM + SDK）

目标：外部作者能写自定义页面，不进主仓。

**改动清单**：

| 操作 | 文件                                                      | 内容                                                                                                                                             |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 修改 | `src-tauri/src/host/`                                     | 注册 `plugin://` 自定义协议，映射到插件根目录，白名单仅限 `.js/.json/.png` 等静态资源，拒绝路径逃逸（`..`）                                      |
| 新增 | `packages/plugin-sdk/`                                    | `@modforge/plugin-sdk`：`PluginContext` 类型（registerPage/components/commands/capabilities/i18n/onDispose）、设计系统组件子集的再导出、版本常量 |
| 新增 | `src/features/compat-plugins/runtime/codePluginLoader.ts` | import map 注入（react/react-dom/SDK → 宿主实例 URL）→ `import('plugin://<id>/index.js')` → sdkVersion 校验 → `activate(ctx)` → 失败隔离         |
| 修改 | `apps/desktop/index.html` / CSP meta                      | `connect-src` 白名单收敛                                                                                                                         |
| 新增 | `packages/plugin-sdk/template/`                           | 作者脚手架：构建配置（React external 化）、示例页面、打包说明                                                                                    |
| 新增 | 测试                                                      | loader 的 sdkVersion 拒绝路径、onDispose 回收、import map 缺失时整体拒绝代码包                                                                   |

**验证**：手写一个示例代码包（FS 风格的简单画布页），在 dev 环境完整走通安装→加载→渲染→重载。

### 阶段 4：插件管理界面 + 扩展型贡献

- 插件管理页（内置模块，进 `tools` section）：已装插件列表、数据包/代码包标识、加载错误、手动重载、打开插件目录
- `assetSchema`（SpaceCore）与 `conditionSyntax`（EPU）贡献接入 CP 编辑器
- 回归：全量 `vp run --filter @modforge/desktop test` + 后端 `cargo test`

### 阶段依赖关系

```
阶段 0（后端 manifest 链路）
  └─ 阶段 1（清单暴露 + registry 合并）
       ├─ 阶段 2（schema 渲染器 + AT 数据包）
       └─ 阶段 3（代码包机制）── 可与阶段 2 并行
            └─ 阶段 4（管理界面 + 扩展贡献）
```

阶段 0 和 1 是所有人的前提；阶段 2 和 3 互不阻塞；阶段 4 需要 2、3 都稳定后再做。
