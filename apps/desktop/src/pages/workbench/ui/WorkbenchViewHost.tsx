import { createElement, type ComponentType } from 'react'
import type { AppEvent } from '@shared/contracts'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import type { DraftPatch, CpMakerDraft, WorkspaceId } from '@shared/contracts'
import type { GameDirectoryInfo } from '@shared/contracts'
import type { LocaleCode, ThemeMode, EditorCopy } from '@locales/editor-shell'
import type { StudioDeskModel, UseCpMakerReturn } from '@features/cp-maker'
import type { WorkspaceMode } from '@locales/editor-shell'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'

type WorkbenchViewHostProps = {
  editModeView: WorkbenchViewRegistration | null
  workspaceMode: WorkspaceMode
  copy: EditorCopy
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
  onSetWorkspaceViewMode: (mode: 'edit' | 'preview') => void
  studioDeskGalleryOpen: boolean
  onStudioDeskGalleryOpenChange: (open: boolean) => void
  activeEditPatchId: string | null
}

export function WorkbenchViewHost({
  editModeView,
  workspaceMode,
  copy,
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
  onSetWorkspaceViewMode,
  studioDeskGalleryOpen,
  onStudioDeskGalleryOpenChange,
  activeEditPatchId,
}: WorkbenchViewHostProps) {
  return (
    <>
      {editModeView?.viewId === 'studio-desk' ? (
        <LoadingMotionReveal itemId="workbench-edit-studio-desk" index={0} className="h-full min-h-0">
          {createElement(editModeView.component as ComponentType<Record<string, unknown>>, {
            model: studioDeskModel,
            copy,
            onCreateDraft: (
              metadata: Pick<
                CpMakerDraft['projectMetadata'],
                'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
              >,
            ) => {
              void cpMaker.createDraft({
                ...metadata,
                gameRootPath: directoryInfo?.rootPath ?? null,
              })
            },
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
              onWorkbenchEvent({
                type: 'workbench/view-selected',
                viewId: nextWorkspace === 'mods' ? 'studio-desk' : 'workspace-editor',
              })
              onSetWorkspaceMode(nextWorkspace)
              onSetWorkspaceViewMode('edit')
              navigateToPatch(null)
            },
            onOpenPatch: (patchId: string) => {
              const patch = cpMaker.activeDraft?.patches.find((candidate) => candidate.id === patchId)
              if (!patch) {
                return
              }
              onWorkbenchEvent({
                type: 'cp-maker/asset-selected',
                draftKey: cpMaker.activeDraft?.draftStorageKey ?? '',
                assetId: patchId,
                assetKind: patch.workspace === 'map' ? 'map' : patch.workspace === 'events' ? 'event' : 'data',
              })
              onSetWorkspaceMode(patch.workspace)
              onSetWorkspaceViewMode('edit')
              navigateToPatch(patchId)
            },
            onOpenDraft: (draftStorageKey: string) => {
              void cpMaker.loadDraft(draftStorageKey)
              onWorkbenchEvent({
                type: 'cp-maker/draft-selected',
                draftKey: draftStorageKey,
              })
              onSetWorkspaceMode('mods')
              onSetWorkspaceViewMode('edit')
              navigateToPatch(null)
            },
            onCopyDraft: (draftStorageKey: string) => {
              void cpMaker.copyDraft(draftStorageKey)
            },
            onDeleteDraft: (draftStorageKey: string) => {
              void cpMaker.deleteDraft(draftStorageKey)
            },
            onExportPack: async (outputPath: string) => {
              const result = await cpMaker.exportPack(outputPath)
              void result
            },
            isLoading: cpMaker.draftLoading,
            galleryOpen: studioDeskGalleryOpen,
            onGalleryOpenChange: onStudioDeskGalleryOpenChange,
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
            canGoBack,
            canGoForward,
            onGoBack,
            onGoForward,
          })}
        </LoadingMotionReveal>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-[var(--text-secondary)]">
          Workbench view is not registered.
        </div>
      )}
    </>
  )
}
