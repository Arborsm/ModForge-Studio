import { createElement, type ComponentType } from 'react'
import type { AppEvent } from '@shared/contracts'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import type { WorkspaceId } from '@features/cp-maker'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import type { UseCpMakerReturn } from '@features/cp-maker'
import type { WorkspaceMode } from '@locales/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'

type WorkbenchViewHostProps = {
  editModeView: WorkbenchViewRegistration | null
  workspaceMode: WorkspaceMode
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  directoryInfo: GameDirectoryInfo | null
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  cpMaker: UseCpMakerReturn
  onWorkbenchEvent: (event: AppEvent) => void
  navigateToPatch: (patchId: string | null) => void
  onSetWorkspaceMode: (mode: WorkspaceId) => void
  onRunWithModUnsavedGuard: (action: () => void | Promise<void>) => Promise<boolean>
  onRunWithCpMakerUnsavedGuard: (action: () => void | Promise<void>) => Promise<boolean>
  onSetWorkspaceViewMode: (mode: 'edit' | 'preview') => void
  activeEditPatchId: string | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
}

export function WorkbenchViewHost({
  editModeView,
  workspaceMode,
  locale,
  theme,
  accentColor,
  directoryInfo,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  cpMaker,
  navigateToPatch,
  activeEditPatchId,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
}: WorkbenchViewHostProps) {
  const copy = useEditorCopy()

  return (
    <>
      {editModeView?.viewId === 'workspace-editor' ? (
        <LoadingMotionReveal itemId={`workbench-edit-workspace-editor:${workspaceMode}`} index={0} className="h-full min-h-0">
          {createElement(editModeView.component as ComponentType<Record<string, unknown>>, {
            workspaceMode,
            cpMaker,
            activeEditPatchId,
            onSelectPatch: navigateToPatch,
            locale,
            theme,
            accentColor,
            viewportLabels: copy.viewportLabels,
            directoryInfo,
            playerAppearanceProfile,
            onOpenPlayerAppearanceWindow,
            canGoBack,
            canGoForward,
            onGoBack,
            onGoForward,
          })}
        </LoadingMotionReveal>
      ) : editModeView ? (
        <LoadingMotionReveal itemId={`workbench-edit-registered:${editModeView.viewId}`} index={0} className="h-full min-h-0">
          {createElement(editModeView.component as ComponentType<Record<string, unknown>>, {
            locale,
            theme,
            accentColor,
            directoryInfo,
          })}
        </LoadingMotionReveal>
      ) : (
        <div className="empty-state-card-fill">
          <EmptyStateCard
            title={copy.messages.workbenchViewUnavailableTitle}
            detail={copy.messages.workbenchViewUnavailableDetail}
            density="compact"
          />
        </div>
      )}
    </>
  )
}
