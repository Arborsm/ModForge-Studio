# Maintenance Guide

This document keeps operational notes out of the project homepage. Run commands
from the repository root unless a command says otherwise.

## Prerequisites

- Node.js compatible with the locked dependency graph.
- pnpm 11.5.1, as declared in the root `packageManager` field.
- Rust stable with the toolchain required by `apps/desktop/src-tauri/Cargo.toml`.
- Platform build dependencies for Tauri, Electron, and native package generation.

## Development Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm desktop:dev
pnpm build
pnpm desktop:build
pnpm lint
pnpm format:check
pnpm --filter @modforge/desktop test
```

`pnpm dev` starts the Vite-only frontend path. `pnpm desktop:dev` uses the root
desktop host dispatcher: Linux starts Electron, while macOS and Windows start
Tauri. `pnpm desktop:build` uses the same platform split for build mode.

To trace Host Runtime command scheduling, start the desktop host with:

```bash
MODFORGE_COMMAND_TRACE=1 pnpm desktop:dev
```

This enables `HostRuntime` command start/finish/failure debug lines, including
command id, command name, lane, worker, queue time, elapsed time, resources, and
error state. It is intentionally separate from the in-app debug diagnostics
toggle: UI debug keeps other backend debug/trace output, while command
scheduler traces require `MODFORGE_COMMAND_TRACE`.

Rust backend checks:

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Release Commands

Current release entry points are exposed from the root package and delegated to
`apps/desktop`:

```bash
pnpm release:linux
pnpm release:linux:deb
pnpm release:linux:rpm
pnpm release:macos
pnpm release:windows
pnpm release:all
pnpm release:collect
```

`release:all` runs the current platform's release path and then collects
individual package artifacts into the release output directory. The collector is
intended to preserve package and architecture names instead of hiding them inside
one archive.

Linux releases use Electron Builder to generate Debian, RPM, and AppImage
artifacts. macOS and Windows releases continue to use Tauri packaging.

Linux-specific package scripts can be run directly when only one package format
is needed: `pnpm release:linux:deb` or `pnpm release:linux:rpm`.

## Validation Expectations

Run the smallest useful check while iterating, but report the final validation
surface before handing work back.

Frontend changes normally need:

```bash
pnpm lint
pnpm build
pnpm --filter @modforge/desktop test
```

`pnpm lint` uses Oxlint as the default frontend linter. `pnpm build` keeps the
TypeScript `tsc --noEmit` checks and then runs the Vite 8 production build on
Rolldown. React Compiler is enabled in the Vite React pipeline; do not add
manual `useMemo` or `useCallback` solely for render performance unless a
measurement or compiler diagnostic proves it is needed. Existing memoization
should only be removed when it is a pure render-performance cache; keep it for
provider values, effect dependency stability, external store or virtualizer
integration, drag-and-drop handlers, and third-party callback identity
requirements.

Rust changes need formatting plus the relevant check or test:

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

UI and layout changes should be verified with a screenshot, Playwright-backed
interaction script, or a clear manual path. Architecture changes should update
or add tests under `apps/desktop/src/test/architecture`.

## Implementation Completeness

Do not treat a minimal visible path as complete. New functionality should land
as a real product slice with data loading, state transitions, loading/empty/error
states, persistence, localization, host permission/path handling, and tests
according to the affected area.

Avoid placeholder UI, fake data, no-op commands, TODO-only flows, swallowed
errors, hard-coded fallbacks, and compatibility shims that require another task
before users can rely on the feature. If a change is too large, split it into
independently usable vertical slices rather than shipping a partial shell.

## CI and GitHub Actions

The release workflow should build each supported host on its matching runner:

- Linux: Debian package plus RPM package.
- macOS: app bundle and distributable archive or disk image.
- Windows: NSIS installer.

CI should cache pnpm store data, Rust registry data, Rust git dependencies, and
`apps/desktop/src-tauri/target` where practical. Cache keys should include the
OS, architecture, lockfiles, and Rust manifest files.

## macOS Signing

Official distribution should use Apple Developer signing credentials and, when
needed, notarization secrets supplied by CI or the local release environment.

Ad-hoc signing is only a development fallback. It can make a locally built app
bundle launchable on the same machine, but it is not a replacement for Developer
ID signing. A quarantined downloaded build may still require the user to remove
quarantine metadata, for example:

```bash
xattr -dr com.apple.quarantine "ModForge Studio.app"
```

Do not commit signing certificates, keychains, provisioning profiles, or local
release credentials.

## Repository Hygiene

- pnpm is the only JavaScript package manager for this repository. Keep
  `pnpm-lock.yaml` and do not commit `package-lock.json`.
- Keep the root `packageManager` field and documentation in sync when the pnpm
  version changes.
- Keep required `apps/desktop` configuration files in place, including
  `package.json`, `vite.config.ts`, `tsconfig*.json`, `postcss.config.cjs`, and
  `index.html`.
- Generated build outputs belong in ignored directories such as
  `apps/desktop/dist`, `apps/desktop/electron-dist`, and
  `apps/desktop/src-tauri/target`.
- Do not introduce unrelated Python or environment-management tooling into
  project docs or scripts unless the repository actually adopts it.

## Documentation Scope

The README is the project homepage. Long-lived maintenance details belong here
or in another file under `docs/`. Shared architecture notes belong in
`docs/frontend-architecture.md`.

Use `.devDocs/**` for local investigation artifacts, screenshots, traces,
sketches, and superpowers output. Superpowers-generated documents must live
under `.devDocs/superpowers/` and should not be committed.

When adding a new top-level directory, important feature directory, or
developer-facing entry point, update the README Quick Map, Feature Index, or
Common Change Paths so future agents know where to look.
