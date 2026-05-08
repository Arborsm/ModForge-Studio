import type {
  ContentPatcherProjectSnapshot,
  ContentPatcherSimulationResult,
  LoadContentPatcherResultAssetResult,
  ModProjectDetail,
  ModProjectSummary,
  SaveModProjectResult,
} from '@shared/contracts'
import type { ContentPatcherBackendSimulationContext, WorkspacePluginDefinition } from '../../workspaces/mod'

export type BuildModsWorkspacePanelsOptions = {
  modWorkspaceCopy: import('@locales').ModWorkspaceCopy
  modPluginDefinition: WorkspacePluginDefinition | null
  gameRootPath: string | null
  modProjects: ModProjectSummary[]
  filteredModProjects: ModProjectSummary[]
  activeProjectPath: string | null
  activeProject: ModProjectSummary | null
  modFilter: string
  contentPatcherOnly: boolean
  compatibleOnly: boolean
  onModFilterChange: (value: string) => void
  onContentPatcherOnlyChange: (value: boolean) => void
  onCompatibleOnlyChange: (value: boolean) => void
  onSelectModProject: (path: string) => void
  onImportModProject: () => void
  onRefreshModProjects: () => void
  activeModProjectDetail: ModProjectDetail | null
  modManifestEditor: {
    text: string
    value: unknown | null
    error: string | null
  }
  modContentEditor: {
    text: string
    value: unknown | null
    error: string | null
  }
  modContentSummary: {
    format: string | null
    changeCount: number
    includeCount: number
    dynamicTokenCount: number
    configKeys: string[]
    configEntries?: Array<{
      key: string
      defaultValue: unknown
    }>
    patches: Array<{
      id: string
      action: string
      target: string
      fromFile: string | null
      logName: string
      hasWhen: boolean
      whenKeys: string[]
      updateKeys: string[]
    }>
  }
  modDiagnostics: Array<{
    severity: 'info' | 'warning' | 'error'
    message: string
    field: string | null
  }>
  activeModPatchId: string | null
  onSelectModPatch: (patchId: string | null) => void
  activeModPatch: Record<string, unknown> | null
  modPatchWhenError: string | null
  modHasUnsavedChanges: boolean
  modCanPersist: boolean
  modStatusMessage: string
  modLastSaveResult: SaveModProjectResult | null
  contentPatcherSnapshot: ContentPatcherProjectSnapshot | null
  contentPatcherSimulation: ContentPatcherSimulationResult | null
  contentPatcherResultAsset: LoadContentPatcherResultAssetResult | null
  contentPatcherResultLoading: boolean
  contentPatcherResultError: string | null
  simulationContext: ContentPatcherBackendSimulationContext
  navigatorMode: 'patches' | 'targets'
  selectedTargetPath: string | null
  onNavigatorModeChange: (mode: 'patches' | 'targets') => void
  scaleUpEditor?: {
    targetPath: string
    focusSection: 'preview' | 'settings'
  } | null
  onModManifestFieldChange: (field: string, value: string) => void
  onModManifestTextChange: (value: string) => void
  onModContentTextChange: (value: string) => void
  onAddModPatch: () => void
  onRemoveModPatch: () => void
  onModPatchFieldChange: (field: string, value: string | boolean) => void
  onModPatchWhenChange: (value: string) => void
  onSaveModProject: () => void
  onExportModProject: () => void
  onSimulationContextChange: (next: ContentPatcherBackendSimulationContext) => void
  onSelectTarget: (targetPath: string) => void
  onOpenScaleUp?: (targetPath: string, focusSection: 'preview' | 'settings') => void
  onScaleUpContentChange?: (nextContent: unknown) => void
  onCloseScaleUpEditor?: () => void
}

export type BuildModWorkspacePanelsOptions = BuildModsWorkspacePanelsOptions
