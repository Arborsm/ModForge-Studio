import { Redo2, Undo2 } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'
import { useDraftUndoState } from '../model/useDraftUndoShortcuts'

/**
 * Undo / redo controls for the shared draft history.
 *
 * Every authoring page already answers Ctrl+Z; these buttons are the visible
 * half of the same history, so a page's toolbar renders them beside its save
 * controls instead of inventing its own. Availability comes from the shared
 * stack rather than from the host, which is why only the two handlers are
 * passed in.
 *
 * `compact` swaps in the script console's smaller icon button, so the event
 * editor's dense header keeps its own rhythm.
 */
export function DraftUndoButtons({ onUndo, onRedo, compact = false }: { onUndo: () => void; onRedo: () => void; compact?: boolean }) {
  const toolbar = useEditorCopy().studioDesk.toolbar
  const { canUndo, canRedo } = useDraftUndoState()
  const buttonClass = compact ? 'icon-btn' : 'icon-button h-8 w-8'
  const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <>
      <button type="button" className={buttonClass} onClick={onUndo} disabled={!canUndo} title={toolbar.undo} aria-label={toolbar.undo}>
        <Undo2 className={cx(iconClass, !canUndo && 'opacity-35')} />
      </button>
      <button type="button" className={buttonClass} onClick={onRedo} disabled={!canRedo} title={toolbar.redo} aria-label={toolbar.redo}>
        <Redo2 className={cx(iconClass, !canRedo && 'opacity-35')} />
      </button>
    </>
  )
}
