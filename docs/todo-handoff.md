# ModForge Studio TODO / Handoff

## Current Status

Project shape is now established as:

- Frontend: `React + TypeScript + Vite`
- Desktop host: `Tauri 2`
- Bridge service: `.NET 8` console project

Main repo entry points:

- Root workspace: `package.json`
- Desktop app: `apps/desktop`
- Tauri host: `apps/desktop/src-tauri`
- .NET bridge: `services/sdv-bridge`

## Completed Work

### Environment and workspace

- Initialized npm workspace at repo root.
- Created `@modforge/desktop` app with React + TypeScript + Vite.
- Initialized Tauri desktop host.
- Initialized `.NET` bridge project `ModForge.Studio.SdvBridge`.
- Added user-level `context7` MCP entry for React / library docs lookup.

### Build and validation

Verified successfully:

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- `dotnet restore services\sdv-bridge\ModForge.Studio.SdvBridge.csproj`
- `dotnet build services\sdv-bridge\ModForge.Studio.SdvBridge.csproj --no-restore`

### Directory detection and map scanning

Implemented in:

- `apps/desktop/src/lib/desktop.ts`
- `apps/desktop/src-tauri/src/lib.rs`

Capabilities:

- Detect default Stardew Valley install path.
- Validate selected game directory.
- Prefer `Content (unpacked)\Maps` over `Content\Maps`.
- Scan available map assets.
- Return map summaries to frontend.

### TMX loading and internal MapDocument parsing

Implemented in:

- `apps/desktop/src/lib/maps/types.ts`
- `apps/desktop/src/lib/maps/tmx.ts`
- `apps/desktop/src-tauri/src/lib.rs`

Capabilities:

- Load selected map file content through Tauri command.
- Parse `TMX` XML into internal `MapDocument`.
- Parse:
  - root map metadata
  - root properties
  - tilesets
  - tile properties
  - tile animations
  - tile layers with CSV data
  - object groups
  - objects

Current parser scope:

- Supports `TMX`
- Supports CSV layer data
- Does not support compressed layer data
- Does not support `XNB` loading yet

### Interactive tile viewport

Implemented in:

- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/lib/maps/assets.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`

Capabilities:

- Resolve tileset image paths relative to the map file.
- Load tileset images through Tauri asset protocol.
- Render visible tile layers to a canvas.
- Handle basic Tiled flip flags during draw.
- Show viewport metadata.
- Toggle layer visibility from the document inspector.
- Zoom in / out / reset while previewing.
- Drag to pan the scrollable viewport.
- Inspect hovered tile coordinates, gid, tileset, and tile properties.

## Current User-Visible Flow

From the desktop app UI, the user can:

1. Choose a Stardew Valley folder.
2. Validate the folder layout.
3. Scan map assets.
4. Click a `TMX` map.
5. Build a `MapDocument`.
6. See:
   - selected map summary
   - map properties
   - tileset summary
   - layer summary
   - object group summary
   - interactive rendered viewport
   - layer visibility toggles
   - hovered tile inspector

## Important Files

### Product / planning

- `docs/project-plan.zh-CN.md`
- `docs/todo-handoff.md`

### Frontend

- `apps/desktop/src/App.tsx`
- `apps/desktop/src/App.css`
- `apps/desktop/src/lib/desktop.ts`
- `apps/desktop/src/lib/maps/types.ts`
- `apps/desktop/src/lib/maps/tmx.ts`
- `apps/desktop/src/lib/maps/assets.ts`
- `apps/desktop/src/components/MapViewport.tsx`

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

- `TMX` is the active path.
- `XNB` is intentionally deferred.
- If the selected source is only `XNB`, UI can scan files but cannot build `MapDocument` yet.

### Viewport scope

- Current viewport renders tile layers only.
- Pan / zoom / layer toggles / tile hover inspection are implemented.
- No object rendering yet.
- No wheel zoom or fit-to-screen shortcut yet.

### Tileset loading

- Relies on Tauri asset protocol.
- Uses tileset `image source` path relative to map file directory.
- Assumes missing image extension should default to `.png`.

### Parsing assumptions

- Layer data must be CSV.
- External `.tsx` tilesets are not supported yet.
- Infinite maps are not supported yet.

## Recommended Next Steps

Priority order:

1. Add object visualization
2. Improve viewport camera controls
3. Add `XNB` loading path
4. Move parsing into the .NET bridge if game-compat logic becomes heavier

### 1. Object rendering

Implement:

- draw object bounds overlay
- label object names / types
- toggle object group visibility

Suggested files:

- `apps/desktop/src/components/MapViewport.tsx`
- `apps/desktop/src/App.tsx`

### 2. Viewport camera follow-up

Implement:

- wheel zoom
- fit-to-screen
- minimap or quick reset to origin
- optional zoom level persistence per map

Suggested files:

- `apps/desktop/src/components/MapViewport.tsx`

### 3. XNB loading

Implement in phases:

- expose `load_map_asset` fallback for `.xnb`
- either decode `XNB` directly or route through .NET bridge
- normalize output into same `MapDocument`

Likely files:

- `apps/desktop/src-tauri/src/lib.rs`
- `services/sdv-bridge/*`

### 4. Bridge architecture hardening

Right now:

- TMX parsing is in frontend
- file IO is in Rust
- .NET bridge is mostly scaffold only

Later possible direction:

- Rust host handles shell / FS / dialog only
- .NET bridge handles:
  - TMX parsing
  - XNB parsing
  - Content Patcher compatibility
  - game-aware normalization

## Testing Checklist

Manual desktop test:

1. Run `npm run desktop:dev`
2. Validate known path
3. Scan maps
4. Click `Farm`, `Town`, `Forest`
5. Confirm right panel shows parsed map summary
6. Confirm viewport renders visible layers
7. Confirm tileset images load without blank canvas
8. Confirm zoom buttons update the canvas scale
9. Confirm dragging the viewport pans the map
10. Confirm layer toggles hide/show tile layers
11. Confirm hovered tile panel updates with coordinates and gid data

Build validation:

- `npm run lint`
- `npm run build`
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`
- `dotnet build services\sdv-bridge\ModForge.Studio.SdvBridge.csproj --no-restore`

## Notes for Future Window

- Dev ports were changed away from the original Tauri defaults to avoid local conflicts.
- Tauri asset protocol is enabled in config and mirrored by the Rust crate feature.
- If viewport image loading breaks, check both:
  - `tauri.conf.json` security asset protocol config
  - `tauri` crate features in `Cargo.toml`
- If `App.tsx` starts getting too large, split it into:
  - directory controls
  - map list
  - map summary
  - document inspector
  - viewport panel

## Short Handoff Summary

The project is past scaffolding. It can already:

- open the desktop shell
- detect and validate the Stardew Valley install
- scan map files
- load a selected `TMX`
- parse it into internal structured data
- render an interactive tile viewport with zoom, pan, layer toggles, and tile inspection

The next high-value task is to render object layers and overlays so map semantics can be inspected before editing tools and mutation workflows begin.
