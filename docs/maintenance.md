# Maintenance Guide

This document keeps operational notes out of the project homepage. Run commands
from the repository root unless a command says otherwise.

## Prerequisites

- Node.js compatible with the locked dependency graph.
- Vite+ (`vp`) as the primary development entry point. It delegates package
  management to pnpm 11.5.1, as declared in the root `packageManager` field.
- Rust stable with the toolchain required by `apps/desktop/src-tauri/Cargo.toml`.
- Platform build dependencies for Tauri, Electron, and native package generation.

## Development Commands

```bash
vp install --frozen-lockfile
vp run dev
vp run web:dev
vp run build
vp run desktop:build
vp run lint
vp run format:check
vp run --filter @modforge/desktop test
vp run --filter @modforge/desktop gen:host-commands
```

`vp run dev` is the default full desktop path and uses the root desktop host
dispatcher directly. `vp run web:dev` starts the Vite+ frontend-only path.
Linux starts Electron, while macOS and Windows start Tauri. `vp run
desktop:build` uses the same platform split for build mode.

To trace Host Runtime command scheduling, start the desktop host with:

```bash
MODFORGE_COMMAND_TRACE=1 vp run dev
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
vp run release:linux
vp run release:linux:deb
vp run release:linux:rpm
vp run release:macos
vp run release:windows
vp run release:all
vp run release:collect
```

`release:all` runs the current platform's release path and then collects
individual package artifacts into the release output directory. The collector is
intended to preserve package and architecture names instead of hiding them inside
one archive.

Linux releases use Electron Builder to generate Debian, RPM, and AppImage
artifacts. macOS and Windows releases continue to use Tauri packaging.

Linux-specific package scripts can be run directly when only one package format
is needed: `vp run release:linux:deb` or `vp run release:linux:rpm`.

## Windows Installer

The custom Windows installer lives in `apps/installer` (`@modforge/installer`),
a standalone Tauri 2 + React app styled after the BitFun installer. It ships as
a single `modforge-installer.exe` with the desktop payload embedded as a zip
(`build.rs` packs `src-tauri/payload/` into the binary; external `payload/` /
`payload.zip` next to the exe remain as dev fallbacks).

Build it from the repository root:

```bash
vp run installer:build                                        # desktop app + installer
node apps/installer/scripts/build-installer.cjs --skip-app-build  # reuse existing desktop exe
```

`--skip-app-build` expects `modforge_studio_desktop.exe` and `gmcm-probe/` in
`apps/desktop/src-tauri/target/release/`; without it the script first runs the
desktop `--no-bundle` build. Step 2 copies the exe, runtime sibling files, and
`gmcm-probe/` into `src-tauri/payload/` with a sha256 `payload-manifest.json`,
then step 3 produces
`apps/installer/src-tauri/target/release/modforge-installer.exe`. For UI
iteration use `vp run --filter @modforge/installer tauri:dev`; debug builds fall
back to a placeholder payload.

The installer is per-user (no admin): it extracts the payload, registers the
Add/Remove Programs entry under
`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\ModForgeStudio`,
mirrors the Tauri NSIS install-location key at
`HKCU\Software\ModForge Studio\ModForge Studio`, creates Desktop and Start Menu
shortcuts, and writes the chosen language to
`%APPDATA%\ModForge Studio\app\ui-state.json` (`appearance.locale`).

Uninstall runs the same binary: install copies it to `<install>\uninstall.exe`
and the registered command is `"<install>\uninstall.exe" --uninstall "<install>"`.
Uninstall removes shortcuts, both registry keys (HKCU and HKLM attempts), any
`Run` autostart value, and every payload file, then schedules a cmd cleanup
script that deletes `uninstall.exe` itself after exit. User data under
`%APPDATA%\ModForge Studio` is never touched.

Rust checks for the installer crate:

```bash
cargo fmt --manifest-path apps/installer/src-tauri/Cargo.toml
cargo check --manifest-path apps/installer/src-tauri/Cargo.toml
```

## Test Layout

Tests are kept out of source folders and grouped by type.

Frontend tests live under `apps/desktop/src/tests/`:

- `src/tests/unit/` — pure-logic `.ts` tests only (no `.tsx`/`.spec.tsx`, no component or `renderHook` rendering, no CSS-class/inline-style/DOM-structure assertions). They mirror the source path they exercise and cover parsers, data transformation, reducers, command routing, and headless state logic.
- `src/tests/architecture/` — architecture and repository-shape assertions (dependency direction, style ownership, code-splitting).
- `src/tests/support/` — shared test infrastructure: `setup.ts` (jsdom + matchers), `sourceScan.ts` (architecture scanners), and type declarations. Imported via the `@test/*` alias.

The frontend intentionally keeps no UI/render tests; UI and layout behavior is verified by screenshot, Playwright, or a manual path rather than jsdom render assertions.

Rust tests are centralized by type under `apps/desktop/src-tauri/`:

- `src-tauri/src/tests/unit/` — unit tests for domain/infrastructure modules.
- `src-tauri/src/tests/integration/` — cross-module integration tests.
- `src-tauri/tests/regression/` — installed-game regression targets.
- `src-tauri/tests/report/` — installed-game report examples.
- `src-tauri/tests/support/` — helpers shared by explicit Cargo targets.

Unit and integration Rust tests are declared from source files via `#[cfg(test)] #[path = "..."] mod ...;`. Installed-game targets are declared explicitly in `Cargo.toml`, require the `installed-game-validation` feature, and remain ignored unless a maintainer supplies `SDV_GAME_PATH`.

Compile all installed-game validation surfaces without running them:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --no-run
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --examples
```

Run one regression or report against an installed game explicitly:

```bash
SDV_GAME_PATH=/path/to/StardewValley cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --test lzxd_regression -- --ignored
SDV_GAME_PATH=/path/to/StardewValley cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --example unpacked_pass_rate_report
SDV_GAME_PATH=/path/to/StardewValley cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --features installed-game-validation --example xact_cue_coverage_report
```

## Validation Expectations

Run the smallest useful check while iterating, but report the final validation
surface before handing work back.

Frontend changes normally need:

```bash
vp run lint
vp run build
vp run --filter @modforge/desktop test
```

`vp run lint` uses Vite+ lint. `vp run build` keeps the
TypeScript `tsc --noEmit` checks and then runs the Vite+ production build on
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
or add tests under `apps/desktop/src/tests/architecture`.

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

CI should run Vite+ package-management commands such as `vp install` and cache
pnpm store data, Rust registry data, Rust git dependencies, and
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

- Use `vp install`, `vp add`, `vp remove`, and related Vite+ commands for
  package-management workflows. They delegate to the package manager declared by
  the repository.
- pnpm is the underlying JavaScript package manager for this repository. Keep
  `pnpm-lock.yaml`, keep the root `packageManager` field, and do not commit
  `package-lock.json`.
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
