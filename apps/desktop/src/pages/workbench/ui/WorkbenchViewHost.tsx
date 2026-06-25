import { createElement, type ComponentType } from 'react'
import type { AppEvent } from '@shared/contracts'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import type { DraftPatch, WorkspaceId } from '@features/cp-maker'
import type { GameDirectoryInfo } from '@entities/game/api'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskModel, UseCpMakerReturn } from '@features/cp-maker'
import type { WorkspaceMode } from '@locales/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'

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
  studioDeskModel: StudioDeskModel
  onWorkbenchEvent: (event: AppEvent) => void
  navigateToPatch: (patchId: string | null) => void
  onSetWorkspaceMode: (mode: WorkspaceId) => void
  onRunWithModUnsavedGuard: (action: () => void | Promise<void>) => Promise<boolean>
  onRunWithCpMakerUnsavedGuard: (action: () => void | Promise<void>) => Promise<boolean>
  onSetWorkspaceViewMode: (mode: 'edit' | 'preview') => void
  onStudioDeskCreateDraftRequest: () => void
  onStudioDeskExportPackRequest: () => void
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
  studioDeskModel,
  onWorkbenchEvent,
  navigateToPatch,
  onSetWorkspaceMode,
  onRunWithModUnsavedGuard,
  onSetWorkspaceViewMode,
  onStudioDeskCreateDraftRequest,
  onStudioDeskExportPackRequest,
  activeEditPatchId,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
}: WorkbenchViewHostProps) {
  const copy = useEditorCopy()

  return (
    <>
      {editModeView?.viewId === 'studio-desk' ? (
        <LoadingMotionReveal itemId="workbench-edit-studio-desk" index={0} className="h-full min-h-0">
          {createElement(editModeView.component as ComponentType<Record<string, unknown>>, {
            model: studioDeskModel,
            onCreateDraftRequest: onStudioDeskCreateDraftRequest,
            onCreatePatch: (action: DraftPatch['action'], nextWorkspace: WorkspaceId) => {
              if (!cpMaker.activeDraft) {
                return
              }
              const id = cpMaker.addPatch(nextWorkspace, '', action)
              onWorkbenchEvent({
                type: 'cp-maker/asset-selected',
                draftKey: cpMaker.activeDraft.draftStorageKey,
                assetId: id,
                assetKind: nextWorkspace === 'map' ? 'map' : nextWorkspace === 'events' ? 'event' : 'data',
              })
              navigateToPatch(id)
            },
            onOpenWorkspace: (nextWorkspace: WorkspaceId) => {
              void onRunWithModUnsavedGuard(() => {
                onWorkbenchEvent({
                  type: 'workbench/view-selected',
                  viewId: nextWorkspace === 'mods' ? 'studio-desk' : 'workspace-editor',
                })
                onSetWorkspaceMode(nextWorkspace)
                onSetWorkspaceViewMode('edit')
                navigateToPatch(null)
              })
            },
            onOpenPatch: (patchId: string) => {
              const patch = cpMaker.activeDraft?.patches.find((candidate) => candidate.id === patchId)
              if (!patch) {
                return
              }
              void onRunWithModUnsavedGuard(() => {
                onWorkbenchEvent({
                  type: 'cp-maker/asset-selected',
                  draftKey: cpMaker.activeDraft?.draftStorageKey ?? '',
                  assetId: patchId,
                  assetKind: patch.workspace === 'map' ? 'map' : patch.workspace === 'events' ? 'event' : 'data',
                })
                onSetWorkspaceMode(patch.workspace)
                onSetWorkspaceViewMode('edit')
                navigateToPatch(patchId)
              })
            },
            onExportPackRequest: onStudioDeskExportPackRequest,
            isLoading: cpMaker.draftLoading,
          })}
        </LoadingMotionReveal>
      ) : editModeView?.viewId === 'workspace-editor' ? (
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
        <div className="flex h-full items-center justify-center text-xs text-(--text-secondary)">Workbench view is not registered.</div>
      )}
    </>
  )
}
