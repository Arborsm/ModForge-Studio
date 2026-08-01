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
dispatcher directly: it is provided by the `run.tasks.dev` task in the root
`vite.config.ts` (`command: node ./scripts/desktop-host-dispatch.cjs dev`), not
by a package script — the root `package.json` has no `dev` script, so
`pnpm run dev` at the repository root fails with "Missing script". `vp run
web:dev` starts the Vite+ frontend-only path.
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
`%APPDATA%\ModForge Studio\app\ui-state.json` (`appearance.locale`). The Options
page also offers an off-by-default "launch on system startup" checkbox that
writes a per-user `HKCU\...\CurrentVersion\Run` value; the Finish page has a
"launch now" checkbox (on by default) that starts the installed exe and then
closes the installer.

A "App Preferences" wizard page sits between Options and Progress (install mode
only). It pre-selects the main app's color theme (`appearance.themeId`), loading
motion (`appearance.loadingMotion.styleId`), close behavior
(`shell.windowCloseBehavior` + `rememberCloseChoice`), notification sound
(`shell.notificationSoundEnabled`) and startup mode (`shell.appMode`), persisted
by the `persist_app_preferences` command when leaving the page — a read-merge-write
of `ui-state.json` that only overwrites those fields. Defaults match the app's
serde defaults, so skipping the page keeps current behavior;
`rememberCloseChoice` is written `true` only when the user actively changes the
close-behavior radio. The app's light/dark mode is runtime system-following and
is intentionally not pre-seeded.

The installer UI ships dark and light themes aligned with the desktop app's
`neutral-tool` tokens (`apps/desktop/src/styles/tokens.css`). It follows
`prefers-color-scheme` by default; the titlebar day/night toggle pins an
explicit mode and persists it to localStorage
(`modforge.installer.theme-preference`), so uninstall mode uses the same choice.

Uninstall runs the same binary: install copies it to `<install>\uninstall.exe`
and the registered command is `"<install>\uninstall.exe" --uninstall "<install>"`.
Uninstall removes shortcuts, both registry keys (HKCU and HKLM attempts), any
`Run` autostart value, and every payload file, then schedules a cmd cleanup
script that deletes `uninstall.exe` itself after exit. User data under
`%APPDATA%\ModForge Studio` is kept unless the user ticks "also delete user
data" (off by default), which deletes that data root after the files are
removed — mods, game folders and documents are never touched. Deletion steps
are appended to `%TEMP%\modforge-uninstall-runtime.log`.

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
- `src/tests/support/` — shared test infrastructure: `setup.ts` (jsdom + matchers), `sourceScan.ts` (architecture scanners), `draftPortHost.ts` (in-memory host for `AssetDraftPort` unit tests), and type declarations. Imported via the `@test/*` alias.

`vp run --filter @modforge/desktop test` runs `test:frontend` and then
`test:node`. `test:frontend` drives Vitest through
`scripts/run-frontend-tests.mjs`, which gates on React `act(...)` warnings: any
warning in the test output fails the run even when Vitest itself passes.
`test:node` runs four standalone scripts under `node --test`
(`frontend-test-warning-gate.test.mjs`, `linux-cuda-runtime.test.mjs`,
`scan-gmcm-probe.test.mjs`, and `../../docs/nexusmods-graphql/convert-to-markdown.test.mjs`).

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

## Backend Logging

Every backend log line is built with `LogEvent`
(`apps/desktop/src-tauri/src/support/logging/event.rs`). Never call a `log::`
macro or hand-format a message — two unit tests in
`src/tests/unit/support/log_call_site_tests.rs` fail the build if you do.

```rust
use crate::support::logging::{LogEvent, targets};

LogEvent::new("launcher.install.start")
    .path("modsPath", &mods_path)
    .flag("hasBackupRoot", backup_root.is_some())
    .optional("uniqueId", manifest_unique_id.as_deref())
    .ms("elapsedMs", started_at.elapsed())
    .error(&error)
    .emit_warn(targets::LAUNCHER);
```

Conventions the builder enforces:

- Event names are dotted camelCase (`updateCheck.cacheHit`); field keys are
  camelCase (`modsPath`, `elapsedMs`, `apiKeyPresent`). The frontend's
  `reportAppEvent` `keyValues` use the same casing.
- Targets come from `targets::*` only. They are dotted PascalCase namespaces
  (`Launcher.Downloads`, `Localization.Translation`), never literals.
- `.optional(...)` omits the key entirely rather than emitting `unknown` or an
  empty string. `.path(...)` normalizes like command results. Values are quoted
  only when whitespace, `"` or `=` would break `key=value` parsing, and
  backslashes stay literal so Windows paths keep reading as paths.
- `.error(...)` owns the `error` field; the terminal colors it red.
- `.block(body)` attaches a multi-line body to one record instead of fanning it
  into N lines (see `hostRuntime.stats`).
- One record per state change, not per item. A per-item loop belongs in one
  summary line with a count (see `launcher.autoCover.skippedBlocked`), and a
  toggle that the frontend re-syncs on mount only logs on an actual transition.

Layout lives in `support/logging/terminal.rs` and renders one line two ways.
The terminal gets fixed columns and a `│` gutter for block bodies and wrapped
fields. The palette is deliberately near-monochrome: timestamp, target, field
keys, `=` and quotes are grey, values keep the default foreground, and event
names are bold. Color is reserved for what needs acting on — a filled badge on
warn and error only, and red for the `error` and `warnings` fields. Never
reintroduce per-type value colors; coloring paths, numbers and booleans
separately turns every line into a swatch. Do not key colorization off the
level either: `reason` is a general-purpose discriminator, so
`hostRuntime.stats reason=shutdown` was painted like a failure while the badge
already said `WARN`. ANSI dim (SGR 2) is not used anywhere, as it is unreadable
on mid-grey backgrounds.

Targets too wide for the column abbreviate their leading namespace segments
(`Localization.MachineTranslation` → `L.MachineTranslation`) so every message
starts in the same column; the distinguishing last segment is kept whole, and
the log file always writes the full name so grepping by target still works.

The log file repeats the full prefix on every line so each greps standalone,
keeps console-bridge metadata the terminal hides, is never wrapped, and is
never colorized.

```
12:34:56  INFO   [Launcher]              launcher.install.start modsPath=E:/SDV/Mods
12:34:56  WARN   [HostRuntime]           hostRuntime.stats reason=shutdown
                                         │ Pools
                                         │   Io/Lane
12:34:56  DEBUG  [Launcher.Trace]        launcher.updateCache.miss entryState=missing
                                         │ activeChecks=0 hadActiveCheck=false
```

Terminal lines wrap at the detected width, continuing in the message column
rather than at column zero. A single field wider than the terminal is never
split or truncated, and a lone trailing field folds back rather than being
stranded on a row of its own. Width detection tries stdout, stderr and stdin in
turn — under `tauri dev` the host logger writes stdout while the sidecar writes
stderr, and both are pipes. When no handle reports a width the record is left
whole: guessing narrower than the real terminal wraps lines that would have fit,
which reads worse than the terminal's own soft wrap. Override with
`MODFORGE_LOG_WIDTH=<columns>`, or `MODFORGE_LOG_WIDTH=off` to disable wrapping.

`cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example
log_format_sample` renders the whole sample set through both sinks, which is the
fastest way to check a layout change.

Force or suppress terminal color with `MODFORGE_LOG_COLOR=always|never`
(`NO_COLOR`, `FORCE_COLOR`, `CLICOLOR_FORCE` and `CLICOLOR` are also honored).

Preview the layout without launching the app:

```bash
MODFORGE_LOG_COLOR=always cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example log_format_sample
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

### Verification Scripts

`apps/desktop/scripts/` contains 15 `verify-*.mjs` scripts. Seven are wired
into `apps/desktop/package.json` and run via `vp run --filter @modforge/desktop <script>`:

- `test:launcher-custom-sort` → `verify-launcher-custom-sort.mjs` — custom launcher mod ordering (Playwright against the launcher mock scenario).
- `test:launcher-drag` → `verify-launcher-drag.mjs` — launcher drag-and-drop frame-budget metrics.
- `test:launcher-fast-scroll` → `verify-launcher-fast-scroll.mjs` — fast-scroll frame timings against the 360-mod launcher mock.
- `test:launcher-performance` → `verify-launcher-performance.mjs` — general launcher interaction performance.
- `test:performance:pages` → `verify-page-performance.mjs` — per-page interaction budgets across the workbench scenarios.
- `test:performance:chunks` → `verify-chunk-budgets.mjs` — built-chunk size budgets read from the Vite manifest (requires a prior `vp run build`; no browser or dev server).
- `test:performance:compiler-cleanup` → `verify-compiler-cleanup-performance.mjs` — interaction timings on React Compiler cleanup surfaces.

The remaining eight are manual/on-demand Playwright verification scripts with
no package script; run them directly with `node apps/desktop/scripts/<name>.mjs`.
They expect a running dev server (probing `http://127.0.0.1:5175`,
`http://127.0.0.1:5176`, then `http://localhost:5173` — start one with
`vp run web:dev -- --host 127.0.0.1 --port 5175`) and open it with the
`?mfLauncherMock=1&mfSettingsMock=1` mock query; most write screenshots to the
system temp dir (overridable per script via `MODFORGE_*_SCREENSHOT_DIR`):

- `verify-dialogue-bulk.mjs` — dialogue bulk-table inline editing and override staging.
- `verify-gsq-mount.mjs` — GameStateQuery builder standalone mount rendering.
- `verify-guide-tour.mjs` — guide tour layer auto-start, step, skip, and settings replay.
- `verify-i18n-bootstrap.mjs` — project-translation bootstrap card on a fresh draft.
- `verify-workbench-authoring.mjs` — content authoring workspaces (three-pane editor, appearance variants, gift tastes, building footprint).
- `verify-workbench-project-flow.mjs` — project creation flow and pack-structure surfaces.
- `verify-workbench-schedule-mail.mjs` — schedule and mail workspaces on the shared `AssetDraftPort`.
- `verify-workbench-undo.mjs` — shared draft undo/redo stack and the add-patch target picker.

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

Both workflows (`.github/workflows/checks.yml` and
`.github/workflows/release.yml`) install JavaScript dependencies with
`pnpm install --frozen-lockfile` rather than `vp install`, and cache the pnpm
store through `actions/setup-node` (`cache: pnpm`). Rust registry data, Rust git
dependencies, and `apps/desktop/src-tauri/target` are cached by
`Swatinem/rust-cache@v2` scoped to `apps/desktop/src-tauri -> target`. The
release workflow additionally caches desktop packaging tooling (Tauri CLI cache
and `.tmp/electron-builder-cache`) with the key
`desktop-packaging-${{ matrix.platform }}-${{ runner.os }}-${{ hashFiles('apps/desktop/src-tauri/Cargo.lock', 'pnpm-lock.yaml') }}` —
platform and OS plus the two lockfiles, with no architecture component and no
Cargo manifest hash; the Rust side is implicitly covered by
`Swatinem/rust-cache`'s own key.

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
