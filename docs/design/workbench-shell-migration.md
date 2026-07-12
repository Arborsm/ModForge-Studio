# 工作台骨架替换实施计划

> 范围：把 `prototype/workbench-shell-mock.html` 的信息架构落到现有产品  
> 原则：壳子换新，内容复用现系统  
> 对照原型：`prototype/workbench-shell-mock.html` 及 `workbench-shell-home*.png` 等截图  
> 规范：视觉 / IA 见 [`page-design-spec.md`](./page-design-spec.md) §0；产品形态见 [`../DESIGN.md`](../DESIGN.md) Workbench；分层见 [`../frontend-architecture.md`](../frontend-architecture.md)  
> 最后更新：2026-07-11

---

## 1. 目标与边界

### 1.1 目标 IA（mock 已收敛）

| 区域         | 行为                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| **顶栏**     | 产品 `TopMenuBar`：品牌 / 视图菜单 / **中央项目标题 + 项目菜单** / 状态 / 主题 / 窗控 |
| **左导航**   | 可展开分组：主页、浏览（地图/事件/角色/建筑/物品）、工具、开发；可收成图标轨          |
| **主页三态** | 有内容 · 空世界 · 无项目（宽屏双栏）                                                  |
| **工作区**   | 同一页内 **浏览 / 编辑** 切换；编辑依赖当前项目；无项目时编辑锁                       |
| **布局**     | 宽屏占满；侧栏宽可拖；中栏吃剩余宽度                                                  |

### 1.2 明确不做什么

- 不重写角色 / 物品 / 地图 / 事件工作区内部编辑器
- 不替换 `HostCommandClient` / `cp-maker` 草稿与导出链路
- 不把主页做成「项目管理大表」为主（项目管理是入口，不是整页主题）
- 不一次改完所有视觉细节；按可合并切片交付

### 1.3 产品事实源（替换时必须接上）

| 能力                         | 现位置                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 工作台总编排                 | `pages/workbench/ui/WorkbenchExperience.tsx`                                                   |
| 主页                         | `pages/workbench/ui/WorkbenchHomePage.tsx` + `features/cp-maker`（`StudioDeskModel` / 草稿库） |
| 顶栏                         | `widgets/top-navigation/ui/TopMenuBar.tsx`（工作台中央 `projectMenu` + `historyControls`）     |
| 浏览 ≈ preview / 编辑 = edit | `workspaceViewMode: 'edit' \| 'preview'`                                                       |
| 多栏布局                     | `WorkbenchLayoutHost` → `shared/workspace` `WorkspaceLayout`                                   |
| 模块注册                     | `app/registry-setup.ts` + `WorkbenchViewRegistration`                                          |
| 项目 / 草稿                  | `useCpMaker`、`CreateDraftDialog`、`ExportDialog`、`ProjectPropertiesDialog`                   |
| 命令 / 事件                  | `app/providers/workbenchOrchestration`、typed event/command                                    |

---

## 2. 映射：mock → 现系统

```text
mock                          →  product
─────────────────────────────────────────────────────
data-view=home                →  workbenchRoute === 'home'
data-view=workspace           →  workbenchRoute === 'workspace'
browse                        →  workspaceViewMode === 'preview'
edit                          →  workspaceViewMode === 'edit'
edit-locked                   →  edit && !cpMaker.activeDraft
nav browse:map|events|…       →  workspaceMode + open root/preview route
nav tools / dev               →  registry workbenchViews (mod-i18n / dev-*)
项目标题菜单                  →  扩展 TopMenuBar.projectMenu + StudioDesk 数据
主页·有内容                   →  hasActiveProject && content summary > 0
主页·空世界                   →  hasActiveProject && 无实质内容
主页·无项目                   →  !hasActiveProject（仍可有 recent gallery）
内容数字                      →  已有 preview status counts
                                (characterCount / itemCount / …)
需关注                        →  taskSummary (export/conflict) + directory status
继续工作                      →  launchpad recent / 最近编辑 patch 或资源
三栏骨架                      →  保留 WorkspaceLayout；几何/CSS 对齐 mock
                                贴边网格（ROOT_PADDING=0, 5px gap,
                                1px hairline resizer, docked 无圆角卡片壳）
                                + 顶工具条 + 浏览/编辑分段
```

### 命名对齐

- UI 对外用「浏览 / 编辑」
- 代码可继续 `preview | edit`，或逐步 rename 为 `browse | edit`（可选，单独 PR，避免大面积改名）

---

## 3. 架构落点（FSD）

```text
app/
  registry-setup.ts              # 导航分组配置可从 registry 派生
  providers/workbenchOrchestration

widgets/
  workbench-shell/               # 新增：左导航壳、壳布局
  top-navigation/                # 改造：中央项目标题菜单
  status-bar/                    # 基本不动

pages/workbench/
  ui/WorkbenchExperience.tsx     # 瘦身：只编排 route + mode + 插槽
  ui/WorkbenchHomePage.tsx       # 重写三态 UI，数据仍走 props/hooks
  ui/WorkbenchLayoutHost.tsx     # 壳样式对接；布局引擎保留
  model/*                        # 导航 / route / recent 抽纯逻辑

features/cp-maker/               # 项目 CRUD、导入导出、属性对话框复用
entities/*                       # 只读计数与摘要，不进 shell UI 类型
shared/
  contracts/registry.ts          # 如需 nav group 元数据
  styles/workspace/*             # shell / home / nav 样式
```

### 规则

- `pages` 只做分发与插槽；导航条目由 **registry + 静态配置** 组成，禁止 feature 运行时自注册。
- 跨 feature 仍走 event/command；主页点「导出」→ 已有 `onExportProject` / 对话框链路。
- 文案进 `locales`；颜色走 `tokens.css`。
- 依赖方向：`app -> pages -> widgets -> features -> entities -> shared/contracts`。

---

## 4. 分阶段实施

### Phase 0 — 冻结决策与对照表

产出：

1. 以本文件 + mock 三态截图为验收基准。
2. 列出 **保留 / 废弃** 的现主页能力：

| 现能力                                       | 决策                                                              |
| -------------------------------------------- | ----------------------------------------------------------------- |
| StudioDesk 项目库画廊                        | **迁入「无项目」最近列表 + 标题栏项目菜单**；主页有内容态不铺整库 |
| 全局搜索 command palette                     | **延后**或收到顶栏 / 快捷键，不阻塞壳替换                         |
| GooeyNav 模块切换                            | **下沉到左导航**；顶栏去掉工作台模块 GooeyNav                     |
| LaunchpadDock                                | **收敛**：最近页进主页活动 / 继续工作；标题栏 dock 可删或极简     |
| Create / Import / Export / Properties 对话框 | **全部保留**，只改入口位置                                        |

验收：产品 / 设计对「有内容页不再是大画廊」无异议。

---

### Phase 1 — Shell 骨架：左导航 + 顶栏项目中心

#### 1.1 左导航 widget

- 新增 `widgets/workbench-shell/WorkbenchSideNav`（或等价命名）。
- 分组：主页 · 浏览 · 工具 · 开发；展开 / 折叠 + 收起图标轨。
- 数据：静态 mode 列表 + `workbenchViews` 过滤 dev / i18n。
- 交互：
  - 主页 → `setWorkbenchRoute('home')`
  - 浏览项 → `workspaceMode` + `preview` + `route=workspace`
  - 带 prefer-edit 时走现有 `openProjectWorkspace` / edit 守卫

#### 1.2 TopMenuBar 工作台模式

- 中央 **项目标题按钮**（名称、版本、空态「未选择项目」）。
- 下拉：最近项目、新建 / 打开 / 导入、设置、显示目录、导出、关闭项目。
- 接 `StudioDeskModel` / `cpMaker` 已有 API；不要在 widget 里直连 host。

#### 1.3 Experience 布局网格

```text
grid-rows: titlebar | 1fr
1fr = [side-nav | main]
main = home | workspace（现有 Suspense 分支）
```

- `WorkbenchLaunchpadDock` 已从 titlebar 移除（PR4 删除实现与样式）。
- 保持 `InitializationOverlay`、对话框、unsaved guard。

验收：

- 无业务内容也能在 mock 同构壳里切 home / map-preview / characters。
- 项目菜单可切换 / 清除当前草稿。
- 截图：展开导航、收起导航、无项目标题态。

---

### Phase 2 — 主页三态替换

重写 `WorkbenchHomePage` UI，**props 面尽量复用**（`studioDeskModel`、`taskSummary`、`hasActiveProject`、handlers）。

#### 2.1 状态机

```text
!gameDirectoryReady     → 既有「游戏目录」引导（可保留独立条）
!hasActiveProject       → home-none
hasActiveProject && empty → home-empty
hasActiveProject && rich  → home-rich
```

「empty」定义建议：各模块 count 全 0 且无 active draft patches（与 `taskSummary` / preview snapshot 对齐，缺则先用 draft 补丁数近似）。

#### 2.2 有内容（宽屏双栏）

- **左**：继续工作（recent 首条）→ 内容五格（地图 / 事件 / 角色 / 建筑 / 物品 count）→ 最近活动
- **右**：需关注（导出 / 冲突 / 构建）→ 项目 meta（UniqueID / 版本 / 路径）+ 打开目录 / 关闭
- **顶**：导出 / 项目设置 / 新建…（与 mock 一致）
- **禁止**再铺一整页项目画廊
- 布局：`grid minmax(0,1fr) + minmax(300px, 360–420px)`；`<1100px` 单栏堆叠

#### 2.3 空世界

- 居中「创建第一项」→ 调 `onProjectWorkspaceOpen` / create 流程
- 次要：设置 / 目录 / 关闭

#### 2.4 无项目

- 项目管理三动作：新建 / 打开 / 导入（接现有 dialogs）
- 最近项目列表（gallery）：打开、从列表移除、目录
- 右栏：无需项目的浏览入口 → `onRootWorkspaceOpen(mode)` preview

验收：

- 三种场景截图对齐 mock（建议 1680 宽）。
- 所有按钮接到真实 handler（禁止死按钮）。
- locale 中英文齐全。
- 删或大幅删旧 `workbench-home-*` 样式，避免两套主页 CSS。

---

### Phase 3 — 工作区页内「浏览 / 编辑」壳

#### 3.1 工具条

- 在 workspace 主区域顶部加 mock 风格 toolbar：模块名 · 模式 · **浏览 | 编辑**。
- 绑定现有 `workspaceViewMode` + unsaved guards（已有 `handleWorkspaceViewModeChangeWithGuards`）。

#### 3.2 编辑锁

- `edit && !activeDraft`：内联 gate（选择项目 / 继续浏览），对应 mock `edit-locked`。
- 与现有 `workspaceNavigationDisabled={edit && !draft}` 语义统一。

#### 3.3 布局

- 继续 `WorkspaceLayout`；样式向「全宽分栏 + hairline」靠拢（见 `docs/design/page-design-spec.md` + mock）。
- 不强制砍掉 layout 的高级能力（预设 / 显隐）；视图菜单仍控面板。

验收：

- 有项目：浏览 ↔ 编辑可切，编辑进 maker 路由。
- 无项目：点编辑出现 gate，不丢当前 preview。
- 角色 / 物品 / 地图面板**内容**与改壳前一致（回归截图或现有 unit）。

---

### Phase 4 — 数据摘要与「继续工作」做实

- **内容 count**：统一从 preview / runtime snapshot 或轻量 query 注入 home（避免 home 自己扫盘）。
- **继续工作 / 最近活动**：优先 `useWorkbenchLaunchpadRecentPages` + 草稿 patch 最近编辑；无数据时空态文案。
- **需关注**：`taskSummary` + export 队列真实数；构建态若无 API 先显示目录 / 就绪状态。

验收：有真实项目时数字与列表非写死 mock。

---

### Phase 5 — 清理与护栏

- 删除废弃：旧 home 大块 DOM、无用 dock、重复 GooeyNav 工作台入口。
- 架构测试：`shared` 不依赖 pages；widgets 不 import platform；禁止硬编码用户文案。
- 样式：`styles/workspace` / `styles/features` 落位，token only。
- 文档：必要时在 `page-design-spec.md` 补「壳 IA」一小节。
- 手工路径：`vp run dev` 走三态主页 + 浏览编辑锁 + 项目切换。

---

## 5. 推荐 PR 切分

| PR      | 内容                                                                    | 风险               |
| ------- | ----------------------------------------------------------------------- | ------------------ |
| **PR1** | SideNav + Experience 网格 + TopMenuBar 项目菜单（功能可切，视觉可先糙） | 中：导航路径多     |
| **PR2** | Home 三态 UI + 接现有 project handlers                                  | 中：信息架构变化   |
| **PR3** | Workspace toolbar + edit gate + 壳样式                                  | 中：与 layout 交互 |
| **PR4** | 摘要 / recent 真实数据 + 清理旧 UI                                      | 低–中              |

每 PR 至少：

```bash
vp run lint
vp test run --configLoader runner <affected-tests>
```

以及截图：home 三态 / browse / edit-locked（UI 变更时）。

---

## 6. 风险与策略

| 风险                                       | 策略                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `WorkbenchExperience` 过大，改挂导航易回归 | PR1 只动壳插槽，不改 cpMaker 状态机                         |
| 浏览 / 编辑与 preview / edit 文案双轨      | UI 文案先换；代码 rename 单独 PR                            |
| Home 依赖的 count 在未进过模块时为空       | 空显示 0 或「—」；Phase 4 补预取                            |
| 项目管理入口变多（菜单 + 主页 + 对话框）   | 统一 handler，禁止复制业务逻辑                              |
| 宽屏 vs 窄窗                               | home `grid 1fr + 300–420px`；&lt;1100 单栏堆叠（mock 已有） |

---

## 7. 完成定义

1. 用户打开工作台看到的是 **mock 同构壳**（左导航 + 项目标题栏 + 三态主页 + 页内浏览 / 编辑）。
2. 打开项目、新建 / 导入、导出、属性、各模块预览 / 编辑仍走 **现有 cp-maker 与 workspace panels**。
3. 旧 launchpad 大页 / 顶栏 GooeyNav 模块条不再是主路径。
4. 架构与 locale 规则不破；关键路径有截图或明确手工清单。

---

## 8. 建议启动顺序

1. **PR1 壳**（无导航几乎无法验证后续主页）
2. **PR2 主页**（用户感知最大）
3. **PR3 工作区模式条**
4. **PR4 数据与清理**

建议首刀：`WorkbenchSideNav` + `TopMenuBar` 项目中心 + `WorkbenchExperience` 布局网格。

---

## 9. 相关文件

| 类型     | 路径                                                           |
| -------- | -------------------------------------------------------------- |
| 原型     | `prototype/workbench-shell-mock.html`                          |
| 截图脚本 | `prototype/screenshot-workbench-shell-mock.mjs`                |
| 页面规范 | `docs/design/page-design-spec.md`（§0 壳 / 主页）              |
| 产品设计 | `docs/DESIGN.md`（Workbench 节）                               |
| 前端架构 | `docs/frontend-architecture.md`（Workbench shell composition） |
| 主编排   | `apps/desktop/src/pages/workbench/ui/WorkbenchExperience.tsx`  |
| 主页     | `apps/desktop/src/pages/workbench/ui/WorkbenchHomePage.tsx`    |
| 顶栏     | `apps/desktop/src/widgets/top-navigation/ui/TopMenuBar.tsx`    |
| 注册表   | `apps/desktop/src/app/registry-setup.ts`                       |
