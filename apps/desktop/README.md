# ModForge Studio Desktop

Desktop editor shell for ModForge Studio.

## Stack

- `React 19`
- `TypeScript`
- `Vite`
- `Tailwind CSS 4`
- `react-resizable-panels`
- `Radix Context Menu`
- `Tauri 2`

## Current Scope

The desktop app currently focuses on Stardew Valley map inspection inside a desktop-style authoring shell.

Implemented:

- choose or auto-detect a game directory
- validate Stardew Valley folder structure
- scan `TMX / XNB` map assets
- load `TMX` content into an internal `MapDocument`
- render tile layers in a central canvas viewport
- render TMX object groups as overlay bounds
- inspect hovered tiles and object hits through the bottom status bar
- toggle visible tile layers and object groups
- focus map objects from the object groups panel
- use right-click editor context menus in the viewport
- pan the viewport with pointer capture
- zoom with toolbar controls, context menu actions, and mouse wheel
- fit map to screen or switch to `1:1`
- build stitched world-atlas views, including remote regions
- draw colored warp-link routes in atlas views
- keep `World Atlas` pinned as the first center tab
- open maps as closeable, draggable document tabs
- reopen or focus an existing map tab when the same map is selected again
- show the active document path in the bottom status bar instead of the top tab strip
- switch between light and dark themes
- switch between Chinese and English UI copy
- use an IDE-style tool-window workspace with:
  - left/right icon rails
  - docked side and bottom tool windows
  - floating windows
  - drag-to-dock targets
  - layout persistence and presets
- use a frameless Tauri window with custom minimize / maximize / close controls

## Commands

From the repository root:

```bash
npm run lint --workspace @modforge/desktop
npm run build --workspace @modforge/desktop
```

To run the desktop shell in development:

```bash
npm run desktop:dev
```

To run only the frontend dev server:

```bash
npm run dev
```

## Rider Hot Reload

Recommended Rider run configuration:

1. Create an `npm` configuration from the repository root `package.json`
2. Select script `desktop:dev`
3. Run it from Rider

Behavior:

- changes under `apps/desktop/src` hot-reload through Vite HMR
- changes under `apps/desktop/src-tauri` rebuild and restart the desktop host
- changes to `tauri.conf.json`, capabilities, Tailwind/PostCSS config, or package dependencies usually require a manual restart

## Important Files

- `src/App.tsx`
- `src/styles/globals.css`
- `src/components/TopMenuBar.tsx`
- `src/components/LeftPanels.tsx`
- `src/components/RightPanels.tsx`
- `src/components/WorkspaceLayout.tsx`
- `src/components/CentralWorkspace.tsx`
- `src/components/StatusBar.tsx`
- `src/components/MapViewport.tsx`
- `src/lib/editor-shell.ts`
- `src/lib/desktop.ts`
- `src/lib/maps/tmx.ts`
- `src/lib/maps/types.ts`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`

## Current Constraints

- `TMX` is the active map loading path
- `XNB` scanning exists, but `XNB` parsing/loading is not implemented yet
- object editing is not implemented yet
- external `.tsx` tilesets are not supported yet
- compressed layer data is not supported yet

## Next Focus

- object selection and editing
- richer inspectors for map objects
- character / building / item editors behind the top module switcher
- event graph editor
- `XNB` compatibility path
