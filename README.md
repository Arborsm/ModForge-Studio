# ModForge Studio

> [中文说明](docs/README.zh-CN.md)

ModForge Studio is a desktop workbench for creating, inspecting, and managing
Stardew Valley mods.

It combines mod library management, game asset inspection, Content Patcher
authoring, and desktop launch workflows in one Tauri application. The active
product workspace is `apps/desktop`.

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

## Tech Stack

- Desktop shell: Tauri v2 with a Rust backend.
- Frontend: React 19, TypeScript 6, Vite 8, Tailwind CSS 4.
- UI/runtime libraries: Radix UI, Floating UI, lucide-react, React Resizable
  Panels, TanStack Virtual, XYFlow, Zustand.
- Testing: Vitest, jsdom, Testing Library, Playwright verification scripts.
- Package manager: pnpm 10.30.3.

## Quick Start

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Use `pnpm desktop:dev` to run the full Tauri desktop application with the Rust
backend. Use `pnpm build` for the frontend production build.

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

Linux builds currently use Tauri's experimental CEF path. Release automation is
available, but platform signing and distribution credentials are expected to be
provided by CI or the local release environment.

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
