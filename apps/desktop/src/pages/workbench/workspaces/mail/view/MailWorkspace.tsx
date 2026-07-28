import { DraftUndoButtons } from '@features/cp-maker'
import { useMailEditorCopy } from '@locales/provider'
import { MailWorkspaceProvider, useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import { useMailWorkspace } from '../state/useMailWorkspace'
import { MailInfoSidebar } from './MailInfoSidebar'
import { MailLetterEditor } from './MailLetterEditor'
import { MailLetterRail } from './MailLetterRail'
import { MailPreviewPanel } from './MailPreviewPanel'

function MailWorkspaceHeader() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()
  const statusText =
    workspace.saveState === 'saving'
      ? copy.savingStatus
      : workspace.saveState === 'saved'
        ? copy.savedStatus
        : workspace.saveState === 'error'
          ? copy.saveErrorStatus
          : null

  return (
    <header className="mail-editor-header">
      <div className="mail-editor-heading">
        <div className="mail-editor-title">{copy.title}</div>
        <div className="mail-editor-subtitle">{copy.subtitle}</div>
      </div>
      <div className="mail-editor-header-actions">
        {workspace.isDirty ? <span className="mail-editor-dirty-badge">{copy.dirtyBadge}</span> : null}
        {statusText ? (
          <span className="mail-editor-save-status" data-state={workspace.saveState}>
            {statusText}
          </span>
        ) : null}
        <DraftUndoButtons onUndo={workspace.undo} onRedo={workspace.redo} />
        <button type="button" className="control-button" onClick={workspace.revert} disabled={!workspace.isDirty}>
          {copy.revertAction}
        </button>
        <button
          type="button"
          className="control-button control-button-primary"
          onClick={workspace.save}
          disabled={!workspace.isDirty || workspace.saveState === 'saving'}
        >
          {copy.saveAction}
        </button>
      </div>
    </header>
  )
}

function MailWorkspaceBody() {
  const copy = useMailEditorCopy()
  const workspace = useMailWorkspaceContext()

  if (!workspace.hasProject) {
    return (
      <div className="mail-editor-body">
        <div className="mail-editor-empty">
          <p className="mail-editor-empty-title">{copy.noProjectTitle}</p>
          <p className="mail-editor-empty-hint">{copy.noProjectHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mail-editor-body">
      <MailLetterRail />
      <MailLetterEditor />
      <aside className="mail-editor-side custom-scrollbar">
        <MailPreviewPanel />
        <MailInfoSidebar />
      </aside>
    </div>
  )
}

/** Root view for the mail authoring module: letter list, letter editor, preview, and info rail. */
export function MailWorkspace() {
  const workspace = useMailWorkspace()
  return (
    <MailWorkspaceProvider value={workspace}>
      <div className="mail-editor">
        <MailWorkspaceHeader />
        <MailWorkspaceBody />
      </div>
    </MailWorkspaceProvider>
  )
}
