/**
 * @file Generated plugin-facing mirrors of the host design-system components — do not edit by hand.
 *
 * Regenerate with `vp run --filter @modforge/desktop gen:plugin-docs`. Source of truth: the
 * JSDoc and prop declarations of `apps/desktop/src/shared/ui/*.tsx`. Host-internal types are
 * remapped word-for-word (`ReactNode` → `PluginReactNode`, `CSSProperties` →
 * `Record<string, unknown>`, referenced extra types → `Plugin*` mirrors); generic parameter
 * lists are carried verbatim from the host declaration.
 */

import type { PluginReactNode, ReactComponentType } from './primitives'

/** Props for `PluginComponents.PanelFrame`; Panel surface with an optional header (title, subtitle, header action) and a body region. */
export type PluginPanelFrameProps = {
  /** Header title text. */
  title: string
  /** Secondary line rendered under the title. */
  subtitle?: string
  /** Right-aligned header content (buttons, selects). */
  headerAction?: PluginReactNode
  /** Extra class on the root section. */
  className?: string
  /** Extra class on the scrollable body region. */
  bodyClassName?: string
  /** Render without the header. */
  hideHeader?: boolean
  /** Flat surface without the panel shadow/bevel. */
  flat?: boolean
  /** Body content. */
  children: PluginReactNode
}

/** Props for `PluginComponents.PanelSection`; Sub-section within a panel, with an optional header (title, subtitle, action) and variant styling. */
export type PluginPanelSectionProps = {
  /** Section header title; header renders when title, subtitle or action is set. */
  title?: string
  /** Secondary line in the section header. */
  subtitle?: string
  /** Right-aligned header content. */
  action?: PluginReactNode
  /** Extra class on the root section. */
  className?: string
  /** Extra class on the header element. */
  headerClassName?: string
  /** Extra class on the body wrapper. */
  bodyClassName?: string
  /** Surface treatment: `default`, `muted` (recessed) or `accent` (accent-tinted). */
  variant?: 'default' | 'muted' | 'accent'
  /** Section body content. */
  children: PluginReactNode
}

/** Props for `PluginComponents.EmptyStateCard`; Shared empty-results card for business-agnostic loading, empty, and unavailable states. */
export type PluginEmptyStateCardProps = {
  /** Small label rendered above the title. */
  eyebrow?: string
  /** Heading text. */
  title: string
  /** Supporting text under the title. */
  detail: string
  /** Primary action content (e.g. a `control-button control-button-primary` button). */
  primaryAction?: PluginReactNode
  /** Secondary action rendered next to the primary one. */
  secondaryAction?: PluginReactNode
  /** Custom icon replacing the default illustration core. */
  illustrationIcon?: PluginReactNode
  /** Extra accent element overlaid on the illustration. */
  illustrationAccent?: PluginReactNode
  /** `compact` shrinks paddings for inline/sidebar use. */
  density?: 'default' | 'compact'
  /** Extra class on the root section. */
  className?: string
}

/** Empty-state hint rendered in the main column when it has no children. */
export type PluginWorkspaceSplitViewEmptyState = {
  /** Icon rendered above the empty-state title. */
  icon: PluginReactNode
  /** Empty-state heading text. */
  title: string
  /** Supporting detail text under the title. */
  hint: string
  /** Optional action rendered below the hint. */
  action?: PluginReactNode
}

/** Props for `PluginComponents.WorkspaceSplitView`; Workspace two/three-column layout control: a plain left sidebar, a center main content area, and an optional right detail panel. Renders children directly when there is content; otherwise renders a centered emptyState. */
export type PluginWorkspaceSplitViewProps = {
  /** Left column content; the column body scrolls as a whole, use sticky for fixed headers. */
  sidebar: PluginReactNode
  /** Main content; renders the emptyState hint when absent. */
  children?: PluginReactNode
  /** Fixed top toolbar for the main content (search/filter/add controls), rendered above the main content. */
  mainToolbar?: PluginReactNode
  /** Optional right detail panel; shown when provided, collapses to no space when empty. */
  rightPanel?: PluginReactNode
  /** Hint state shown when the main content has no children. */
  emptyState?: PluginWorkspaceSplitViewEmptyState
  /** Accessible label for the sidebar landmark. */
  sidebarLabel?: string
  /** Accessible label for the right panel landmark. */
  rightPanelLabel?: string
  /** Sidebar width, defaults to 20rem. */
  sidebarWidth?: string
  /** Right panel width, defaults to 18rem. */
  rightPanelWidth?: string
  /** Extra class applied to the sidebar element. */
  sidebarClassName?: string
  /** Extra class applied to the main content element. */
  mainClassName?: string
  /** Extra class applied to the right panel element. */
  rightPanelClassName?: string
  /** Main content canvas grid background toggle (for editor views); off by default for directory/list pages. */
  canvas?: boolean
  /** Extra class applied to the outer wrapper. */
  className?: string
}

/** One selectable option in a CompactSelect, with optional description and disabled state. */
export type PluginCompactSelectOption<TValue extends string | number> = {
  /** Option value handed to `onChange`. */
  value: TValue
  /** Visible option label. */
  label: string
  /** Secondary line under the label. */
  description?: string
  /** Renders the option non-interactive. */
  disabled?: boolean
}

/** Props for `PluginComponents.CompactSelect`; Compact app-styled select for small toolbars and footers. It owns popover positioning and basic keyboard/open-state behavior without leaking platform-specific UI. */
export type PluginCompactSelectProps<TValue extends string | number> = {
  /** Currently selected value. */
  value: TValue
  /** Options to display. */
  options: readonly PluginCompactSelectOption<TValue>[]
  /** Called with the value of the picked option. */
  onChange: (value: TValue) => void
  /** Accessible label for the trigger. */
  ariaLabel: string
  /** Shown on the trigger when the value matches no option; without it the first option is displayed instead. */
  placeholder?: string
  /** Extra class on the root wrapper. */
  className?: string
  /** Extra class on the trigger button. */
  triggerClassName?: string
  /** Extra class on the popover menu. */
  menuClassName?: string
  /** Renders the trigger non-interactive. */
  disabled?: boolean
  /** Popover placement relative to the trigger. */
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
}

/** Props for `PluginComponents.Disclosure`; Collapsible section for progressive disclosure: advanced options stay one click away without crowding the default form. Local open state only; the parent owns the form values inside. */
export type PluginDisclosureProps = {
  /** Toggle row heading text. */
  title: string
  /** Optional secondary text on the toggle row. */
  subtitle?: string
  /** Starts open; the host owns the local open state. */
  defaultOpen?: boolean
  /** Extra class applied to the outer wrapper. */
  className?: string
  /** Extra class applied to the body region. */
  bodyClassName?: string
  /** Section body content, rendered only while the section is open. */
  children: PluginReactNode
}

/** Props for `PluginComponents.ProgressRing`; Circular progress indicator with an accessible progressbar role and optional center content. */
export type PluginProgressRingProps = {
  /** Progress percentage, clamped to 0–100. */
  progress: number
  /** Accessible label for the progressbar role. */
  label: string
  /** Ring diameter in pixels, defaults to 32. */
  size?: number
  /** Ring stroke width in pixels, defaults to 3. */
  strokeWidth?: number
  /** Extra class applied to the ring wrapper. */
  className?: string
  /** Indicator ring color, defaults to the accent token. */
  indicatorColor?: string
  /** Track ring color, defaults to a translucent accent tint. */
  trackColor?: string
  /** Optional center content rendered inside the ring. */
  children?: PluginReactNode
}

/** Props for `PluginComponents.ImageSkeleton`; Image placeholder skeleton that respects a target aspect ratio while the real image loads. */
export type PluginImageSkeletonProps = {
  /** Extra class applied to the skeleton element. */
  className?: string
  /** Inline styles forwarded to the skeleton element. */
  style?: Record<string, unknown>
  /** Target aspect ratio (e.g. `16 / 9`); the element is auto-sized when omitted. */
  aspectRatio?: string
  /** Rounded corners, on by default. */
  rounded?: boolean
  /** Overlay variant for images rendered on top of content. */
  overlay?: boolean
}

/** Props for `PluginComponents.ItemGroupPopover`; Hover/focus popover that renders a group of items as a responsive grid with floating-ui positioning. */
export type PluginItemGroupPopoverProps<T> = {
  /** Trigger icon; can also be a function receiving the current open state. */
  groupIcon: PluginReactNode | ((isOpen: boolean) => PluginReactNode)
  /** Items rendered in the popover grid. */
  items: T[]
  /** Renders one item cell; receives the item and its grid index. */
  renderItem: (item: T, index: number) => PluginReactNode
  /** Optional heading above the grid. */
  title?: string
  /** Optional supporting text under the heading. */
  subtitle?: string
}

/** A rectangle in source-image pixels. */
export type PluginSheetRegion = {
  /** Left edge in source pixels. */
  x: number
  /** Top edge in source pixels. */
  y: number
  /** Region width in source pixels. */
  width: number
  /** Region height in source pixels. */
  height: number
}

/** Props for `PluginComponents.SheetRegionPicker`; Rubber-band region selection over a sprite sheet. The stage scales the image to the container width and maps pointer coordinates back to source pixels; the selection renders as a percentage overlay so no resize bookkeeping is needed. Coordinates still arrive in source pixels, ready for `FromArea` / `ToArea` / `SpriteIndex` semantics. */
export type PluginSheetRegionPickerProps = {
  /** Image URL rendered as the selectable stage. */
  imageUrl: string
  /** Image width in source pixels. */
  imageWidth: number
  /** Image height in source pixels. */
  imageHeight: number
  /** Current selection in source pixels, or null. */
  value: PluginSheetRegion | null
  /** Called with the new selection on drag end or, in cellPick mode, on click. */
  onChange: (region: PluginSheetRegion) => void
  /** Snap grid size in source pixels (e.g. 16 for tiles); freehand when omitted. */
  snap?: number
  /** Click-to-pick single cells instead of dragging rectangles. */
  cellPick?: boolean
  /** Extra class applied to the picker stage. */
  className?: string
}

/** Props for `PluginComponents.Tooltip`; Small app-styled tooltip for replacing native browser title popups on selected UI. It owns hover/focus positioning only and does not mutate child behavior. */
export type PluginTooltipProps = {
  /** Tooltip content rendered in the floating popup. */
  label: PluginReactNode
  /** The wrapped element the tooltip attaches to; its behavior is not modified. */
  children: PluginReactNode
  /** Disables the tooltip so hover/focus never opens it. */
  disabled?: boolean
  /** Extra class applied to the trigger wrapper span. */
  className?: string
  /** Popover placement relative to the trigger; defaults to top. */
  placement?: 'top' | 'right' | 'bottom' | 'left'
}

/** Design-system component subset exposed to plugins (token-styled). */
export interface PluginGeneratedComponents {
  /** Panel surface with an optional header (title, subtitle, header action) and a body region. */
  PanelFrame: ReactComponentType<PluginPanelFrameProps>
  /** Sub-section within a panel, with an optional header (title, subtitle, action) and variant styling. */
  PanelSection: ReactComponentType<PluginPanelSectionProps>
  /** Shared empty-results card for business-agnostic loading, empty, and unavailable states. */
  EmptyStateCard: ReactComponentType<PluginEmptyStateCardProps>
  /** Workspace two/three-column layout control: a plain left sidebar, a center main content area, and an optional right detail panel. Renders children directly when there is content; otherwise renders a centered emptyState. */
  WorkspaceSplitView: ReactComponentType<PluginWorkspaceSplitViewProps>
  /** Compact app-styled select for small toolbars and footers. It owns popover positioning and basic keyboard/open-state behavior without leaking platform-specific UI. */
  CompactSelect: <TValue extends string | number>(props: PluginCompactSelectProps<TValue>) => any
  /** Collapsible section for progressive disclosure: advanced options stay one click away without crowding the default form. Local open state only; the parent owns the form values inside. */
  Disclosure: ReactComponentType<PluginDisclosureProps>
  /** Circular progress indicator with an accessible progressbar role and optional center content. */
  ProgressRing: ReactComponentType<PluginProgressRingProps>
  /** Image placeholder skeleton that respects a target aspect ratio while the real image loads. */
  ImageSkeleton: ReactComponentType<PluginImageSkeletonProps>
  /** Hover/focus popover that renders a group of items as a responsive grid with floating-ui positioning. */
  ItemGroupPopover: <T>(props: PluginItemGroupPopoverProps<T>) => any
  /** Rubber-band region selection over a sprite sheet. The stage scales the image to the container width and maps pointer coordinates back to source pixels; the selection renders as a percentage overlay so no resize bookkeeping is needed. Coordinates still arrive in source pixels, ready for `FromArea` / `ToArea` / `SpriteIndex` semantics. */
  SheetRegionPicker: ReactComponentType<PluginSheetRegionPickerProps>
  /** Small app-styled tooltip for replacing native browser title popups on selected UI. It owns hover/focus positioning only and does not mutate child behavior. */
  Tooltip: ReactComponentType<PluginTooltipProps>
}
