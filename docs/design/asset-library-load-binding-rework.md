# 素材库「资源替换」编辑器重做计划

> 状态：计划已核实，待实施（2026-09-10）
> 关联：`AGENTS.md`、`docs/design/workbench-design-principles.md`、`docs/design/page-design-spec.md`、`docs/frontend-architecture.md`、`docs/dev-verification.md`
> 取代 `docs/design/asset-library-workspace-rework-plan.md` B 轨道中「保留编号步骤、计数徽标、✓、预览表」的决策；该文档 A/C 轨道不受影响。

## 背景与已核实问题

用户对「资源替换」编辑弹窗（`LoadBindingEditor`）的整体判断：卡片化步骤表单形式过重、状态不可信。逐条核实如下（均带证据，实施前无需重查）。

### 功能 bug

| #   | 问题                                                                                                                                                                                                                                                                                    | 证据                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | 新建替换默认产出**被禁用**的补丁且界面不可见：创建时 `enabled: true`，编辑器挂载 effect 因 `fromFile === ''` 立即改 `enabled: false`，之后选好目标+文件**无任何恢复路径**（开关在默认折叠的高级设置里）。弹窗显示「已保存 + 已就绪」，实际替换不生效，仅列表行 45% 透明 + hover tooltip | `features/cp-maker/state/useCpMaker.ts:958`；`asset-library/editors/LoadBindingEditor.tsx:162-166`；`styles/workspace/asset-library-load-bindings.css:76-78` |
| B2  | 新建即把占位目标 `Maps/NewMap` 等写进补丁 target，漏删则导出垃圾 Load；且 `LogName` 创建时一次性盖章 `Load → <占位>`，之后 target 变更**永不更新**，原样导出                                                                                                                            | `AssetLibraryWorkspace.tsx:464,477`；`mapLoadBinding.ts:237-252`；`useCpMaker.ts:957`（盖章）+ `:509-511`（导出）                                            |
| B3  | 右键「替换游戏资源」的 family 取自当前选中素材而非右键素材：`createLoadBindingForAsset(assetPath)` 内 `loadAssetFamily(selected.relativePath)`，fromFile 却取参数                                                                                                                       | `AssetLibraryWorkspace.tsx:474-485`（476 行取 selected）；右键入口 `:856`                                                                                    |
| B4  | 导出把字符串 `'false'` 的 enabled 当停用过滤，导出前校验 `isPatchEnabled` 却只判 `!== false`，同一补丁两边语义不一致                                                                                                                                                                    | `useCpMaker.ts:378-382`；`features/cp-maker/model/projectValidation.ts:27-29`                                                                                |

导出端相关事实（设计依据）：

- `Load` 无 `FromFile` 在 `buildContentJson` 被静默跳过（`useCpMaker.ts:591-593`）→ 未配齐的绑定本来就不产生内容，B1 的「自动禁用」没有必要。
- 非 Include 补丁无条件写 `Target`（`:506-508`）→ target 为 `''` 且 fromFile 有值会导出 `"Target": ""`；编辑器把目标删空是可达状态（`removeTarget` → `buildLoadTargetExpression([]) === ''`），且导出预检无 target 空校验。

### 交互 / 信息架构（对照 workbench-design-principles）

| #   | 问题                                                                                                                                                                                                                                                                                                                                                      | 证据                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | 「自定义路径与占位符需在高级模式下使用。」否定式提示在卡 1、卡 2 各渲染一次，普通模式下纯噪音                                                                                                                                                                                                                                                             | `LoadBindingEditor.tsx:359`、`:442`                                                                                                                 |
| I2  | 步骤号（左）、目标计数（右）、完成 ✓（右）三种含义共用同一视觉语言（同款 accent 圆圈数字），截图中出现两个一样的「1」                                                                                                                                                                                                                                     | `asset-library-load-bindings.css:137-155`                                                                                                           |
| I3  | 卡 2 换文件入口是 chip 样式的触发钮（显示文件名），看起来像静态标签；卡 1 却是 chip 列表 + 显式按钮，两卡形态不一致                                                                                                                                                                                                                                       | `features/resource-browser/ui/ResourcePicker.tsx:946`（trigger 渲染）                                                                               |
| I4  | 「替换预览」表格在单目标场景是卡 1+卡 2 的复读；唯一增量「文件存在」应内联。且「已就绪」只查路径存在、不查类型匹配，语义过强                                                                                                                                                                                                                              | `LoadBindingEditor.tsx:447-488`；`mapLoadBinding.ts:114-130`                                                                                        |
| I5  | 弹窗标题 = 裸路径 `Maps/AdventureGuild`，对小白无上下文                                                                                                                                                                                                                                                                                                   | `AssetLibraryWorkspace.tsx:1003`                                                                                                                    |
| I6  | footer「已保存」是草稿自动保存状态，对弹窗是噪音；真实「生效 / 未生效」状态不可见                                                                                                                                                                                                                                                                         | `AssetLibraryWorkspace.tsx:744-763,1013-1021`                                                                                                       |
| I7  | undo：创建流程有一条机器写入栈（B1 的 enabled 翻转）；跨字段操作各自成条可接受（选目标、选文件本来就是两次操作），B1 修复后达标                                                                                                                                                                                                                           | `features/cp-maker/model/draftPort.ts:96-102,447-456`                                                                                               |
| I8  | 地图目标无本地化显示名。数据链可行：`Maps/<名>` → `Data/Locations` 同名位置 `DisplayName`（多为 `[LocalizedText Strings/Locations:<键>]`）→ `Content/Strings/Locations.<locale>.xnb`；基建已有（`loadTextAsset`、`localizedText.ts` 的 token 解析 + Strings 表缓存、先例 dialogue 工作区 NPC 名解析）。非位置地图（节日图/事件图/自建图）无来源，回退原名 | `entities/game/api/gameAssets.ts:143-161`；`entities/game/api/localizedText.ts:61-150`；`workspaces/dialogue/state/useDialogueWorkspace.ts:125-140` |

## 目标契约

### Batch 1 — 生命周期与数据修复

1. **删除自动禁用 effect**（`LoadBindingEditor.tsx:162-166`）。`enabled` 语义 = 用户显式意图，编辑器不再自动写。安全性由导出端既有守卫保证（Load 无 FromFile 不导出）。
2. **新建流程去占位目标**：`createLoadBindingForFamily` / `createLoadBindingForAsset` 改为 `addPatch('Load', '', fromFile?)`（空串 target 合法，Include 先例 `useCpMaker.ts:955`）；删除 `placeholderLoadTarget`（`mapLoadBinding.ts:237-252`）及其 barrel 导出与测试。
   **去重语义（已核实 `isSameDefaultPatch`，`useCpMaker.ts:691-699`：非 Include 只比 workspace+target，忽略 fromFile）**：port 绑定 workspace 是 `'map'`，target 全空后查重域是「workspace='map' 的未配置 Load」。这导致两个不一致：maps 家族连点会去重，但非 map 家族创建后立即被 `updatePatch` 移到 `'mods'`、绕过查重 → 可堆叠多个完全相同的未配置行；反向地，一个未配置的 maps 绑定会劫持下一次任意家族的新建（被查重命中后改写成新家族 workspace）。**决定：创建时按最终 workspace 查重**——`createLoadBindingForFamily/ForAsset` 在 `addPatch` 前先自查 `port.draft.patches` 里 `action==='Load' && target==='' && workspace===loadFamilyWorkspace(family)` 的未配置绑定，有则直接复用（选中打开），无则新建；不改动 `isSameDefaultPatch` 本身（它是 cp-maker 通用机制）。
3. **列表「未配置」组**：target 为空的绑定在左栏单独成组、行内占位「未配置」；用 UI 侧 filter 实现，不改 `groupLoadPatchesByFamily` / `loadAssetFamily('') === 'other'` 的 model 语义（已被 `mapLoadBinding.test.ts:163` 钉住）。空目标 Load 在其他 9 个工作区的只读摘要显示既有 noTargets 空态，无崩溃（`editorRouting.ts:59-63` + `GenericLoadSummaryEditor.tsx:51-53`）。
4. **导出/校验守卫**：
   - `buildContentJson` 新增：`action === 'Load' && Target 空` → `continue`（与 `:591-593` 的 FromFile 守卫并列）。
   - `projectValidation` 新增 Load 专属 error `patchTargetMissing`（messageKey 与 `patch.sourceFileMissing` 同 bundle，**已定位 = `workbench/asset-authoring`**：`locales/model/workbench/asset-authoring.ts:329` 的 union、`zh-CN:404`、`en-US:502` 三份同步）；不动其他 action，避免误伤存量项目。
   - `isPatchEnabled`（`projectValidation.ts:27-29`）对齐导出语义：字符串 `'false'`（不分大小写）也算停用。
5. **logName 跟随**：`LoadBindingEditor.commitTargets` 时若 `patch.logName` 等于 `` `Load → ${previousTarget}` ``（仍是创建默认值）则在同一次 `updatePatch` 里同步为新 `` `Load → <表达式>` ``；用户改过名则不动。消除导出 JSON 残留占位 LogName。
6. **B3 修复**：family 从参数 `assetPath` 计算。
7. **停用可见性**（兼容存量被 B1 影响的绑定）：弹窗 footer 状态条在布尔 `enabled === false` 时显示「已停用」+「启用」按钮；列表行维持 45% 透明 + tooltip 现状。

### Batch 2 — 弹窗信息架构重构

1. **结构**：删四张编号步骤卡，改单页两段 + 折叠高级：
   - 段1「替换目标」：目标 chips（hover 显删除）+ 按 family 的点选区（maps=ResourcePicker 按钮；images=缩略图网格；audio/fonts/data=图标列表；other=仅 expert 输入）+ expert 输入框（仅 expert mode 渲染，**无任何提示文案**）。
   - 段2「替换文件」：未选 = 整块可点选择区（ResourcePicker trigger + `triggerContent` 自定义成带图标的按钮形态）；已选 = 文件名 + 存在性角标 + hover 更换/清除；images family 保留原游戏/项目对比预览（`.load-binding-compare`）。
   - **预览内联**：单目标且 fromFile 不含 `{{token}}` 时不渲染表格，存在性并入段 2 角标；多目标或含 token 时在段 2 内联解析明细（复用 `.map-load-preview-table`）。
   - 高级折叠保留：When 条件 / 优先级（expert）/ 启用开关与表达式态。
2. **徽章收敛**：删除步骤号徽章、计数徽章（`.map-load-card-number/-count/-check` 类清理）；段头右侧只允许段 2 的 ✓/⚠ 一种状态。
3. **文案**：删除 `expertOnlyHint` 两处渲染点；asset-library bundle 的 key 此后零引用，三份字典同步删。**注意 asset-authoring bundle 有同名 key 被 `GenericPatchEditor.tsx:71` 使用，不得误删**。`previewHint` 被 `MapLoadSummaryEditor.tsx:72` 复用，key 保留。
4. **弹窗宿主**：title = 「替换{family 名} · {首目标文件名}」，空目标 = 「新建替换」；subtitle = 完整 target 表达式（mono 小字）；icon 保留 `LoadFamilyIcon`。
5. **footer 契约**：左侧生效状态条，优先级 error 原文 > 已停用+启用按钮 > 未配齐（「还差：替换目标/替换文件，配齐后自动生效」）> 已生效；自动保存状态降为圆点 + sr-only（对齐列表工具条圆点先例）。右侧「完成」保持纯关闭。
6. **状态语义**：`analyzeLoadBindings` 增加 `matchesFamily`（用 `classifyProjectAsset` 与 family 期望比对，堵住 expert 手输路径）；角标三态 ✓ 已就绪 / ⚠ 未找到 / ⚠ 类型不匹配。**已核实的映射缺口**：`classifyProjectAsset`（`projectAssets.ts:60-71`）返回 `ProjectAssetKind = 'map' | 'image' | 'audio' | 'data' | 'other'`，与 family（`'maps'/'images'/'fonts'/'data'/'other'`）之间需要一张映射表；fonts 无对应 kind。策略：maps/images/audio/data 做类型匹配，fonts/other **不做**（matchesFamily 恒 true）。
7. **列表**：空目标行「未配置」占位 + 未配置组；其余行保持现状（已扁平、hover 删除）。

### Batch 3 — 地图本地化命名

- 新增 `entities/game/api/useMapTargetDisplayName(gameRootPath, locale)`：`Maps/<名>` → `Data/Locations` 同名位置 `DisplayName` → `[LocalizedText]` → `Strings/Locations` 按 locale 文本；无记录返回 null 回退原名。解析纯函数（记录 → key 提取）与加载分离，纯函数进单测。
- 消费点：弹窗 title、目标 chip 副文本、地图 picker 选项（`MapResourceOptions.ts` 加 optional `displayNameFor` 参数，由调用方注入，`features/resource-browser` 不新增依赖）；列表行副文本可选。
- 边界：非位置地图一律回退原名；不做官方本地化索引的精确查询 host command（现有出口只有 FTS 搜索，接口不匹配）。

## 文件级变更清单

| 批次 | 操作 | 文件                                                                                                                            | 内容                                                                                                       |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1    | 修改 | `asset-library/editors/LoadBindingEditor.tsx`                                                                                   | 删自动禁用 effect；commitTargets 的 logName 跟随                                                           |
| 1    | 修改 | `asset-library/ui/AssetLibraryWorkspace.tsx`                                                                                    | 两个创建函数（target `''`、family 取参数）；列表未配置组/占位                                              |
| 1    | 修改 | `asset-library/model/mapLoadBinding.ts`                                                                                         | 删 `placeholderLoadTarget`                                                                                 |
| 1    | 修改 | `workspaces/asset-library/index.ts`                                                                                             | barrel 去 `placeholderLoadTarget`                                                                          |
| 1    | 修改 | `features/cp-maker/state/useCpMaker.ts`                                                                                         | 导出守卫：Load 空 Target 跳过                                                                              |
| 1    | 修改 | `features/cp-maker/model/projectValidation.ts`                                                                                  | `isPatchEnabled` 对齐；`patchTargetMissing`                                                                |
| 1    | 修改 | `patch.sourceFileMissing` 所在 locale bundle（实施时定位）                                                                      | 新 key                                                                                                     |
| 1    | 测试 | `tests/unit/.../asset-library/mapLoadBinding.test.ts`；`tests/unit/features/cp-maker/model/`（buildContentJson fidelity、校验） | 删占位用例；新增空 Target 不导出、`'false'` 字符串停用                                                     |
| 2    | 重写 | `asset-library/editors/LoadBindingEditor.tsx`                                                                                   | 两段式结构（保留 `EditorComponent` 签名与文件路径）                                                        |
| 2    | 修改 | `asset-library/ui/AssetLibraryWorkspace.tsx`                                                                                    | 弹窗宿主 title/subtitle/footer 状态条                                                                      |
| 2    | 修改 | `asset-library/model/mapLoadBinding.ts`                                                                                         | `analyzeLoadBindings` + `matchesFamily`                                                                    |
| 2    | 重构 | `styles/workspace/asset-library-load-bindings.css`                                                                              | 删卡片徽章段；新增段样式；**保留共享类**                                                                   |
| 2    | 修改 | `locales/model` + `zh-CN` + `en-US` 的 `workbench/asset-library.ts`                                                             | `mapLoadBinding` keys 增删（三份同步）                                                                     |
| 2    | 测试 | `mapLoadBinding.test.ts`（matchesFamily）；`asyncOwnership.test.ts:44` 白名单条目按重写后实际情况保留或删除（stale 即挂）       | —                                                                                                          |
| 2    | 脚本 | `scripts/verify/verify-asset-library-ui.mjs`（5.5/5.6 在 `:402-458`；`:387-401` 的 4.4 属上一计划 B 轨道，不动）                | 5.5/5.6 断言随新结构重写（family picker → 未配置态 → 配齐后 footer「已生效」→ 列表行；停用态造数方式更新） |
| 3    | 新建 | `entities/game/api/useMapTargetDisplayName.ts`（+ barrel 导出）                                                                 | hook + 纯解析函数                                                                                          |
| 3    | 修改 | `features/resource-browser/ui/MapResourceOptions.ts`                                                                            | optional `displayNameFor`                                                                                  |
| 3    | 修改 | `LoadBindingEditor.tsx` / `AssetLibraryWorkspace.tsx`                                                                           | 消费显示名                                                                                                 |
| 3    | 测试 | 解析纯函数单测                                                                                                                  | —                                                                                                          |

## 实施批次与验收

- 顺序：Batch 1 → 2 → 3（1、2 触碰同文件必须串行；3 建议在 2 后）。每批独立可验收、可合并。
- **已知中间态**：Batch 1 删除自动禁用 effect 后，`verify-asset-library-ui.mjs` 5.6（`:434-458`，靠自动禁用造停用态）预期失败，Batch 2 更新造数方式后恢复；Batch 1 验收不跑 Playwright，不视为回归。
- 每批验收：`vp run lint`；`vp test run --configLoader runner`（定向 `src/tests/unit/pages/workbench/workspaces/asset-library`、`src/tests/unit/features/cp-maker`、`src/tests/architecture`）；`vp run build`。
- Batch 2 起：`vp run web:dev -- --host 127.0.0.1 --port 5175` 后跑 `vp run --filter @modforge/desktop test:asset-library-ui`，截图 1440/1680 明暗。
- 本计划不涉及 Rust 改动。

## 红线（对实施子代理）

- 工作树有未提交 WIP：一切修改叠加在当前工作树之上，**禁止 git commit / checkout / restore / stash / revert，禁止回滚任何现有改动**。
- locale 三份（`locales/model` / `zh-CN` / `en-US`）同步；组件内禁止硬编码用户可见字符串。
- 颜色走 `tokens.css` 主题变量；禁止字面量颜色。
- 操作失败走 `@shared/ui/notifications`；禁止静默吞错。
- React Compiler 已启用：不新增手写 `useMemo` / `useCallback`。
- `.map-load-preview-*`、`.map-load-section-*`、`.map-load-editor`、`.map-enabled-token-chip` 等被 `MapLoadSummaryEditor` / `GenericLoadSummaryEditor` 共享的类**不得删除或改名**。
- 前端只保留纯逻辑测试 + 架构测试；不写渲染类测试。
- Playwright 断言以数值/几何/状态为主，截图辅助。
