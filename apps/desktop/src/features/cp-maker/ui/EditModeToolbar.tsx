import { ArrowLeft, ArrowRight, Eye, Plus, RefreshCw, Save, Settings } from 'lucide-react'
import type { DraftPatch } from '@features/cp-maker'
import type { WorkspaceId } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'
import { PatchQuickMenu } from './PatchQuickMenu'
import { PatchActionIcon } from './PatchActionIcon'
import { getPatchActionColor } from '../model/patchActionColor'

type EditModeToolbarProps = {
  workspaceId: WorkspaceId
  patches: DraftPatch[]
  activePatchId: string | null
  activePatch: DraftPatch | null
  contextTitle?: string | null
  contextSubtitle?: string | null
  isDirty: boolean
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  onSelectPatch: (patchId: string | null) => void
  onAddPatch: () => void
  onOpenConfig: () => void
  onSaveDraft: () => void
  onReloadDraft?: () => void
}

export function EditModeToolbar({
  workspaceId,
  patches,
  activePatchId,
  activePatch,
  contextTitle,
  contextSubtitle,
  isDirty,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onSelectPatch,
  onAddPatch,
  onOpenConfig,
  onSaveDraft,
  onReloadDraft,
}: EditModeToolbarProps) {
  const copy = useEditorCopy()
  const toolbar = copy.studioDesk.toolbar
  const workspaceLabel = workspaceId === 'mods' ? toolbar.project : copy.nav[workspaceId]

  return (
    <header className="edit-mode-toolbar">
      <div className="edit-mode-toolbar-nav">
        <button
          type="button"
          className="icon-button h-8 w-8"
          onClick={onGoBack}
          disabled={!canGoBack}
          title={toolbar.back}
          aria-label={toolbar.back}
        >
          <ArrowLeft className={cx('h-4 w-4', !canGoBack && 'opacity-35')} />
        </button>
        <button
          type="button"
          className="icon-button h-8 w-8"
          onClick={onGoForward}
          disabled={!canGoForward}
          title={toolbar.forward}
          aria-label={toolbar.forward}
        >
          <ArrowRight className={cx('h-4 w-4', !canGoForward && 'opacity-35')} />
        </button>
      </div>

      <PatchQuickMenu patches={patches} activePatchId={activePatchId} onSelectPatch={onSelectPatch} />

      <div className="edit-mode-toolbar-context">
        {activePatch ? (
          <>
            <span className={cx('edit-mode-toolbar-context-icon', getPatchActionColor(activePatch.action))}>
              <PatchActionIcon action={activePatch.action} />
            </span>
            <span className="edit-mode-toolbar-title">{contextTitle || activePatch.logName || activePatch.target}</span>
            {contextSubtitle ? <span className="edit-mode-toolbar-subtitle">{contextSubtitle}</span> : null}
          </>
        ) : (
          <>
            <Eye className="h-4 w-4 text-(--accent)" />
            <span className="edit-mode-toolbar-title">{workspaceLabel}</span>
            <span className="edit-mode-toolbar-subtitle">{toolbar.patchCount(patches.length)}</span>
          </>
        )}
      </div>

      <div className="edit-mode-toolbar-spacer" />

      <span className={cx('status-pill', isDirty ? 'status-pill-working' : 'status-pill-ready')}>
        {isDirty ? toolbar.unsaved : toolbar.saved}
      </span>

      <button type="button" className="control-button" onClick={onAddPatch}>
        <Plus className="h-4 w-4" />
        <span>{toolbar.add}</span>
      </button>
      <button type="button" className="control-button" onClick={onOpenConfig}>
        <Settings className="h-4 w-4" />
        <span>{toolbar.config}</span>
      </button>
      {onReloadDraft ? (
        <button type="button" className="control-button" onClick={onReloadDraft}>
          <RefreshCw className="h-4 w-4" />
          <span>{toolbar.reload}</span>
        </button>
      ) : null}
      <button type="button" className="control-button control-button-primary" onClick={onSaveDraft} disabled={!isDirty}>
        <Save className="h-4 w-4" />
        <span>{isDirty ? toolbar.saveDirty : toolbar.save}</span>
      </button>
    </header>
  )
}
