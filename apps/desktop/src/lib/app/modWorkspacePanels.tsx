import { ContentPatcherWorkspace } from '../../components/mods/ContentPatcherWorkspace'
import { ContentPatcherDiagnosticsPanel } from '../../components/mods/content-patcher/ContentPatcherDiagnosticsPanel'
import { ContentPatcherExportPanel } from '../../components/mods/content-patcher/ContentPatcherExportPanel'
import { ContentPatcherNavigator } from '../../components/mods/content-patcher/ContentPatcherNavigator'
import { ContentPatcherTracePanel } from '../../components/mods/content-patcher/ContentPatcherTracePanel'
import { ModBrowserPanel } from '../../components/mods/ModBrowserPanel'
import type { WorkspacePanelConfig } from '../../components/WorkspaceLayout'
import type {
  ContentPatcherProjectSnapshot,
  ContentPatcherSimulationResult,
  LoadContentPatcherResultAssetResult,
  ModProjectDetail,
  ModProjectSummary,
  SaveModProjectResult,
} from '../desktop'
import type { ContentPatcherBackendSimulationContext } from '../plugins/contentPatcher'
import type { ModWorkspaceCopy } from '../editor-shell'
import type { WorkspacePluginDefinition } from '../plugins/types'

type BuildModWorkspacePanelsOptions = {
  modWorkspaceCopy: ModWorkspaceCopy
  modPluginDefinition: WorkspacePluginDefinition | null
  gameRootPath: string | null
  modProjects: ModProjectSummary[]
  filteredModProjects: ModProjectSummary[]
  activeProjectPath: string | null
  activeProject: ModProjectSummary | null
  modFilter: string
  contentPatcherOnly: boolean
  onModFilterChange: (value: string) => void
  onContentPatcherOnlyChange: (value: boolean) => void
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
  onModManifestFieldChange: (field: string, value: string) => void
  onModManifestTextChange: (value: string) => void
  onModContentTextChange: (value: string) => void
  onAddModPatch: () => void
  onRemoveModPatch: () => void
  onModPatchFieldChange: (field: string, value: string) => void
  onModPatchWhenChange: (value: string) => void
  onSaveModProject: () => void
  onExportModProject: () => void
  onSimulationContextChange: (next: ContentPatcherBackendSimulationContext) => void
  onSelectTarget: (targetPath: string) => void
}

export function buildModWorkspacePanels({
  modWorkspaceCopy: modCopy,
  modPluginDefinition,
  gameRootPath,
  modProjects,
  filteredModProjects,
  activeProjectPath,
  activeProject,
  modFilter,
  contentPatcherOnly,
  onModFilterChange,
  onContentPatcherOnlyChange,
  onSelectModProject,
  onImportModProject,
  onRefreshModProjects,
  activeModProjectDetail,
  modManifestEditor,
  modContentEditor,
  modContentSummary,
  modDiagnostics,
  activeModPatchId,
  onSelectModPatch,
  activeModPatch,
  modPatchWhenError,
  modHasUnsavedChanges,
  modCanPersist: _modCanPersist,
  modStatusMessage,
  modLastSaveResult,
  contentPatcherSnapshot,
  contentPatcherSimulation,
  contentPatcherResultAsset,
  contentPatcherResultLoading,
  contentPatcherResultError,
  simulationContext,
  navigatorMode,
  selectedTargetPath,
  onNavigatorModeChange,
  onModManifestFieldChange,
  onModManifestTextChange,
  onModContentTextChange,
  onAddModPatch,
  onRemoveModPatch,
  onModPatchFieldChange,
  onModPatchWhenChange,
  onSaveModProject,
  onExportModProject,
  onSimulationContextChange,
  onSelectTarget,
}: BuildModWorkspacePanelsOptions): WorkspacePanelConfig[] {
  return [
    {
      id: 'mods-browser',
      title: modCopy.browserTitle,
      subtitle: modCopy.browserSubtitle,
      minWidth: 320,
      minHeight: 320,
      dockMinHeight: 240,
      defaultDock: 'left-top',
      defaultDockHeight: 760,
      content: (
        <ModBrowserPanel
          projects={modProjects}
          filteredProjects={filteredModProjects}
          activeProjectPath={activeProjectPath}
          modFilter={modFilter}
          contentPatcherOnly={contentPatcherOnly}
          onFilterChange={onModFilterChange}
          onContentPatcherOnlyChange={onContentPatcherOnlyChange}
          onSelectProject={onSelectModProject}
          onImportProject={onImportModProject}
          onRefreshProjects={onRefreshModProjects}
        />
      ),
    },
    {
      id: 'mods-navigator',
      title: modCopy.patchesTitle,
      subtitle: modCopy.patchesSubtitle,
      minWidth: 300,
      minHeight: 240,
      dockMinHeight: 200,
      defaultDock: 'left-bottom',
      defaultDockHeight: 320,
      content: (
        <ContentPatcherNavigator
          mode={navigatorMode}
          onModeChange={onNavigatorModeChange}
          patches={contentPatcherSimulation?.plan.patches ?? []}
          patchStatuses={contentPatcherSimulation?.patchStatuses ?? []}
          targets={contentPatcherSimulation?.targets ?? []}
          selectedPatchId={activeModPatchId}
          selectedTargetPath={selectedTargetPath}
          onSelectPatch={(patchId) => onSelectModPatch(patchId)}
          onSelectTarget={onSelectTarget}
        />
      ),
    },
    {
      id: 'mods-workspace',
      title: activeProject?.name ?? modCopy.workspaceLabel,
      subtitle: modCopy.workspaceSubtitle,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat',
      minWidth: 680,
      minHeight: 480,
      defaultDock: 'center',
      defaultDockHeight: 760,
      content: (
        <ContentPatcherWorkspace
          pluginDefinition={modPluginDefinition}
          projectDetail={activeModProjectDetail}
          diagnostics={modDiagnostics}
          statusMessage={modStatusMessage}
          lastSaveResult={modLastSaveResult}
          gameRootPath={gameRootPath}
          manifestEditor={modManifestEditor}
          contentEditor={modContentEditor}
          contentSummary={modContentSummary}
          selectedPatchId={activeModPatchId}
          selectedPatch={activeModPatch}
          patchWhenError={modPatchWhenError}
          hasUnsavedChanges={modHasUnsavedChanges}
          canPersist={_modCanPersist}
          contentPatcherSnapshot={contentPatcherSnapshot}
          contentPatcherSimulation={contentPatcherSimulation}
          contentPatcherResultAsset={contentPatcherResultAsset}
          contentPatcherResultLoading={contentPatcherResultLoading}
          contentPatcherResultError={contentPatcherResultError}
          simulationContext={simulationContext}
          onSimulationContextChange={onSimulationContextChange}
          onManifestFieldChange={onModManifestFieldChange}
          onManifestTextChange={onModManifestTextChange}
          onContentTextChange={onModContentTextChange}
          onPatchFieldChange={onModPatchFieldChange}
          onPatchWhenChange={onModPatchWhenChange}
          onAddPatch={onAddModPatch}
          onRemoveSelectedPatch={onRemoveModPatch}
          onSaveProject={onSaveModProject}
          onExportProject={onExportModProject}
        />
      ),
    },
    {
      id: 'mods-trace',
      title: 'Patch Trace',
      subtitle: 'Applied patch flow for the selected target',
      minWidth: 300,
      minHeight: 220,
      dockMinHeight: 180,
      defaultDock: 'right-top',
      defaultDockHeight: 360,
      content: <ContentPatcherTracePanel result={contentPatcherResultAsset} />,
    },
    {
      id: 'mods-target-diagnostics',
      title: modCopy.targetDiagnosticsTitle,
      subtitle: modCopy.targetDiagnosticsSubtitle,
      minWidth: 300,
      minHeight: 220,
      dockMinHeight: 180,
      defaultDock: 'right-bottom',
      defaultDockHeight: 300,
      content: <ContentPatcherDiagnosticsPanel result={contentPatcherResultAsset} />,
    },
    {
      id: 'mods-export',
      title: modCopy.exportResultTitle,
      subtitle: modCopy.exportResultSubtitle,
      minWidth: 300,
      minHeight: 200,
      dockMinHeight: 160,
      defaultDock: 'right-bottom',
      defaultDockHeight: 220,
      content: (
        <ContentPatcherExportPanel
          projectPath={activeModProjectDetail?.summary.absolutePath ?? null}
          gameRootPath={gameRootPath}
          snapshot={contentPatcherSnapshot}
          manifestJson={modManifestEditor.text}
          contentJson={modContentEditor.text}
          simulationContext={simulationContext}
          selectedTargetPath={selectedTargetPath}
          result={contentPatcherResultAsset}
        />
      ),
    },
  ]
}

export type { BuildModWorkspacePanelsOptions }





