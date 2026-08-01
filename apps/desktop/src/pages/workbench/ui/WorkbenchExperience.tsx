import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceLayoutHandle } from '@shared/contracts'
import { type AppMode } from '@locales/api'
import { useEditorCopy, useModCopy } from '@locales/provider'
import {
  useCpMaker,
  buildStudioDeskModel,
  collectDraftIssues,
  CreateDraftDialog,
  ExportDialog,
  ProjectPropertiesDialog,
  type WorkspaceId,
} from '@features/cp-maker'
import '../model/builtInWorkspaces'
import type { SettingsWindowCategory } from '@shared/contracts'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchModuleRegistration } from '@shared/contracts'
import InitializationOverlay from './InitializationOverlay'
import { WorkbenchShell } from './WorkbenchShell'
import { useEditModeNavigation } from '../model/useEditModeNavigation'
import { usePlayerAppearanceState } from '../model/usePlayerAppearanceState'
import { useWorkspaceLayoutPersistence } from '../model/useWorkspaceLayoutPersistence'
import { useWorkbenchNavigation } from '../model/useWorkbenchNavigation'
import { useWorkbenchNavigationController } from '../model/useWorkbenchNavigationController'
import { useWorkbenchProjectController } from '../model/useWorkbenchProjectController'
import { useWorkbenchPersistenceController } from '../model/useWorkbenchPersistenceController'
import { type WorkbenchUnsavedGuard } from '../model/workbenchModuleContexts'
import { useWorkbenchCommandIntent } from '../model/workbenchCommandIntent'
import { useDeferredWorkbenchModule } from '../model/useDeferredWorkbenchModule'
import { useWorkbenchCloseController } from '../model/useWorkbenchCloseController'
import { useWorkbenchProjectPresentationController } from '../model/useWorkbenchProjectPresentationController'
import { useWorkbenchDirectoryController } from '../model/useWorkbenchDirectoryController'
import { useWorkbenchSideNavigation } from '../model/useWorkbenchSideNavigation'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { THEME_PRESETS } from '@shared/lib/theme/presets'

const PlayerAppearanceWindow = lazy(() => import('./PlayerAppearanceWindow'))
const WorkspaceDecisionDialog = lazy(() =>
  import('../workspaces/mod/mods/content-patcher/content-view/ModWorkspaceDecisionDialogs').then((module) => ({
    default: module.WorkspaceDecisionDialog,
  })),
)

type WorkbenchExperienceProps = {
  pendingWorkbenchIntent: PendingWorkbenchCommandIntent | null
  onClearPendingIntent: () => void
  active: boolean
  appUiStateReady: boolean
  desktopHost: boolean
  onToggleTheme: () => void
  onSwitchToLauncher: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => boolean | Promise<boolean>
  onWindowCloseRequestChange?: (handler: (() => boolean | Promise<boolean>) | null) => void
  onHomeRouteActiveChange?: (active: boolean) => void
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchModuleRegistration: (moduleId: string) => WorkbenchModuleRegistration | null
  workbenchModules?: readonly WorkbenchModuleRegistration[]
  workbenchActivationKey?: number
}

const AUTHORING_MODULE_BY_WORKSPACE: Record<WorkspaceId, string> = {
  mods: 'project-content',
  map: 'map-authoring',
  events: 'event-authoring',
  characters: 'character-authoring',
  buildings: 'building-authoring',
  items: 'item-authoring',
  dialogue: 'dialogue-editor',
  schedules: 'schedule-editor',
  mail: 'mail-editor',
}

function isWorkspaceId(value: string): value is WorkspaceId {
  return Object.hasOwn(AUTHORING_MODULE_BY_WORKSPACE, value)
}

export default function WorkbenchExperience({
  pendingWorkbenchIntent,
  onClearPendingIntent,
  active,
  appUiStateReady,
  desktopHost,
  onToggleTheme,
  onSwitchToLauncher,
  onOpenSettings,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  onWindowCloseRequestChange,
  onHomeRouteActiveChange,
  onWorkbenchEvent,
  getWorkbenchModuleRegistration,
  workbenchModules = [],
}: WorkbenchExperienceProps) {
  const navigation = useWorkbenchNavigation({ kind: 'home' })
  const theme = usePreferencesStore((state) => state.theme)
  const themeId = usePreferencesStore((state) => state.themeId)
  const accentColor = THEME_PRESETS.find((preset) => preset.id === themeId)?.accent ?? THEME_PRESETS[0].accent
  const { openHome } = navigation
  const cpMaker = useCpMaker()
  const copy = useEditorCopy()
  const modWorkspaceCopy = useModCopy()
  const [modGuardHandle, setModGuardHandle] = useState<WorkbenchUnsavedGuard | null>(null)
  const runWithModUnsavedGuard = useCallback(
    async (action: () => void | Promise<void>) => {
      if (!modGuardHandle) {
        await action()
        return true
      }
      return modGuardHandle.requestUnsavedChangeDecision(action)
    },
    [modGuardHandle],
  )
  const projectController = useWorkbenchProjectController({
    cpMaker,
    onRestoreFailed: openHome,
    saveFailedMessage: modWorkspaceCopy.saveFailed,
    runWithExternalGuard: runWithModUnsavedGuard,
  })
  const { projectReady, runWithUnsavedGuard: runWithCpMakerUnsavedGuard } = projectController
  const activeModuleId = navigation.location.kind === 'module' ? navigation.location.moduleId : null
  const isHome = navigation.location.kind === 'home'
  const activeModuleRegistration =
    navigation.location.kind === 'module' ? getWorkbenchModuleRegistration(navigation.location.moduleId) : null
  const deferredHeavyModuleId = useDeferredWorkbenchModule(activeModuleId)
  const sideNavigation = useWorkbenchSideNavigation()
  const shellRootRef = useRef<HTMLDivElement | null>(null)
  const { navigateToPatch, resetNavigation } = useEditModeNavigation(activeModuleRegistration?.presentation === 'authoring')
  const navigationController = useWorkbenchNavigationController({
    active,
    rootRef: shellRootRef,
    navigation,
    hasActiveProject: Boolean(cpMaker.activeDraft),
    getRegistration: getWorkbenchModuleRegistration,
    resetAuthoringNavigation: resetNavigation,
    ensureSectionOpen: sideNavigation.ensureSectionOpen,
    runWithModuleGuard: runWithModUnsavedGuard,
  })
  const {
    navigationInteractedRef,
    applyLocation: applyWorkbenchLocation,
    resetHistory: resetWorkbenchHistory,
    goBack: goShellBack,
    goForward: goShellForward,
    canGoBack: canGoShellBack,
    canGoForward: canGoShellForward,
    openHome: handleOpenHome,
    openModule: handleOpenRegisteredWorkbenchView,
  } = navigationController

  const [playerAppearanceWindowOpen, setPlayerAppearanceWindowOpen] = useState(false)
  const [playerAppearanceWindowNonce, setPlayerAppearanceWindowNonce] = useState(0)
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)
  const {
    playerAppearanceProfiles,
    activePlayerAppearanceProfileId,
    activePlayerAppearanceProfile,
    setActivePlayerAppearanceProfileId,
    handleCreatePlayerAppearanceProfile,
    handleDuplicatePlayerAppearanceProfile,
    handleDeletePlayerAppearanceProfile,
    handleImportPlayerAppearanceProfile,
    handleChangePlayerAppearanceProfile,
  } = usePlayerAppearanceState(appUiStateReady)

  const directoryController = useWorkbenchDirectoryController({
    active,
    desktopHost,
    appUiStateReady,
    runWithModuleGuard: runWithModUnsavedGuard,
  })
  const { directoryInfo, directoryStatus, handleDirectoryInvalid } = directoryController
  useEffect(() => {
    onHomeRouteActiveChange?.(active && isHome)
    return () => onHomeRouteActiveChange?.(false)
  }, [active, isHome, onHomeRouteActiveChange])

  useEffect(() => {
    if (activeModuleId !== 'map-browser') {
      return
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [activeModuleId])

  const { workspaceLayouts, workspaceLayoutStorageKey, handleWorkspacePersistStateChange } = useWorkspaceLayoutPersistence(
    appUiStateReady,
    activeModuleRegistration?.persistenceKey ?? 'map-browser',
  )

  useWorkbenchPersistenceController({
    appUiStateReady,
    projectReady,
    hasActiveProject: Boolean(cpMaker.activeDraft),
    location: navigation.location,
    collapsed: sideNavigation.collapsed,
    sections: sideNavigation.sections,
    navigationInteractedRef,
    sideNavigationInteractedRef: sideNavigation.interactedRef,
    getModuleRegistration: getWorkbenchModuleRegistration,
    restoreLocation: applyWorkbenchLocation,
    restoreCollapsed: sideNavigation.setCollapsed,
    restoreSections: sideNavigation.setSections,
  })

  const handleReloadActiveProject = useCallback(() => {
    void projectController.reloadDraft(() => {
      navigateToPatch(null)
    })
  }, [navigateToPatch, projectController])

  const navigateToAuthoringWorkspace = useCallback(
    (workspaceId: string) => {
      return isWorkspaceId(workspaceId)
        ? handleOpenRegisteredWorkbenchView(AUTHORING_MODULE_BY_WORKSPACE[workspaceId])
        : Promise.resolve(false)
    },
    [handleOpenRegisteredWorkbenchView],
  )
  useWorkbenchCommandIntent({
    pendingIntent: pendingWorkbenchIntent,
    cpMaker,
    openModule: handleOpenRegisteredWorkbenchView,
    navigateToAuthoringWorkspace,
    runWithModUnsavedGuard,
    runWithCpMakerUnsavedGuard,
    navigateToPatch,
    clearPendingIntent: onClearPendingIntent,
  })

  const studioDeskModel = useMemo(
    () =>
      buildStudioDeskModel({
        activeDraft: cpMaker.activeDraft,
        drafts: cpMaker.drafts,
        patchCountByWorkspace: cpMaker.patchCountByWorkspace,
        dirtyPatchIds: cpMaker.dirtyPatchIds,
        isDirty: cpMaker.isDirty,
      }),
    [cpMaker.activeDraft, cpMaker.drafts, cpMaker.patchCountByWorkspace, cpMaker.dirtyPatchIds, cpMaker.isDirty],
  )
  const editModeView = activeModuleRegistration

  useEffect(() => {
    resetNavigation()
  }, [activeModuleId, resetNavigation])

  const openAppearanceWindow = useCallback(() => {
    setPlayerAppearanceWindowNonce((current) => current + 1)
    setPlayerAppearanceWindowOpen(true)
  }, [])

  const handleAppModeChange = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === 'launcher') {
        void runWithModUnsavedGuard(() => {
          void runWithCpMakerUnsavedGuard(() => {
            onSwitchToLauncher()
          })
        })
      }
    },
    [onSwitchToLauncher, runWithCpMakerUnsavedGuard, runWithModUnsavedGuard],
  )

  const handleCloseWindow = useWorkbenchCloseController({
    active,
    moduleDirty: Boolean(modGuardHandle?.hasUnsavedChanges),
    projectDirty: cpMaker.isDirty,
    moduleDecisionPending: Boolean(modGuardHandle?.hasPendingUnsavedDecision),
    projectDecisionPending: Boolean(projectController.pendingUnsavedAction),
    runWithModuleGuard: runWithModUnsavedGuard,
    runWithProjectGuard: runWithCpMakerUnsavedGuard,
    closeWindow: onCloseWindow,
    onCloseRequestChange: onWindowCloseRequestChange,
  })

  const projectPresentation = useWorkbenchProjectPresentationController({
    cpMaker,
    projectController,
    gameRootPath: directoryInfo?.rootPath ?? null,
    importLabel: copy.studioDesk.importDraft,
    onWorkbenchEvent,
    openHome: handleOpenHome,
    openModule: handleOpenRegisteredWorkbenchView,
    applyLocation: applyWorkbenchLocation,
    resetHistory: resetWorkbenchHistory,
    resetAuthoringNavigation: resetNavigation,
    navigateToPatch,
  })

  const projectMenuRecentProjects = useMemo(
    () =>
      studioDeskModel.gallery.projects.slice(0, 8).map((project) => ({
        draftStorageKey: project.draftStorageKey,
        title: project.title,
        uniqueId: project.uniqueId,
        isCurrent: project.isCurrent,
      })),
    [studioDeskModel.gallery.projects],
  )

  return (
    <>
      <WorkbenchShell
        rootRef={shellRootRef}
        active={active}
        interactionLocked={directoryController.interactionLocked}
        topMenu={{
          appMode: 'workbench',
          onAppModeChange: handleAppModeChange,
          theme,
          onToggleTheme,
          statusTone: directoryStatus.tone,
          desktopHost,
          onMinimizeWindow,
          onToggleMaximizeWindow,
          onCloseWindow: handleCloseWindow,
          settingsMenu: { onOpen: () => onOpenSettings('appearance') },
          projectMenu: {
            title: studioDeskModel.hasActiveDraft ? studioDeskModel.projectName || null : null,
            version: studioDeskModel.hasActiveDraft ? studioDeskModel.projectVersion || null : null,
            uniqueId: studioDeskModel.hasActiveDraft ? studioDeskModel.projectUniqueId || null : null,
            recentProjects: projectMenuRecentProjects,
            hasActiveProject: studioDeskModel.hasActiveDraft,
            onSelectProject: (draftStorageKey) => projectPresentation.selectDraft(draftStorageKey),
            onCreateProject: projectPresentation.openCreateDialog,
            onOpenProject: projectPresentation.openProjectLibrary,
            onImportProject: () => void projectPresentation.importDraft(),
            onProjectSettings: projectPresentation.openPropertiesDialog,
            onExportProject: projectPresentation.openExportDialog,
            onCloseProject: projectPresentation.closeDraft,
          },
        }}
        sideNavigation={{
          collapsed: sideNavigation.collapsed,
          hasActiveProject: Boolean(cpMaker.activeDraft),
          onCollapsedChange: sideNavigation.changeCollapsed,
          canGoBack: canGoShellBack,
          canGoForward: canGoShellForward,
          onGoBack: goShellBack,
          onGoForward: goShellForward,
          onResetLayout: () => workspaceLayoutRef.current?.resetLayout(),
          location: navigation.location,
          modules: workbenchModules,
          onHomeOpen: handleOpenHome,
          onModuleOpen: handleOpenRegisteredWorkbenchView,
          sectionState: sideNavigation.sections,
          onSectionStateChange: sideNavigation.changeSections,
        }}
        moduleHost={
          navigation.location.kind === 'module'
            ? {
                module: editModeView,
                environment: {
                  active,
                  desktopHost,
                  accentColor,
                  directoryInfo,
                  directoryStatus,
                  heavyWorkspaceReady: deferredHeavyModuleId === activeModuleId,
                  onDirectoryInvalid: handleDirectoryInvalid,
                  playerAppearanceProfile: activePlayerAppearanceProfile,
                  onOpenPlayerAppearanceWindow: openAppearanceWindow,
                  onImportModProject: projectPresentation.importFromPath,
                  onReloadProject: handleReloadActiveProject,
                  onOpenModule: handleOpenRegisteredWorkbenchView,
                  onOpenProjectProperties: projectPresentation.openPropertiesDialog,
                  onOpenCreateProject: projectPresentation.openCreateDialog,
                  onExportProject: projectPresentation.openExportDialog,
                  onCloseProject: projectPresentation.closeDraft,
                  onOpenGameDirectory: directoryController.openOverlay,
                  onOpenSettings,
                },
                project: cpMaker,
                moduleState: {
                  moduleId: editModeView?.id ?? '',
                  persistenceKey: editModeView?.persistenceKey ?? workspaceLayoutStorageKey,
                  layoutRef: workspaceLayoutRef,
                  layouts: workspaceLayouts,
                  onPersistStateChange: handleWorkspacePersistStateChange,
                  onUnsavedGuardChange: setModGuardHandle,
                },
              }
            : null
        }
        homePage={
          isHome
            ? {
                presentation: 'home',
                hasActiveProject: Boolean(cpMaker.activeDraft),
                projectDirty: cpMaker.isDirty,
                gameDirectoryReady: Boolean(directoryInfo),
                studioDeskModel,
                taskSummary: {
                  exportCount: studioDeskModel.gallery.projects.filter((project) => project.statuses.includes('export')).length,
                  errorCount: studioDeskModel.stats.errorCount,
                  warningCount: studioDeskModel.stats.warningCount,
                  directoryStatus,
                },
                onProjectModuleOpen: handleOpenRegisteredWorkbenchView,
                onProjectCreateOpen: projectPresentation.openCreateDialog,
                onProjectImport: projectPresentation.importDraft,
                onProjectSelect: projectPresentation.selectDraft,
                onProjectDelete: projectPresentation.deleteDraft,
                onProjectPropertiesOpen: projectPresentation.openPropertiesDialog,
                onExportProject: projectPresentation.openExportDialog,
                onSaveProject: cpMaker.saveDraft,
                onGameDirectoryAction: directoryController.openOverlay,
                onCloseProject: projectPresentation.closeDraft,
              }
            : null
        }
      />

      {playerAppearanceWindowOpen ? (
        <Suspense fallback={<LoadingMotionFallback className="workbench-loading-motion-fallback" />}>
          <PlayerAppearanceWindow
            key={`player-appearance:${playerAppearanceWindowNonce}`}
            open={playerAppearanceWindowOpen}
            rootPath={directoryInfo?.rootPath ?? null}
            profiles={playerAppearanceProfiles}
            activeProfileId={activePlayerAppearanceProfileId}
            onSelectProfile={setActivePlayerAppearanceProfileId}
            onCreateProfile={handleCreatePlayerAppearanceProfile}
            onDuplicateProfile={handleDuplicatePlayerAppearanceProfile}
            onDeleteProfile={handleDeletePlayerAppearanceProfile}
            onImportProfile={handleImportPlayerAppearanceProfile}
            onChangeProfile={handleChangePlayerAppearanceProfile}
            onClose={() => setPlayerAppearanceWindowOpen(false)}
          />
        </Suspense>
      ) : null}

      {projectController.pendingUnsavedAction ? (
        <Suspense fallback={<LoadingMotionFallback />}>
          <WorkspaceDecisionDialog
            open
            title={modWorkspaceCopy.unsavedChangesTitle}
            message={copy.studioDesk.unsavedChangesMessage}
            error={projectController.unsavedError}
            saving={projectController.unsavedSaving}
            cancelLabel={modWorkspaceCopy.unsavedCancel}
            secondaryLabel={modWorkspaceCopy.unsavedDiscardAndContinue}
            primaryLabel={modWorkspaceCopy.unsavedSaveAndContinue}
            cancelDisabled={projectController.unsavedSaving}
            onCancel={projectController.cancelUnsavedDecision}
            onSecondary={() => void projectController.confirmDiscardAndContinue()}
            onPrimary={() => void projectController.confirmSaveAndContinue()}
          />
        </Suspense>
      ) : null}

      <CreateDraftDialog
        open={projectPresentation.createDialogOpen}
        onClose={projectPresentation.closeCreateDialog}
        onCreate={projectPresentation.createDraft}
      />
      <ProjectPropertiesDialog
        open={projectPresentation.propertiesDialogOpen}
        metadata={
          cpMaker.activeDraft?.projectMetadata ?? {
            projectName: studioDeskModel.projectName,
            projectDescription: studioDeskModel.projectDescription,
            projectAuthor: studioDeskModel.projectAuthor,
            projectVersion: studioDeskModel.projectVersion,
            projectUniqueId: studioDeskModel.projectUniqueId,
            gameRootPath: null,
            contentPackForUniqueId: 'Pathoschild.ContentPatcher',
          }
        }
        onClose={projectPresentation.closePropertiesDialog}
        onSave={projectPresentation.updateMetadata}
      />
      {projectPresentation.exportDialogOpen ? (
        <ExportDialog
          open
          draftName={studioDeskModel.projectName || copy.studioDesk.noActiveDraftTitle}
          fileList={studioDeskModel.exportSummary.fileList}
          issues={cpMaker.activeDraft ? collectDraftIssues(cpMaker.activeDraft) : []}
          onClose={projectPresentation.closeExportDialog}
          onExport={projectPresentation.exportPack}
        />
      ) : null}

      {directoryController.overlayOpen ? (
        <InitializationOverlay
          desktopHost={desktopHost}
          gameDirectory={directoryController.gameDirectory}
          detectedDirectories={directoryController.knownGameDirectories}
          loading={directoryController.interactionLocked}
          status={directoryController.overlayError ? null : directoryController.overlayStatus}
          error={directoryController.overlayError}
          onGameDirectoryChange={directoryController.setGameDirectory}
          onSelectDirectory={directoryController.setGameDirectory}
          onChooseDirectory={directoryController.chooseDirectory}
          onScanAndOpenTown={directoryController.validateDirectory}
          onRetry={directoryController.validateDirectory}
          onChooseDirectoryAction={directoryController.chooseDirectory}
          onClose={directoryController.needsInitialization ? undefined : directoryController.closeOverlay}
        />
      ) : null}
    </>
  )
}
