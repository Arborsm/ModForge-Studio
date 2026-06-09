# ModForge Studio

> [中文说明](docs/README.zh-CN.md)

ModForge Studio is a desktop workbench for creating, inspecting, and managing
Stardew Valley mods.

It combines mod library management, game asset inspection, Content Patcher
authoring, and desktop launch workflows in one desktop application. The active
product workspace is `apps/desktop`.

## Quick Map

- `apps/desktop/src` - React application code organized by app, pages, widgets,
  features, entities, shared contracts, platform adapters, locales, and styles.
- `apps/desktop/src-tauri` - Rust backend, Tauri commands, domain logic,
  infrastructure, and regression tests.
- `apps/desktop/electron` - Electron host code used for Linux development and
  packaging.
- `apps/desktop/scripts` - desktop host dispatch, Vite/Tauri/Electron helpers,
  verification scripts, and release helpers.
- `docs/frontend-architecture.md` - frontend layer boundaries, platform DI,
  registry, event/command, CSS, and architecture-test rules.
- `docs/maintenance.md` - operational commands, release paths, CI/signing notes,
  validation expectations, and repository hygiene.

## Features

- Manage Stardew Valley game locations, launcher settings, mod libraries, and
  install workflows.
- Inspect game assets, maps, events, characters, items, buildings, saves, and
  mod project data.
- Build Content Patcher drafts and event/workbench projects with structured
  editors.
- Diagnose Nexus Mods connectivity and support download-oriented mod management
  flows.
- Produce desktop release packages for Linux, macOS, and Windows.

## Feature Index

- Launcher and mod library management: `apps/desktop/src/features`,
  `apps/desktop/src/widgets`, and `apps/desktop/src-tauri/src/domain/launcher`.
- Workbench pages and project flows: `apps/desktop/src/pages`,
  `apps/desktop/src/widgets`, and
  `apps/desktop/src-tauri/src/domain/workbench_project`.
- Content Patcher and CP maker flows: frontend slices under
  `apps/desktop/src/features` and Rust domains under
  `apps/desktop/src-tauri/src/domain/content_patcher` and
  `apps/desktop/src-tauri/src/domain/cp_maker`.
- Game asset, save, map, event, character, building, item, and mod models:
  `apps/desktop/src/entities` plus the matching Rust domain/infrastructure
  modules under `apps/desktop/src-tauri/src`.
- Desktop host integration: `apps/desktop/src/platform/electron`,
  `apps/desktop/src/platform/tauri`, `apps/desktop/electron`, and
  `apps/desktop/src-tauri`.

## Tech Stack

- Desktop shell: Electron on Linux; Tauri v2 on macOS and Windows; Rust remains
  the backend for desktop capabilities.
- Frontend: React 19, TypeScript 6, Vite 8, Tailwind CSS 4.
- UI/runtime libraries: Radix UI, Floating UI, lucide-react, React Resizable
  Panels, TanStack Virtual, XYFlow, Zustand.
- Testing: Vitest, jsdom, Testing Library, Playwright verification scripts.
- Package manager: pnpm 11.5.1.

## Quick Start

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Use `pnpm desktop:dev` to run the full desktop application with the Rust
backend. The root dispatcher starts Electron on Linux and Tauri on macOS and
Windows. Use `pnpm build` for the frontend production build and
`pnpm desktop:build` for the current platform's desktop build path.

Common checks:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm --filter @modforge/desktop test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Status

ModForge Studio is in early active development. The repository is structured as
a pnpm workspace, but `apps/desktop` is currently the only active product
workspace.

Linux builds use Electron packages. Release automation is available, but
platform signing and distribution credentials are expected to be provided by CI
or the local release environment.

## Common Change Paths

- Frontend UI or state changes: place page-local code in `pages`, shared page
  regions in `widgets`, reusable user actions in `features`, reusable domain
  models in `entities`, and host-agnostic contracts in `shared/contracts`.
- Desktop capability changes: update `shared/contracts/platform.ts`, implement
  adapters in `platform/electron` and `platform/tauri`, then wire providers from
  `app/providers`.
- Rust command changes: keep command wrappers thin in `src-tauri/src/commands`
  and put business behavior in the relevant `src-tauri/src/domain` module.
- Styling changes: use `apps/desktop/src/styles/index.css` as the global entry,
  keep primitives/workspace/features separated, and split large CSS files before
  they exceed the architecture-test limit.
- New user-visible text: update the typed locale bundles in
  `apps/desktop/src/locales`; do not hard-code UI strings inside React
  components.
- Architecture changes: update `docs/frontend-architecture.md` and the relevant
  tests under `apps/desktop/src/test/architecture`.

## Documentation

- [Chinese README](docs/README.zh-CN.md) - project overview in Chinese.
- [Frontend architecture](docs/frontend-architecture.md) - layer boundaries and
  dependency rules.
- [Maintenance guide](docs/maintenance.md) - commands, release notes, CI, signing,
  and repository hygiene.
- [Nexus Mods GraphQL snapshot](docs/nexusmods-graphql/SUMMARY.md) - generated API
  reference snapshot.

## License

ModForge Studio is licensed under
[GPL-3.0-or-later](LICENSE).
