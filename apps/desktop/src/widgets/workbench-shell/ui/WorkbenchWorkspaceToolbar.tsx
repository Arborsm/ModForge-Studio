import { Lock } from 'lucide-react'
import { getWorkspaceModeLabel, type WorkspaceMode } from '@locales/api'
import { useEditorCopy, useLocale } from '@locales/provider'

export type WorkbenchWorkspaceToolbarProps = {
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  registeredWorkbenchViewId: string | null
  registeredWorkbenchViewTitle?: string | null
  hasActiveProject: boolean
  onWorkspaceViewModeChange: (mode: 'edit' | 'preview') => void
}

/**
 * Workspace top chrome: module title + browse/edit segmented control.
 * Edit without a project is marked locked; the parent renders the gate.
 */
export default function WorkbenchWorkspaceToolbar({
  workspaceMode,
  workspaceViewMode,
  registeredWorkbenchViewId,
  registeredWorkbenchViewTitle,
  hasActiveProject,
  onWorkspaceViewModeChange,
}: WorkbenchWorkspaceToolbarProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const editLocked = workspaceViewMode === 'edit' && !hasActiveProject

  const title = registeredWorkbenchViewId
    ? (registeredWorkbenchViewTitle ?? registeredWorkbenchViewId)
    : getWorkspaceModeLabel(locale, copy, workspaceMode)

  const supportsModeSwitch = !registeredWorkbenchViewId
  const modeLabel = workspaceViewMode === 'preview' ? navCopy.shellBrowseMode : navCopy.shellEditMode

  return (
    <div className="workbench-ws-toolbar" data-edit-locked={editLocked ? 'true' : 'false'}>
      <span className="workbench-ws-toolbar-title">{title}</span>
      {supportsModeSwitch ? <span className="workbench-ws-toolbar-sub">{modeLabel}</span> : null}
      {supportsModeSwitch ? (
        <div className="workbench-ws-mode-seg" role="group" aria-label={`${navCopy.shellBrowseMode} / ${navCopy.shellEditMode}`}>
          <button type="button" aria-pressed={workspaceViewMode === 'preview'} onClick={() => onWorkspaceViewModeChange('preview')}>
            {navCopy.shellBrowseMode}
          </button>
          <button
            type="button"
            aria-pressed={workspaceViewMode === 'edit'}
            data-locked={!hasActiveProject ? 'true' : 'false'}
            onClick={() => onWorkspaceViewModeChange('edit')}
          >
            {navCopy.shellEditMode}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export type WorkbenchEditGateProps = {
  onSelectProject: () => void
  onStayBrowse: () => void
}

/** Inline gate shown when edit mode is active without a current project. */
export function WorkbenchEditGate({ onSelectProject, onStayBrowse }: WorkbenchEditGateProps) {
  const copy = useEditorCopy()
  const navCopy = copy.workbenchNavigation

  return (
    <div className="workbench-edit-gate" role="status" aria-live="polite">
      <Lock className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <strong>{navCopy.shellEditLockedTitle}</strong>
        <div className="workbench-edit-gate-actions">
          <button type="button" className="control-button control-button-primary" onClick={onSelectProject}>
            {navCopy.shellEditLockedSelectProject}
          </button>
          <button type="button" className="control-button control-button-ghost" onClick={onStayBrowse}>
            {navCopy.shellEditLockedStayBrowse}
          </button>
        </div>
      </div>
    </div>
  )
}
