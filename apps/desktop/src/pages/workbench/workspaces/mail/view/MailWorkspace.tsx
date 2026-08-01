import { useMailEditorCopy } from '@locales/provider'
import { MailWorkspaceProvider, useMailWorkspaceContext } from '../state/MailWorkspaceContext'
import { useMailWorkspace } from '../state/useMailWorkspace'
import { MailLetterEditor } from './MailLetterEditor'
import { MailLetterRail } from './MailLetterRail'
import { MailPreviewPanel } from './MailPreviewPanel'

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

  if (workspace.activeMailId === null || workspace.activeDraft === null) {
    return <MailLetterRail />
  }

  return (
    <div className="mail-editor-focused-layout">
      <MailLetterEditor />
      <aside className="mail-editor-side custom-scrollbar">
        <MailPreviewPanel />
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
        <MailWorkspaceBody />
      </div>
    </MailWorkspaceProvider>
  )
}
