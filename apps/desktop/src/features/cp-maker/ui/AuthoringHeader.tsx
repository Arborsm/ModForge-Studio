/**
 * Unified authoring header for all content workspaces. Replaces EditModeToolbar
 * and the standalone headers mail/dialogue/schedule pages each implemented.
 *
 * Header structure: workspace title / breadcrumb | undo-redo | save-state | expert toggle.
 * No save button (auto-save), no patch count (that's project-content only), no
 * patch settings (that's expert-panel only).
 */

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useAuthoringShellCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { DraftUndoButtons } from './DraftUndoButtons'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export type AuthoringHeaderProps = {
  /** Workspace title (e.g. "建筑工作区"). */
  workspaceTitle: string
  /** Current context breadcrumb, or null when none is active. */
  breadcrumb?: string | null
  /** Save state from the auto-save flow. */
  saveState: SaveState
  /** Navigation controls. */
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  /** Draft undo/redo. */
  onUndo: (() => void) | null
  onRedo: (() => void) | null
}

export function AuthoringHeader({
  workspaceTitle,
  breadcrumb = null,
  saveState,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onUndo,
  onRedo,
}: AuthoringHeaderProps) {
  const copy = useAuthoringShellCopy()
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const setExpertMode = useEditorModeStore((state) => state.setExpertMode)

  const saveLabel =
    saveState === 'saving' ? copy.saving : saveState === 'saved' ? copy.saved : saveState === 'error' ? copy.saveFailed : copy.unsaved

  return (
    <header className="authoring-header">
      <div className="authoring-header-nav">
        <button
          type="button"
          className="icon-button h-8 w-8"
          onClick={onGoBack}
          disabled={!canGoBack}
          title={copy.back}
          aria-label={copy.back}
        >
          <ArrowLeft className={cx('h-4 w-4', !canGoBack && 'opacity-35')} />
        </button>
        <button
          type="button"
          className="icon-button h-8 w-8"
          onClick={onGoForward}
          disabled={!canGoForward}
          title={copy.forward}
          aria-label={copy.forward}
        >
          <ArrowRight className={cx('h-4 w-4', !canGoForward && 'opacity-35')} />
        </button>
        {onUndo && onRedo ? <DraftUndoButtons onUndo={onUndo} onRedo={onRedo} /> : null}
      </div>

      <div className="authoring-header-context">
        <span className="authoring-header-title">{workspaceTitle}</span>
        {breadcrumb ? <span className="authoring-header-breadcrumb">{breadcrumb}</span> : null}
      </div>

      <div className="authoring-header-spacer" />

      <span
        className={cx('authoring-header-save-status', saveState === 'error' && 'is-error', saveState === 'saving' && 'is-working')}
        data-state={saveState}
      >
        {saveLabel}
      </span>

      <label className="authoring-header-expert-toggle" title={copy.expertModeHint}>
        <input type="checkbox" checked={expertMode} onChange={(event) => setExpertMode(event.target.checked)} />
        <span>{copy.expertMode}</span>
      </label>
    </header>
  )
}
