# Frontend Architecture

This document defines the target frontend architecture for ModForge Studio.

The goal is to move from the historical `components + lib/app` structure to a stricter architecture suitable for a complex desktop workbench:

- Feature-Sliced boundaries for ownership.
- Clean Architecture dependency direction.
- Static registry for workbench/page composition.
- Typed Event + Command for cross-feature communication.
- Platform DI for Tauri and desktop capabilities.

## Target Layers

```text
src/
├── app/
│   ├── app-shell/
│   ├── providers/
│   ├── registry-setup.ts
│   └── App.tsx
├── pages/
├── widgets/
├── features/
├── entities/
├── platform/
└── shared/
    ├── contracts/
    ├── ui/
    ├── lib/
    └── types/
```

Target dependency direction:

```text
app -> pages -> widgets -> features -> entities -> shared/contracts
```

`platform` is an external adapter. It is implemented in the platform layer and injected by `app/providers`. Business code should depend on contracts, not on Tauri. The `processes` layer is deprecated in the current architecture; remaining orchestration belongs in `app/` or in the relevant `features/` slice.

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
- Widgets must not directly import Tauri or platform adapters.

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
- `shared/types`: cross-domain types that are not contracts.

Rules:

- Shared must not import app/pages/widgets/features/entities/platform.
- Shared UI must not contain domain decisions.
- Shared contracts must define interfaces only, not instances.

### platform

`platform` implements external capabilities.

Responsibilities:

- Tauri command adapters.
- File system, dialog, window, storage, and shell ports.
- Desktop host feature detection.

Rules:

- `platform/tauri` implements `shared/contracts/platform.ts`.
- Business layers must not import `@tauri-apps/api`.
- Business layers must not call `invoke(` directly.

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
- Tauri implementation lives in `platform/tauri`.
- Provider lives in `app/providers`.
- Upper layers consume ports from the provider or a narrow hook.

This keeps entities/features testable and prevents Tauri from leaking into business code.

## Migration Rules

The historical folders are migration sources:

- `components`
- `lib/app`
- `lib/desktop.ts`
- `processes` is deprecated; move remaining orchestration into `app/` or the owning `features/` slice.

New or migrated code should prefer the target layers.

## Barrel Hygiene

Large barrel files can slow the dev server and reduce tree-shaking quality in large projects. Keep public APIs narrow and intentional.

Rules:

- Prefer small, slice-level public APIs.
- Avoid adding segment-level `index.ts` files inside already sliced areas unless the extra boundary is truly needed.
- For `shared`, split exports by intent (`shared/ui`, `shared/lib`, `shared/contracts`, `shared/types`) rather than creating one giant barrel.
- If a project grows beyond one sensible root, split it into multiple packages or roots instead of accumulating more barrel layers.

Migration order:

1. Create contracts, providers, registry interfaces, and architecture guards.
2. Establish workbench registry and view host.
3. Move workspace panel assembly into widgets.
4. Move domain hooks and models into entities.
5. Move feature-owned UI/state/model under features.
6. Shrink app shell and remove legacy shims.

Do not parallelize subsystem migrations until the foundation is stable.

After the foundation is stable, subsystem migrations can be split across subagents with disjoint write sets.

## Architecture Tests

Architecture tests should guard these rules:

- Business layers do not import `@tauri-apps/api`.
- Business layers do not call `invoke(` directly.
- `features` do not import other `features`.
- `entities` do not import `widgets`, `pages`, or `features`.
- `shared` does not import app/pages/widgets/features/entities/platform.
- `entities` do not import panel/layout contracts.
- Registry interfaces and registry instances stay separated.

These tests are mandatory for the migration because documentation alone will not stop architectural drift.
