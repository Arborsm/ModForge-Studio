import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { localeBundles } from '@locales'
import { type LocaleCode, type ThemeMode, type WorkspaceMode } from '@locales/api'
import { useModWorkspaceCopy } from '@locales/provider'
import { ModWorkspaceDecisionDialogs, useModWorkspace } from '../workspaces/mod'
import type { ModI18nStatusFilter } from '../workspaces/mod-i18n'
import { buildWorkspacePanels } from '../model/workspace-panels/buildWorkspacePanels'
import type { GameDirectoryInfo, WorkspaceLayoutHandle, WorkspacePanelMeta, WorkspaceStoredState } from '@shared/contracts'
import { WorkbenchLayoutHost } from './WorkbenchLayoutHost'
import { createPreviewPanelDefaults } from './workbenchPreviewPanelDefaults'

type ModWorkspaceGuardHandle = {
  hasUnsavedChanges: boolean
  hasPendingUnsavedDecision: boolean
  requestUnsavedChangeDecision: (action: () => void | Promise<void>) => Promise<boolean>
}

type ModPreviewStatusSnapshot = {
  diagnostics: Array<{ severity: 'info' | 'warning' | 'error' }>
  hasUnsavedChanges: boolean
  projectsCount: number
  activeProjectDetail: object | null
  statusMessage: string
}

type WorkbenchModPreviewRuntimeProps = {
  copy: (typeof import('@locales/api').editorCopy)[LocaleCode]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  workspaceMode: Extract<WorkspaceMode, 'mods' | 'mod-i18n'>
  directoryInfo: GameDirectoryInfo | null
  heavyWorkspaceReady: boolean
  workspaceLayoutRef: RefObject<WorkspaceLayoutHandle | null>
  workspaceLayoutStorageKey: string
  workspaceLayouts: Record<string, WorkspaceStoredState>
  modI18nSourceLocale: string
  modI18nTargetLocale: string
  modI18nQuery: string
  modI18nStatusFilter: ModI18nStatusFilter
  onModI18nSourceLocaleChange: (locale: string) => void
  onModI18nTargetLocaleChange: (locale: string) => void
  onModI18nQueryChange: (value: string) => void
  onModI18nStatusFilterChange: (status: ModI18nStatusFilter) => void
  onGuardHandleChange: Dispatch<SetStateAction<ModWorkspaceGuardHandle | null>>
  onStatusSnapshotChange: Dispatch<SetStateAction<ModPreviewStatusSnapshot>>
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
  onLayoutMetaChange: (payload: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => void
}

/** Mounts the mod browser/editor state only while mod preview workspaces are active. */
export function WorkbenchModPreviewRuntime({
  copy,
  locale,
  theme,
  accentColor,
  workspaceMode,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  modI18nSourceLocale,
  modI18nTargetLocale,
  modI18nQuery,
  modI18nStatusFilter,
  onModI18nSourceLocaleChange,
  onModI18nTargetLocaleChange,
  onModI18nQueryChange,
  onModI18nStatusFilterChange,
  onGuardHandleChange,
  onStatusSnapshotChange,
  onPersistStateChange,
  onLayoutMetaChange,
}: WorkbenchModPreviewRuntimeProps) {
  const modWorkspaceCopy = useModWorkspaceCopy()
  const modWorkspace = useModWorkspace({
    directoryInfo,
  })
  const modI18nCopy = localeBundles[locale].modI18n
  const requestUnsavedChangeDecisionRef = useRef(modWorkspace.requestUnsavedChangeDecision)
  const hasPendingUnsavedDecision = Boolean(modWorkspace.pendingUnsavedChangeDecision)

  useEffect(() => {
    requestUnsavedChangeDecisionRef.current = modWorkspace.requestUnsavedChangeDecision
  }, [modWorkspace.requestUnsavedChangeDecision])

  const requestUnsavedChangeDecision = useCallback((action: () => void | Promise<void>) => {
    return requestUnsavedChangeDecisionRef.current(action)
  }, [])

  useEffect(() => {
    onGuardHandleChange((current) => {
      if (
        current?.hasUnsavedChanges === modWorkspace.hasUnsavedChanges &&
        current.hasPendingUnsavedDecision === hasPendingUnsavedDecision &&
        current.requestUnsavedChangeDecision === requestUnsavedChangeDecision
      ) {
        return current
      }

      return {
        hasUnsavedChanges: modWorkspace.hasUnsavedChanges,
        hasPendingUnsavedDecision,
        requestUnsavedChangeDecision,
      }
    })
    return () => onGuardHandleChange(null)
  }, [hasPendingUnsavedDecision, modWorkspace.hasUnsavedChanges, onGuardHandleChange, requestUnsavedChangeDecision])

  useEffect(() => {
    const snapshot = {
      diagnostics: modWorkspace.diagnostics,
      hasUnsavedChanges: modWorkspace.hasUnsavedChanges,
      projectsCount: modWorkspace.modProjects.length,
      activeProjectDetail: modWorkspace.projectDetail,
      statusMessage: modWorkspace.statusMessage,
    } satisfies ModPreviewStatusSnapshot

    onStatusSnapshotChange((current) => {
      if (
        current.diagnostics === snapshot.diagnostics &&
        current.hasUnsavedChanges === snapshot.hasUnsavedChanges &&
        current.projectsCount === snapshot.projectsCount &&
        current.activeProjectDetail === snapshot.activeProjectDetail &&
        current.statusMessage === snapshot.statusMessage
      ) {
        return current
      }

      return snapshot
    })
  }, [
    modWorkspace.diagnostics,
    modWorkspace.hasUnsavedChanges,
    modWorkspace.modProjects.length,
    modWorkspace.projectDetail,
    modWorkspace.statusMessage,
    onStatusSnapshotChange,
  ])

  const modI18nLocales = useMemo(() => modWorkspace.i18nFiles.map((file) => file.locale), [modWorkspace.i18nFiles])
  const normalizedModI18nSourceLocale = modI18nLocales.includes(modI18nSourceLocale)
    ? modI18nSourceLocale
    : modI18nLocales.includes('default')
      ? 'default'
      : (modI18nLocales[0] ?? 'default')
  const normalizedModI18nTargetLocale = modI18nLocales.includes(modI18nTargetLocale)
    ? modI18nTargetLocale
    : (modI18nLocales.find((candidate) => candidate !== normalizedModI18nSourceLocale) ?? normalizedModI18nSourceLocale)

  const workspacePanels = useMemo(
    () =>
      buildWorkspacePanels({
        ...createPreviewPanelDefaults({
          copy,
          modWorkspaceCopy,
          locale,
          workspaceMode,
          directoryInfo,
          theme,
          accentColor,
          heavyWorkspaceReady,
        }),
        modWorkspaceCopy: modWorkspace.copy,
        modI18nCopy,
        modPluginDefinition: modWorkspace.pluginDefinition,
        modProjects: modWorkspace.modProjects,
        filteredModProjects: modWorkspace.filteredModProjects,
        activeProjectPath: modWorkspace.activeProjectPath,
        activeProject: modWorkspace.activeProject ?? null,
        modFilter: modWorkspace.modFilter,
        contentPatcherOnly: modWorkspace.contentPatcherOnly,
        compatibleOnly: modWorkspace.compatibleOnly,
        onModFilterChange: modWorkspace.setModFilter,
        onContentPatcherOnlyChange: modWorkspace.setContentPatcherOnly,
        onCompatibleOnlyChange: modWorkspace.setCompatibleOnly,
        onSelectModProject: modWorkspace.handleSelectProject,
        onImportModProject: () => void modWorkspace.handleImportProject(),
        onRefreshModProjects: () => void modWorkspace.handleRefreshProjects(),
        activeModProjectDetail: modWorkspace.projectDetail,
        modManifestEditor: modWorkspace.manifestEditor,
        modContentEditor: modWorkspace.contentEditor,
        modContentSummary: modWorkspace.contentSummary,
        modDiagnostics: modWorkspace.diagnostics,
        activeModPatchId: modWorkspace.selectedPatchId,
        onSelectModPatch: modWorkspace.setSelectedPatchId,
        activeModPatch: modWorkspace.selectedPatch ?? null,
        modPatchWhenError: modWorkspace.patchWhenError,
        modHasUnsavedChanges: modWorkspace.hasUnsavedChanges,
        modCanPersist: modWorkspace.canPersist,
        modStatusMessage: modWorkspace.statusMessage,
        modLastSaveResult: modWorkspace.lastSaveResult ?? null,
        contentPatcherSnapshot: modWorkspace.contentPatcherSnapshot,
        contentPatcherSimulation: modWorkspace.contentPatcherSimulation,
        contentPatcherResultAsset: modWorkspace.contentPatcherResultAsset,
        contentPatcherResultLoading: modWorkspace.contentPatcherResultLoading,
        contentPatcherResultError: modWorkspace.contentPatcherResultError,
        simulationContext: modWorkspace.simulationContext,
        modI18nFiles: modWorkspace.i18nFiles,
        modI18nSourceLocale: normalizedModI18nSourceLocale,
        modI18nTargetLocale: normalizedModI18nTargetLocale,
        modI18nQuery,
        modI18nStatusFilter,
        onModI18nSourceLocaleChange,
        onModI18nTargetLocaleChange,
        onModI18nQueryChange,
        onModI18nStatusFilterChange,
        onModI18nFilesChange: modWorkspace.setI18nFiles,
        navigatorMode: modWorkspace.navigatorMode,
        selectedTargetPath: modWorkspace.selectedTargetPath,
        onNavigatorModeChange: modWorkspace.setNavigatorMode,
        scaleUpEditor: modWorkspace.scaleUpEditor,
        onModManifestFieldChange: modWorkspace.handleManifestFieldChange,
        onModManifestTextChange: modWorkspace.handleManifestTextChange,
        onModContentTextChange: modWorkspace.handleContentTextChange,
        onAddModPatch: modWorkspace.handleAddPatch,
        onRemoveModPatch: modWorkspace.handleRemoveSelectedPatch,
        onModPatchFieldChange: modWorkspace.handlePatchFieldChange,
        onModPatchWhenChange: modWorkspace.handlePatchWhenChange,
        onSaveModProject: () => void modWorkspace.handleSaveProject(),
        onExportModProject: () => void modWorkspace.handleExportProject(),
        onSimulationContextChange: modWorkspace.handleSimulationContextChange,
        onSelectTarget: modWorkspace.setSelectedTargetPath,
        onOpenScaleUp: modWorkspace.handleOpenScaleUpEditor,
        onScaleUpContentChange: modWorkspace.handleScaleUpContentChange,
        onCloseScaleUpEditor: modWorkspace.handleCloseScaleUpEditor,
      }),
    [
      accentColor,
      copy,
      directoryInfo,
      heavyWorkspaceReady,
      locale,
      modI18nCopy,
      modI18nQuery,
      modI18nStatusFilter,
      modWorkspace,
      normalizedModI18nSourceLocale,
      normalizedModI18nTargetLocale,
      onModI18nQueryChange,
      onModI18nSourceLocaleChange,
      onModI18nStatusFilterChange,
      onModI18nTargetLocaleChange,
      theme,
      workspaceMode,
    ],
  )

  return (
    <>
      <ModWorkspaceDecisionDialogs
        pendingUnsavedChangeDecision={modWorkspace.pendingUnsavedChangeDecision}
        pendingExportOverwriteDecision={modWorkspace.pendingExportOverwriteDecision}
        onConfirmUnsavedSaveAndContinue={() => void modWorkspace.confirmUnsavedSaveAndContinue()}
        onConfirmUnsavedDiscardAndContinue={() => void modWorkspace.confirmUnsavedDiscardAndContinue()}
        onCancelUnsavedChangeDecision={modWorkspace.cancelUnsavedChangeDecision}
        onConfirmExportOverwrite={() => void modWorkspace.confirmExportOverwrite()}
        onCancelExportOverwrite={modWorkspace.cancelExportOverwrite}
      />
      <WorkbenchLayoutHost
        workspaceLayoutRef={workspaceLayoutRef}
        workspaceLayoutStorageKey={workspaceLayoutStorageKey}
        workspaceLayouts={workspaceLayouts}
        workspacePanels={workspacePanels}
        onPersistStateChange={onPersistStateChange}
        onLayoutMetaChange={onLayoutMetaChange}
      />
    </>
  )
}

export type { ModPreviewStatusSnapshot, ModWorkspaceGuardHandle }
