# Compat 插件运行时重载（热加载）落地计划

状态：已实施（S1–S3 全部落地）。前置方案见 `compat-plugin-system-landing.md` §3.4 / C5；本文档把它收敛成可执行的切片。

## 1. 目标

插件管理页的"重载"按钮变成真重载：

- 重新扫描插件根目录 → 新增/删除的插件立刻反映到导航与诊断
- 代码包重新 import（编辑 `index.js` 后不重开应用即可看到新版）
- 数据包 descriptor、i18n bundle、asset schema、condition syntax 全部按新 manifest 重建
- 已打开的插件页面就地换新版组件；正在展示的旧版插件通知被撤回

非目标（本计划不做）：

- 单插件粒度热替换（整树重建已够快，语义也更干净）
- 文件系统监听自动重载（stretch，见 §6）
- CSP 收敛（landing 文档已单独立项）

## 2. 现状阻塞点（代码事实）

| #   | 阻塞                                                                                                               | 位置                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| B1  | `mergedRegistry` 在 `importWorkbenchPage()` 里构建一次，闭包缓存进 `workbenchPagePromise`，无任何重建入口          | `apps/desktop/src/app/app-shell/AppShell.tsx:100-164`                                  |
| B2  | 代码包 `import()` 的 URL 不变，webview 模块缓存直接命中，重 import 拿到旧模块                                      | `codePluginLoader.ts` `loadCodePlugins`                                                |
| B3  | 相对子导入（`import './util.js'`）不受 entry URL 版本参数影响，多文件插件换 query 也破不了缓存                     | 浏览器模块解析规则                                                                     |
| B4  | 数据包的重注册语义未定义：i18n bundle / asset schema / condition syntax 目前只有 register，没有 replace/unregister | `registerPluginI18nBundles.ts`、`registerAssetSchema`、`registerPluginConditionSyntax` |
| B5  | "重载"按钮只调 `listCompatPlugins` 刷新列表                                                                        | `PluginManagerWorkspace.tsx`                                                           |

好消息：dispose 链路已就位——`disposeCodePlugins` 会跑全部 `onDispose`，且 loader 已自动撤回插件发布的通知。

## 3. 方案

### 3.1 Registry 运行时重建（解 B1）

- 把 `importWorkbenchPage()` 内的构建段（listCompatPlugins → buildCompatRegistrations → registerPluginI18nBundles → mergePluginAssetSchemas → loadCodePlugins → createAppRegistry → registerPluginConditionSyntax）抽成 `buildWorkbenchRegistry()`，返回 `{ registry, diagnostics }`。
- 新增轻量 `workbenchRegistryStore`（zustand，`app` 层）：持有当前 registry + epoch。初始值由首次构建填充。
- `WorkbenchPageWithRegistry` 不再闭包捕获 registry，改为 `useSyncExternalStore` 订阅 store，`getWorkbenchModuleRegistration` / `workbenchModules` 从当前快照取。静态模块不变时引用保持稳定，不会引起非插件页面重渲染。
- 重载 = 重新执行 `buildWorkbenchRegistry()` 成功后整体 `set`（epoch + 1）。构建失败保留旧 registry，诊断进通知。

依赖方向注意：store 放 `app` 层；`features/compat-plugins` 只暴露 `reloadCompatPlugins()` 纯函数（dispose + 重新加载 + 返回 registrations/diagnostics），不写 store，由 `app` 层编排。

### 3.2 import 缓存破除（解 B2/B3）

不用 query 参数（`?v=N` 只破 entry，子导入仍命中缓存）。改用**路径段版本前缀**：

```
plugin://<id>/__v<N>/<entry>
```

- `N` 是重载 epoch，每次重载 +1。entry 里的相对导入自然解析为 `plugin://<id>/__v<N>/util.js`，整棵模块树都被换名，缓存必然失效。
- `FileSystemPort.resolvePluginUrl(pluginId, relativePath)` 增加可选 `epoch` 参数；loader 在重载时传当前 epoch。`readPluginAsset` 等运行时读取**不带** epoch（读的是磁盘当前内容，缓存无所谓；且 fetch 不走模块缓存）。
- 宿主 handler 端剥掉首段 `__v\d+/` 前缀再进 `resolve_plugin_protocol_path`：
  - Tauri：`plugin` protocol handler 在拆分 id/path 后剥离（顺手确认当前取的是 `uri().path()`，query 不会漏进来）。
  - Electron：`electron/main.ts` 的 plugin handler 同样剥前缀；保持与 Rust 同语义，补两侧单测（带前缀/不带前缀/伪造 `..__v1__` 拒绝）。
- 安全面不变：剥前缀发生在既有绝对路径/扩展名白名单校验之前，不放宽任何规则。

### 3.3 重载流程（解 B4/B5）

`reloadCompatPlugins()`（features/compat-plugins 暴露）：

```
1. disposeCodePlugins()          # onDispose + 通知撤回（已有）
2. listCompatPlugins()           # 重新扫描根目录（后端每次都现扫，无缓存）
3. registerPluginI18nBundles()   # 改为整树替换：store.setBundles(map) 而非 merge
4. mergePluginAssetSchemas()     # 重注册前清掉 plugin 来源的 schema（registerAssetSchema 增 replace 语义或按来源过滤）
5. loadCodePlugins(epoch)        # 带新 epoch 重新 import
6. registerPluginConditionSyntax() # 同上，整树替换
7. buildCompatRegistrations() + code registrations → 返回给 app 层 set store
```

- 中途失败：该插件进 diagnostics，其余继续（与启动同策略）；整体失败则保留旧 registry 并弹 error 通知。
- 已打开的插件页面：module id 稳定（`compat-<pluginId>:<pageId>`），新组件类型替换后 React 自动 remount；旧组件卸载时其局部 cleanup（BGM、timer）正常跑。
- i18n：切换 locale 的既有路径（registerPluginI18nBundles 替换式）顺便修掉"切语言后插件侧栏标签不更新"的潜在问题。

### 3.4 插件管理页 UX

- "重载"按钮：进行中 disable + loading 文案；完成后 toast（成功 N 个 / 失败 M 个，失败详情链接到诊断列表）。
- 诊断列表（已有）展示本次重载的新失败项。
- 补一个"打开插件目录"按钮（走既有 `openPath` 宿主命令开数据目录 `compat-plugins/`），让"丢文件夹 → 重载"闭环。

## 4. 实施切片

| 切片 | 内容                                                                            | 验收                                                                                  |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S1   | registry store 化 + `reloadCompatPlugins()` 全链路（3.1 + 3.3，暂不含缓存破除） | 新增/删除 manifest 级插件（数据包）重载后立即可见；旧通知被撤回；打开中的插件页不白屏 |
| S2   | epoch 路径前缀 + 双宿主 handler 剥离 + 单测（3.2）                              | 改代码包 `index.js` → 重载 → 页面跑新代码；多文件插件子模块同样更新                   |
| S3   | 管理页 UX（3.4）                                                                | 重载有 loading/结果反馈；可从管理页打开插件目录                                       |

每片独立可合并、可真实使用。S1 先落地能让数据包作者立刻受益；S2 才是代码包开发者体验的关键。

## 5. 测试计划

- 单元（`src/tests/unit/`）：
  - `reloadCompatPlugins` 编排：dispose 先于 import、失败插件隔离、空列表重载
  - i18n/schema/condition syntax 的替换语义（注册两次后者生效，无泄漏）
  - epoch URL 生成（`resolvePluginUrl` 带 epoch 的三种宿主形态）
- Rust 单测：`__v<N>/` 前缀剥离 + 伪造前缀拒绝（`compat_plugin_tests.rs`）；Electron handler 侧 TS 单测镜像
- 架构测试：compat-plugins feature 不出现对 `app` 层的反向 import
- 手动/截图：启动 → 改示例插件文案 → 管理页重载 → 页面文案更新且导航无重复项；删除插件目录 → 重载 → 导航项消失

## 6. Stretch（不在本计划内）

- 插件根目录文件监听 → 自动触发重载（dev 体验；需要后端 watcher 命令，单独切片）
- 重载时保留插件页面内部状态（目前 remount 全丢；多数场景可接受，示例游戏的 sessionBest 因模块级存活反而保留——语义自洽）
