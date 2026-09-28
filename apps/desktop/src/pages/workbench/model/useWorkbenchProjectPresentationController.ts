import { useState } from 'react'
import type { WorkbenchLocation } from '@shared/contracts'
import type { CpMakerDraft, UseCpMakerReturn } from '@features/cp-maker'
import { getPackTemplate, type CreateDraftInput } from '@features/cp-maker'
import type { useWorkbenchProjectController } from './useWorkbenchProjectController'
import type { WorkbenchOpenModuleOptions } from './useWorkbenchNavigationController'

type Options = {
  cpMaker: UseCpMakerReturn
  projectController: ReturnType<typeof useWorkbenchProjectController>
  gameRootPath: string | null
  importLabel: string
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

  const openProjectDashboard = () => {
    navigateToPatch(null)
    // The successful project operation updates React state in the same async turn.
    // Allow the guarded navigation to commit before that state is rendered.
    openModule('project-dashboard', {
      hasActiveProject: true,
      resetHistoryTo: { kind: 'home' },
    })
  }

  const createDraft = (input: CreateDraftInput) => {
    const template = getPackTemplate(input.templateId)
    void projectController.createDraft({ ...input.metadata, gameRootPath }, async () => {
      // Seed the template's singleton patches; addPatch is idempotent, and a
      // fresh draft has no patches yet, so this simply materializes them.
      for (const seed of template.seedPatches) {
        cpMaker.addPatch(seed.workspace, seed.target, seed.action)
      }
      if (template.seedPatches.length > 0) {
        await cpMaker.saveDraft()
      }
      if (template.landingModule === null) {
        openProjectDashboard()
        return
      }
      navigateToPatch(null)
      openModule(template.landingModule, {
        hasActiveProject: true,
        resetHistoryTo: { kind: 'home' },
      })
    })
    setCreateDialogOpen(false)
  }

  const importFromPath = async (sourcePath: string) => {
    await projectController.importPack(sourcePath, async () => {
      openProjectDashboard()
    })
  }

  const importDraft = async () => {
    const sourcePath = await cpMaker.chooseDirectory(importLabel)
    if (sourcePath) await importFromPath(sourcePath)
  }

  const selectDraft = (draftStorageKey: string) => {
    void projectController.selectDraft(draftStorageKey, async () => {
      openProjectDashboard()
    })
  }

  const closeDraft = () => {
    void projectController.closeDraft(async () => {
      resetAuthoringNavigation()
      applyLocation({ kind: 'home' })
      resetHistory({ kind: 'home' })
    })
  }

  const updateMetadata = (metadata: Partial<CpMakerDraft['projectMetadata']>) => {
    cpMaker.updateMetadata(metadata)
    setPropertiesDialogOpen(false)
  }

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
