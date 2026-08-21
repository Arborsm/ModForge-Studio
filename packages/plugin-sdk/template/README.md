# ModForge Plugin Template

A template for creating ModForge Studio compat plugins with custom code-package pages.

## Getting Started

1. Copy this template to your plugin directory
2. Update `package.json` with your plugin name
3. Write your plugin entry point in `src/index.tsx` (JSX is supported — the
   build uses the automatic runtime, and `react` / `react-dom` /
   `react/jsx-runtime` / `@modforge/plugin-sdk` stay external and resolve to
   the host singletons via the webview import map)
4. Create a `manifest.json` in your plugin directory (see ModForge docs)
5. Build with `npm run build` — this produces `dist/index.js`
6. Symlink or copy `dist/index.js` to your plugin directory as `index.js`

## Local Development

1. Build your plugin: `npm run dev` (watches for changes)
2. Symlink the output to the dev plugin directory:
   ```bash
   # On Windows
   mklink "apps/desktop/compat-plugins/<your-plugin-id>/index.js" "dist/index.js"
   # On macOS/Linux
   ln -s dist/index.js apps/desktop/compat-plugins/<your-plugin-id>/index.js
   ```
3. Run ModForge Studio in dev mode: `vp run dev`
4. Your plugin page should appear in the workbench navigation

## Plugin Manifest

Create a `manifest.json` in your plugin directory:

```json
{
  "format": 1,
  "id": "your.plugin-id",
  "name": "Your Plugin Name",
  "targets": ["YourMod.UniqueId"],
  "sdkVersion": "1.0.0",
  "entry": "index.js",
  "contributions": {
    "pages": []
  }
}
```

The `pages` array in the manifest can be empty — pages are registered
dynamically via `ctx.registerPage()` in your code entry point.

## SDK API

See `@modforge/plugin-sdk` for the full API:

- `ctx.registerPage(page)` — register a workbench page
- `ctx.components` — design-system components (CompactSelect, PanelFrame, etc.)
- `ctx.commands` — allowlisted host commands
- `ctx.i18n` — plugin locale lookup
- `ctx.onDispose(fn)` — cleanup on unload/reload

The example in `src/index.tsx` renders a page from `ctx.components` (PanelFrame,
PanelSection, CompactSelect, EmptyStateCard) and reads every label through
`ctx.i18n.t(...)`; the template ships without an i18n bundle, so copy the keys
listed in that file's header comment into your manifest `i18n` when adapting it.

## Design Guide

Read [DESIGN.md](DESIGN.md) before writing any UI: theme tokens, host
components, the scoped-stylesheet pattern, i18n, notifications, and the
shipping checklist. The bundled `modforge.example-code-plugin` implements
every pattern in it.
