import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppEvent, WorkbenchLocation } from '@shared/contracts'
import type { CpMakerDraft, UseCpMakerReturn } from '@features/cp-maker'
import type { useWorkbenchProjectController } from './useWorkbenchProjectController'
import type { WorkbenchOpenModuleOptions } from './useWorkbenchNavigationController'

type CreateDraftMetadata = Pick<
  CpMakerDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

type Options = {
  cpMaker: UseCpMakerReturn
  projectController: ReturnType<typeof useWorkbenchProjectController>
  gameRootPath: string | null
  importLabel: string
  onWorkbenchEvent: (event: AppEvent) => void
  openHome: () => void
  openModule: (moduleId: string, options?: WorkbenchOpenModuleOptions) => void
  applyLocation: (location: WorkbenchLocation) => void
  resetHistory: (location: WorkbenchLocation) => void
  resetAuthoringNavigation: () => void
  navigateToPatch: (patchId: string | null) => void
}

/** Owns managed-project commands and their Workbench presentation state. */
export function useWorkbenchProjectPresentationController({
  cpMaker,
  projectController,
  gameRootPath,
  importLabel,
  onWorkbenchEvent,
  openHome,
  openModule,
  applyLocation,
  resetHistory,
  resetAuthoringNavigation,
  navigateToPatch,
}: Options) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [propertiesDialogOpen, setPropertiesDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const selectedDraftKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const draftKey = cpMaker.activeDraft?.draftStorageKey ?? null
    if (!draftKey) {
      selectedDraftKeyRef.current = null
      return
    }
    if (selectedDraftKeyRef.current === draftKey) return
    selectedDraftKeyRef.current = draftKey
    onWorkbenchEvent({ type: 'cp-maker/draft-selected', draftKey })
  }, [cpMaker.activeDraft?.draftStorageKey, onWorkbenchEvent])

  const openProjectDashboard = useCallback(() => {
    navigateToPatch(null)
    // The successful project operation updates React state in the same async turn.
    // Allow the guarded navigation to commit before that state is rendered.
    openModule('project-dashboard', { hasActiveProject: true, resetHistoryTo: { kind: 'home' } })
  }, [navigateToPatch, openModule])

  const createDraft = useCallback(
    (metadata: CreateDraftMetadata) => {
      void projectController.createDraft({ ...metadata, gameRootPath }, openProjectDashboard)
      setCreateDialogOpen(false)
    },
    [gameRootPath, openProjectDashboard, projectController],
  )

  const importFromPath = useCallback(
    async (sourcePath: string) => {
      await projectController.importPack(sourcePath, async () => {
        openProjectDashboard()
      })
    },
    [openProjectDashboard, projectController],
  )

  const importDraft = useCallback(async () => {
    const sourcePath = await cpMaker.chooseDirectory(importLabel)
    if (sourcePath) await importFromPath(sourcePath)
  }, [cpMaker, importFromPath, importLabel])

  const selectDraft = useCallback(
    (draftStorageKey: string) => {
      void projectController.selectDraft(draftStorageKey, async () => {
        openProjectDashboard()
      })
    },
    [openProjectDashboard, projectController],
  )

  const closeDraft = useCallback(() => {
    void projectController.closeDraft(async () => {
      resetAuthoringNavigation()
      applyLocation({ kind: 'home' })
      resetHistory({ kind: 'home' })
    })
  }, [applyLocation, projectController, resetAuthoringNavigation, resetHistory])

  const updateMetadata = useCallback(
    (metadata: Partial<CpMakerDraft['projectMetadata']>) => {
      cpMaker.updateMetadata(metadata)
      setPropertiesDialogOpen(false)
    },
    [cpMaker],
  )

  return {
    createDialogOpen,
    propertiesDialogOpen,
    exportDialogOpen,
    openProjectLibrary: openHome,
    openCreateDialog: () => setCreateDialogOpen(true),
    closeCreateDialog: () => setCreateDialogOpen(false),
    openPropertiesDialog: () => setPropertiesDialogOpen(true),
    closePropertiesDialog: () => setPropertiesDialogOpen(false),
    openExportDialog: () => setExportDialogOpen(true),
    closeExportDialog: () => setExportDialogOpen(false),
    createDraft,
    importFromPath,
    importDraft,
    selectDraft,
    closeDraft,
    deleteDraft: (draftStorageKey: string) => void projectController.deleteDraft(draftStorageKey),
    updateMetadata,
    exportPack: async (outputPath: string) => {
      await cpMaker.exportPack(outputPath)
    },
  }
}
