---
version: alpha
name: ModForge Studio Design System
description: A professional modding workbench for Stardew Valley with multi-theme support and comprehensive design tokens.

colors:
  # Primary palette (required)
  primary: '#2563eb'
  accent: '#2563eb'
  success: '#15803d'
  warning: '#c2410c'
  danger: '#dc2626'
  info: '#0e7490'

  # Surfaces
  surface-app: '#ffffff'
  surface-panel: '#ffffff'
  surface-panel-muted: '#f0f0f3'
  surface-viewport: '#ebebef'
  surface-active: '#e3ecfd'
  surface-elevated: 'rgba(255, 255, 255, 0.95)'

  # Text
  text-primary: '#1c1c20'
  text-secondary: '#52535a'
  text-tertiary: '#86878e'
  text-inverse: '#f8fbff'

  # Borders & Grids
  border-subtle: 'rgba(110, 112, 120, 0.24)'
  grid-minor: 'rgba(110, 112, 120, 0.1)'
  grid-major: 'rgba(110, 112, 120, 0.16)'

  # Semantic colors (component-specific)
  cp-logic: '#22c55e'
  cp-logic-dark: '#15803d'
  cp-file: '#3b82f6'
  cp-file-dark: '#1d4ed8'
  cp-data: '#f97316'
  cp-data-dark: '#c2410c'

  # Overlays
  scrim: 'rgba(15, 23, 42, 0.32)'
  surface-inverse: '#0f172a'

  # Shadow base colors
  shadow-light: 'rgba(20, 22, 30, 0.05)'
  shadow-medium: 'rgba(20, 22, 30, 0.07)'
  shadow-heavy: 'rgba(20, 22, 30, 0.18)'

typography:
  font-sans:
    fontFamily: "'Segoe UI Variable Text', 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei', system-ui, sans-serif"
    fontSize: 1rem
    lineHeight: 1.5

  font-mono:
    fontFamily: "'IBM Plex Mono', 'Cascadia Mono', 'JetBrains Mono', monospace"
    fontSize: 0.875rem
    lineHeight: 1.6

rounded:
  sm: 4px
  md: 8px
  lg: 12px
  app-window: 12px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  titlebar-height: 57px

components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.text-inverse}'
    rounded: '{rounded.md}'
    padding: 12px

  button-secondary:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.primary}'
    rounded: '{rounded.md}'
    padding: 12px

  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.text-inverse}'
    rounded: '{rounded.md}'
    padding: 12px

  panel:
    backgroundColor: '{colors.surface-panel}'
    rounded: '{rounded.md}'

  panel-elevated:
    backgroundColor: '{colors.surface-elevated}'
    rounded: '{rounded.lg}'

  panel-muted:
    backgroundColor: '{colors.surface-panel-muted}'
    rounded: '{rounded.md}'

  card-active:
    backgroundColor: '{colors.surface-active}'
    rounded: '{rounded.md}'

  titlebar:
    backgroundColor: '{colors.surface-panel}'
    height: 57px

  text-body:
    textColor: '{colors.text-primary}'
    typography: '{typography.font-sans}'

  text-label:
    textColor: '{colors.text-secondary}'
    typography: '{typography.font-sans}'

  text-caption:
    textColor: '{colors.text-tertiary}'
    typography: '{typography.font-sans}'

  code-block:
    backgroundColor: '{colors.surface-viewport}'
    textColor: '{colors.text-primary}'
    typography: '{typography.font-mono}'
    rounded: '{rounded.sm}'
    padding: 8px

  badge-success:
    backgroundColor: '{colors.success}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  badge-warning:
    backgroundColor: '{colors.warning}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  badge-danger:
    backgroundColor: '{colors.danger}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  badge-info:
    backgroundColor: '{colors.info}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  viewport-canvas:
    backgroundColor: '{colors.surface-viewport}'

  app-container:
    backgroundColor: '{colors.surface-app}'

  border-divider:
    backgroundColor: '{colors.border-subtle}'
    height: 1px

  grid-overlay-minor:
    backgroundColor: '{colors.grid-minor}'

  grid-overlay-major:
    backgroundColor: '{colors.grid-major}'

  modal-scrim:
    backgroundColor: '{colors.scrim}'

  chip-logic:
    backgroundColor: '{colors.cp-logic-dark}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  chip-file:
    backgroundColor: '{colors.cp-file-dark}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  chip-data:
    backgroundColor: '{colors.cp-data-dark}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: 4px
    size: 14px

  tooltip:
    backgroundColor: '{colors.surface-inverse}'
    textColor: '{colors.text-inverse}'
    rounded: '{rounded.sm}'
    padding: 8px

  link-accent:
    textColor: '{colors.accent}'
---

## Overview

ModForge Studio embodies **Professional Tool Craftsmanship** — a design language that balances technical precision with creative warmth. The interface draws from modern development tools while embracing the artisanal spirit of modding culture.

The design system supports **8 distinct themes** spanning neutral-tool, warm-paper, slate-blue, forest, twilight, stardew-wood, crimson, and blossom, each with light and dark variants. This multi-theme architecture ensures creators can customize their workspace to match their workflow and mood.

## Colors

### Color Philosophy

The palette is built on **semantic neutrals** and a **single dominant accent** per theme. Surfaces progress from viewport (deepest) → app → panel → elevated, creating natural depth hierarchy without relying on heavy shadows.

- **Accent** — The theme's identity color. Used for primary actions, active states, and focus indicators. Each theme defines its own accent to establish distinct visual personalities.
- **Success/Warning/Danger/Info** — Status colors remain semantically consistent across themes but adjust hue/saturation to harmonize with the theme's accent.
- **Surface layers** — `surface-viewport` (canvas background), `surface-app` (main container), `surface-panel` (cards/panels), `surface-panel-muted` (de-emphasized panels), `surface-active` (selected items), `surface-elevated` (floating menus/dialogs).
- **Text hierarchy** — `text-primary` (headlines/body), `text-secondary` (labels/metadata), `text-tertiary` (captions/hints).
- **Component palette** — `cp-logic` (green), `cp-file` (blue), `cp-data` (orange) distinguish different entity types in visual programming contexts.

### Dark Mode

Every theme includes a dark variant activated via `.dark` class. Dark surfaces invert the luminance hierarchy while preserving the same semantic relationships. Accent colors are typically lightened in dark mode to maintain WCAG contrast ratios against darker backgrounds.

### Theme Variants

| Theme            | Accent (Light) | Accent (Dark) | Character                                    |
| ---------------- | -------------- | ------------- | -------------------------------------------- |
| **neutral-tool** | `#2563eb`      | `#5b8def`     | Clean, professional, universal baseline      |
| **warm-paper**   | `#5b54d6`      | `#8983e8`     | Cozy purple on warm beige, journalistic feel |
| **slate-blue**   | `#0e7490`      | `#2bb6d4`     | Cool cyan-teal, technical precision          |
| **forest**       | `#3f8f4f`      | `#5fb96f`     | Earthy green, organic warmth                 |
| **twilight**     | `#7c5cd6`      | `#a385ee`     | Deep violet, creative mystique               |
| **stardew-wood** | `#c77d2e`      | `#e09a4f`     | Rustic amber, game-inspired                  |
| **crimson**      | `#d4324a`      | `#ec5a70`     | Bold red, high energy                        |
| **blossom**      | `#db2777`      | `#f25fa0`     | Vibrant pink, playful elegance               |

## Typography

### Font Families

- **Sans-serif stack** — Multi-script support prioritizing system fonts for optimal rendering across Windows (Segoe UI Variable), macOS (SF Pro), and Chinese locales (PingFang SC, Microsoft YaHei, Noto Sans CJK SC). Falls back to system-ui for unsupported platforms.
- **Monospace stack** — Developer-friendly programming fonts: IBM Plex Mono (metrics-compatible with Consolas), Cascadia Mono (Windows Terminal default), JetBrains Mono (ligature-rich).

### Type Scale

Body text defaults to `1rem` (16px) with `1.5` line-height for comfortable reading. Monospace text reduces to `0.875rem` (14px) with tighter `1.6` line-height to maximize code density while maintaining legibility.

### Usage Guidelines

- Use **sans-serif** for all UI text: navigation, labels, buttons, descriptions, help text.
- Use **monospace** for code blocks, file paths, JSON/YAML previews, command-line output, version numbers, and technical identifiers.
- Never mix font families within a single text block unless differentiating code from prose (e.g., inline `<code>` tags).

## Layout

### Spacing Scale

The spacing system uses a **4px base unit** with exponential growth:

- `xs: 4px` — Tight inline gaps (icon-to-text)
- `sm: 8px` — Compact padding (buttons, chips)
- `md: 16px` — Standard panel padding
- `lg: 24px` — Section spacing
- `xl: 32px` — Page-level margins

### Window Anatomy

The app uses a **fixed titlebar** (`57px` including 1px divider) that remains interactive across all overlay states. Dialogs use `inset: 57px 0 0` clipping to ensure the titlebar is never obscured.

### Grid & Alignment

Viewport grids use `grid-minor` (10% opacity) and `grid-major` (16% opacity) for canvas rulers and snap guides. Grid lines derive from theme border colors to harmonize with the active palette.

## Elevation & Depth

### Shadow Tokens

- **panel** — Subtle lift for cards and panels (`0 1px 2px + 0 8px 18px`). Keeps surfaces grounded while clearly separating from the canvas.
- **float** — Prominent lift for dropdowns, popovers, tooltips (`0 18px 30px + 0 8px 18px`). Signals temporary, transient UI that hovers above the workspace.

### Stacking Context (Z-Index)

The z-index scale is centralized to prevent layering conflicts:

| Layer                | Z-Index | Purpose                                  |
| -------------------- | ------- | ---------------------------------------- |
| `z-base`             | 0       | Default document flow                    |
| `z-dock`             | 100     | Workspace dock surfaces                  |
| `z-titlebar-divider` | 135     | 1px divider under titlebar               |
| `z-popover`          | 180     | Dropdowns, compact-select menus          |
| `z-titlebar`         | 260     | Titlebar (always interactive)            |
| `z-drawer`           | 280     | Page-level modal drawers                 |
| `z-guide`            | 290     | Guide tour overlay                       |
| `z-dialog`           | 300     | Dialog overlays (clipped below titlebar) |
| `z-dialog-stack`     | 310     | Nested dialogs                           |
| `z-toast`            | 400     | Notification toasts                      |
| `z-tooltip`          | 500     | Hover tooltips (topmost)                 |

## Shapes

### Border Radius

- **sm (4px)** — Buttons, chips, small controls
- **md (8px)** — Panels, cards, input fields
- **lg (12px)** — Modal dialogs, large containers
- **app-window (12px)** — Main application window frame

Avoid radius values outside this scale. Never use pill-shaped borders (`border-radius: 9999px`) except for circular avatars or indicators.

## Components

### Buttons

**Primary buttons** use the theme accent with inverse text color. Hover states darken the background by mixing `82%` accent with `text-primary`. Padding is `8px 16px` (sm × md).

**Secondary buttons** use transparent backgrounds with accent text. Hover applies `bg-hover` (55% active color).

**Danger buttons** replace accent with the danger color for destructive actions.

### Panels

**Elevated panels** float above the surface layer using `surface-elevated` (rgba white with 95% opacity) and `panel` shadow. Standard panels sit flush on `surface-panel` without shadow.

### Focus States

All interactive elements show a **focus ring** using `--focus-ring` (45% accent opacity). The ring is `2px` wide with `2px` offset to avoid clipping text.

### Active States

Selected items receive `surface-active` background — a tinted version of the accent at ~13% opacity. This provides clear visual feedback without overwhelming the content.

## Do's and Don'ts

### Color Usage

✅ **Do** use CSS variables (`var(--accent)`, `var(--text-primary)`) for all color references  
✅ **Do** derive computed colors via `color-mix()` to maintain theme consistency  
❌ **Don't** hardcode hex/rgb values in component styles  
❌ **Don't** use opacity to fake disabled states — use dedicated semantic tokens

### Typography

✅ **Do** use the sans-serif stack for all UI text  
✅ **Do** use monospace for technical identifiers and code  
✅ **Do** maintain the 16px base font size for body text  
❌ **Don't** apply font-size values outside the documented scale  
❌ **Don't** use bold weights for large blocks of text (use for emphasis only)

### Layout

✅ **Do** follow the 4px spacing scale for all padding/margin  
✅ **Do** respect the z-index scale for layering  
✅ **Do** clip dialog overlays below the titlebar  
❌ **Don't** add arbitrary z-index values  
❌ **Don't** use fixed positioning without accounting for titlebar height

### Shadows

✅ **Do** use `panel` shadow for cards and static elevations  
✅ **Do** use `float` shadow for temporary overlays  
❌ **Don't** stack multiple shadow layers  
❌ **Don't** apply shadows to flat UI elements like buttons or inputs

### Theming

✅ **Do** test new components in all 8 themes × 2 modes (16 variants)  
✅ **Do** use theme-agnostic formulas for derived colors  
❌ **Don't** assume light backgrounds when writing color logic  
❌ **Don't** create theme-specific overrides for individual components
