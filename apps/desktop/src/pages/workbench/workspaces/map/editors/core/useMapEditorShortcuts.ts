import { useEffect, useRef } from 'react'
import type { AssetTool } from './useMapDocumentEditor'
import { isShortcutInputFocused, matchMapShortcut, type MapShortcutContext } from '../../model/mapShortcuts'

/**
 * Unified keyboard shortcut hook for the map asset editor, the patch-tiles
 * session editor, and the browse workspace (CentralWorkspace). The hook
 * installs a single `keydown` listener that dispatches to callback refs, so
 * callers can pass fresh closures on every render without re-binding the
 * listener.
 *
 * The shortcut table lives in `model/mapShortcuts.ts`; this hook is only the
 * React subscription layer. Omit callbacks for actions the host does not
 * support (e.g. CentralWorkspace omits `onSave`/`onUndo`/`onRedo`).
 *
 * All shortcuts are ignored while the focus is in an input/select/textarea.
 * Tool shortcuts are inert while the overlay is active (the paint rules own
 * the canvas until the overlay is turned off).
 */
export function useMapEditorShortcuts({
  onSave,
  onUndo,
  onRedo,
  onToggleOverlay,
  onToggleGrid,
  onToolChange,
  overlayActiveRef,
}: {
  onSave?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onToggleOverlay?: () => void
  onToggleGrid?: () => void
  onToolChange?: (tool: AssetTool) => void
  overlayActiveRef?: React.RefObject<boolean>
}) {
  const saveRef = useRef<() => void>(() => {})
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const toggleOverlayRef = useRef<() => void>(() => {})
  const toggleGridRef = useRef<() => void>(() => {})
  const toolChangeRef = useRef<(tool: AssetTool) => void>(() => {})
  saveRef.current = onSave ?? (() => {})
  undoRef.current = onUndo ?? (() => {})
  redoRef.current = onRedo ?? (() => {})
  toggleOverlayRef.current = onToggleOverlay ?? (() => {})
  toggleGridRef.current = onToggleGrid ?? (() => {})
  toolChangeRef.current = onToolChange ?? (() => {})

  // The listener only needs to be re-bound when callback *presence* changes
  // (undefined ↔ defined), not when callback identity changes on every render.
  // Callbacks are already dispatched through refs, so a stable presence
  // signature is the correct effect dependency.
  const presenceSignature = `${onSave ? 's' : ''}${onUndo ? 'u' : ''}${onRedo ? 'r' : ''}${onToggleOverlay ? 'o' : ''}${onToggleGrid ? 'd' : ''}${onToolChange ? 't' : ''}${overlayActiveRef ? 'v' : ''}`

  useEffect(() => {
    const context: MapShortcutContext = {
      canSave: onSave !== undefined,
      canUndoRedo: onUndo !== undefined && onRedo !== undefined,
      canToggleOverlay: onToggleOverlay !== undefined,
      canToggleGrid: onToggleGrid !== undefined,
      canSwitchTools: onToolChange !== undefined,
    }
    function onKeyDown(event: KeyboardEvent) {
      if (isShortcutInputFocused(globalThis.document.activeElement)) return
      const overlayActive = overlayActiveRef?.current ?? false
      const action = matchMapShortcut(event, context, overlayActive)
      if (!action) return
      event.preventDefault()
      switch (action.kind) {
        case 'save':
          saveRef.current()
          return
        case 'undo':
          undoRef.current()
          return
        case 'redo':
          redoRef.current()
          return
        case 'toggleOverlay':
          toggleOverlayRef.current()
          return
        case 'toggleGrid':
          toggleGridRef.current()
          return
        case 'tool':
          toolChangeRef.current(action.tool)
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // Re-bind only when callback presence changes; values are read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceSignature])
}
