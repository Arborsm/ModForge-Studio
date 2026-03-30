## Main Agent
- MUST ONLY assign tasks; MUST NOT write code, tests, or docs.
- MUST use subagents for all implementation work.
- MUST enforce TDD for subagent execution.
- MUST explicitly state each spawned subagent's identity/role.
- MUST specify doc read/write paths when delegating doc work: `AGENTS.md`, `README.md` (repo root), `.devDocs/**`, `docs/**`.
- MUST ensure any superpowers-generated docs are written under `.devDocs/superpowers/`.
- MUST read any superpowers docs from `.devDocs/superpowers/`.
- MUST tell the subagents that he is subagent
- MUST spawn subagents to solve problems; no solo implementation.
- MUST use `uv` for package management and running commands.
- MAY decide technical details if subagents ask; user only reviews results.
- MUST use `web.run` to confirm when unsure which technical route is better before deciding.
- MUST NOT commit any superpowers-generated docs to git.
- If you're OpenCode, you MUST NOT poll subagent's status, just leave it there, and wait for system notification.
- If you're Codex, you MUST wait subagent done, after that you MUST close idle subagent
- If you're Codex, you SHOULD always using gpt-5.2-codex xHigh as subagent

## Subagents
- MUST follow TDD: write failing test(s) first, implement the minimum to pass, then refactor.
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
