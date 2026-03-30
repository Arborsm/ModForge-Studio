import { ContentPatcherWorkspace } from '../../components/mods/ContentPatcherWorkspace'
import { ModBrowserPanel } from '../../components/mods/ModBrowserPanel'
import type { WorkspacePanelConfig } from '../../components/WorkspaceLayout'
import type { ModProjectDetail, ModProjectSummary, SaveModProjectResult } from '../desktop'
import type { ModWorkspaceCopy } from '../plugins/copy'
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
  onModFilterChange: (value: string) => void
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
  onModManifestFieldChange: (field: string, value: string) => void
  onModManifestTextChange: (value: string) => void
  onModContentTextChange: (value: string) => void
  onAddModPatch: () => void
  onRemoveModPatch: () => void
  onModPatchFieldChange: (field: string, value: string) => void
  onModPatchWhenChange: (value: string) => void
  onSaveModProject: () => void
  onExportModProject: () => void
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
  onModFilterChange,
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
  onModManifestFieldChange,
  onModManifestTextChange,
  onModContentTextChange,
  onAddModPatch,
  onRemoveModPatch,
  onModPatchFieldChange,
  onModPatchWhenChange,
  onSaveModProject,
  onExportModProject,
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
          copy={modCopy}
          projects={modProjects}
          filteredProjects={filteredModProjects}
          activeProjectPath={activeProjectPath}
          modFilter={modFilter}
          onFilterChange={onModFilterChange}
          onSelectProject={onSelectModProject}
          onImportProject={onImportModProject}
          onRefreshProjects={onRefreshModProjects}
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
          copy={modCopy}
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
          onSelectPatch={(patchId) => onSelectModPatch(patchId)}
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
  ]
}

export type { BuildModWorkspacePanelsOptions }





