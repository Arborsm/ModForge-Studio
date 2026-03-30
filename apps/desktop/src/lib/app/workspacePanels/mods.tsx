import type { WorkspacePanelConfig } from '../../../components/WorkspaceLayout'
import { buildModWorkspacePanels } from '../modWorkspacePanels'
import type { BuildWorkspacePanelsOptions } from './types'

export function buildModsWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  return buildModWorkspacePanels({
    modWorkspaceCopy: options.modWorkspaceCopy,
    modPluginDefinition: options.modPluginDefinition,
    gameRootPath: options.directoryInfo?.rootPath ?? null,
    modProjects: options.modProjects,
    filteredModProjects: options.filteredModProjects,
    activeProjectPath: options.activeProjectPath,
    activeProject: options.activeProject,
    modFilter: options.modFilter,
    onModFilterChange: options.onModFilterChange,
    onSelectModProject: options.onSelectModProject,
    onImportModProject: options.onImportModProject,
    onRefreshModProjects: options.onRefreshModProjects,
    activeModProjectDetail: options.activeModProjectDetail,
    modManifestEditor: options.modManifestEditor,
    modContentEditor: options.modContentEditor,
    modContentSummary: options.modContentSummary,
    modDiagnostics: options.modDiagnostics,
    activeModPatchId: options.activeModPatchId,
    onSelectModPatch: options.onSelectModPatch,
    activeModPatch: options.activeModPatch,
    modPatchWhenError: options.modPatchWhenError,
    modHasUnsavedChanges: options.modHasUnsavedChanges,
    modCanPersist: options.modCanPersist,
    modStatusMessage: options.modStatusMessage,
    modLastSaveResult: options.modLastSaveResult,
    onModManifestFieldChange: options.onModManifestFieldChange,
    onModManifestTextChange: options.onModManifestTextChange,
    onModContentTextChange: options.onModContentTextChange,
    onAddModPatch: options.onAddModPatch,
    onRemoveModPatch: options.onRemoveModPatch,
    onModPatchFieldChange: options.onModPatchFieldChange,
    onModPatchWhenChange: options.onModPatchWhenChange,
    onSaveModProject: options.onSaveModProject,
    onExportModProject: options.onExportModProject,
  })
}
