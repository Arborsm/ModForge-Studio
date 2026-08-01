# 工作台「项目构建」页面职能与 UI 重组方案

> **落地状态（截至 2026-07-29）**：切片 1–6 与 8 已全部落地，切片 7 主体落地。下文保留为原始计划（历史记录），与实际落点的差异以本状态块为准。
>
> | 项                                        | 状态                                                                                                                                                                                                                           |
> | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | §3.2 `AssetSchema` 内核                   | 已落地，但实际建在 `entities/asset-schema/`（非计划的 `features/asset-authoring/`）；`EditorProps` 落地为 4 项 `{ patch, schema, draftPort, resources }`（无 `copy`，见 `features/cp-maker/model/workspaceRegistry.ts:39-44`） |
> | §5.3 条件构建器注册表化                   | **残留**：`entities/event/ui/EventConditionBuilderModal.tsx` 仍为硬编码 `SKILL_OPTIONS` / `NPC_OPTIONS` / `ITEM_SUGGESTIONS`                                                                                                   |
> | §2.1 `WorkspaceId` 扩展 festivals/shops   | **残留**：`features/cp-maker/model/types.ts` 仍为九元联合                                                                                                                                                                      |
> | §9.5 图鉴命名口径                         | **部分残留**：仅 `character-browser` 完成「角色图鉴」命名，其余浏览页未改                                                                                                                                                      |
> | §9.5 硬编码色值清理                       | **残留**：`tests/architecture/styleArchitecture.test.ts` 白名单仍有 10+ 文件                                                                                                                                                   |
> | §3.3-5 `BuildWorkspacePanelsOptions` 拆分 | **残留**：现 325 行，各页 `Pick` 类型已建，但共享 base 仍是大袋子                                                                                                                                                              |

事件页（`event-authoring`）是本方案的质量基准，不在重做范围内，只做被复用改造。其余项目构建页按下面的职能地图重新划分，并按 `docs/design/page-design-spec.md` 重画。

## 1. 已核实的现状问题

结论都来自读源码，不是推测。

### 1.1 职能重叠 / 同名不同物

- 导航里 `character-browser`（角色）与 `character-authoring`（角色制作）名字同义、零代码复用：浏览侧是 `useCharacterWorkspace.ts`（1249 行）+ `CharacterGiftTasteSection.tsx`（550 行），编辑侧是 `CharacterDataPatchEditor.tsx`（496 行），两边各自加载 `Data/Characters`、各自维护一份字段理解。问题是**领域模型重复**，不是"页面多了一个"——浏览（查阅原版数据、比对、找素材）与创作（改 patch）是两种真实职能，都要保留，但必须共用同一份 `entities/*` 定义与同一份数据加载。
- `building-authoring`（建筑制作）与 `item-authoring`（物品制作）是空壳。`pages/workbench/model/builtInWorkspaces.ts:31-56` 的 `selectEditor` 启发式最后 `return createElement(GenericPatchEditor, props)`，也就是说 `Data/Buildings`、`Data/Objects` 的"编辑器"是一个裸 JSON textarea。同时 621 行的 `entities/building/model.ts` 和 1336 行的 `entities/item/model.ts` 全部只服务只读浏览。
- dialogue / schedule / mail 三个兄弟页各有独立 hook（599 / 710 / 495 行）和三套互不相同的保存策略：dialogue 每条 entry 写完就 `void saveDraft()`；schedule 用模块级 `draftBuffers` Map 延迟；mail 要显式保存，但 `deleteLetter` 立刻持久化——这个不一致甚至被写进了 zh-CN 词典的提示文案。

### 1.2 骨架系统确实简陋

- `features/cp-maker/model/workspaceRegistry.ts` 的 `EditorComponent` 是一个 18 项宽 prop 包（`patch, draft, onPatchChange, onAddVirtualAsset, …, isDirty`），任何新编辑器都得吞下全部。
- `GenericPatchCatalog.tsx`（135 行）用 `panel-surface` 卡片做列表，直接违反 `page-design-spec.md` §2.1 对工作区内容面板的规定。
- `GenericPatchEditor.tsx`（102 行）= logName / action / target / fromFile / enabled 五个输入框 + 一个覆盖 `editorState` 的 raw JSON textarea。
- `WorkspacePlugin.serializer` 是死代码：唯一调用方是 `tests/unit/pages/workbench/model/builtInWorkspaces.test.ts`，而且它产出 PascalCase `Entries`，与真正的导出路径 `buildContentJson` 的小写 `entries` 语义相反。

### 1.3 事件内对话与对话编辑器没有复用

- `command-schemas/dialogue.ts` 里 `speak` / `splitSpeak` / `message` 的文本参数是 `ui:'textarea'`，事件里编对话就是敲裸文本。
- 同一仓库里 `dialogue/entities/dialogue/model/script.ts` 已经有无损页面 AST：`DialoguePage`、`#$e#`/`#$b#` 分页、portrait token、question/response 分叉，并保证 `serializeDialogueScript(parseDialogueScript(s)) === s`。
- 头像帧数学实现了两遍：`DIALOGUE_EMOTION_FRAME_INDEX` / `getPortraitFrameIndex` / `getDialoguePortraitFrame` 对 `eventStageAssets.ts:152` 的 `getPortraitFrameBounds`。

### 1.4 对话键没有优先级模型

`dialogue/entities/dialogue/model/keys.ts`（173 行）是一个**分类器**，不是优先级模型：`DialogueKeyBuild` 只有 `daily|date|hearts|location|introduction|custom` 六类，缺婚后/配偶键、姻亲键（`<season>_<key>_inlaw_<spouse>`）、第二年日期键（`spring_1_2`），也完全没有"谁覆盖谁"的概念。

游戏实际的升序优先级（后者胜）是：`Mon` < `Mon2` < `spring_Mon` < `spring_Mon2` < `spring_1` < `spring_1_2`。关键是季节键压过心数键——`summer_Mon` 会盖掉 `Mon10`。目前 UI 完全不表达这件事，作者写了两个互相遮蔽的键不会有任何提示。

对照物已经存在：`dictionaries/zh-CN/workbench/schedule.ts` 的 `keyFamilyLabels` 已经建好了 20 族的优先级分类法（greenRain / marriageFestival / … / default / locationReplacement / custom），对话侧照抄这个形状即可。

### 1.5 导出保真与其他确认缺陷

- `useCpMaker.ts` 的 `buildContentJson`（326-660 行）不认识 `disabledEntries`、`entryLabels`、`titles`——grep 在整个文件里零命中。也就是说被作者标为"禁用"的 schedule entry 照样会打进 `changes/<workspace>.json`。
- `entities/event/model/patchHub.ts` 的 `severity` / `issueCount` 恒为 `'ok'` / `0`，因为事件编辑器没有校验层。
- `studioDeskModel.ts:227` 把 `patch.enabled === false` 的数量当作"有冲突"报给用户；`:266` 用正则 `/festival|节日|祭/i` 数节日。两个都是当事实展示的启发式。
- 校验只存在于 dialogue / schedule / mail 三个 entity（97 / 内联 / 183 行），其余页面无校验。全工作台没有撤销/重做。
- `AddPatchDialog.tsx` 的 `COMMON_TARGETS` 还带着 SDV 1.5 时代的 `Data/BigCraftablesInformation`、`Data/ClothingInformation`（36/38、79/81 行）。
- 模块级缓存跨项目泄漏：schedule 的 `draftBuffers`、dialogue 的 `vanillaNpcCache/vanillaDialogueCache/portraitCache` 都不随项目切换失效。

## 2. 目标职能地图

一个页面一个职能。浏览与创作是**两种职能，各自保留独立页面**，但共用一份领域模型与数据加载；区分靠职能命名（"图鉴" vs "制作"），不靠同义词。

| 模块 id               | 名称     | 单一职能                             | 主数据资产                               |
| --------------------- | -------- | ------------------------------------ | ---------------------------------------- |
| `project-dashboard`   | 项目总览 | 项目健康度、真实校验汇总、入口分发   | 无（聚合）                               |
| `project-content`     | 内容清单 | 全部 patch 的唯一权威列表与批量操作  | `content.json` / `changes/*`             |
| `map-authoring`       | 地图     | 地图属性、传送点、图块               | `Maps/*`                                 |
| `event-authoring`     | 事件     | 事件脚本编排（基准，不重做）         | `Data/Events/*`                          |
| `dialogue-authoring`  | 对话     | 按优先级分层的 NPC 对话              | `Characters/Dialogue/*`                  |
| `schedule-authoring`  | 行程     | NPC 日程段                           | `Characters/schedules/*`                 |
| `mail-authoring`      | 信件     | 信件 + 触发器                        | `Data/mail` + `Data/TriggerActions`      |
| `character-authoring` | 角色     | 角色定义（含外观变体、礼物喜好）     | `Data/Characters` + `Data/NPCGiftTastes` |
| `building-authoring`  | 建筑     | 建筑定义（材料、皮肤、放置、升级链） | `Data/Buildings`                         |
| `item-authoring`      | 物品制作 | 物品定义                             | `Data/Objects` 等                        |
| `character-browser`   | 角色图鉴 | 只读查阅 / 比对 / 素材定位           | `Data/Characters`（只读）                |
| `building-browser`    | 建筑图鉴 | 只读查阅 / 比对 / 素材定位           | `Data/Buildings`（只读）                 |
| `item-browser`        | 物品图鉴 | 只读查阅 / 比对 / 素材定位           | 物品诸资产（只读）                       |
| `map-browser`         | 地图图鉴 | 只读查阅                             | `Maps/*`（只读）                         |
| `event-browser`       | 事件图鉴 | 只读查阅                             | `Data/Events/*`（只读）                  |
| `project-translation` | 翻译     | i18n 抽取与生成                      | `i18n/*`                                 |

### 2.1 浏览页与创作页的分工

浏览页全部保留并保持独立 nav 条目。它们的职能是**只读查阅**：翻原版数据、跨条目比对、按标签/分组找素材、看贴图与预览。创作页的职能是**改 patch**。两者的边界用三条硬规则钉死：

1. **领域模型单一来源**。`entities/character/`、`entities/building/`、`entities/item/`、`entities/dialogue/` 是唯一定义处，字段类型、枚举目录、解析/格式化（如 `giftTasteHelpers.ts`）、贴图装配、帧数学都只写一份。浏览页与创作页都从这里取，`useCharacterWorkspace`/`useBuildingWorkspace`/`useItemWorkspace` 里内联的领域知识上移到 `entities/`，两侧一起改。
2. **数据加载单一来源**。原版资产读取走同一个 loader 与同一份缓存（缓存挂项目上下文，见 §9.1），不再各自 `Data/Characters` 读一遍。
3. **写入方向单向**。浏览页不做编辑、不产生 draft、不写 patch，只提供"在制作页打开"的跳转（带上 entry key）；创作页不承担图鉴式的跨条目检索职能。

创作页自己仍有来源切换（`游戏原版 / 本项目 / 全部`，沿用 `BrowserSourceSwitch` 与 `eventResourceRegistry` 的 `source` 语义），那是 left 栏的取材过滤器，与图鉴页的检索职能不冲突：来源切换回答"这个 key 我要基于谁编"，图鉴回答"有哪些东西、长什么样"。

浏览页同样按 §3.1 的三段式重画（left 索引 / center 列表或详情 / right 预览与元信息），只是 center 不是编辑画布。§3.2 的 `AssetFieldRenderer` 提供只读渲染模式（`readOnly`），图鉴详情复用同一份 `AssetSchema`，避免字段说明写两遍。

`WorkspaceId` 从九元闭合联合改为按资产族声明，新增 `festivals`、`shops` 的位置留在类型里但不注册 nav，直到有真实编辑器。

## 3. 统一的页面架构：三段式 + 声明式字段渲染

事件编辑器之所以站得住，是因为它把"命令语法"抽成数据（`CommandSchema` + `UIControlType` + `templateRenderer` + `ParamPill`），渲染器是通用的。数据资产页要走同一条路，只是被抽的东西从"命令"变成"资产字段族"。

### 3.1 布局契约

所有 authoring 页统一为三段式，落在已有的 `WorkspacePanelConfig` 上（`area: left | center | right`，`hideDockHeader: true`，`shellClassName: 'workspace-panel-shell-flat'`）：

- **left · 索引栏**（minWidth 220）：来源切换 + 搜索 + 条目树。条目树按各页的**优先级/分组语义**分层，不是平铺。
- **center · 编辑画布**（minWidth 480，对齐 spec 的 `MIN_CENTER_WIDTH = 360` 下限但业务下限取 480）：垂直流式卡片，每张卡是一个语义单元（对话页 = 一页对话，行程页 = 一个时段，建筑页 = 一个字段组）。
- **right · 属性/校验栏**（minWidth 240）：当前选中单元的属性、实时校验、预览。

禁止事项照 `page-design-spec.md`：工作区内容面板不用 `panel-surface`；分隔线是 5px 间隙内居中的 hairline；不出现重复标题栏；空 section 隐藏；先按 ≥1440 / ≥1680 验证。

### 3.2 `AssetFieldSchema`：数据资产的声明式渲染

新增 `features/asset-authoring/`（feature 层，供 pages 组合），提供与 `commandSchema.ts` 同构的一套：

```ts
// features/asset-authoring/model/fieldSchema.ts
export type FieldControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'toggle'
  | 'tri_bool'
  | 'enum'
  | 'gsq'
  | 'string_list'
  | 'number_list'
  | 'key_value_list'
  | 'point'
  | 'rect'
  | 'color_rgb'
  | 'npc_ref'
  | 'item_ref'
  | 'location_ref'
  | 'texture_ref'
  | 'map_ref'
  | 'dialogue_script' // 复用对话 AST 编辑器
  | 'schedule_script'
  | 'nested_list' // 材料表 / 皮肤表 / 放置格
  | 'raw'

export type AssetFieldSchema = {
  key: string
  group: string // 折叠分组 id
  control: FieldControl
  labelKey: string // 只能是 locale contract 的 key
  hintKey?: string
  required?: boolean
  enumCatalog?: string // 指向 resourceRegistry / 静态目录
  itemSchema?: readonly AssetFieldSchema[] // nested_list 用
  validate?: (value: unknown, ctx: AssetValidationContext) => AssetIssue[]
}

export type AssetSchema = {
  assetId: string // 'Data/Buildings'
  keyOrder: readonly string[]
  groups: readonly { id: string; labelKey: string; collapsedByDefault?: boolean }[]
  fields: readonly AssetFieldSchema[]
}
```

配套三件通用件，替换 `GenericPatchEditor`：

- `AssetFieldRenderer`：`AssetFieldSchema` → 控件。控件实现从 `character-data/editors/fields.tsx` 的 16 个原语搬过来并去掉 character 专属假设，成为共享层。
- `AssetEntryCanvas`：分组折叠 + 未知字段保留（沿用 `CharacterDataDraft{fields, unknown, keyOrder}` 的三段结构，保证往返无损）。
- `AssetValidationRail`：把 `AssetIssue[]` 渲进 right 栏，并向上汇报给 `patchHub`。
- `AssetFieldRenderer` / `AssetEntryCanvas` 都接受 `readOnly`：图鉴页用只读模式渲染同一份 `AssetSchema`（无输入控件、无 draft、无校验栏），字段标签与分组只维护一份。

每页只需提交一份 `AssetSchema` + 一个 `entities/<domain>/model.ts` 的类型定义。`entities/building/model.ts`、`entities/item/model.ts` 里现成的 `BuildingMaterialEntry` / `BuildingSkinEntry` / `BuildingPlacementTileEntry` 等直接成为 `nested_list` 的 `itemSchema` 来源，不重写领域知识。

### 3.3 骨架系统的退场路径

1. `builtInWorkspaces.selectEditor` 的 `preferred === 'image'` / `startsWith('Data/Events')` 启发式改为**按 `AssetSchema.assetId` 精确查表**，查不到才落 `raw`。
2. `GenericPatchCatalog` 删除，列表统一由 `project-content` 与各页 left 栏承担，列表卡片形态照 `PatchListPage` 而不是 `panel-surface`。
3. `GenericPatchEditor` 保留但降级为**显式 raw 逃生舱**：只在用户主动点"编辑原始 JSON"时出现，不再是默认落点。
4. `WorkspacePlugin.serializer` 与它唯一的测试一起删除；导出只有 `buildContentJson` 一条路径。
5. `EditorComponent` 的 18 项 prop 包换成 `{ patch, schema, draftPort, resources, copy }` 五项；`workspace-panels/types.ts` 的 157 行 `BuildWorkspacePanelsOptions` 随之按页拆成各自的 options 类型，不再是全页共享的 mega prop bag。

## 4. 对话页：按优先级分层

### 4.1 键模型从分类器升级为优先级模型

`keys.ts` 扩成两层。第一层补全族（现在缺的）：

```ts
export type DialogueKeyFamily =
  // 婚后专属
  | 'marriage_spouseRoom'
  | 'marriage_indoor'
  | 'marriage_outdoor'
  | 'marriage_job'
  | 'marriage_seasonDay'
  | 'marriage_weekday'
  // 姻亲：<season>_<key>_inlaw_<spouse>
  | 'inlaw'
  // 一次性剧情
  | 'introduction'
  | 'danceRejection'
  | 'secondchance'
  | 'dumped'
  | 'breakUp'
  // 地点变体：Resort_*、GreenRain 等
  | 'location'
  // 日期
  | 'seasonDayYear' // spring_1_2
  | 'seasonDay' // spring_1
  | 'seasonWeekdayHearts' // spring_Mon2
  | 'seasonWeekday' // spring_Mon
  | 'weekdayHearts' // Mon2
  | 'weekday' // Mon
  | 'custom'

export const DIALOGUE_FAMILY_RANK: Record<DialogueKeyFamily, number>
```

第二层是真正的裁决函数，纯逻辑、可测：

```ts
export type DialogueKeyDescriptor = {
  key: string
  family: DialogueKeyFamily
  rank: number
  season?: DialogueSeason
  weekday?: DialogueWeekday
  dayOfMonth?: number
  minYear?: number
  hearts?: number
  spouse?: string
  location?: string
}

export function describeDialogueKey(key: string): DialogueKeyDescriptor
export function compareDialoguePriority(a, b): number
// 同一条件下 b 是否会遮蔽 a（例如 summer_Mon 遮蔽 Mon10）
export function findShadowedKeys(keys: readonly string[]): DialogueShadowReport[]
```

裁决规则按游戏实际行为：季节键胜过非季节键，非季节键里心数高者胜，精确日期胜过星期，带年份的日期键胜过不带年份的。`summer_Mon` 遮蔽 `Mon10` 这一条必须有专门用例。

### 4.2 UI：left 栏改为优先级分层树

left 栏不再是平铺 entry 列表，改成按 `DIALOGUE_FAMILY_RANK` 降序分组的分层树：

```
高优先级
  ├ 婚后 · 配偶房间          spouseRoom
  ├ 婚后 · 季节日期          spring_1
  └ 姻亲                     spring_Mon_inlaw_Abigail
剧情一次性
  └ Introduction
地点变体
  └ Resort_Bar
日期
  ├ 季节 + 日期 + 年         spring_1_2
  ├ 季节 + 日期              spring_1
  ├ 季节 + 星期 + 心数        spring_Mon2
  ├ 季节 + 星期              spring_Mon
  ├ 星期 + 心数              Mon10
  └ 星期                     Mon
自定义
```

族标签走新的 `dialogueEditor.keyFamilyLabels`，形状照 `dictionaries/zh-CN/workbench/schedule.ts` 的 `keyFamilyLabels`（那边已有 20 族的先例）。

被遮蔽的行显示为**降级态**（低对比 + 遮蔽角标），hover 给出"被 `<key>` 遮蔽"的说明；right 栏在选中被遮蔽键时把遮蔽者作为可跳转链接列出。这是 `findShadowedKeys` 的唯一 UI 出口，不做静默处理。

来源徽标沿用 `DialogueListView` 现有的 vanilla / project / override 三态，但和优先级树正交：树分层按优先级，徽标标来源。

### 4.3 center 栏保留并强化

`DialogueEditorView` 的垂直页面流（start 卡 + `DialoguePageCard` + `AddPageInline` 给 `#$e#`/`#$b#`）是这批页面里唯一达标的画布形态，保留。补三项：

- 页面卡增加 portrait 实时裁切预览（复用 `getDialoguePortraitFrame`，不再各画一遍）。
- `$q`/`$r` 分叉在卡内以子分支形式展开，而不是折进 raw。
- 高级段（`$c $p $d $y $t $k $1 $query $action`）当前落 `kind:'raw'`，改为各自的最小结构化卡片，`raw` 只留给真正无法解析的内容。

## 5. 事件内对话复用同一套编辑器

### 5.1 提升对话 AST 为共享 entity

`pages/workbench/workspaces/dialogue/entities/dialogue/model/script.ts` 上移到 `src/entities/dialogue/`（entities 层可被 features 与 pages 共用，方向合法）。导出保持 `parseDialogueScript` / `serializeDialogueScript` 及其无损往返契约。

同时把 portrait 帧计算收敛到一处：`entities/dialogue/model/portrait.ts` 提供 `getDialoguePortraitFrame`，`eventStageAssets.ts:152` 的 `getPortraitFrameBounds` 改为转调，不再各算一遍 64×64。

### 5.2 新增 `ui: 'dialogue_script'` 控件

`UIControlType` 增加 `dialogue_script`，`ParamPill` 对该类型渲染共享的 `DialogueScriptField`（内部即 `DialoguePageCard` 流的紧凑变体，含 portrait 选择与分页按钮）。然后把 `command-schemas/dialogue.ts` 里三处 `ui:'textarea'` 换掉：

- `speak` 的 param2
- `splitSpeak` 的文本参数
- `message` 的文本参数

`editorStore` 的 raw-authority 模型不变：`DialogueScriptField` 的 `onChange` 交出的仍是 `serializeDialogueScript` 的字符串，写回 `segments[index + 3]`，再由 `rebuildScriptRaw` 用 `/` 重新拼接。这样事件侧不引入第二套真相来源，无损往返契约同时兜住了事件脚本的保真。

反向复用一条：对话页 right 栏的"在游戏中试" 走 `entities/debug-bridge` 的 `buildSpeechCommand`，与事件页的 `buildRunEventScriptCommand` 同一条通道，不再各接一次。

### 5.3 条件构建器去重

`EventConditionBuilderModal`（1178 行）自带一套硬编码的 NPC / 技能 / 物品 / 季节 / 天气集合，与 `loadResourceRegistry` 返回的真实注册表并存。改为读注册表，硬编码集合只保留注册表覆盖不到的枚举（天气、季节）。改完后角色页、建筑页、物品页的 `gsq` 控件与事件页共用同一个 modal，`character-data` 已经在复用 `EventGameStateQueryBuilderModal`，这条只是把资源来源统一。

## 6. 角色页重做

`character-authoring`，三段式：

- **left**：来源切换（原版 / 项目 / 全部）+ NPC 列表，按"项目已覆盖 / 仅原版"两组分层。列表项显示行走图首帧缩略与覆盖徽标。
- **center**：`AssetEntryCanvas` 渲染 `Data/Characters` 的 61 字段（`CHARACTER_FIELD_ORDER` 直接作为 `keyOrder`），分组沿用 `character-data/editors/sections.tsx` 已有的 7 组。三处必须补齐（现在是缺口）：
  - `appearance` 变体：`model.ts:88` 现在是 `Appearance?: unknown[]`，词典也自认 "完整的外观变体编辑暂未提供，可直接编辑该数组的 JSON"。需要新建 `CharacterAppearanceEntry` 类型（Id / Condition / Season / Indoors / Outdoors / Portrait / Sprite / Weight / Precedence，照 SDV 1.6 `Data/Characters` 的 Appearance 结构），再作为 `nested_list` 的 `itemSchema`，带 `gsq` 条件、季节、纹理引用与实时预览。
  - 礼物喜好：把浏览侧 `CharacterGiftTasteSection.tsx`（550 行）的领域知识转为 `Data/NPCGiftTastes` 的可编辑 `nested_list`，与角色 entry 同页编辑、分别落 patch。解析/格式化复用已有的 `entities/character/lib/giftTasteHelpers.ts`，不再写第二份。
  - `createMinimalCharacterEntry` 硬编码的 Town 29,67 改为从 `location_ref` + `point` 控件取值，新建时必填。
- **right**：立绘/行走图预览（复用浏览侧现成的行走循环与呼吸动画）+ `AssetValidationRail`（`validateCharacterEntries` 接进统一 `AssetIssue`）。

`character-browser`（角色图鉴）保留，同步改造：`useCharacterWorkspace.ts`（1249 行）与 `CharacterGiftTasteSection.tsx`（550 行）里的领域知识上移到 `entities/character/model/`（字段定义、枚举目录）与 `entities/character/lib/`（礼物喜好解析、行走图装配），浏览页只剩检索、列表与预览的呈现逻辑；详情区改用 `AssetEntryCanvas` 的 `readOnly` 模式渲染同一份 `AssetSchema`。列表项与详情页提供"在角色制作中打开"跳转，带 NPC key。浏览页不产生 draft。

## 7. 建筑页重做

`building-authoring` 从 JSON textarea 变成真编辑器，领域模型直接吃 `entities/building/model.ts`（621 行）现成的类型：

- **left**：建筑列表，按 `createConstructibleBuildingGroups` 的可建造分组分层。`buildingLocationSeeds.ts` 的英文字面量组名改走词典；`farm: []` 这类空组按 spec 隐藏而不是渲染空壳。
- **center**：`Data/Buildings` 的字段组 —— 基础信息 / 建造（`BuildingMaterialEntry` → `nested_list`）/ 皮肤（`BuildingSkinEntry`）/ 放置（`BuildingPlacementTileEntry`，配 `point` 与图上拾取）/ 升级链 / 室内地图（`map_ref` 指向地图页）/ 纹理（`texture_ref`）。
- **right**：主预览（沿用 `BuildingPrimaryPreview` 的贴图装配逻辑）+ 校验。

新增 `entities/building/model/validation.ts`：材料引用是否存在、升级链是否成环、放置格是否越界、室内地图是否已在项目里，全部返回 `AssetIssue`。

`BUILDINGS_DATA_ASSET_PATH = 'Content\\Data\\Buildings.xnb'` 这类只读取值路径保持不变，编辑走 patch，不碰游戏目录。

`building-browser`（建筑图鉴）保留：`useBuildingWorkspace` 的领域知识归位 `entities/building/`，`BuildingPrimaryPreview` 的贴图装配成为两页共用的一份实现，详情走 `readOnly` 渲染，列表项提供"在建筑制作中打开"跳转。

## 8. 物品页

物品的数据面比建筑大（`entities/item/model.ts` 1336 行 + `itemWorkspaceData.ts` 620 行 + `itemTypes.ts` 332 行），且横跨 `Data/Objects`、`Data/Boots`、`Data/Weapons`、`Data/Tools` 等多资产。本轮**只做到 `Data/Objects` 一族**的真编辑器，其余资产族在 left 栏可见、进入时明确显示"本版本暂不支持编辑，可用原始 JSON"并给出 raw 逃生舱入口——这是显式声明的范围边界，不是占位 UI。后续按同一 `AssetSchema` 模式逐族补齐。

`item-browser`（物品图鉴）保留且**覆盖全部物品资产族**，不受编辑范围限制：制作页暂不支持的资产族仍可在图鉴里完整查阅。`itemWorkspaceData.ts`（620 行）与 `itemTypes.ts`（332 行）的领域知识归位 `entities/item/`，两页共用。图鉴详情提供"在物品制作中打开"跳转；跳转到暂不支持编辑的资产族时，落到 raw 逃生舱而不是死链。

## 9. 横向收敛项

这些不属于单页，但每个纵切片都必须带上对应部分，否则页面做完了仍然不可信。

### 9.1 持久化与保存策略统一

新增 `features/cp-maker/model/draftPort.ts`，所有 authoring 页通过同一个接口读写：

```ts
export type AssetDraftPort = {
  read(assetId: string, entryKey: string): AssetEntryDraft | null
  stage(assetId: string, entryKey: string, draft: AssetEntryDraft): void
  commit(): Promise<void> // 显式保存
  revert(assetId?: string): void
  isDirty(assetId?: string): boolean
}
```

统一策略：**编辑只 stage，保存才 commit，删除也走 stage**。mail 的"删除即持久化"和 dialogue 的"每条 entry 自动 saveDraft" 都收进这一条；zh-CN 词典里那句解释保存不一致的提示文案随之删除。

模块级缓存（schedule 的 `draftBuffers`、dialogue 的三个 vanilla 缓存）改为挂在项目上下文里，随项目切换失效——现在它们跨项目泄漏。

### 9.2 校验层

`AssetIssue` 成为唯一校验形状（`{ severity: 'error' | 'warning' | 'info', code, messageKey, path, relatedKeys? }`）。dialogue / schedule / mail 三份现成校验改为产出 `AssetIssue`，角色 / 建筑 / 物品新写。

然后 `patchHub.ts` 的 `severity` / `issueCount` 从硬编码 `'ok'` / `0` 换成真实汇总，`project-dashboard` 与 `project-content` 显示同一份数字。`studioDeskModel.ts:227` 把"禁用的 patch 数"当"冲突数"的假指标删除，改为真实的 `error` 计数；`:266` 的 `/festival|节日|祭/i` 正则删除，节日计数在没有真实节日资产支持前不展示。

### 9.3 撤销/重做

`AssetDraftPort` 之上加一层命令栈（`stage` 即一次可撤销操作），全工作台共享 Ctrl+Z / Ctrl+Shift+Z。事件编辑器的 `editorStore` 接同一个栈，`insertCommandAt/updateCommandAt/removeCommandAt/moveCommand` 各自登记一条可逆操作。

### 9.4 导出保真

`buildContentJson` 必须认识现在被静默丢弃的三个 key：

- `disabledEntries` → 从 `entries` 里剔除对应键（而不是照样导出）。
- `entryLabels` / `titles` → 编辑期元数据，不进 `changes/*.json`，但要在导出前显式过滤并在测试里锁死"不出现在产物中"。

配一组往返测试：任意 draft → `buildContentJson` → 解析回来，禁用项不在产物里、元数据不在产物里、`Format: '2.9.0'` 不变。

### 9.5 文案与配色

每个新页面必须先在 `locales/model/workbench/<page>.ts` 加 contract，再补 `dictionaries/{zh-CN,en-US}/workbench/<page>.ts` 双份（编译期 parity 已有保障）。

nav 标签按职能统一改口径：浏览页叫"XX 图鉴"，创作页叫"XX 制作"，双词典同步（`dictionaries/{zh-CN,en-US}/workbench/shell.ts`），消掉现在"角色"与"角色制作"这种同义并列。

两处现存反模式一并清掉：`eventComposerCopy.ts` 用 `locale !== 'en-US'` 内联中英字符串，改走词典；`studio-desk.ts` 里 mock 时代的 `designTags: ['浅色主题','工作区独立','去工程化视觉']` 与 `avatarInitials: ['Ab','Se','Li']` 删除。

配色全部走 `tokens.css` 变量。`GenericPatchEditor` 与 `EventPatchEditor` 里现有的 `text-red-400` 这类字面量在改动到的文件里顺手换成语义变量。

### 9.6 陈旧目标清单

`AddPatchDialog` 的 `COMMON_TARGETS` 按 SDV 1.6 重写：删掉 `Data/BigCraftablesInformation`、`Data/ClothingInformation`，补 `Data/Buildings`、`Data/Characters`、`Data/TriggerActions`、`Data/Shops`、`Data/Machines` 等现行资产。清单与 `AssetSchema` 注册表同源，避免第二次漂移。

## 10. 纵切片划分

每片都是可独立合并、真实用户可用的完整功能，不是"先搭骨架后填肉"。顺序有依赖，但每片自身闭环。

### 切片 1 · 共享对话内核 + 事件内对话复用

- `entities/dialogue/` 建立（AST 上移 + portrait 帧收敛到一处）。
- `UIControlType` 增加 `dialogue_script`，`ParamPill` 支持，`speak`/`splitSpeak`/`message` 换掉 textarea。
- 交付后可用价值：在事件编辑器里用结构化方式编对话（分页、头像、分叉），不必再敲 `#$e#`。
- 测试：`tests/unit/entities/dialogue/script.test.ts`（往返无损）、`portrait.test.ts`（两处帧数学结果一致）、`eventDialogueBridge.test.ts`（`DialogueScriptField` 序列化结果写回 `segments[index+3]` 后 `rebuildScriptRaw` 输出与手写 raw 一致）。
- 验证：事件页 `speak` 卡片截图（≥1440 / ≥1680）。

### 切片 2 · 对话页优先级分层

- `keys.ts` 升级为 `DialogueKeyDescriptor` + `DIALOGUE_FAMILY_RANK` + `compareDialoguePriority` + `findShadowedKeys`，补婚后 / 姻亲 / 年份键。
- `dialogueEditor.keyFamilyLabels` 双词典。
- left 栏改分层树 + 遮蔽降级态 + right 栏遮蔽者跳转。
- center 栏补 portrait 预览、`$q/$r` 子分支、高级段结构化。
- 测试：`dialogueKeys.test.ts` 覆盖全部族解析、`summer_Mon` 遮蔽 `Mon10`、`spring_1_2` 胜 `spring_1`、姻亲键解析出 spouse。
- 验证：对话页三栏截图 + 遮蔽态截图。

### 切片 3 · `AssetSchema` 内核与骨架退场

- `features/asset-authoring/`：`fieldSchema.ts` + `AssetFieldRenderer` + `AssetEntryCanvas` + `AssetValidationRail`，控件原语从 `character-data/editors/fields.tsx` 提升为共享。
- `selectEditor` 改精确查表；`GenericPatchCatalog` 删除；`GenericPatchEditor` 降级为显式 raw 逃生舱；`WorkspacePlugin.serializer` 及其测试删除；`EditorComponent` prop 包收敛为五项。
- 交付后可用价值：本片自带角色页迁移（见切片 4 的前半）才算闭环，因此切片 3 与 4 合并发布或切片 3 只做内核 + 把 `character-data` 现有编辑器迁到新渲染器（行为等价、无回归）。选后者，保持可独立合并。
- 测试：`assetFieldSchema.test.ts`（keyOrder 往返、unknown 字段保留）、`selectEditor.test.ts`（查表命中与 raw 兜底）。

### 切片 4 · 角色页重做

- `character-authoring` 重做；`character-browser` 保留，改为消费同一份领域模型与 `readOnly` 渲染，并补"在角色制作中打开"跳转。两个 nav 条目都在，名称按职能改为"角色图鉴" / "角色制作"。
- 领域模型归位：`entities/character/` 现在只有 `lib/clothingSprites.ts` 与 `lib/giftTasteHelpers.ts`，而 560 行的 `CharacterDataFields` / `CHARACTER_FIELD_ORDER` / 枚举目录躺在 `pages/workbench/workspaces/character-data/entities/character-data/model.ts`。本片把它移到 `entities/character/model/`，浏览与创作共用一份定义（对话同理，见切片 1）。原版资产加载与缓存同时收敛为一处。
- 外观变体 `nested_list`（补齐现有缺口）、礼物喜好可编辑、新建位置必填。
- `validateCharacterEntries` → `AssetIssue`。
- 测试：`characterSchema.test.ts`、`characterValidation.test.ts`、`characterAppearance.test.ts`（变体条件与季节序列化）。
- 验证：三段式截图 + 外观变体编辑截图。

### 切片 5 · 建筑页重做

- `building-authoring` 真编辑器（材料 / 皮肤 / 放置 / 升级链 / 室内地图 / 纹理）；`building-browser` 保留，领域模型与贴图装配归位 `entities/building/` 后两页共用，补跳转。
- `entities/building/model/validation.ts` 新写（材料引用、升级链成环、放置越界、室内地图缺失）。
- 组名走词典、空组隐藏。
- 测试：`buildingSchema.test.ts`、`buildingValidation.test.ts`（含成环用例）。
- 验证：三段式 + 预览截图。

### 切片 6 · 行程页与信件页并入统一架构

- 两页 left 栏改优先级分层（schedule 直接用现成的 20 族 `keyFamilyLabels`；mail 按触发方式分组）。
- 两页 hook 迁到 `AssetDraftPort`，保存策略统一。
- mail 的双资产（`Data/mail` + `Data/TriggerActions`）在 UI 上明确成两个 patch 而不是隐式。
- 测试：`scheduleKeyPriority.test.ts`、`mailTriggerSplit.test.ts`、`draftPort.test.ts`（stage/commit/revert 语义、项目切换后缓存失效）。

### 切片 7 · 横向收敛收口

- 撤销/重做命令栈接入全部页面与 `editorStore`。
- `patchHub` 真实 `severity`/`issueCount`；`studioDeskModel` 假指标删除。
- `buildContentJson` 处理 `disabledEntries`/`entryLabels`/`titles`。
- `COMMON_TARGETS` 按 1.6 重写并与 `AssetSchema` 注册表同源。
- `eventComposerCopy.ts` 走词典；`studio-desk.ts` mock 文案删除。
- 测试：`undoStack.test.ts`、`buildContentJson.fidelity.test.ts`、`patchHubSeverity.test.ts`。

### 切片 8 · 物品页（`Data/Objects` 一族）

- `Data/Objects` 真编辑器；其余物品资产族在 left 栏可见但明示不支持编辑并给 raw 入口。
- `item-browser` 保留并覆盖全部资产族，领域模型归位 `entities/item/` 后两页共用，补跳转（暂不支持编辑的族落 raw 逃生舱）。
- 测试：`itemObjectSchema.test.ts`、`itemBrowserJump.test.ts`（跳转目标解析：支持族 → 结构化编辑器，未支持族 → raw）。

## 11. 测试与验证约束

- 前端测试一律 `vp test run --configLoader runner`（裸 `vp test` 进 watch，非交互 shell 会挂）。
- `src/tests/unit/**` 只放纯逻辑 `.ts`，不写渲染测试。上面每个切片的测试项都落在这里：schema 往返、键优先级裁决、校验规则、导出保真、draft port 语义。
- UI 变更靠截图 / Playwright `getBoundingClientRect()` 量测证明，按 `page-design-spec.md` 的宽屏优先（≥1440 / ≥1680）验证，先做 mock 迭代再接真数据。
- Rust 侧若因资产读取扩展而改动：`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`。
- 新增 host command 后跑 `vp run --filter @modforge/desktop gen:host-commands`，不手写 `HOST_COMMANDS`。

## 12. 明确不在本轮范围

- 节日（`Data/Festivals/*`）与商店（`Data/Shops`）编辑器：类型位置预留，不注册 nav，不做占位页面。
- 地图编辑器（`MapPatchEditor` 876 行）保持现状，只在 `map_ref` 控件上被引用。
- `map-browser` / `event-browser` 两个浏览页本轮不改造，保持现状与现有 nav 位置；仅在 §9.5 统一命名时把标签调成"图鉴"口径。角色 / 建筑 / 物品三个图鉴页按切片 4 / 5 / 8 随对应制作页一起改造，不单独立片。
- 翻译页与 AI 本地化不动。
- 物品页除 `Data/Objects` 外的资产族。
