import type { AssetTool } from '../editors/core/useMapDocumentEditor'

/**
 * A single keyboard shortcut binding. `key` is the lower-case key name (without
 * modifiers); `ctrl`/`shift` describe the required modifier state. `action` is
 * the semantic action id the host hook dispatches. `description` is a stable
 * identifier used for locale lookup — it is NOT user-visible text itself.
 */
export type MapShortcutBinding = {
  key: string
  ctrl: boolean
  shift: boolean
  action: MapShortcutAction
  /** Locale copy key the host uses to resolve a human-readable description. */
  description: string
}

/**
 * Semantic actions the unified shortcut registry can dispatch. Tool actions
 * carry the tool id; the rest are discrete editor operations.
 */
export type MapShortcutAction =
  | { kind: 'save' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'toggleOverlay' }
  | { kind: 'toggleGrid' }
  | { kind: 'tool'; tool: AssetTool }

/**
 * Editor context flags that determine which shortcuts are available. The
 * browse context (CentralWorkspace) has no save/undo/redo/overlay; the asset
 * and session editors support the full set. `canToggleGrid` is set by the
 * browse context, where G toggles the grid instead of the cell-rule overlay.
 */
export type MapShortcutContext = {
  /** Whether save (Ctrl+S) is available. */
  canSave: boolean
  /** Whether undo/redo are available. */
  canUndoRedo: boolean
  /** Whether the cell-rule overlay toggle (G) is available. */
  canToggleOverlay: boolean
  /** Whether the grid toggle (G) is available (browse context). */
  canToggleGrid: boolean
  /** Whether tool-switching shortcuts (B/E/F/R/D/H/I) are available. */
  canSwitchTools: boolean
}

/**
 * The full shortcut table. Order matters only for documentation; matching is
 * exact (ctrl+shift+key). The host hook iterates this list and dispatches the
 * first binding whose modifiers and key match the event, gated by context.
 */
export const MAP_SHORTCUTS: readonly MapShortcutBinding[] = [
  { key: 's', ctrl: true, shift: false, action: { kind: 'save' }, description: 'shortcutSave' },
  { key: 'z', ctrl: true, shift: false, action: { kind: 'undo' }, description: 'shortcutUndo' },
  { key: 'z', ctrl: true, shift: true, action: { kind: 'redo' }, description: 'shortcutRedo' },
  { key: 'y', ctrl: true, shift: false, action: { kind: 'redo' }, description: 'shortcutRedo' },
  { key: 'g', ctrl: false, shift: false, action: { kind: 'toggleOverlay' }, description: 'shortcutToggleOverlay' },
  { key: 'g', ctrl: false, shift: false, action: { kind: 'toggleGrid' }, description: 'shortcutToggleGrid' },
  { key: 'b', ctrl: false, shift: false, action: { kind: 'tool', tool: 'brush' }, description: 'shortcutToolBrush' },
  { key: 'e', ctrl: false, shift: false, action: { kind: 'tool', tool: 'erase' }, description: 'shortcutToolErase' },
  { key: 'f', ctrl: false, shift: false, action: { kind: 'tool', tool: 'fill' }, description: 'shortcutToolFill' },
  { key: 'r', ctrl: false, shift: false, action: { kind: 'tool', tool: 'rectangle' }, description: 'shortcutToolRectangle' },
  { key: 'd', ctrl: false, shift: false, action: { kind: 'tool', tool: 'eyedropper' }, description: 'shortcutToolEyedropper' },
  { key: 'h', ctrl: false, shift: false, action: { kind: 'tool', tool: 'hand' }, description: 'shortcutToolHand' },
  { key: 'i', ctrl: false, shift: false, action: { kind: 'tool', tool: 'inspect' }, description: 'shortcutToolInspect' },
]

/**
 * Matches a keyboard event against the shortcut table, respecting the editor
 * context. Returns the action to dispatch, or null when no binding matches or
 * the context disables it.
 *
 * Tool shortcuts are suppressed when `overlayActive` is true — the overlay
 * owns canvas interaction until it is turned off.
 */
export function matchMapShortcut(
  event: { key: string; ctrlKey: boolean; shiftKey: boolean },
  context: MapShortcutContext,
  overlayActive: boolean,
): MapShortcutAction | null {
  const key = event.key.toLowerCase()
  for (const binding of MAP_SHORTCUTS) {
    if (binding.key !== key) continue
    if (binding.ctrl !== event.ctrlKey) continue
    if (binding.shift !== event.shiftKey) continue
    // A binding matches the key + modifiers; check the context gate. When the
    // context disables this binding, continue to the next binding — the same
    // key may have a second binding gated by a different flag (e.g. G is both
    // toggleOverlay in editors and toggleGrid in browse mode).
    switch (binding.action.kind) {
      case 'save':
        if (!context.canSave) continue
        return binding.action
      case 'undo':
        if (!context.canUndoRedo) continue
        return binding.action
      case 'redo':
        if (!context.canUndoRedo) continue
        return binding.action
      case 'toggleOverlay':
        if (!context.canToggleOverlay) continue
        return binding.action
      case 'toggleGrid':
        if (!context.canToggleGrid) continue
        return binding.action
      case 'tool':
        if (!context.canSwitchTools) continue
        if (overlayActive) continue
        return binding.action
    }
  }
  return null
}

/**
 * Returns true when the focused element is a text-input surface where
 * single-key shortcuts must not fire (would interfere with typing).
 */
export function isShortcutInputFocused(activeElement: Element | null): boolean {
  const tag = activeElement?.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}

/**
 * Resolves a `MapShortcutBinding.description` key to its localized text using
 * the `shortcuts` block of the map authoring copy. Returns the key unchanged
 * when no entry exists (defensive — the locale bundle is the source of truth
 * but callers should not crash on a missing key).
 */
export function resolveShortcutDescription(descriptionKey: string, shortcutsCopy: Record<string, string>): string | undefined {
  return shortcutsCopy[descriptionKey]
}

/**
 * Looks up the shortcut description for a given tool id, so toolbars can
 * append the keyboard hint to the tool tooltip.
 */
export function shortcutDescriptionForTool(tool: AssetTool, shortcutsCopy: Record<string, string>): string | undefined {
  const binding = MAP_SHORTCUTS.find((b) => b.action.kind === 'tool' && b.action.tool === tool)
  return binding ? resolveShortcutDescription(binding.description, shortcutsCopy) : undefined
}
