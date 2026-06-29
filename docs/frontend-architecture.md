# Frontend Architecture

This document defines the target frontend architecture for ModForge Studio.

The frontend architecture is suitable for a complex desktop workbench:

- Feature-Sliced boundaries for ownership.
- Clean Architecture dependency direction.
- Static registry for workbench/page composition.
- Typed Event + Command for cross-feature communication.
- Platform DI for Electron, Tauri, and desktop capabilities.

## Target Layers

The durable frontend layers are `app`, `pages`, `widgets`, `features`, `entities`, `shared`, and `platform`. Do not use this document as a file map: project structure is indexed by CodeGraph, and concrete paths should be discovered with `codegraph_files`, `codegraph_context`, and `codegraph_search`.

Target dependency direction:

```text
app -> pages -> widgets -> features -> entities -> shared/contracts
```

`platform` is an external adapter. It is implemented in the platform layer and injected by `app/providers`. Business code should depend on contracts, not on Electron, Tauri, or host globals. Cross-page or cross-feature orchestration belongs in `app/` or in the relevant feature slice; do not add a separate `processes` layer.

Use Feature-Sliced Design pragmatically: start page-specific code in `pages/`, extract only when the same code is actively reused and the boundary is stable. Do not create empty layers, speculative entities, or feature slices just because a concept might be reused later.

## Layer Responsibilities

### app

`app` is the application motherboard.

Responsibilities:

- Mount global providers.
- Restore startup state.
- Inject platform ports.
- Compose static registries.
- Own global shell concerns such as theme, locale, app mode, notification provider, and desktop window chrome.

Rules:

- `app` may import all lower layers.
- `app` should not contain feature business logic.
- `app/registry-setup.ts` is the only place that creates the static registry instance.
- `app` is the right home for app-level orchestration hooks that translate events into commands; do not create a dedicated `processes` layer.

### pages

`pages` are route-level or mode-level entry points.

Responsibilities:

- Page shell.
- View dispatch.
- Page-level slots and layout skeleton.

Rules:

- Pages should not pull every feature's data and pass it down.
- Pages can consume registries and app-level orchestration hooks.
- Pages should delegate smart composition to widgets.

### widgets

`widgets` are smart containers.

Responsibilities:

- Combine feature/entity hooks with shared UI.
- Assemble large page regions such as workspace panels, top navigation, status bars, and workbench view hosts.
- Bridge layout containers with feature-owned content.

Rules:

- Widgets may call `features` and `entities` hooks/selectors/commands.
- Widgets must not define domain data structures.
- Widgets must not directly import Electron/Tauri APIs or platform adapters.

### features

`features` own independent business capabilities.

Examples:

- `cp-maker`
- concrete patch editors
- import/export flows
- feature-specific command palettes or builders

Rules:

- Feature modules must not import other feature modules.
- Cross-feature coordination must use typed events and commands.
- Feature public APIs should be explicit: state hooks, UI entry points, registration objects, and model helpers.

### entities

`entities` are headless domain modules.

Examples:

- `entities/map`
- `entities/event`
- `entities/character`
- `entities/building`
- `entities/item`
- `entities/mod`

Responsibilities:

- Domain types.
- Normalization.
- State hooks.
- Selectors.
- Queries.
- Domain-specific pure model logic.

Rules:

- Entities must not import `pages`, `widgets`, or `features`.
- Entities must not import panel/layout UI types.
- Entities must not know where their output will be rendered.
- If an entity needs desktop capabilities, it depends on a contract port, not on platform implementation.

### shared

`shared` is the bottom layer for reusable contracts and primitives.

Responsibilities:

- `shared/contracts/registry.ts`: registry interfaces and registration item types.
- `shared/contracts/events.ts`: typed events.
- `shared/contracts/commands.ts`: typed commands.
- `shared/contracts/platform.ts`: platform port interfaces.
- `shared/ui`: pure UI primitives.
- `shared/lib`: pure helpers and generic hooks.
- `shared/infra`: game-format and asset-format parsing helpers that do not call host adapters.
- `shared/types`: cross-domain types that are not contracts.

Rules:

- Shared must not import app/pages/widgets/features/entities/platform.
- Shared UI must not contain domain decisions.
- Shared contracts must define interfaces only, not instances.
- `shared/lib` must not import `shared/infra` or `platform`.
- `shared/infra` may depend on `shared/contracts` and pure `shared/lib` helpers, but not on host adapters.

### platform

`platform` implements external capabilities.

Responsibilities:

- Electron and Tauri command adapters.
- File system, dialog, window, storage, and shell ports.
- Desktop host feature detection.
- Host bridge helpers under `platform/host`.
- Host command constants, `HostCommandClient`, task runtime, and frontend observability adapters.

Rules:

- `platform/electron` and `platform/tauri` implement `shared/contracts/platform.ts`.
- `platform/host` exposes typed host bridge helpers and owns desktop command invocation.
- `platform/host-commands` owns generated host command runtime constants.
- Business layers must not import `@tauri-apps/api`.
- Business layers must not call `invoke(` directly.
- Business layers must not access Electron preload globals directly.

## Registry

Use a static registry, not runtime self-registration.

Rules:

- Registry interfaces live in `shared/contracts/registry.ts`.
- Feature/widget modules export registration objects.
- `app/registry-setup.ts` imports those objects and builds the registry instance.
- `WorkbenchPage` and view hosts consume the registry result.
- Shell code should not import concrete workspace views just to switch on route strings.

The point is explicit composition without service-locator behavior.

## Event + Command

Cross-feature communication uses two channels:

- Events describe what happened.
- Commands describe what should be done.

Example flow:

1. `cp-maker` emits `CpMakerAssetSelected`.
2. `app/providers/workbenchOrchestration` listens to that event.
3. The process dispatches `OpenWorkspaceAsset`.
4. Workbench command handling changes workspace, opens the asset, and focuses the correct view.

Rules:

- Feature A must not import Feature B.
- Features may emit typed events.
- App-level orchestration hooks translate events into commands.
- Commands are handled by app/page orchestration, not by random leaf components.

## Platform DI

Platform capabilities are provided as ports.

Suggested contracts:

- `FileSystemPort`
- `DesktopWindowPort`
- `StoragePort`
- `DialogPort`
- `PlatformPorts`

Rules:

- Contracts live in `shared/contracts/platform.ts`.
- Electron and Tauri implementations live in `platform/electron` and `platform/tauri`.
- Provider lives in `app/providers`.
- Upper layers consume ports from the provider or a narrow hook.

This keeps entities/features testable and prevents host APIs from leaking into business code.

## Host Command Client And Task Runtime

Desktop command calls sit above platform ports and below business APIs.

Rules:

- Electron and Tauri adapters expose raw host transport through platform ports only.
- Business code must call typed desktop APIs or `HostCommandClient`; it must not call `fileSystem.invokeCommand`, `window.modforgeElectron`, Tauri `invoke`, or Electron preload globals directly.
- Business code must pass generated `HOST_COMMANDS.*` constants to `invokeDesktop`, not raw protocol strings. `HOST_COMMANDS` is generated from Rust `#[tauri::command] pub fn` wrapper names, so protocol names stay tied to implementation names instead of a separate manifest.
- `HostCommandClient` owns frontend command policy and maps calls to the shared task runtime.
- Feature and entity APIs must declare a policy at the call site, such as `latest`, `keyedLatest`, `exclusiveMutation`, `queuedMutation`, `parallelPool`, or `serviceGate`.
- Hooks should not invent local `cancelled`, `requestId`, or `versionRef` guards when the task runtime can express the same ownership rule.
- Late host command results must not publish into a stale scope. For commands that cannot be physically aborted, task runtime scope invalidation still owns whether the result can update UI state.
- Mutations that write shared durable state should use `exclusiveMutation` or `queuedMutation` in frontend policy and matching Rust resource locks in the Host Runtime.

Typical policy mapping:

- Search and catalog refresh use `latest`.
- Resource loads keyed by root path, locale, mod id, file id, or project path use `keyedLatest`.
- Settings, library state, covers, app UI state, mod project saves, installs, restore, cache clear, and draft writes use mutation policies.
- Image/audio/preload fan-out uses `parallelPool` or `serviceGate`.
- Cancellation actions, such as cancelling a launcher download, use `serviceGate` and must not queue behind the long-running command being cancelled.

Backend command scheduling is documented as agent/backend rules in `AGENTS.md`; frontend architecture only owns how business code reaches the host and how UI state publication is scoped.

## Implementation Completeness

Architecture boundaries are not a reason to ship hollow slices. Do not add placeholder UI, no-op commands, fake data, TODO flows, silent catches, or happy-path-only implementations just to satisfy a visible acceptance point.

Rules:

- New flows must cover real data loading, state updates, loading states, empty states, error states, persistence, host permission/path checks, localization, and tests according to their impact.
- Bug fixes must address the root cause and adjacent regression risk. Do not hide a defect with hard-coded fallbacks, swallowed errors, or bypassed validation.
- If a requested change is too large, split it into independently usable vertical slices. Each slice must work for a real user without depending on a future cleanup task.
- Temporary adapters, compatibility shims, debug code, one-off migration entries, and unused exports must be removed in the same change that makes them unnecessary.

## Cleanup Rules

New and moved code must use the target layers. Do not recreate old catch-all roots such as `components`, `lib`, or `processes`, and do not add re-export shims or compatibility directories for old import paths. If a short-lived compatibility layer is unavoidable, document the deletion condition and remove the shim as soon as the change lands.

Architecture tests should guard durable boundaries, not one-off migration milestones. Keep rules that prevent dependency drift or removed roots from being referenced again; delete tests that only assert a specific old filename no longer exists once the change is complete.

## Barrel Hygiene

Large barrel files can slow the dev server and reduce tree-shaking quality in large projects. Keep public APIs narrow and intentional.

Rules:

- Prefer small, slice-level public APIs.
- Avoid adding segment-level `index.ts` files inside already sliced areas unless the extra boundary is truly needed.
- For `shared`, split exports by intent (`shared/ui`, `shared/lib`, `shared/contracts`, `shared/types`) rather than creating one giant barrel.
- Keep `shared/infra` for game-format helpers and `platform/host` for host bridge helpers; do not re-export either through `shared/lib`.
- If a project grows beyond one sensible root, split it into multiple packages or roots instead of accumulating more barrel layers.

## Public API Comments

Public and cross-layer APIs must carry concise JSDoc so call sites can understand the boundary from editor hover text.

Required:

- `features/*/api` and `entities/*/api` request/result functions and DTOs.
- Stable exports from `features/*/index.ts`, `entities/*/index.ts`, and `shared/*/index.ts` when they are intended for other layers.
- Shared utilities under `shared/lib/*`, `shared/infra/*`, and `platform/host/*` that are consumed by app/pages/widgets/features/entities.
- Core contracts under `shared/contracts/*`, especially registry, commands, events, platform ports, and workspace/runtime types.

Comments should describe purpose, owner boundary, important cache behavior, and side effects. Avoid comments that restate the implementation line-by-line. When an API is removed, delete its comments with it; do not leave compatibility or migration notes in code.

## CSS Organization

CSS follows the same ownership model as the frontend layers. Global entry points stay small and durable; feature styles live under the feature style area that owns the UI surface.

Rules:

- `apps/desktop/src/styles/index.css` is the single global style entry. Do not add another global entry point for convenience.
- Keep `primitives`, `workspace`, and `features` separated by responsibility. Do not duplicate selectors across those folders to patch ownership problems.
- Keep individual CSS files below 1000 lines. When a file approaches that threshold, split it by stable UI regions such as shell, sidebar, card grid, dialog, details panel, lists, or responsive rules.
- Preserve cascade order during a split. The original file should become a thin `@import` aggregator, and imported files should appear in the same order the rules previously appeared.
- Put split files in a same-name directory beside the aggregator, for example `launcher/configuration.css` importing files from `launcher/configuration/`.
- Each split file should declare its own `@layer components`; do not rely on an aggregator to wrap imported files in a layer.
- Update style architecture tests when style ownership rules change. The line-count guard and any rules that inspect imported CSS belong in `src/tests/architecture/styleArchitecture.test.ts`.

## Boundary Debt

Frontend architecture debt should be tracked as explicit, shrinking baselines in tests or task docs, not as compatibility shims in product code. When a debt file is cleaned, remove it from the architecture test baseline in the same change.

Do not preserve old internal request shapes, localStorage keys, route ids, or import paths for compatibility while the product is unreleased. Finish the change, update callers, and delete temporary code immediately.

## Architecture Tests

Architecture tests should guard these rules:

- Business layers do not import `@tauri-apps/api`.
- Business layers do not call `invoke(` directly.
- Business layers do not access Electron preload globals directly.
- `features` do not import other `features`.
- `entities` do not import `widgets`, `pages`, or `features`.
- `shared` does not import app/pages/widgets/features/entities/platform.
- `entities` do not import panel/layout contracts.
- Registry interfaces and registry instances stay separated.

These tests are mandatory because documentation alone will not stop architectural drift.

## Test Organization

Tests are centralized under `apps/desktop/src/tests/` and must not live next to source files.

- `src/tests/unit/` — component and module tests, arranged to mirror the source path they exercise. For example, a test for `src/features/launcher/model/useLauncher.ts` belongs at `src/tests/unit/features/launcher/model/useLauncher.test.ts`.
- `src/tests/architecture/` — architecture and repository-shape assertions, including dependency direction, style ownership, and code-splitting rules.
- `src/tests/integration/` — cross-module integration tests.
- `src/tests/support/` — shared test infrastructure only: `setup.ts`, render helpers, mock ports, and test assets. Consume these through the `@test/*` alias, which resolves to `src/tests/support`.

Source folders (`src/app`, `src/pages`, `src/widgets`, `src/features`, `src/entities`, `src/shared`, `src/platform`, `src/locales`) must not contain `*.test.ts` or `*.test.tsx` files.
