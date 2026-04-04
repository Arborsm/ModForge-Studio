- MUST read docs only from: `AGENTS.md`, `README.md` (repo root), `.devDocs/**`, `docs/**`.
- MUST write docs only to: `AGENTS.md`, `README.md` (repo root), `.devDocs/**`, `docs/**`.
- MUST place any superpowers-generated docs under `.devDocs/superpowers/`.
- MUST read any superpowers docs from `.devDocs/superpowers/`.
- MUST use `uv` for package management and running commands.
- MUST NOT commit any superpowers-generated docs to git.

# Repository Guidelines

## Project Structure & Module Organization
`apps/desktop` is the active product workspace. Put React UI in `apps/desktop/src/components`, shared domain logic in `apps/desktop/src/lib`, localized strings in `apps/desktop/src/locales`, and global styles/assets under `src/styles` and `src/assets`. Tauri backend code lives in `apps/desktop/src-tauri/src`, with parser modules grouped by feature (`xnb`, `xact`, `mods`, `saves`). Rust regression and report tests live in `apps/desktop/src-tauri/tests`. Treat `docs/` as reference material and avoid editing generated output in `dist/`, `target/`, `bin/`, or `obj/`.

## Build, Test, and Development Commands
Run commands from the repository root unless noted otherwise.

- `npm run dev` starts the Vite frontend only.
- `npm run desktop:dev` launches the full Tauri desktop app.
- `npm run build` builds the desktop frontend bundle.
- `npm run lint` runs ESLint for the TypeScript/React workspace.
- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` validates the Rust backend.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` runs the Rust regression suite.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF, spaces everywhere, `indent_size = 2`, except `*.cs` uses 4 spaces. Keep React components and windows in PascalCase files such as `WorkspaceLayout.tsx`; hooks must start with `use` (`useMapWorkspace.ts`); helper and parser modules use camelCase or snake_case based on language conventions. Prefer keeping view state orchestration in `src/lib/app` and rendering concerns in `src/components`. Use `npm run lint` before submitting frontend changes.

## Testing Guidelines
Rust coverage is centered on regression-style tests such as `character_data_regression.rs` and `xact_regression.rs`; add or extend these when changing asset decoding, parsing, or fallback behavior. There is no dedicated frontend test runner configured yet, so the minimum check for UI work is `npm run lint` plus `npm run build`, followed by a brief manual validation note.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits with scopes, for example `feat(workspace): ...`, `refactor(ui): ...`, and `feat(gameplay): ...`. Keep subjects imperative and scoped to the area you changed. Pull requests should describe the user-visible impact, list validation commands, and include screenshots or short clips for UI/layout changes. Link the related issue or task when one exists.
