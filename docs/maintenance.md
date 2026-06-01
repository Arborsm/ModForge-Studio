# Maintenance Guide

This document keeps operational notes out of the project homepage. Run commands
from the repository root unless a command says otherwise.

## Prerequisites

- Node.js compatible with the locked dependency graph.
- pnpm 10.30.3, as declared in the root `packageManager` field.
- Rust stable with the toolchain required by `apps/desktop/src-tauri/Cargo.toml`.
- Platform build dependencies for Tauri, CEF, and native package generation.

## Development Commands

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm desktop:dev
pnpm build
pnpm lint
pnpm format:check
pnpm --filter @modforge/desktop test
```

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
pnpm release:macos
pnpm release:windows
pnpm release:all
pnpm release:collect
```

`release:all` runs the current platform's release path and then collects
individual package artifacts into the release output directory. The collector is
intended to preserve package and architecture names instead of hiding them inside
one archive.

Linux CEF builds use Tauri's experimental `cef` feature. RPM output is generated
through the project release script rather than relying only on Tauri's default
RPM bundler path.

## CI and GitHub Actions

The release workflow should build each supported host on its matching runner:

- Linux: Debian package plus RPM package.
- macOS: app bundle and distributable archive or disk image.
- Windows: NSIS installer.

CI should cache pnpm store data, Rust registry data, Rust git dependencies, and
`apps/desktop/src-tauri/target` where practical. Cache keys should include the
OS, architecture, lockfiles, and Rust manifest files so platform-specific CEF
artifacts do not leak across runners.

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
- Keep required `apps/desktop` configuration files in place, including
  `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`,
  `postcss.config.cjs`, `index.html`, and `.npmrc`.
- Generated build outputs belong in ignored directories such as
  `apps/desktop/dist` and `apps/desktop/src-tauri/target`.

## Documentation Scope

The README is the project homepage. Long-lived maintenance details belong here
or in another file under `docs/`. Shared architecture notes belong in
`docs/frontend-architecture.md`;
