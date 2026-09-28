# 素材库工作区改造计划：地图编辑器挂载 API + 资源替换/工具条重设计

> 状态：实施中（2026-09-09）
> 关联：`AGENTS.md`、`docs/design/workbench-design-principles.md`、`docs/design/page-design-spec.md`、`docs/frontend-architecture.md`、`docs/dev-verification.md`

## 背景与目标

用户对素材库页面三点批评：

1. 资源替换 UI 差 → B 轨道（侧栏 + 编辑弹窗）。
2. 地图编辑器绑死在地图制作页（点「地图编辑器」按钮直接切模块）→ A 轨道（抽挂载 API，素材库内嵌）。
3. 顶部工具条差 → C 轨道（降噪 + 控件规范化）。

## 红线（对实施子代理）

- 工作树有大量未提交 WIP（`AssetLibraryWorkspace.tsx`、`AuthoringRuntime.tsx`、`mapEditorSessions.ts`、asset-library/map/studio-desk locale、asset-library 两个 CSS、asyncOwnership.test.ts 等均有 M/MM/?? 状态）：**一切修改叠加在当前工作树之上，禁止 git commit / checkout / restore / stash / revert，禁止回滚任何现有改动**。
- UI 文案走 typed locale bundles（zh-CN + en-US + `locales/model` 类型三处同步）；组件内禁止硬编码字符串。
- 颜色走 `tokens.css` 主题变量；禁止字面量颜色。
- 错误统一走 `@shared/ui/notifications`，禁止静默吞。
- React Compiler 已启用：不新增手写 `useMemo` / `useCallback`。
- 前端无渲染测试：验证 = lint / build / unit / architecture + Playwright 脚本截图。

## A. 地图编辑器挂载 API（去跨模块绑定）

### 现状耦合（已核实）

- 素材库地图资产按钮「地图编辑器」：`AssetLibraryWorkspace.tsx:201-204` = `pendingMapAssetEditStore.requestEdit` + `environment.onOpenModule('map-authoring')`。
- `AuthoringRuntime.tsx:149-157` 消费 pending；`:175-190` 文档加载；`:194-208` 重启恢复；`:290-324` 资产会话渲染分支。
- 会话 store：`workspaces/map/model/mapEditorSessions.ts`（`useMapEditorSessionStore`，`map/index.ts:10` 已导出，模块无关）。
- `MapAssetEditorSession`：`map/editors/MapAssetEditor.tsx:1190`，props `{ relativePath, document, draftPort, resources }`。
- `EditorResources`：`features/cp-maker/model/workspaceRegistry.ts:15-36`，`onReturnToLibrary` / `onOpenMapAsset` / `onEditPatchTiles` / `onReadProjectAsset` 均为 optional。

### 目标契约

新建 `workspaces/map/editors/MapAssetEditorHost.tsx`（经 `map/index.ts` 导出）：

```ts
type MapAssetEditorHostProps = {
  draftPort: AssetDraftPort
  loadProjectMapAsset: (relativePath: string) => Promise<{ content: string }>
  resources: EditorResources // 环境基础字段；host 覆盖会话回调
  onReturnToLibrary: () => void // 表面专属的返回行为
  onSessionOpen?: (relativePath: string) => void // 表面专属的打开伴随逻辑
}
```

- host 职责：消费会话、文档加载（`useLatestTask`）、加载/错误/重试 UI、装配 `onOpenMapAsset` / `onReturnToLibrary`、渲染 `MapAssetEditorSession`；无会话返回 null。
- 打开入口 = `useMapEditorSessionStore.openMapAsset`（已公开）；host 不提供打开 API。
- 任何持有项目 draft port 的模块 runtime 都可挂载（「做成 API、可挂载任何页面」）。图块会话（tiles session）是 map-authoring 专属，不进 host。

### 素材库内嵌

- 会话存在且 port 非空时，`MapAssetEditorHost` 整区替换 `WorkspaceSplitView`（Dialog 保留在树中）；不再切模块。
- 按钮文案 `editInMapEditorAction`（「地图编辑器」）改名 `editMapAction`（「编辑地图」/ "Edit map"）。
- 返回 = 会话 store 的 `closeMapAsset()`（注意真名，不是 `closeMapAssetSession`），素材库选中态自然保留。
- 图块会话回调不传（类型已 optional）。
- 分包：素材库 chunk 静态 import host 会把整个地图编辑器拉进首载。host 在素材库侧用 `React.lazy` + `Suspense` 挂载（map-authoring 侧本就在 map chunk 内，保持静态 import）；`viteConfig.test.ts` 的 chunk-group 断言必须过。
- 会话可见性语义（store 是全局单例，写清楚避免验收误判）：
  - 素材库内打开的会话，切到 map-authoring 后那边的 host 会渲染同一会话——**这是期望行为**（会话跨模块存活本来就是 store 的设计）。
  - 重启恢复持久化（`useModulePersistentState('map-editor/asset-session')`）只在 map-authoring 挂载时生效；素材库内打开的会话**不参与重启恢复**——同样是有意的行为差异。

### map-authoring 侧

- 删 pending 消费 effect；资产会话渲染分支改挂 host。
- 保留：tiles 会话全家、重启恢复（`useModulePersistentState('map-editor/asset-session')`）、`openMapAsset` bookkeeping 包装（作为 `onSessionOpen`）。
- `resources` 对象保持原样传给 host（host 覆盖 `onOpenMapAsset` / `onReturnToLibrary`）。

### 删除 pendingMapAssetEditStore

- 删 `shared/lib/app-state/pendingMapAssetEditStore.ts`；全仓 grep `pendingMapAssetEdit` 零残留。
- `tests/architecture/asyncOwnership.test.ts` 移除其白名单/条目（mapEditorSessions 注册保留）。
- `docs/frontend-architecture.md` supplementary stores 清单（约 :255-258）删除提及。

### A 轨道文件清单

| 操作 | 文件                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新建 | `workspaces/map/editors/MapAssetEditorHost.tsx`                                                                                                                                                                                     |
| 修改 | `AuthoringRuntime.tsx`、`AssetLibraryWorkspace.tsx`、`workspaces/map/index.ts`（追加导出）、zh/en/`locales/model` 的 asset-library bundle（key 改名）、`tests/architecture/asyncOwnership.test.ts`、`docs/frontend-architecture.md` |
| 删除 | `shared/lib/app-state/pendingMapAssetEditStore.ts`                                                                                                                                                                                  |

## B. 资源替换重设计（侧栏 + 弹窗）

### 侧栏（`AssetLibraryWorkspace.tsx:1225-1307` + `asset-library-load-bindings.css`）

- header 收敛为一行：「资源替换」小号 bold + 「N 项替换」tertiary + `ml-auto` 的 ＋ icon-button（title=新建替换）；删除 `loadBindingsHint` 提示段落（文案「在右侧编辑」与实际弹窗行为不符，直接删 key）。
- 行扁平化：去边框卡片（`.asset-library-load-binding-main` 去 border/bg/圆角装饰），行间 hairline 分隔，hover `bg-surface-active`，选中 `bg-accent-soft`。
- 删除按钮 hover / focus-within 才显示（opacity 0→100）。
- 去状态徽标：停用 = 行 45% 透明 + `title` 提示（「已停用」/「由条件控制：…」，key 保留用于 tooltip）；启用无任何标记。组头保留（一级分类计数例外）。

### 编辑弹窗（`LoadBindingEditor.tsx`）

- 删 intro 段落与三张步骤卡头部的 hint 文案（`introHint` / `targetsHint` / `fromFileHint` / `previewHint`）。**已核实 `previewHint` 被 `MapLoadSummaryEditor.tsx:72` 复用**：四个 key 全部保留在 locale bundle，只删素材库侧的使用点，不动 key 本身。
- 保留编号步骤、计数徽标、✓、预览表、高级折叠、expert 模式能力。

## C. 工具条（`AssetLibraryWorkspace.tsx:859-1005` + `asset-library.css`）

- 保存态：文本 → 8px 圆点 `data-state` 指示（saving=accent 脉冲 / saved=中性 / dirty=中性脉冲 / error=danger），外层保留 `aria-live`，文本转 `sr-only`。
- 类型过滤：原生 `<select>` → `CompactSelect`（`shared/ui/CompactSelect.tsx`，API：value/options/onChange/ariaLabel/placeholder/triggerClassName）。
- 删「显示 N/M 项」常驻计数（组头已有计数）。
- 导入菜单：自定义浮动 div → `@radix-ui/react-popover`（依赖已有 `package.json:158`；若 `shared/ui` 已有 Popover 包装则优先用包装）解决点外部不关闭；分体按钮视觉收敛为单控件（hairline 分隔）。
- 布局分组：左簇（搜索 + 过滤）/ 右簇（视图切换 + 导入）。

## 实施批次与验收

- Batch 1 = A 轨道；Batch 2 = B + C 轨道（同文件，顺序执行避免冲突）。
- 主代理验收门：`vp run lint`；`vp test run --configLoader runner`（unit + architecture 定向，**含 `viteConfig.test.ts` chunk-group 断言**和 `asyncOwnership.test.ts`）；`vp run build`；Playwright `verify-asset-library-ui.mjs` 扩展断言 + 截图（1440/1680 × 明暗）。
- Playwright 扩展断言（Batch 2 一并更新脚本）：
  - 「编辑地图」→ 编辑器画布挂载且未切模块（素材库 nav 仍激活）；返回后网格恢复、原资产保持选中。
  - 侧栏行：删除按钮默认不可见 hover 可见；停用行透明度；无状态徽标。
  - 工具条：保存圆点存在、过滤为 CompactSelect 触发器、无「显示 N/M 项」文本。
