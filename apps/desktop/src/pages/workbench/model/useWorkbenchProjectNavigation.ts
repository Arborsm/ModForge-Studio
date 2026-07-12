import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { WorkspaceMode } from '@locales/api'
import type { AppEvent, WorkbenchViewRegistration } from '@shared/contracts'
import type { CpMakerDraft, UseCpMakerReturn } from '@features/cp-maker'
import type { LaunchpadRecentPage } from './useWorkbenchLaunchpadRecentPages'
import { decodeWorkbenchNavigation, encodeWorkbenchNavigation } from './useWorkbenchNavigation'
import type { WorkbenchShellLocation } from './useWorkbenchShellHistory'

export type MakerWorkspaceMode = Extract<WorkspaceMode, 'map' | 'events' | 'items'>

type CreateDraftMetadata = Pick<
  CpMakerDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

type UnsavedGuardRunner = (action: () => void | Promise<void>) => Promise<boolean>

type UseWorkbenchProjectNavigationOptions = {
  cpMaker: UseCpMakerReturn
  directoryRootPath: string | null
  importDraftLabel: string
  makerPending: MakerWorkspaceMode | null
  setMakerPending: Dispatch<SetStateAction<MakerWorkspaceMode | null>>
  workbenchRoute: 'home' | 'workspace'
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  registeredWorkbenchViewId: string | null
  setWorkbenchRoute: (route: 'home' | 'workspace') => void
  setWorkbenchRouteToWorkspace: () => void
  setWorkspaceMode: (mode: WorkspaceMode) => void
  setWorkspaceViewMode: (mode: 'edit' | 'preview') => void
  setRegisteredWorkbenchViewId: (viewId: string | null) => void
  setProjectLibraryFocusKey: Dispatch<SetStateAction<number>>
  setCreateDraftDialogOpen: Dispatch<SetStateAction<boolean>>
  setProjectPropertiesDialogOpen: Dispatch<SetStateAction<boolean>>
  navigateToPatch: (patchId: string | null) => void
  resetNavigation: () => void
  pushShellLocation: (location: WorkbenchShellLocation) => void
  resetShellHistory: (location: WorkbenchShellLocation) => void
  rememberRecentPage: (page: LaunchpadRecentPage) => void
  runWithModUnsavedGuard: UnsavedGuardRunner
  runWithCpMakerUnsavedGuard: UnsavedGuardRunner
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null
}

export function createShellLocation(input: WorkbenchShellLocation): WorkbenchShellLocation {
  return encodeWorkbenchNavigation(decodeWorkbenchNavigation(input))
}

/** Owns project-library and registered-view navigation actions for the workbench shell. */
export function useWorkbenchProjectNavigation({
  cpMaker,
  directoryRootPath,
  importDraftLabel,
  makerPending,
  setMakerPending,
  workbenchRoute,
  workspaceMode,
  workspaceViewMode,
  registeredWorkbenchViewId,
  setWorkbenchRoute,
  setWorkbenchRouteToWorkspace,
  setWorkspaceMode,
  setWorkspaceViewMode,
  setRegisteredWorkbenchViewId,
  setProjectLibraryFocusKey,
  setCreateDraftDialogOpen,
  setProjectPropertiesDialogOpen,
  navigateToPatch,
  resetNavigation,
  pushShellLocation,
  resetShellHistory,
  rememberRecentPage,
  runWithModUnsavedGuard,
  runWithCpMakerUnsavedGuard,
  onWorkbenchEvent,
  getWorkbenchViewRegistration,
}: UseWorkbenchProjectNavigationOptions) {
  const handleOpenRootWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      void runWithModUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceViewMode('preview')
        setWorkspaceMode(mode)
        rememberRecentPage({ kind: 'root', mode })
        setWorkbenchRouteToWorkspace()
        pushShellLocation(
          createShellLocation({
            workbenchRoute: 'workspace',
            workspaceMode: mode,
            workspaceViewMode: 'preview',
            registeredWorkbenchViewId: null,
          }),
        )
      })
    },
    [
      pushShellLocation,
      rememberRecentPage,
      runWithModUnsavedGuard,
      setRegisteredWorkbenchViewId,
      setWorkbenchRouteToWorkspace,
      setWorkspaceMode,
      setWorkspaceViewMode,
    ],
  )

  const handleOpenProjectWorkspace = useCallback(
    (mode: MakerWorkspaceMode) => {
      void runWithModUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceViewMode('edit')
        setWorkspaceMode(mode)
        resetNavigation()
        rememberRecentPage({ kind: 'project', mode })
        setWorkbenchRouteToWorkspace()
        pushShellLocation(
          createShellLocation({
            workbenchRoute: 'workspace',
            workspaceMode: mode,
            workspaceViewMode: 'edit',
            registeredWorkbenchViewId: null,
          }),
        )
      })
    },
    [
      pushShellLocation,
      rememberRecentPage,
      resetNavigation,
      runWithModUnsavedGuard,
      setRegisteredWorkbenchViewId,
      setWorkbenchRouteToWorkspace,
      setWorkspaceMode,
      setWorkspaceViewMode,
    ],
  )

  const handleOpenHome = useCallback(() => {
    setWorkbenchRoute('home')
    setProjectLibraryFocusKey((key) => key + 1)
    pushShellLocation(createShellLocation({ workbenchRoute: 'home', workspaceMode, workspaceViewMode, registeredWorkbenchViewId }))
  }, [pushShellLocation, registeredWorkbenchViewId, setProjectLibraryFocusKey, setWorkbenchRoute, workspaceMode, workspaceViewMode])

  const handleOpenProjectCreate = useCallback(() => setCreateDraftDialogOpen(true), [setCreateDraftDialogOpen])

  const handleCreateDraft = useCallback(
    (metadata: CreateDraftMetadata) => {
      void runWithCpMakerUnsavedGuard(() => {
        void cpMaker.createDraft({ ...metadata, gameRootPath: directoryRootPath })
      })
      setCreateDraftDialogOpen(false)
    },
    [cpMaker, directoryRootPath, runWithCpMakerUnsavedGuard, setCreateDraftDialogOpen],
  )

  const handleImportDraft = useCallback(async () => {
    await runWithModUnsavedGuard(async () => {
      await runWithCpMakerUnsavedGuard(async () => {
        const selectedPath = await cpMaker.chooseDirectory(importDraftLabel)
        if (!selectedPath) return
        const draft = await cpMaker.importPack(selectedPath)
        onWorkbenchEvent({ type: 'cp-maker/draft-selected', draftKey: draft.draftStorageKey })
        setRegisteredWorkbenchViewId(null)
        navigateToPatch(null)
        setWorkbenchRoute('home')
        resetShellHistory(
          createShellLocation({ workbenchRoute: 'home', workspaceMode, workspaceViewMode, registeredWorkbenchViewId: null }),
        )
      })
    })
  }, [
    cpMaker,
    importDraftLabel,
    navigateToPatch,
    onWorkbenchEvent,
    resetShellHistory,
    runWithCpMakerUnsavedGuard,
    runWithModUnsavedGuard,
    setRegisteredWorkbenchViewId,
    setWorkbenchRoute,
    workspaceMode,
    workspaceViewMode,
  ])

  const openLoadedDraftWorkspace = useCallback(
    (mode: MakerWorkspaceMode) => {
      setRegisteredWorkbenchViewId(null)
      setWorkspaceMode(mode)
      setWorkspaceViewMode('edit')
      navigateToPatch(null)
      resetNavigation()
      setWorkbenchRouteToWorkspace()
      rememberRecentPage({ kind: 'project', mode })
      resetShellHistory(
        createShellLocation({
          workbenchRoute: 'workspace',
          workspaceMode: mode,
          workspaceViewMode: 'edit',
          registeredWorkbenchViewId: null,
        }),
      )
    },
    [
      navigateToPatch,
      rememberRecentPage,
      resetNavigation,
      resetShellHistory,
      setRegisteredWorkbenchViewId,
      setWorkbenchRouteToWorkspace,
      setWorkspaceMode,
      setWorkspaceViewMode,
    ],
  )

  const handleSelectProjectFromHome = useCallback(
    (draftStorageKey: string, explicitMakerMode?: MakerWorkspaceMode | null) => {
      const pendingMode = explicitMakerMode ?? makerPending
      void runWithModUnsavedGuard(() => {
        void runWithCpMakerUnsavedGuard(async () => {
          await cpMaker.loadDraft(draftStorageKey)
          onWorkbenchEvent({ type: 'cp-maker/draft-selected', draftKey: draftStorageKey })
          if (pendingMode) {
            openLoadedDraftWorkspace(pendingMode)
          } else {
            resetNavigation()
            setWorkbenchRoute('home')
            resetShellHistory(createShellLocation({ workbenchRoute: 'home', workspaceMode, workspaceViewMode, registeredWorkbenchViewId }))
          }
          setMakerPending(null)
        })
      })
    },
    [
      cpMaker,
      makerPending,
      onWorkbenchEvent,
      openLoadedDraftWorkspace,
      registeredWorkbenchViewId,
      resetNavigation,
      resetShellHistory,
      runWithCpMakerUnsavedGuard,
      runWithModUnsavedGuard,
      setMakerPending,
      setWorkbenchRoute,
      workspaceMode,
      workspaceViewMode,
    ],
  )

  const handleCloseProject = useCallback(() => {
    void runWithModUnsavedGuard(() => {
      void runWithCpMakerUnsavedGuard(() => {
        cpMaker.clearActiveDraft()
        setRegisteredWorkbenchViewId(null)
        resetNavigation()
        setWorkbenchRoute('home')
        resetShellHistory(
          createShellLocation({ workbenchRoute: 'home', workspaceMode, workspaceViewMode, registeredWorkbenchViewId: null }),
        )
      })
    })
  }, [
    cpMaker,
    resetNavigation,
    resetShellHistory,
    runWithCpMakerUnsavedGuard,
    runWithModUnsavedGuard,
    setRegisteredWorkbenchViewId,
    setWorkbenchRoute,
    workspaceMode,
    workspaceViewMode,
  ])

  const handleCopyProject = useCallback((draftStorageKey: string) => void cpMaker.copyDraft(draftStorageKey), [cpMaker])
  const handleDeleteProject = useCallback((draftStorageKey: string) => void cpMaker.deleteDraft(draftStorageKey), [cpMaker])
  const handleUpdateDraftMetadata = useCallback(
    (metadata: Partial<CpMakerDraft['projectMetadata']>) => {
      cpMaker.updateMetadata(metadata)
      setProjectPropertiesDialogOpen(false)
    },
    [cpMaker, setProjectPropertiesDialogOpen],
  )
  const handleExportPack = useCallback(async (outputPath: string) => void (await cpMaker.exportPack(outputPath)), [cpMaker])

  const handleOpenDevView = useCallback(
    (viewId: string) => {
      void runWithModUnsavedGuard(() => {
        void runWithCpMakerUnsavedGuard(() => {
          setRegisteredWorkbenchViewId(viewId)
          setWorkspaceViewMode('edit')
          rememberRecentPage({ kind: 'dev', viewId })
          resetNavigation()
          setWorkbenchRouteToWorkspace()
          pushShellLocation(
            createShellLocation({
              workbenchRoute: 'workspace',
              workspaceMode,
              workspaceViewMode: 'edit',
              registeredWorkbenchViewId: viewId,
            }),
          )
        })
      })
    },
    [
      pushShellLocation,
      rememberRecentPage,
      resetNavigation,
      runWithCpMakerUnsavedGuard,
      runWithModUnsavedGuard,
      setRegisteredWorkbenchViewId,
      setWorkbenchRouteToWorkspace,
      setWorkspaceViewMode,
      workspaceMode,
    ],
  )

  const handleOpenToolWorkspace = useCallback(
    (mode: 'mod-browser' | 'mod-i18n') => {
      void runWithModUnsavedGuard(() => {
        setRegisteredWorkbenchViewId(null)
        setWorkspaceViewMode('preview')
        setWorkspaceMode(mode)
        rememberRecentPage({ kind: 'root', mode })
        setWorkbenchRouteToWorkspace()
        pushShellLocation(
          createShellLocation({
            workbenchRoute: 'workspace',
            workspaceMode: mode,
            workspaceViewMode: 'preview',
            registeredWorkbenchViewId: null,
          }),
        )
      })
    },
    [
      pushShellLocation,
      rememberRecentPage,
      runWithModUnsavedGuard,
      setRegisteredWorkbenchViewId,
      setWorkbenchRouteToWorkspace,
      setWorkspaceMode,
      setWorkspaceViewMode,
    ],
  )

  const handleOpenRegisteredWorkbenchView = useCallback(
    (viewId: string) => {
      const registration = getWorkbenchViewRegistration(viewId)
      if (registration?.activation.kind === 'workspace') {
        const mode = registration.activation.workspaceMode
        if (mode === 'mod-browser' || mode === 'mod-i18n') handleOpenToolWorkspace(mode)
        return
      }
      handleOpenDevView(viewId)
    },
    [getWorkbenchViewRegistration, handleOpenDevView, handleOpenToolWorkspace],
  )

  useEffect(() => {
    if (!cpMaker.activeDraft?.draftStorageKey || !makerPending || workbenchRoute !== 'home') return
    openLoadedDraftWorkspace(makerPending)
    setMakerPending(null)
  }, [cpMaker.activeDraft?.draftStorageKey, makerPending, openLoadedDraftWorkspace, setMakerPending, workbenchRoute])

  return {
    handleCloseProject,
    handleCopyProject,
    handleCreateDraft,
    handleDeleteProject,
    handleExportPack,
    handleImportDraft,
    handleOpenDevView,
    handleOpenHome,
    handleOpenProjectCreate,
    handleOpenProjectLibrary: handleOpenHome,
    handleOpenProjectWorkspace,
    handleOpenRegisteredWorkbenchView,
    handleOpenRootWorkspace,
    handleSelectProjectFromHome,
    handleUpdateDraftMetadata,
  }
}
