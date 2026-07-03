# ModForge Studio Design

This document records the current product shape, visual language, and design priorities visible in the repository. It is not a speculative landing-page brief. The source of truth is the codebase: README, locale bundles, contracts, desktop commands, schemas, and CSS tokens.

## Product Purpose

ModForge Studio is a desktop workbench for Stardew Valley. The current host path is Linux Electron for the active local development/runtime path and macOS/Windows Tauri for the packaged desktop path. The README leads with one broad product promise: mod creation, asset viewing, Content Patcher project editing, mod management, and game launching in one desktop workspace.

The product name is `ModForge Studio`. The in-app English tagline is `Professional mod authoring workspace`.

Design should treat the app as a dense creation and management tool, not as a marketing site. The first-screen weight belongs to the actual working surfaces: Launcher and Workbench.

## Primary Product Surfaces

### Shell

The app has two shell modes: `Workbench` and `Launcher`. The shell owns theme, locale, accent color, settings, notifications, desktop window controls, mode switching, and lazy loading of the workbench.

Critical files:

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/app-shell/AppShell.tsx`
- `apps/desktop/src/app/app-shell/SettingsWindow.tsx`
- `apps/desktop/src/widgets/top-navigation/ui/TopMenuBar.tsx`
- `apps/desktop/src/widgets/status-bar/ui/StatusBar.tsx`

### Launcher

Launcher copy defines its job as: `Manage mods, updates, and download tasks from one shell view.`

Launcher pages are:

- `Library`: `Installed Library`, used to scan, inspect, enable, disable, and install local SMAPI mods.
- `Discover`: searches Nexus and queues direct downloads into the launcher pipeline.
- `Updates`: compares installed mods against Nexus pages derived from UpdateKeys.
- `Configuration`: launcher paths, Nexus access, diagnostics, and optional debug utilities.

Launcher must foreground operational state: installed mods, enabled mods, disabled mods, queued downloads, active downloads, completed downloads, pending updates, route health, API key state, and direct download availability.

Native Launcher terms from code and copy:

- `Installed Library`
- `Mod Details`
- `Missing Dependencies`
- `Update Keys`
- `Pack Management`
- `Storage Folders`
- `Current Pack`
- `Hidden Mods`
- `Gallery Images`
- `Install Summary`
- `Install Backups`
- `Network Diagnostics`
- `Nexus Mods Network`
- `Nexus API Key`
- `Route health and authentication status for Nexus Mods services.`

Critical files:

- `apps/desktop/src/pages/launcher/LauncherPage.tsx`
- `apps/desktop/src/pages/launcher/ui/LauncherShell.tsx`
- `apps/desktop/src/pages/launcher/library/LauncherLibraryPageContent.tsx`
- `apps/desktop/src/features/launcher/model/useLauncherLibrary.ts`
- `apps/desktop/src/features/launcher/model/useLauncherDownloads.ts`
- `apps/desktop/src/features/launcher/model/useLauncherUpdates.ts`
- `apps/desktop/src/features/launcher/model/nexusDiagnostics.ts`
- `apps/desktop/src-tauri/src/domain/launcher/types.rs`
- `apps/desktop/src-tauri/src/domain/nexusmods/diagnostics.rs`

### Workbench

Workbench is the creation surface. The registry exposes `Studio Desk` and `Workspace Editor`, plus workspace panels such as `Assets`, `Viewport`, `Event Timeline`, `Item Navigation`, `Item Catalog`, and `Item Details`.

The Studio Desk copy describes a `three-part creation desk`: recent inspirations on the left, project heartbeat and workspace entries in the middle, and the world bible with export center on the right.

Native Workbench terms from code and copy:

- `Studio Desk`
- `Workspace Editor`
- `Project Lobby`
- `Project grid`
- `World Bible`
- `Global Rules`
- `Tokens`
- `Custom Locations`
- `Export Center`
- `Patch Catalog`
- `Event Graph`
- `Script diagnostics`
- `Continuity sheet`
- `Trigger environment`
- `Player state`
- `Progress gates`

Workspace modes are `map`, `characters`, `buildings`, `items`, `events`, and `mods`. Their native descriptions emphasize independent editing:

- Events: event scripts, stage previews, and actor actions.
- Map: map assets, tiles, warps, and location content.
- Characters: character data, portraits, sprites, and gift tastes.
- Buildings: building art, footprints, and related content.
- Items: item definitions, atlases, shop rules, drops, and rewards.
- Mods: built-in plugin workspace for Content Patcher projects.

Critical files:

- `apps/desktop/src/pages/workbench/ui/WorkbenchPage.tsx`
- `apps/desktop/src/pages/workbench/ui/WorkbenchExperience.tsx`
- `apps/desktop/src/pages/workbench/ui/WorkbenchViewHost.tsx`
- `apps/desktop/src/pages/workbench/model/builtInWorkspaces.ts`
- `apps/desktop/src/pages/workbench/model/workspace-panels/buildWorkspacePanels.tsx`
- `apps/desktop/src/features/cp-maker/ui/StudioDesk.tsx`
- `apps/desktop/src/features/cp-maker/ui/EditWorkspaceContent.tsx`
- `apps/desktop/src/pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherWorkspace.tsx`

## Native Data Shape

The product is organized around pipelines, catalogs, previews, and traces.

Launcher data shape:

- `LauncherSettings`: game path, mods path, download path, Nexus API key, auto-install downloads, keep downloaded archives, auto-check mod updates.
- `LauncherLibraryModSummary`: mod identity, author, version, description, UniqueID, folder, enabled state, Nexus mod id, update keys, required dependencies, missing dependencies.
- `LauncherLibraryState`: storage folders, hidden mods, pack presets, child mod groups, library folders, current pack, scope mode.
- `LauncherDownloadQueueItem`: mod id, file id, title, version, source, status, archive path, install target, error, timestamps.
- `LauncherUpdateSummary`: current version, latest version, mod URL, image URL, release/update data, file size.

Workbench and Content Patcher data shape:

- `CpMakerDraftRecord`: project metadata, overlay targets, config schema draft, serialized change registry, dynamic tokens, custom locations, event source snapshots, export fingerprint.
- `ChangeRegistryPatch`: workspace, target, action, log name, enabled state, When, FromFile, editor state, target locale, priority, local tokens, target field.
- `ContentPatcherProjectSnapshot`: summary, source files, include tree, diagnostics.
- `ContentPatcherPatchPlan`: ordered planned patches.
- `ContentPatcherTraceEntry`: patch id, log name, action, source path, status, reason summary, change summary, diagnostics.
- `ContentPatcherTargetSummary`: path, asset kind, touched patch count, result state, patch ids.

Event editing data shape:

- Event command schemas are the source of command UI.
- Command categories are `dialogue`, `movement`, `visual`, `audio`, `logic`, `scene`, `item`, `animation`, and `other`.
- Command UI controls include text, textarea, number, NPC selector, tile picker, direction, emote, music, sound, toggle, choice, RGB color, and raw text.

Design implication: pages should be arranged as working instruments around lists, queues, graphs, traces, inspectors, previews, and status. Avoid generic feature-section templates.

## Architecture Constraints

Frontend architecture is Feature-Sliced Design plus Clean Architecture.

Target dependency direction:

```text
app -> pages -> widgets -> features -> entities -> shared/contracts
```

Durable architecture rules that affect design work:

- `app` mounts providers, restores startup state, injects platform ports, composes registries, and owns shell concerns.
- `pages` own page shell, view dispatch, slots, and layout skeletons.
- `widgets` compose feature/entity hooks with shared UI.
- `features` own independent user capabilities and must not import other features.
- `entities` are headless domain modules.
- `shared/contracts` owns registry, events, commands, platform ports, and cross-layer types.
- `platform/electron` and `platform/tauri` implement desktop adapters; business code must not import host APIs directly.
- Static registry composition happens in `apps/desktop/src/app/registry-setup.ts`.

Cross-feature coordination uses typed events and commands:

- Events include `workbench/view-selected`, `workbench/asset-focused`, `cp-maker/draft-selected`, `cp-maker/asset-selected`, and `app/locale-changed`.
- Commands include `navigation/open-page`, `navigation/open-workbench-view`, and `workbench/open-asset`.

## Visual Identity

The visual system is already defined in CSS tokens and feature styles. Inherit it.

Typography:

- Sans stack: `Segoe UI Variable Text`, `SF Pro Text`, `PingFang SC`, `Microsoft YaHei UI`, system UI.
- Mono stack: `IBM Plex Mono`, `Cascadia Mono`, `JetBrains Mono`.
- Base body size is `14px` with `1.45` line height.
- Dense labels commonly use `10px` to `12px`, uppercase, bold, and tracked.
- Tool and dashboard headings are usually `20px` to `28px`; Studio project titles can reach `44px`.

Core light tokens:

- Accent: `#4f46e5`
- Success: `#16a34a`
- Warning: `#d97706`
- Danger: `#dc2626`
- App surface: `#e9edf2`
- Panel surface: `#f4f7fb`
- Muted panel: `#e9eef4`
- Viewport: `#d6dce6`
- Primary text: `#18212f`
- Secondary text: `#4f5968`
- Tertiary text: `#7d8798`

The token accent is user/theme selectable. Do not infer a fixed hue from one screenshot: `Indigo`, `Blue`, and other accent presets can all be valid. When matching launcher configuration references, preserve the usage balance: neutral gray-blue surfaces, subtle borders, white/soft panels, and sparse token-accent emphasis.

Core dark tokens:

- Accent: `#6366f1`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#f87171`
- App surface: `#12151c`
- Panel surface: `#1a1f27`
- Viewport: `#0a0d12`
- Primary text: `#f3f6fb`
- Secondary text: `#b4bdcb`

Accent presets are `Indigo`, `Blue`, `Cyan`, `Emerald`, `Amber`, and `Rose`.

Common component language:

- Workspace panels use blurred panel surfaces, subtle borders, `14px` radius, and panel/floating shadows.
- Icon tool buttons are generally square `28px` to `30px`, with `9px` to `12px` radius.
- Pills use full rounding and carry status, mode, scope, or small metadata.
- Launcher cards use cover art, compact metadata, hover lift, selected outlines, and disabled-state danger borders.
- Studio Desk uses a three-column grid, soft grid backgrounds, cover cards, status dots, and creation-focused panels.
- Workbench uses floating/docked panels, viewport chrome, tool rails, resizers, drop zones, and drag previews.

Launcher-style visual treatment:

- Launcher-style prototypes should borrow the launcher configuration page's visual language without copying its internal class names, markup, layout, or product responsibilities.
- Preserve the target flow's existing job and interaction shape. For example, an ObjectData item picker remains an item-selection dialog with category rail, search, grid/list results, pagination, selected item footer, and optional item detail view.
- Apply the launcher configuration feel through surfaces, borders, shadows, typography, chips, buttons, inputs, status colors, and density rather than by moving the screen into a configuration-page layout.
- Buttons and inputs should match the launcher configuration feel: flat borderless accent buttons, compact icon buttons, transparent `2px` focus-border inputs, and compact neutral chips.
- The launcher configuration feel is mainly neutral gray-blue surfaces, subtle dividers, compact cards, and sparse current-token accent emphasis. Do not hardcode the hue from a single screenshot, and do not turn the accent into broad saturated surfaces.
- Detail or inspector dialogs should use the same configuration-page grammar: panel sections with slim headers, field rows/cards, neutral chips, semantic status colors, and one restrained primary action. Avoid large saturated tag blocks or inline one-off colors.
- Icons should follow the project’s lucide-style line icon language, not emoji. Colorful icons are allowed for category/type affordance, but keep the color on the icon or its small backing chip; do not expand those colors into large selected backgrounds or panel surfaces.
- For ObjectData browser design work, do not change the picker into a settings/configuration page unless the product requirement explicitly changes its function.

Critical visual files:

- `apps/desktop/src/styles/tokens.css`
- `apps/desktop/src/styles/base.css`
- `apps/desktop/src/styles/workspace/layout.css`
- `apps/desktop/src/styles/workspace/top-menu.css`
- `apps/desktop/src/styles/features/launcher/core.css`
- `apps/desktop/src/styles/features/launcher/configuration/shell-and-layout.css`
- `apps/desktop/src/styles/features/launcher/configuration/account-and-routes.css`
- `apps/desktop/src/styles/features/launcher/configuration/settings.css`
- `apps/desktop/src/styles/features/launcher/library/mod-card.css`
- `apps/desktop/src/styles/features/cp-maker/studio-desk/gallery-and-controls.css`
- `apps/desktop/src/styles/features/cp-maker/studio-workspace/stage-and-cards.css`

## Copy And Localization

All user-facing UI copy should come from locale bundles, not hardcoded component strings.

Critical files:

- `apps/desktop/src/locales/schema.ts`
- `apps/desktop/src/locales/en-US.ts`
- `apps/desktop/src/locales/zh-CN.ts`
- `apps/desktop/src/locales/localeContext.tsx`

Use existing terminology exactly when designing new UI:

- Use `UniqueID`, not a generic `identifier`, when referring to SMAPI/manifest identity.
- Use `UpdateKeys`, not `update links`, when matching Nexus pages.
- Use `When`, `FromFile`, `Target`, `Action`, `LogName`, and `PatchMode` for Content Patcher patch fields.
- Use `Nexus API Key`, `Route Diagnostics`, and `Nexus Mods Network` for network/account surfaces.
- Use `World Bible`, `Global Rules`, `Tokens`, and `Custom Locations` for CP Maker authoring surfaces.

## Desktop Backend Responsibilities

Rust owns desktop capabilities and domain-heavy operations. Host command adapters, whether called from Electron sidecar routing on Linux or Tauri command registration on macOS/Windows, should stay thin wrappers around domain modules.

Critical backend files:

- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/commands/launcher.rs`
- `apps/desktop/src-tauri/src/commands/content_patcher.rs`
- `apps/desktop/src-tauri/src/commands/cp_maker.rs`
- `apps/desktop/src-tauri/src/commands/assets.rs`
- `apps/desktop/src-tauri/src/domain/launcher/`
- `apps/desktop/src-tauri/src/domain/content_patcher/`
- `apps/desktop/src-tauri/src/domain/cp_maker/`
- `apps/desktop/src-tauri/src/domain/assets/`
- `apps/desktop/src-tauri/src/infrastructure/game_formats/xnb/`
- `apps/desktop/src-tauri/src/infrastructure/game_formats/xact/`

Backend capabilities visible in command registration include game directory detection, map/event scanning, Content Patcher simulation and export, CP Maker draft storage and export, launcher settings, library scans, Nexus diagnostics, update checks, downloads, archive inspection/install, install backup restore, app UI state, debug logging, Nexus API key validation, and Nexus SSO.

## Design Goals

1. Keep the app work-first.
   The README leads with a desktop workbench, and the code implements an operational shell. Prioritize real tools, state, status, and previews over introductory explanation.

2. Make Launcher feel like a mod operations console.
   Library, Discover, Updates, Downloads, Diagnostics, packs, folders, child mods, and backups should be visible as lifecycle controls around local SMAPI mods and Nexus data.

3. Make Workbench feel like an authoring desk.
   Studio Desk, Workspace Editor, World Bible, Patch Catalog, Event Graph, stage preview, timeline, inspector, and export center should feel connected but independently navigable.

4. Preserve the product’s native structures.
   Use graphs for event workflows, catalogs for mods/items/assets, queues for downloads, traces for simulations, panels for inspectors, and previews for maps/images/stage output.

5. Keep architecture boundaries visible in design decisions.
   New surfaces should map naturally to app, pages, widgets, features, entities, shared/contracts, and platform. Designs that require feature-to-feature imports or direct Tauri calls in business code are not aligned with the codebase.

6. Maintain bilingual readiness.
   Designs must account for both `en-US` and `zh-CN`, and must not rely on strings being passed through component props when locale hooks and bundles already exist.

7. Respect the existing visual language.
   Use restrained desktop density, tokenized surfaces, status colors, compact controls, real panels, tool rails, cards only for repeated items, and accent-driven states.

## Design Anti-Goals

- Do not invent product names, slogans, demo projects, placeholder mod names, or fake metrics.
- Do not design a marketing landing page as the primary screen.
- Do not create UI copy outside locale bundles.
- Do not bypass `shared/contracts/platform.ts` with direct Tauri imports in business layers.
- Do not add catch-all roots such as `components`, `lib`, or `processes`.
- Do not introduce a second global CSS entry point.
- Do not flatten Launcher and Workbench into generic dashboards; they have different jobs.

## Verification Checklist For Future Design Work

Before finalizing a new screen or flow, check:

- Does the page use labels and terminology from `apps/desktop/src/locales/`?
- Does the hierarchy reflect the README’s workbench purpose?
- Does the layout match the product’s native shape: catalog, queue, graph, pipeline, trace, inspector, or preview?
- Does the design inherit tokens from `styles/tokens.css` and feature CSS patterns?
- Does the proposed implementation fit FSD and Clean Architecture boundaries?
- Does it preserve desktop density and avoid decorative filler?
- Does it include empty, loading, error, disabled, selected, dragging, and saved/unsaved states where the existing flows expect them?
