# modforge.example-code-plugin

Bundled example code-package plugin (memory-match game). `DESIGN.md` is a
generated copy of `packages/plugin-sdk/DESIGN.md` — do not edit it here.

## Authoring workflow (in-repo plugins)

The plugin is authored as TypeScript/TSX in `src/` (`src/index.tsx` is the
entry). Run `vp run build:compat-plugins` from the repository root to bundle
it into the ready-to-ship `index.js` that `manifest.json`'s `entry` points
at; use `vp run build:compat-plugins:watch` to rebuild on save. Editing the
generated `index.js` directly is an anti-pattern — always edit `src/` and
rebuild.

`styles.css` is plain hand-written CSS at the plugin root (declared via
`manifest.json`'s `styles` field); the host injects it on load and re-fetches
it on hot-reload — no build step involved.
