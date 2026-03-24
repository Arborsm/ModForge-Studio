# ModForge Studio TODO / Handoff

## Current Status

Project shape:

- Frontend: `React + TypeScript + Vite + Tailwind CSS 4`
- Desktop host: `Tauri 2`
- Bridge service: `.NET 8` console project

Main repo entry points:

- Root workspace: `package.json`
- Desktop app: `apps/desktop`
- Tauri host: `apps/desktop/src-tauri`
- .NET bridge: `services/sdv-bridge`

## Completed Work

### Environment and workspace

- Initialized npm workspace at repo root
- Created `@modforge/desktop` app with React + TypeScript + Vite
- Initialized Tauri desktop host
- Initialized `.NET` bridge project `ModForge.Studio.SdvBridge`

### Build and validation

Verified successfully:

- `npm run lint --workspace @modforge/desktop`
- `npm run build --workspace @modforge/desktop`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- `dotnet restore services\sdv-bridge\ModForge.Studio.SdvBridge.csproj`
- `dotnet build services\sdv-bridge\ModForge.Studio.SdvBridge.csproj --no-restore`

### Directory detection and map scanning

Implemented in:

- `apps/desktop/src/lib/desktop.ts`
- `apps/desktop/src-tauri/src/lib.rs`

Capabilities:

- detect default Stardew Valley install path
- validate selected game directory
- prefer `Content (unpacked)\Maps` over `Content\Maps`
- scan available map assets
- return map summaries to frontend

### TMX loading and internal MapDocument parsing

Implemented in:

- `apps/desktop/src/lib/maps/types.ts`
- `apps/desktop/src/lib/maps/tmx.ts`
- `apps/desktop/src-tauri/src/lib.rs`

Capabilities:

- load selected map file content through Tauri command
- parse `TMX` XML into internal `MapDocument`
- parse root metadata, properties, tilesets, tile properties, tile animations, tile layers, object groups, and objects

Current parser scope:

- supports `TMX`
- supports CSV layer data
- does not support compressed layer data
- does not support `XNB` loading yet
- does not support external `.tsx` tilesets yet

### Current editor shell

Implemented in:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/styles/globals.css`
- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/components/LeftDock.tsx`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/RightDock.tsx`
- `apps/desktop/src/components/StatusBar.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/editor-shell.ts`

Capabilities:

- fixed full-window desktop editor shell
- three-pane resizable layout using `react-resizable-panels`
- top module switcher for map / characters / buildings / items / events
- left dock for project controls and content browser
- central map viewport with toolbar
- right dock for inspector, layers, object groups, hover probe, and diagnostics
- bottom status bar
- internal pane scrolling only
- light / dark themes
- `zh-CN / en-US` UI copy switching
- Tailwind-based visual system backed by shared CSS variables

### Interactive map viewport

Implemented in:

- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/maps/assets.ts`

Capabilities:

- resolve tileset image paths relative to the map file
- load tileset images through Tauri asset protocol
- render visible tile layers to a canvas
- handle basic Tiled flip flags during draw
- render TMX object group overlays and labels
- inspect hovered tile and object information
- pan with pointer capture dragging
- zoom with toolbar controls
- zoom with mouse wheel
- fit map to screen
- switch to `1:1`
- replace browser context menu with an editor-style viewport menu

### Frameless desktop window

Implemented in:

- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src/lib/desktop.ts`
- `apps/desktop/src/components/TopMenuBar.tsx`

Capabilities:

- disabled native window decorations
- added custom minimize / maximize / close controls
- added dedicated draggable title-bar area
- enabled required Tauri window permissions for drag and window controls

## Current User-Visible Flow

From the desktop app UI, the user can:

1. Choose or auto-detect a Stardew Valley folder
2. Validate the folder layout
3. Scan map assets
4. Auto-open the preferred `Town` TMX map when present
5. Switch editor modules from the top bar
6. Inspect:
   - selected map summary
   - layer toggles
   - object group toggles
   - interactive rendered viewport
   - hovered tile and object details
   - diagnostics and workspace status

## Important Files

### Product / planning

- `docs/project-plan.zh-CN.md`
- `docs/todo-handoff.md`
- `docs/editor-workspace.zh-CN.md`

### Frontend

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/styles/globals.css`
- `apps/desktop/src/components/TopMenuBar.tsx`
- `apps/desktop/src/components/LeftDock.tsx`
- `apps/desktop/src/components/CentralWorkspace.tsx`
- `apps/desktop/src/components/RightDock.tsx`
- `apps/desktop/src/components/StatusBar.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/editor-shell.ts`
- `apps/desktop/src/lib/desktop.ts`
- `apps/desktop/src/lib/maps/types.ts`
- `apps/desktop/src/lib/maps/tmx.ts`
- `apps/desktop/src/lib/maps/assets.ts`

### Tauri host

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src-tauri/Cargo.toml`

### .NET bridge

- `services/sdv-bridge/ModForge.Studio.SdvBridge.csproj`
- `services/sdv-bridge/Program.cs`

## Known Constraints

### Map format support

- `TMX` is the active path
- `XNB` is intentionally deferred
- if the selected source is only `XNB`, UI can scan files but cannot build `MapDocument` yet

### Viewport scope

- tile layers and object group overlays are rendered
- pan / wheel zoom / fit / `1:1` / layer toggles / object group toggles / hover inspection are implemented
- object editing is not implemented yet
- object shapes beyond simple rectangle / point style bounds are not interpreted yet

### Tileset loading

- relies on Tauri asset protocol
- uses tileset `image source` path relative to map file directory
- assumes missing image extension should default to `.png`

### Parsing assumptions

- layer data must be CSV
- external `.tsx` tilesets are not supported yet
- infinite maps are not supported yet

## Recommended Next Steps

Priority order:

1. object selection and editing
2. richer map object inspectors
3. specialized character / building / item modules behind the top switcher
4. real event graph editor
5. `XNB` loading path

### 1. Object selection and editing

Implement:

- click-to-select object overlays
- selected highlight state
- numeric editing or transform controls
- write-back into inspector panels

Suggested files:

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/components/RightDock.tsx`

### 2. Richer object inspectors

Implement:

- object type classification
- dedicated inspector sections for spawn points, triggers, buildings, and markers
- editable property grids

Suggested files:

- `apps/desktop/src/components/RightDock.tsx`
- `apps/desktop/src/lib/maps/types.ts`

### 3. Specialized content modules

Implement:

- character editor with portrait, schedule, and dialogue bindings
- building editor with footprint and interior links
- item editor with icon, balance, and shop metadata

Suggested files:

- `apps/desktop/src/components/CentralWorkspace.tsx`
- new components under `apps/desktop/src/components`
- `apps/desktop/src/lib/editor-shell.ts`

### 4. Event graph editor

Implement:

- graph canvas
- node palette
- trigger / condition / action node types
- map-object-to-event linking

Suggested files:

- `apps/desktop/src/components/CentralWorkspace.tsx`
- future graph-specific components

### 5. XNB loading

Implement in phases:

- expose `load_map_asset` fallback for `.xnb`
- decode `XNB` directly or route through .NET bridge
- normalize output into the same `MapDocument`

Likely files:

- `apps/desktop/src-tauri/src/lib.rs`
- `services/sdv-bridge/*`

## Testing Checklist

Manual desktop test:

1. Run `npm run desktop:dev`
2. Validate known path
3. Scan maps
4. Confirm `Town` is auto-opened when available
5. Confirm the center panel shows the fitted scene viewport
6. Confirm tile layers render correctly
7. Confirm object groups render as overlays
8. Confirm layer toggles hide/show tile layers
9. Confirm object group toggles hide/show overlays
10. Confirm hovered tile panel updates with coordinates, gid, and object hits
11. Right-click in the scene viewport and confirm the custom viewport menu appears
12. Use mouse wheel to zoom the viewport
13. Switch between light and dark themes and confirm shell colors update cleanly
14. Switch between Chinese and English and confirm visible UI copy updates
15. Confirm frameless window buttons minimize / maximize / close correctly in Tauri
16. Confirm the top title bar can drag the frameless window

Build validation:

- `npm run lint --workspace @modforge/desktop`
- `npm run build --workspace @modforge/desktop`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- `dotnet build services\sdv-bridge\ModForge.Studio.SdvBridge.csproj --no-restore`

## Notes for Future Window

- Dev ports were changed away from the original Tauri defaults to avoid local conflicts
- Tauri asset protocol is enabled in config and mirrored by the Rust crate feature
- Frameless window behavior only works in the Tauri desktop host, not in a browser tab
- Capability changes and `tauri.conf.json` changes require restarting the Tauri dev process
- If viewport image loading breaks, check both:
  - `tauri.conf.json` security asset protocol config
  - `tauri` crate features in `Cargo.toml`

## Short Handoff Summary

The project is past scaffolding. It can already:

- open the desktop shell
- run as a frameless Tauri window
- detect and validate the Stardew Valley install
- scan map files
- load a selected `TMX`
- auto-open `Town`
- render tile layers and object overlays
- pan and zoom the viewport
- inspect hovered tiles and object hits

The next high-value task is turning the current read-only overlays and inspectors into real editing tools.
