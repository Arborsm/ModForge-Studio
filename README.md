# ModForge Studio

> [中文说明](docs/README.zh-CN.md)

ModForge Studio is a desktop workbench for creating, inspecting, and managing
Stardew Valley mods.

It combines mod library management, game asset inspection, Content Patcher
authoring, and desktop launch workflows in one desktop application. The active
product workspaces are `apps/desktop` and `apps/installer`.

## Quick Map

- `apps/desktop/src` - React application code organized by app, pages, widgets,
  features, entities, shared contracts, platform adapters, locales, and styles.
- `apps/desktop/src/tests` - centralized frontend tests: unit, architecture,
  and shared test support under `support/`.
- `apps/desktop/src-tauri` - Rust backend, Tauri commands, domain logic,
  infrastructure, and tests under `src/tests/unit/`, `src/tests/integration/`,
  and top-level `tests/`.
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
- Compose workbench modules through the static registry, with a product guide
  tour for first-run onboarding.
- Pick shared resources with the resource picker and manage project materials
  in the asset library.
- Author dialogue, mail, and schedule content in structured asset editor
  workspaces.
- Translate mods in the localization center with configurable AI providers,
  usage tracking, and review flows.
- Diagnose Nexus Mods connectivity and support download-oriented mod management
  flows.
- Inspect mod archives without installing them.
- Produce desktop release packages for Linux, macOS, and Windows, plus a
  Windows installer with preferences, autostart, and theme options.

## Feature Index

- Launcher and mod library management: `apps/desktop/src/features`,
  `apps/desktop/src/widgets`, and `apps/desktop/src-tauri/src/domain/launcher`.
- Workbench pages and project flows: `apps/desktop/src/pages`,
  `apps/desktop/src/widgets`, and the `modding`, `ai`, and `localization`
  domains under `apps/desktop/src-tauri/src/domain`.
- Guide, resource browser, and translation features:
  `apps/desktop/src/features/guide`,
  `apps/desktop/src/features/resource-browser`, and
  `apps/desktop/src/features/translation-editor`, with workbench workspaces
  under `apps/desktop/src/pages/workbench/workspaces`.
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
- Frontend: React 19 with React Compiler, TypeScript 7, Vite 8 on Rolldown,
  Tailwind CSS 4.
- UI/runtime libraries: Radix UI, Floating UI, lucide-react, React Resizable
  Panels, TanStack Virtual, XYFlow, Zustand.
- Testing: Vite+ Test, jsdom, Testing Library, Playwright verification scripts.
- Package workflow: Vite+ package-management commands backed by pnpm 11.5.1 and
  `pnpm-lock.yaml`.
- Frontend tooling: Vite+ for install/run/dev/build/test/lint/format workflows.

## Quick Start

```bash
vp install --frozen-lockfile
vp run dev
```

`vp run dev` runs the full desktop application with the Rust backend by default.
The root dispatcher starts Electron on Linux and Tauri on macOS and Windows.
Use `vp run web:dev` for the frontend-only Vite+ dev server, `vp run build` for
the frontend production build, and `vp run desktop:build` for the current
platform's desktop build path.

React Compiler is enabled through the Vite React pipeline. Do not add manual
`useMemo` or `useCallback` only for render performance unless there is a
measurement or compiler diagnostic that requires it. Keep stable-reference
hooks when identity is semantic, such as provider values, effect dependencies,
external stores, virtualizers, drag-and-drop handlers, and third-party callback
contracts.

Common checks:

```bash
vp run format:check
vp run lint
vp run build
vp run --filter @modforge/desktop test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Status

ModForge Studio is in early active development. The repository uses Vite+ as the
primary developer entry point over a pnpm-backed workspace, and `apps/desktop`
and `apps/installer` are the active product workspaces.

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
  tests under `apps/desktop/src/tests/architecture`.

## Documentation

- [Chinese README](docs/README.zh-CN.md) - project overview in Chinese.
- [Frontend architecture](docs/frontend-architecture.md) - layer boundaries and
  dependency rules.
- [Product design](DESIGN.md) - product shape, visual language, design goals.
- [Design system](docs/design-system.md) - visual design tokens and rules for
  AI-assisted implementation.
- [Page design spec](docs/design/page-design-spec.md) - workspace visual rules and
  workbench shell / home IA.
- [Workbench authoring rework](docs/design/workbench-authoring-rework.md) - plan
  to reorganize the project-building workbench pages around the event-authoring
  quality baseline.
- [Maintenance guide](docs/maintenance.md) - commands, release notes, CI, signing,
  and repository hygiene.
- [Nexus Mods GraphQL snapshot](docs/nexusmods-graphql/SUMMARY.md) - generated API
  reference snapshot.

## License

ModForge Studio is licensed under
[GPL-3.0-or-later](LICENSE).
