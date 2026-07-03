请基于现有代码重构 ModForge Studio 工作台的导航与项目管理交互。仓库根目录 `/home/arborsm/Projects/ModForge-Studio`，前端代码在 `apps/desktop/src`，遵循 `AGENTS.md` 的前端硬规则（pages 只做骨架/视图分发、文案走 `locales` 类型化 bundle、配色走 `styles/tokens.css` token、不直接调平台 API、React Compiler 已启用不要堆 useMemo/useCallback）。

## 背景：当前现状（要被重构掉的乱）

- 工作台入口原是浮层对话框（`WorkbenchLaunchpadNavigation.tsx`，已删除），目前已改成首页路由 `workbenchRoute: 'launchpad'|'workspace'`，见 `pages/workbench/ui/WorkbenchExperience.tsx`、`pages/workbench/ui/WorkbenchLaunchpadPage.tsx`、`WorkbenchLaunchpadDock.tsx`、`model/useWorkbenchLaunchpadRecentPages.ts`。
- "项目管理页"目前是 StudioDesk 的 Gallery 开关：`features/cp-maker/ui/StudioDeskProjectGallery.tsx` 由 `studioDeskGalleryOpen` 控制，挂在 `features/cp-maker/ui/StudioDesk.tsx`；`WorkbenchExperience` 用 `handleOpenProjectManagement`/`handleOpenProjectPage` 切这个布尔当隐性路由——要废除。
- draft 操作（load/create/import/copy/delete/export/updateMetadata）来自 `useCpMaker`（`features/cp-maker/state/useCpMaker.ts`），gallery 模型由 `buildStudioDeskModel` 产出（`features/cp-maker/model/studioDeskModel.ts`），列表组件 `StudioDeskProjectGallery` 需要 props：`model, onCreateDraftRequest, onImportDraftRequest, onOpenDraft, onCopyDraft, onDeleteDraft, onEditCurrentDraftProperties`。对话框 `CreateDraftDialog`/`ProjectPropertiesDialog`/`DeleteConfirmDialog`/`ExportDialog` 在 `features/cp-maker/ui/`。StudioDesk 分支接线在 `pages/workbench/ui/WorkbenchViewHost.tsx`（编辑时通过 `createElement` 注入这些回调）。
- 文案：`locales/dictionaries/{en-US,zh-CN}/workbench/shell.ts` 的 `workbenchNavigation` 段、`locales/model/workbench/shell.ts` 的 `WorkbenchShellCopy.workbenchNavigation` 类型；StudioDesk 文案在 `locales/dictionaries/{en-US,zh-CN}/workbench/studio-desk.ts` 与 `locales/model/workbench/studio-desk.ts`。
- 样式：`styles/workspace/workbench-launchpad.css`、`styles/features/cp-maker/studio-desk/gallery-and-controls.css`（这里有 `.studio-desk` 整面 `radial 光晕 + 96px 正交网格线` 背景，以及 `.studio-gallery-view::before` 右下角 ghost 十字/点阵装饰，重构后必须保留这套网格氛围）。
- 架构测试：`test/architecture/frontendModuleArchitecture.test.ts` 已有"launchpad 组件禁止 createPortal / role=dialog"的护栏。

## 目标：单一路由 + 单一列表

1. **只有两个路由**：`workbenchRoute: 'home' | 'workspace'`。废除 `studioDeskGalleryOpen` 当路由的用法。Home 是一整页可滚动页面；`workspace` 是进入某工作区/项目编辑外壳后的渲染。
2. **首页即项目库**，自上而下四段：
   a. Hero + 全局搜索（顶层搜索过滤浏览模块/制作类目/项目行）；
   b. **全局浏览模块**：6 张卡片（map/events/characters/buildings/items/mod-i18n），无需项目，进 preview 模式——这套浏览 vs 制作的区分**保留**；
   c. **项目制作入口**：只 3 张（map/events/items，**删除原来的"项目页面"卡片**）。与活动项目绑定：有活动项目→直接进对应 workspace edit；无活动项目→不 disabled，改为触发"滚动聚焦到项目库选项目"；
   d. **项目库**：直接复用 `StudioDeskProjectGallery` 作为唯一列表实现，含搜索、封面、状态 chip、右键菜单（打开/编辑属性/复制/删除/清除选中）、删除确认、新建/导入按钮。
3. **点锁定的制作类目（无活动项目）→ 滚动聚焦库区**：置 `makerPending: 'map'|'events'|'items'|null`，平滑滚动到库区并 `.is-focus` 高亮，库区顶部出现「为 ·X 制作 选择一个项目」横条，非当前项目行右侧出现「使用此项目 →」按钮；点它即 `loadDraft(key) → setWorkspaceMode(mode) setWorkspaceViewMode('edit') navigateToPatch(null) → workbenchRoute='workspace' → 清 makerPending`。取消条=清 makerPending。无草稿时同样滚到库区并弹 `CreateDraftDialog`，新建完成后若仍 pending 则自动进该 mode。
4. **删除**：`WorkbenchLaunchpadPage` 的内联 `InlineProjectPicker`、`ProjectRequiredNotice`；`WorkbenchExperience` 的 `handleOpenProjectManagement`/`handleOpenProjectPage` 中"管理页"分支；dock 里打开独立项目管理页的入口改成"滚到库区"。`handleOpenProjectPage` 简化为"进项目编辑外壳"（workspace='edit'、studio-desk）。
5. **StudioDesk 不再切换 Gallery**：gallery 移到 home，`StudioDesk` 永远只渲染编辑外壳（storyboard/main-stage/world-bible 等），删内部 `galleryOpen` 分支与 `.studio-mark-button` 回画廊按钮；`CreateDraftDialog`/`ProjectPropertiesDialog`/编辑相关对话框上提到 `WorkbenchExperience` 层由 home 页驱动（`CreateDraftDialog` 仍可由 `studioDeskCreateDialogOpenSignal` 触发，新建按钮直接弹）。
6. 顶栏 quick dock 的"项目管理"按钮改为"滚到首页库区"；Home 按钮 = 切 `workbenchRoute='home'`。保留 Ctrl/Cmd+K 切 home、Escape 回 workspace 的键盘习惯（`active` 时挂载）。
7. 文案：删 `launchpadPage`/原"项目页面"相关 key；在 `workbenchNavigation` 增 `makerPendingFormat(modeLabel)`、`projectLibraryTitle`、`projectLibraryHint`、`useProjectFor` 等新 key，en/zh/model 三处同步，禁止硬编码可见字符串。
8. 样式：新建 home 主画布样式块，照搬 `.studio-desk` 的 `radial 光晕 + 96px 网格线 + ghost 角图` 作整页背景，卡片用半透 + `backdrop-filter: blur(6px)` 叠在网格上而非糊死；库面板高亮 `.is-focus`（`box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-panel)`）；pending 横条用 `accent-soft` 底。配色全走 token，禁止硬编码 hex（icon 装饰色块 `data-tone` 例外）。
9. 测试：更新 `WorkbenchExperience.navigation.test.tsx`（原 `role="dialog"` 已改 `role="region"`，保留 navigation/守卫/关闭拦截断言）；新增 `WorkbenchHomePage` 测试覆盖 makerPending→滚动聚焦→选项目→清 pending、无对话框断言；架构测试护栏保留并补充"home/launchpad 组件禁止 createPortal、避免引入 `studioDeskGalleryOpen` 当路由"。
10. 验收：`vp run lint`、`vp run build`、`vp run --filter @modforge/desktop test` 通过；手动路径：无项目时点"地图制作"→库区聚焦+pending 条→选项目→进地图工作区；有活动项目时点→直接进；Cmd+K 切 home；dock 项目库按钮滚到库区。

参考设计稿 `docs/design/workbench-home-mockup.html`（可直接浏览器打开试交互：点制作类目会滚动聚焦库区并出 pending 条，深浅切换在右下角）。请按真实产品路径完整落地（加载/空态/错误/守卫/文案/测试），不要 MVP 或占位。
