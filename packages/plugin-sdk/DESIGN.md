# ModForge Plugin Design Guide

How to make a code-package page look and behave like a first-class part of
ModForge Studio. The bundled example plugin (`modforge.example-code-plugin`,
the memory-match game) implements every pattern in this guide — read its
`src/` sources alongside this document.

<!--
This is the single source of truth for the plugin design guide. Copies in
`template/DESIGN.md` and `apps/desktop/compat-plugins/modforge.example-code-plugin/DESIGN.md`
are generated — do not edit them. The "Host components" section below is
generated from the JSDoc of `apps/desktop/src/shared/ui/*.tsx`; document props
there, not here. Run `vp run gen:plugin-docs` after editing.
-->

## Principles

1. **Flat workbench surfaces.** Panels are plain surfaces with a hairline
   border and a quiet header. No gradient boxes, no heavy card stacks, no
   decorative chrome around the content area.
2. **High information density.** Prefer tight grids and rows over large padded
   cards. The host's asset library (a dense tile grid with a detail column) is
   the reference layout.
3. **Theme-aware everything.** The app ships multiple color themes, each with
   a light and dark variant. Every color you use must come from a semantic CSS
   variable so the page restyles itself for free.

## Choosing building blocks

Always pick the highest-level building block that fits, in this order:

1. **Host components (`ctx.components`)** — real host React components, fully
   token-styled and behavior-complete (focus rings, popover positioning,
   keyboard handling). If one fits, use it.
2. **Shared host classes** — global CSS classes the host ships for common
   patterns (buttons, inputs, stat cards, list rows, split layouts). They are
   token-styled and restyle with the theme for free.
3. **Scoped custom CSS** — only for visuals the host genuinely does not have
   (game-specific artwork, animations). Ship it as a stylesheet file declared
   in the manifest (see "Custom styles" below).

Hand-rolling a button or stat card when 1–2 exist is the most common plugin
mistake: it drifts from the host's look and breaks on theme changes.

## Hard rules

- **Never hardcode colors.** No `#fff`, no `#xxxxxx`, no `rgba()` literals,
  and never mix literal white/black inside `color-mix`. Always use the tokens
  below. (Exception: non-thematic decoration such as game cover art.)
- **Never write `.dark` overrides.** Themes are orthogonal (`[data-theme]` ×
  `.dark`) and resolve inside the tokens. If a color looks wrong, pick a
  different token — do not patch per theme.
- **Scope every style.** Declare one stylesheet via the manifest `styles`
  field and prefix every selector with a class unique to your plugin (e.g.
  `.myplugin-`). The host injects it on load, re-fetches it on hot-reload,
  and removes it on unload. Never restyle host classes (`.panel-*`,
  `.control-*`) globally.

## Color tokens

All tokens are plain CSS variables available on `:root`; use them directly in
your scoped stylesheet.

| Token                                                     | Use                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `--bg-panel`                                              | Primary panel/card surface                                    |
| `--bg-panel-muted`                                        | Recessed areas: tile wells, sidebars, code blocks             |
| `--bg-elevated`                                           | Raised surfaces                                               |
| `--bg-overlay`                                            | Floating panels (dropdowns, tooltips)                         |
| `--bg-hover` / `--bg-active`                              | Hover / selected row or tile background                       |
| `--text-primary` / `--text-secondary` / `--text-tertiary` | Text, from strongest to quietest                              |
| `--text-inverse`                                          | Text on top of solid accent fills                             |
| `--accent` / `--accent-strong`                            | Primary accent, and its hover/active deepening                |
| `--accent-soft`                                           | Translucent accent tint (badges, selected tiles, focus fills) |
| `--accent-contrast`                                       | Foreground on `--accent` fills                                |
| `--border-color`                                          | The one hairline border color for panels and controls         |
| `--success` / `--warning` / `--danger` / `--info`         | Status colors                                                 |
| `--success-soft` / `--warning-soft` / `--danger-soft`     | Matching translucent status backgrounds                       |
| `--shadow-panel` / `--shadow-float`                       | Panel shadow / floating overlay shadow                        |
| `--bevel-highlight`                                       | Top inset highlight used by raised surfaces                   |
| `--focus-ring`                                            | Keyboard focus ring color                                     |
| `--font-sans` / `--font-mono`                             | UI font / monospace font                                      |

## Host components (`ctx.components`)

```ts
const {
  PanelFrame,
  PanelSection,
  EmptyStateCard,
  WorkspaceSplitView,
  CompactSelect,
  Tooltip,
  Disclosure,
  ProgressRing,
  ImageSkeleton,
  ItemGroupPopover,
  SheetRegionPicker,
} = ctx.components
```

<!-- BEGIN GENERATED host-components — from apps/desktop/src/shared/ui; do not edit -->

### PanelFrame

Panel surface with an optional header (title, subtitle, header action) and a body region.

| Prop             | Type        | Description                                      |
| ---------------- | ----------- | ------------------------------------------------ |
| `title`          | `string`    | Header title text.                               |
| `subtitle?`      | `string`    | Secondary line rendered under the title.         |
| `headerAction?`  | `ReactNode` | Right-aligned header content (buttons, selects). |
| `className?`     | `string`    | Extra class on the root section.                 |
| `bodyClassName?` | `string`    | Extra class on the scrollable body region.       |
| `hideHeader?`    | `boolean`   | Render without the header.                       |
| `flat?`          | `boolean`   | Flat surface without the panel shadow/bevel.     |
| `children`       | `ReactNode` | Body content.                                    |

### PanelSection

Sub-section within a panel, with an optional header (title, subtitle, action) and variant styling.

| Prop               | Type                               | Description                                                                   |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `title?`           | `string`                           | Section header title; header renders when title, subtitle or action is set.   |
| `subtitle?`        | `string`                           | Secondary line in the section header.                                         |
| `action?`          | `ReactNode`                        | Right-aligned header content.                                                 |
| `className?`       | `string`                           | Extra class on the root section.                                              |
| `headerClassName?` | `string`                           | Extra class on the header element.                                            |
| `bodyClassName?`   | `string`                           | Extra class on the body wrapper.                                              |
| `variant?`         | `'default' \| 'muted' \| 'accent'` | Surface treatment: `default`, `muted` (recessed) or `accent` (accent-tinted). |
| `children`         | `ReactNode`                        | Section body content.                                                         |

### EmptyStateCard

Shared empty-results card for business-agnostic loading, empty, and unavailable states.

| Prop                  | Type                     | Description                                                                     |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `eyebrow?`            | `string`                 | Small label rendered above the title.                                           |
| `title`               | `string`                 | Heading text.                                                                   |
| `detail`              | `string`                 | Supporting text under the title.                                                |
| `primaryAction?`      | `ReactNode`              | Primary action content (e.g. a `control-button control-button-primary` button). |
| `secondaryAction?`    | `ReactNode`              | Secondary action rendered next to the primary one.                              |
| `illustrationIcon?`   | `ReactNode`              | Custom icon replacing the default illustration core.                            |
| `illustrationAccent?` | `ReactNode`              | Extra accent element overlaid on the illustration.                              |
| `density?`            | `'default' \| 'compact'` | `compact` shrinks paddings for inline/sidebar use.                              |
| `className?`          | `string`                 | Extra class on the root section.                                                |

### WorkspaceSplitView

Workspace two/three-column layout control: a plain left sidebar, a center main content area, and an optional right detail panel. Renders children directly when there is content; otherwise renders a centered emptyState.

| Prop                   | Type                           | Description                                                                                             |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `sidebar`              | `ReactNode`                    | Left column content; the column body scrolls as a whole, use sticky for fixed headers.                  |
| `children?`            | `ReactNode`                    | Main content; renders the emptyState hint when absent.                                                  |
| `mainToolbar?`         | `ReactNode`                    | Fixed top toolbar for the main content (search/filter/add controls), rendered above the main content.   |
| `rightPanel?`          | `ReactNode`                    | Optional right detail panel; shown when provided, collapses to no space when empty.                     |
| `emptyState?`          | `WorkspaceSplitViewEmptyState` | Hint state shown when the main content has no children.                                                 |
| `sidebarLabel?`        | `string`                       | Accessible label for the sidebar landmark.                                                              |
| `rightPanelLabel?`     | `string`                       | Accessible label for the right panel landmark.                                                          |
| `sidebarWidth?`        | `string`                       | Sidebar width, defaults to 20rem.                                                                       |
| `rightPanelWidth?`     | `string`                       | Right panel width, defaults to 18rem.                                                                   |
| `sidebarClassName?`    | `string`                       | Extra class applied to the sidebar element.                                                             |
| `mainClassName?`       | `string`                       | Extra class applied to the main content element.                                                        |
| `rightPanelClassName?` | `string`                       | Extra class applied to the right panel element.                                                         |
| `canvas?`              | `boolean`                      | Main content canvas grid background toggle (for editor views); off by default for directory/list pages. |
| `className?`           | `string`                       | Extra class applied to the outer wrapper.                                                               |

**`WorkspaceSplitViewEmptyState`**

| Prop      | Type        | Description                                |
| --------- | ----------- | ------------------------------------------ |
| `icon`    | `ReactNode` | Icon rendered above the empty-state title. |
| `title`   | `string`    | Empty-state heading text.                  |
| `hint`    | `string`    | Supporting detail text under the title.    |
| `action?` | `ReactNode` | Optional action rendered below the hint.   |

### CompactSelect

Compact app-styled select for small toolbars and footers. It owns popover positioning and basic keyboard/open-state behavior without leaking platform-specific UI.

| Prop                | Type                                                         | Description                                                                                              |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `value`             | `TValue`                                                     | Currently selected value.                                                                                |
| `options`           | `readonly CompactSelectOption[]`                             | Options to display.                                                                                      |
| `onChange`          | `(value: TValue) => void`                                    | Called with the value of the picked option.                                                              |
| `ariaLabel`         | `string`                                                     | Accessible label for the trigger.                                                                        |
| `placeholder?`      | `string`                                                     | Shown on the trigger when the value matches no option; without it the first option is displayed instead. |
| `className?`        | `string`                                                     | Extra class on the root wrapper.                                                                         |
| `triggerClassName?` | `string`                                                     | Extra class on the trigger button.                                                                       |
| `menuClassName?`    | `string`                                                     | Extra class on the popover menu.                                                                         |
| `disabled?`         | `boolean`                                                    | Renders the trigger non-interactive.                                                                     |
| `placement?`        | `'bottom-start' \| 'bottom-end' \| 'top-start' \| 'top-end'` | Popover placement relative to the trigger.                                                               |

**`CompactSelectOption`**

| Prop           | Type      | Description                         |
| -------------- | --------- | ----------------------------------- |
| `value`        | `TValue`  | Option value handed to `onChange`.  |
| `label`        | `string`  | Visible option label.               |
| `description?` | `string`  | Secondary line under the label.     |
| `disabled?`    | `boolean` | Renders the option non-interactive. |

### Disclosure

Collapsible section for progressive disclosure: advanced options stay one click away without crowding the default form. Local open state only; the parent owns the form values inside.

| Prop             | Type        | Description                                                    |
| ---------------- | ----------- | -------------------------------------------------------------- |
| `title`          | `string`    | Toggle row heading text.                                       |
| `subtitle?`      | `string`    | Optional secondary text on the toggle row.                     |
| `defaultOpen?`   | `boolean`   | Starts open; the host owns the local open state.               |
| `className?`     | `string`    | Extra class applied to the outer wrapper.                      |
| `bodyClassName?` | `string`    | Extra class applied to the body region.                        |
| `children`       | `ReactNode` | Section body content, rendered only while the section is open. |

### ProgressRing

Circular progress indicator with an accessible progressbar role and optional center content.

| Prop              | Type        | Description                                              |
| ----------------- | ----------- | -------------------------------------------------------- |
| `progress`        | `number`    | Progress percentage, clamped to 0–100.                   |
| `label`           | `string`    | Accessible label for the progressbar role.               |
| `size?`           | `number`    | Ring diameter in pixels, defaults to 32.                 |
| `strokeWidth?`    | `number`    | Ring stroke width in pixels, defaults to 3.              |
| `className?`      | `string`    | Extra class applied to the ring wrapper.                 |
| `indicatorColor?` | `string`    | Indicator ring color, defaults to the accent token.      |
| `trackColor?`     | `string`    | Track ring color, defaults to a translucent accent tint. |
| `children?`       | `ReactNode` | Optional center content rendered inside the ring.        |

### ImageSkeleton

Image placeholder skeleton that respects a target aspect ratio while the real image loads.

| Prop           | Type            | Description                                                                  |
| -------------- | --------------- | ---------------------------------------------------------------------------- |
| `className?`   | `string`        | Extra class applied to the skeleton element.                                 |
| `style?`       | `CSSProperties` | Inline styles forwarded to the skeleton element.                             |
| `aspectRatio?` | `string`        | Target aspect ratio (e.g. `16 / 9`); the element is auto-sized when omitted. |
| `rounded?`     | `boolean`       | Rounded corners, on by default.                                              |
| `overlay?`     | `boolean`       | Overlay variant for images rendered on top of content.                       |

### ItemGroupPopover

Hover/focus popover that renders a group of items as a responsive grid with floating-ui positioning.

| Prop         | Type                                            | Description                                                            |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `groupIcon`  | `ReactNode \| ((isOpen: boolean) => ReactNode)` | Trigger icon; can also be a function receiving the current open state. |
| `items`      | `T[]`                                           | Items rendered in the popover grid.                                    |
| `renderItem` | `(item: T, index: number) => ReactNode`         | Renders one item cell; receives the item and its grid index.           |
| `title?`     | `string`                                        | Optional heading above the grid.                                       |
| `subtitle?`  | `string`                                        | Optional supporting text under the heading.                            |

### SheetRegionPicker

Rubber-band region selection over a sprite sheet. The stage scales the image to the container width and maps pointer coordinates back to source pixels; the selection renders as a percentage overlay so no resize bookkeeping is needed. Coordinates still arrive in source pixels, ready for `FromArea` / `ToArea` / `SpriteIndex` semantics.

| Prop          | Type                            | Description                                                                 |
| ------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `imageUrl`    | `string`                        | Image URL rendered as the selectable stage.                                 |
| `imageWidth`  | `number`                        | Image width in source pixels.                                               |
| `imageHeight` | `number`                        | Image height in source pixels.                                              |
| `value`       | `SheetRegion \| null`           | Current selection in source pixels, or null.                                |
| `onChange`    | `(region: SheetRegion) => void` | Called with the new selection on drag end or, in cellPick mode, on click.   |
| `snap?`       | `number`                        | Snap grid size in source pixels (e.g. 16 for tiles); freehand when omitted. |
| `cellPick?`   | `boolean`                       | Click-to-pick single cells instead of dragging rectangles.                  |
| `className?`  | `string`                        | Extra class applied to the picker stage.                                    |

**`SheetRegion`**

| Prop     | Type     | Description                     |
| -------- | -------- | ------------------------------- |
| `x`      | `number` | Left edge in source pixels.     |
| `y`      | `number` | Top edge in source pixels.      |
| `width`  | `number` | Region width in source pixels.  |
| `height` | `number` | Region height in source pixels. |

### Tooltip

Small app-styled tooltip for replacing native browser title popups on selected UI. It owns hover/focus positioning only and does not mutate child behavior.

| Prop         | Type                                     | Description                                                                |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| `label`      | `ReactNode`                              | Tooltip content rendered in the floating popup.                            |
| `children`   | `ReactNode`                              | The wrapped element the tooltip attaches to; its behavior is not modified. |
| `disabled?`  | `boolean`                                | Disables the tooltip so hover/focus never opens it.                        |
| `className?` | `string`                                 | Extra class applied to the trigger wrapper span.                           |
| `placement?` | `'top' \| 'right' \| 'bottom' \| 'left'` | Popover placement relative to the trigger; defaults to top.                |

<!-- END GENERATED host-components -->

## Shared host classes

Global, token-styled classes your page can apply directly — no import needed.

| Class                                                                     | Use                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `control-button`                                                          | Standard secondary button                                     |
| `control-button control-button-primary`                                   | Accent primary action; also the "active" state for toggles    |
| `icon-button`                                                             | 32px square icon-only button                                  |
| `tool-button` (+ `tool-button-active`)                                    | Toolbar toggle button and its active state                    |
| `control-input`                                                           | Single-line text input                                        |
| `panel-surface` / `panel-surface-flat`                                    | Top-level panel card (what PanelFrame renders)                |
| `panel-section` (+ `-muted` / `-accent`)                                  | Bordered sub-section box (what PanelSection renders)          |
| `panel-list-card` (+ `-interactive` / `-active`)                          | Selectable card row in a list                                 |
| `asset-row` (+ `asset-row-active`)                                        | Full-width selectable row                                     |
| `panel-title` / `panel-section-title`                                     | Small uppercase section label                                 |
| `metric-card` (+ `compact-metric-card`)                                   | Small stat card; pair with `metric-label` / `metric-value`    |
| `kv-row` / `compact-kv-row`                                               | Label/value row (two spans)                                   |
| `status-pill` (+ `-idle` / `-working` / `-ready` / `-warning` / `-error`) | Inline status pill                                            |
| `panel-empty-state`                                                       | Dashed-border empty placeholder                               |
| `workspace-split-view` family                                             | Sidebar / main / right-panel page layout (see example plugin) |

## Custom styles

Ship your custom styles as a plain `.css` file at the plugin root and declare
it in `manifest.json`:

```json
{
  "entry": "index.js",
  "styles": "styles.css"
}
```

The host fetches it over the plugin protocol, injects it as one `<style>`
element before your pages mount, re-fetches it on hot-reload, and removes it
when the plugin unloads — no injection code in your bundle. `styles` requires
a code entry (`entry` + `sdkVersion`) and the file must exist, so a typo
fails validation at scan time instead of silently shipping unstyled.

Notes:

- Prefix **every** selector with your plugin-specific class so reloads and
  other plugins never collide.
- Game sprites need `image-rendering: pixelated` (and usually a scale factor
  of 2–4×) to look right.
- Keep radii modest (0.5–0.75rem) and spacing dense; the workbench aesthetic
  is quiet panels plus tight content.
- Tailwind utility classes are **not** available: the host generates them at
  build time from its own sources, so a utility that happens to exist today
  can vanish with any host refactor. Use the shared host classes above or
  your own scoped CSS.

## Runtime modules (import map)

Plugins are native ES modules loaded over the plugin protocol. Bare imports
of the modules below resolve through an import map to the **host's own
instances** — never bundle your own copy of them (two React instances in one
tree breaks hooks):

| Bare specifier            | What you get                                  |
| ------------------------- | --------------------------------------------- |
| `react`                   | Host React 19 singleton                       |
| `react-dom`               | Host ReactDOM                                 |
| `react/jsx-runtime`       | JSX runtime (automatic JSX transform)         |
| `@modforge/plugin-sdk`    | The SDK types/context runtime                 |
| `@dnd-kit/core`           | Drag-and-drop primitives                      |
| `@dnd-kit/sortable`       | Sortable lists on top of dnd-kit              |
| `@dnd-kit/utilities`      | dnd-kit helpers (`CSS` transform utils, etc.) |
| `@floating-ui/react`      | Popover/tooltip positioning                   |
| `@tanstack/react-virtual` | Virtualized lists/grids                       |
| `react-resizable-panels`  | Split-pane layouts                            |
| `lucide-react`            | The host's icon set                           |
| `zustand`                 | State stores                                  |

For TypeScript, install the same package as a **devDependency** (types only)
and mark the specifier external in your bundler — see the template's build
script. Libraries that need their own stylesheet (e.g. `@xyflow/react`) are
deliberately not exposed: import maps only resolve JS.

## i18n

Declare locales in `manifest.json` (`i18n` section) and translate with
`ctx.i18n.t(key)`; missing keys fall back to the key itself. Never hardcode
user-visible strings in the component.

## Notifications

```ts
ctx.notifications.publish({
  id: 'save-done', // optional; reused ids replace the previous toast
  level: 'success', // 'success' | 'info' | 'warning' | 'error'
  title: ctx.i18n.t('saved'),
  autoDismissMs: 4000, // null pins the notification
})
```

Notifications are namespaced per plugin and retracted automatically when the
plugin unloads.

## Host commands (`ctx.commands.invoke`)

| Command                | Args                                                           | Returns                                                                                                                              |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveTargetModRoot` | —                                                              | absolute path of the first target mod, or `null`                                                                                     |
| `listModDirectory`     | `{ rootSubdir, entryFile, entryImage?, includeContentPacks? }` | entries under the target mod (plus its content packs when `includeContentPacks`), each tagged with `sourceModRoot` / `sourceModName` |
| `readModFile`          | `{ rootSubdir, entryId, entryFile, sourceModRoot? }`           | file content, or `null`                                                                                                              |
| `writeModFile`         | `{ rootSubdir, entryId, entryFile, content, sourceModRoot? }`  | —                                                                                                                                    |
| `readPluginAsset`      | `{ path }`                                                     | text content of a file shipped inside your plugin package                                                                            |
| `resolveGameRoot`      | —                                                              | detected game directory, or `null`                                                                                                   |
| `loadGameDataAsset`    | `{ assetPath, locale? }`                                       | parsed text/data asset (`Content Patcher`-style key like `Data/Objects`)                                                             |
| `loadGameImage`        | `{ contentPath, locale? }`                                     | `data:` URL of a game texture                                                                                                        |
| `scanGameAudio`        | —                                                              | `{ cue, kind: 'music' \| 'sound', ... }[]`, music cues classified from the vanilla cue list                                          |
| `loadGameAudioCue`     | `{ cue }`                                                      | `data:audio/wav;base64,...` URL for playback                                                                                         |

All commands reject on failure — surface errors with `EmptyStateCard` or a
notification instead of swallowing them.

Entry identity for directory-pack listings is the (`sourceModRoot`, `id`)
pair: `id` alone is only unique within one mod directory. When
`includeContentPacks: true` aggregates content packs into the listing, pass an
entry's `sourceModRoot` back to `readModFile`/`writeModFile` so the operation
hits the pack the entry came from. `sourceModRoot` must nest under the game's
`Mods` directory; anything else is rejected.

## Capabilities

`ctx.capabilities.get(id)`: built-in ids `plugin.id`, `plugin.targets`,
`host.sdkVersion`, `host.locale` are always available. Host capabilities are
pure-function implementations owned by the host core (they serve ≥2 plugins or
are clearly generic); to reach one, declare its id in the manifest
`contributions.capabilities` array, e.g.
`"capabilities": ["scaleup-frame-math"]`. Undeclared or unknown ids return
`undefined`.

## Checklist before shipping

- [ ] Host components and shared classes used wherever they fit; custom CSS
      only for what the host does not have.
- [ ] Only semantic tokens — no literal colors anywhere.
- [ ] Custom styles shipped as a manifest-declared `.css` file, all selectors
      scoped under a plugin prefix.
- [ ] Shared runtime modules imported via the import map, never bundled.
- [ ] Loading, empty, and error states rendered (EmptyStateCard).
- [ ] All user-visible strings go through `ctx.i18n.t`.
- [ ] Errors from `ctx.commands.invoke` are surfaced, not swallowed.
- [ ] Page registered with a sensible `section`, `order`, and `icon`.
