// Pre-commit rustfmt for lint-staged.
//
// lint-staged appends the staged `.rs` paths as arguments. Standalone rustfmt
// formats exactly those files, so unrelated unstaged edits elsewhere in the
// workspace are never rewritten — unlike `cargo fmt --all`, which has no
// per-file mode and would silently reformat every Rust file in the workspace.
// rustfmt discovers the rustfmt.toml config from each file's directory chain,
// the same way cargo fmt does.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const stagedFiles = process.argv.slice(2)
if (stagedFiles.length === 0) {
  // Nothing staged for this glob (lint-staged passes the file list eagerly in
  // some versions); formatting nothing succeeds.
  process.exit(0)
}

const repoRoot = path.resolve(__dirname, '..', '..', '..')
// Edition must match apps/desktop/src-tauri/Cargo.toml.
const result = spawnSync('rustfmt', ['--edition', '2024', ...stagedFiles], {
  cwd: repoRoot,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
