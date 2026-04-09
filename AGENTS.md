- MUST read docs only from: `AGENTS.md`, `README.md` (repo root), `.devDocs/**`, `docs/**`.
- MUST write docs only to: `AGENTS.md`, `README.md` (repo root), `.devDocs/**`, `docs/**`.
- MUST place any superpowers-generated docs under `.devDocs/superpowers/`.
- MUST read any superpowers docs from `.devDocs/superpowers/`.
- MUST use `uv` for package management and running commands.
- MUST NOT commit any superpowers-generated docs to git.
- MUST update repo-root `README.md` when adding new top-level areas, important feature directories, or new files/folders that change how developers should navigate the codebase.

# Repository Guidelines

## Project Structure & Module Organization
`apps/desktop` is the active product workspace. Put React UI in `apps/desktop/src/components`, shared domain logic in `apps/desktop/src/lib`, typed locale bundles in `apps/desktop/src/locales`, and global styles/assets under `src/styles` and `src/assets`. Keep the layered style system intact: `apps/desktop/src/styles/index.css` is the only stylesheet entrypoint, with styles organized under `primitives`, `workspace`, and `features`. Keep component tests next to source files, put architecture tests under `apps/desktop/src/test/architecture`, cross-module regression tests under `apps/desktop/src/test/regressions`, and shared test helpers under `apps/desktop/src/test`. Tauri backend code lives in `apps/desktop/src-tauri/src`, with parser modules grouped by feature (`xnb`, `xact`, `mods`, `saves`). Rust regression and report tests live in `apps/desktop/src-tauri/tests`. Treat `docs/` as reference material and avoid editing generated output in `dist/`, `target/`, `bin/`, or `obj/`.
Keep Rust unit tests out of implementation-heavy `.rs` files when they grow beyond a tiny smoke check: prefer sibling `tests/*.rs` files next to the module they cover, such as `apps/desktop/src-tauri/src/tests/*.rs` and `apps/desktop/src-tauri/src/content_patcher/tests/*.rs`.
Put Rust shared test filesystem helpers in `apps/desktop/src-tauri/src/test_support.rs`; keep feature-specific Rust test helpers in a nearby `test_support.rs` only when they are genuinely domain-specific.
Avoid adding new large inline `#[cfg(test)] mod tests { ... }` blocks to Tauri source files; move them into the sibling test modules instead.

## Build, Test, and Development Commands
Run commands from the repository root unless noted otherwise.

- `npm run dev` starts the Vite frontend only.
- `npm run desktop:dev` launches the full Tauri desktop app.
- `npm run build` builds the desktop frontend bundle.
- `npm run lint` runs ESLint for the TypeScript/React workspace.
- `npm run test -w @modforge/desktop` runs the desktop Vitest suite.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` validates the Rust backend.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` runs the Rust regression suite.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF, spaces everywhere, `indent_size = 2`, except `*.cs` uses 4 spaces. Keep React components and windows in PascalCase files such as `WorkspaceLayout.tsx`; hooks must start with `use`; helper and parser modules use camelCase or snake_case based on language conventions. Prefer keeping view state orchestration in `src/lib/app` and rendering concerns in `src/components`. Route UI copy through typed locale bundles and locale hooks; do not reintroduce React-layer `copy`/`locale` prop drilling. Non-React logic can keep explicit locale or copy parameters. Use `npm run lint` before submitting frontend changes.

## Testing Guidelines
Rust coverage is centered on regression-style tests such as `character_data_regression.rs` and `xact_regression.rs`; add or extend these when changing asset decoding, parsing, or fallback behavior. Frontend tests use Vitest. Keep component and module tests colocated with the code they exercise, keep architecture assertions in `src/test/architecture`, and keep cross-module regression coverage in `src/test/regressions`. The minimum verification for frontend work is `npm run lint`, `npm run build`, and `npm run test -w @modforge/desktop`.
For Rust backend changes, prefer extracting duplicate test setup before adding more cases. Do not introduce new large inline `#[cfg(test)] mod tests` blocks into Tauri source files when the same coverage can live in a sibling `tests/*.rs` file.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits with scopes, for example `feat(workspace): ...`, `refactor(ui): ...`, `fix(i18n): ...`, and `chore(test): ...`. Keep subjects imperative and scoped to the area you changed. Pull requests should describe the user-visible impact, list validation commands, and include screenshots or short clips for UI/layout changes. Link the related issue or task when one exists.
