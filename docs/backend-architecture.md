# ModForge Studio — 后端架构

Rust/Tauri 后端（`apps/desktop/src-tauri`）的分层、依赖方向与模块约定。前端对应物见 `docs/frontend-architecture.md`；Host Runtime、命令绑定与 wire 协议机制见 `AGENTS.md` 的「后端硬规则」。

本文件的规则由 `apps/desktop/scripts/check-backend-architecture.mjs` 强制执行（CI 每次 PR 运行），不是风格建议。规则有编号（R1–R6），检查报告会引用编号。

## 分层总览

四层 + 装配入口：

| 层                         | 位置                                                                                                                                       | 职责                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| host（入口与传输）         | `src/host/`（`host_handle.rs`、`host_runtime.rs`、`sidecar.rs`、`host_commands.rs`、`dev_asset_bridge.rs`）、`src/bin/modforge_sidecar.rs` | IPC 帧、命令调度、lane/pool/resource 语义、取消、遥测。只做传输与调度，不写业务          |
| domain（业务）             | `src/domain/`                                                                                                                              | launcher、nexusmods、ai、localization、cp_maker、saves 等业务领域。业务规则只出现在这里  |
| infrastructure（技术实现） | `src/infrastructure/`                                                                                                                      | fs、game_formats、http、shell、text_encoding。纯技术能力，不含 launcher/Nexus 等领域规则 |
| support（横切）            | `src/support/`                                                                                                                             | logging、cleanup。任何层可引用；自身不依赖业务层（例外见 R2）                            |
| 装配入口                   | `src/lib.rs`、`src/main.rs`                                                                                                                | 只做拼装（tauri builder、tray、handler 注册），不承载业务或策略                          |

依赖方向（箭头 = 允许依赖）：

```
lib.rs / main.rs（装配入口）

host ──────► domain ──────► infrastructure
  │            │                 │
  └────────────┴────► support ◄──┘   （横切层：任何层可用，反向禁止，R2 例外）
```

## 依赖规则

| 规则 | 内容                                                                                                                                         | 现状                    | 例外 / 白名单                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| R1   | `infrastructure` 禁引 `domain`（任何形式，含内联限定路径）                                                                                   | 0 违规                  | 无                                                      |
| R2   | `support` 禁引 `domain`，共享内核 `app_paths` 例外                                                                                           | 0 违规                  | 规则级例外，非白名单                                    |
| R3   | `domain` 业务文件禁引 host 运行时与传输层（`crate::host_runtime` / `host_commands` / `sidecar`、`tauri::`）；`commands.rs` 是绑定 seam，允许 | 仅 seam 文件引用        | `domain/ai/mod.rs` 的 `ok_ai` 是文档化 seam 助手        |
| R4   | `nexusmods` 禁引 `launcher`；目标方向是 `launcher → nexusmods` 单向                                                                          | 0 违规（2025 批次清零） | 无                                                      |
| R5   | 业务域禁引 `app_ui`（UI 状态持久化不是业务依赖）                                                                                             | 0 违规                  | `commands.rs` seam 与 `SEAM_FILES` 豁免（与 R3 同条件） |
| R6   | `src/` 根目录只允许既有 5 个文件（`domain.rs`、`infrastructure.rs`、`lib.rs`、`main.rs`、`support.rs`）；新文件必须进入对应层级目录          | 全量匹配                | 无                                                      |

白名单语义：条目 = 已登记的遗留耦合。**修复对应耦合时同步删除条目**；删除前先修代码，否则检查会失败。`--strict` 模式把白名单条目升级为违规，用于测量迁移进度。白名单按文件粒度——已在名单里的文件新增同类引用不会产生新条目，这是刻意的粗糙度；但新文件、新方向必须走规则本身。2025 重构批次后 R4/R5 两个白名单均已清零，集合与语义保留，供未来新的迁移清单复用。

检查器是 grep 级启发式闸门：跳过 `//` 行注释，不做 AST 解析（块注释内的 import、宏展开产物可能漏检）。它防的是"不知不觉又多一处耦合"，不是替代评审。

## 命令绑定 seam

`domain/*/commands.rs` 是 host ↔ domain 的接缝，规则见 `AGENTS.md`「后端硬规则」。要点：

- 每个 command 的绑定点是 `#[host_command(...)]` 属性，函数体只写 domain 调用；
- `ok_ai`（`domain/ai/mod.rs`）和资源锁手写三件套（`save_mod_i18n_files` 等）是文档化例外，算 seam 而不是业务代码；
- seam 之外，domain 业务代码不感知 host 的存在（R3 就是这条边界的机械表达）；
- seam 也是跨边界读取的合法位置：业务函数需要的 UI 状态开关（如 `force_non_premium`）由 `commands.rs` 读取后作为参数传入，而不是业务函数自己去读（R5 的豁免条件与 R3 一致）。

## 共享内核

`domain/manifest.rs`、`domain/app_paths.rs` 是跨域共享的纯逻辑/路径常量，性质上不属于任何单一业务域：

- 任何层（含 support）可引用共享内核（R2 例外只放行 `app_paths`）；
- 共享内核禁止变成业务规则容器：放进来的东西必须是"无业务的纯事实"（ID 归一化、路径布局）；
- 新增跨域共享时优先考虑这里，其次是 `support`（纯技术）。候选演进（`domain/shared` 目录、`app_paths` 移入 `infrastructure/fs`）尚未定论，暂维持现状。

## 域间依赖方向

- `launcher → nexusmods`：launcher 是编排方，nexusmods 是远程 API 域。nexusmods 需要的设置派生值由调用方显式注入——标准载体是 `domain/nexusmods/request.rs` 的 `NexusRequestContext`（2025 批次按此模式清零了 R4）：nexusmods 只消费上下文字段，永远不知道 `LauncherSettings` 的存在。launcher 面向前端的 wire 类型（catalog/详情等）由 nexusmods 定义、launcher 侧 `pub use` 重导出。
- `app_ui` 是 UI 状态持久化域：只被 host 层、前端和绑定 seam 消费，业务域不引用（R5）。
- 其他域间引用按需，不设全局禁则；出现跨域共享概念时收敛到共享内核。

## 文件组织

- 模块布局已全仓统一：多文件模块一律「目录 + `mod.rs`」；小模块保持单文件（`event_script.rs`、`manifest.rs`、`app_paths.rs` 等）。历史遗留的「文件 + 同名目录」混用形态（`launcher.rs` + `launcher/`、`xact.rs` + `xact/` 等）已在 2025 批次全部转换完毕，新代码不再引入该形态。
- god file 拆分惯例：单文件超过约 1000 行或混合三个以上职责时拆；按职责拆成子模块，用 `pub(crate) use` 重导出保持调用方不动，一次迁移一个文件。已完成三批：`domain/mods/mod.rs`、`domain/launcher/mod_config.rs`、`domain/ai/providers.rs`、`infrastructure/game_formats/tmx.rs`、`domain/launcher/archive.rs`、`domain/launcher/smapi_update.rs`、`domain/localization/official/index.rs`、`domain/localization/knowledge/store.rs`、`src/host/host_runtime.rs`（调度核心留在 `mod.rs` 以配合 sidecar AST 架构测试，遥测/响应渲染移入子模块）、`domain/assets.rs`（与 `assets/` 目录混用形态一并统一为「目录 + mod.rs」）。所有超过约 1000 行的存量 god file 均已处理完毕。
- 测试：单元测试在 `src/tests/unit/`，跨模块集成测试在 `src/tests/integration/`，回归测试在 `src-tauri/tests/`；`#[path]` 接线是既定机制（允许测试访问私有项），不新建内联测试模块。

## 路径分隔符

游戏格式（TMX/TBin/TSX source、`content.json` asset key 等）与宿主平台使用不同的路径分隔符约定；在 Linux/macOS 上 `\` 不是路径分隔符，只是普通文件名字符。分隔符转换只允许发生在游戏格式序列化/解析边界与逻辑键场景，且必须统一经过 `infrastructure/fs/pathing.rs` 的语义 helper：

- `game_path_to_pathbuf(raw)` — 解析游戏格式路径字符串：`\` 与 `/` 都视为分隔符，trim、跳过空段与 `.` 段，`..` 保留为组件，结果恒为相对路径；
- `validated_game_relative_path(raw)` — 校验版：拒绝空输入、以分隔符开头的绝对路径、非 Normal 组件（`..` / 根 / 前缀）与盘符段（`C:\x`）；
- `normalize_separators(raw)` — 仅做 `\` → `/` 替换，用于展示/日志归一化，禁止用于文件系统访问；
- `logical_path_key(raw)` — trim + 分隔符归一 + 去尾部 `/` + 小写，结果是逻辑比较键，禁止喂给文件系统 API。

禁止在生产代码中手写 `replace('/', "\\")` 或 `replace("/", "\\")`（`src/tests/` 的回归测试可构造反斜杠形态做断言，不受此限）。

## 检查脚本

```bash
vp run --filter @modforge/desktop check:backend-architecture      # 常规检查
node apps/desktop/scripts/check-backend-architecture.mjs --strict # 白名单迁移进度（会把遗留项当违规报出）
```

CI（`.github/workflows/checks.yml`）在每次 PR 运行常规检查；单元测试钉住"当前源码树必须通过 + 白名单集合与现状一致"。

## 已知迁移项（非阻塞，按序）

已完成的 2025 批次：

1. ~~R4 白名单清零~~：nexusmods 经 `NexusRequestContext` 注入，不再读取 launcher 设置。
2. ~~R5 白名单清零~~：UI 状态开关的读取提升到 seam/调用层。
3. ~~host 层收拢~~：host 层五个文件已迁入 `src/host/`，`lib.rs` 保留 `pub use` 别名兼容旧路径。
4. ~~god file 拆分（第一批）~~：`mods`、`mod_config`、`providers` 已拆。
5. ~~god file 拆分（第二批）~~：`tmx`、`archive`、`smapi_update`、`official/index`、`knowledge/store` 已拆（串行进行，每个拆分独立通过 cargo check 与模块测试）。
6. ~~god file 拆分（第三批）~~：`host_runtime`（配合 AST 架构测试，调度核心留在 mod.rs）、`assets`（顺带完成该域布局统一）已拆；`tests/regression/` 两个回归文件的 `#[path]` 已指向新门面。
7. ~~统一模块布局~~：11 处「文件 + 同名目录」混用（launcher、content_patcher、cp_maker、nexusmods、modding、saves、fs、game_formats、http、xact、xnb）全部转换为「目录 + `mod.rs`」，同目录 `#[path]` 声明清零，回归测试支撑文件的引用同步更新。

**当前无剩余迁移项**。新的结构化改进按需走正常功能开发流程。
