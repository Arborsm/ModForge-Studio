import {
  ContentPatcherDiagnosticsPanel,
  ContentPatcherExportPanel,
  ContentPatcherNavigator,
  ContentPatcherTracePanel,
  ContentPatcherWorkspace,
  ModBrowserPanel,
} from '../../workspaces/mod'
import type { ReactNode } from 'react'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import type { BuildModsWorkspacePanelsOptions } from './modWorkspaceTypes'

export function buildModsWorkspacePanels({
  modWorkspaceCopy: modCopy,
  modPluginDefinition,
  gameRootPath,
  modProjects,
  filteredModProjects,
  activeProjectPath,
  activeProject,
  modFilter,
  contentPatcherOnly,
  compatibleOnly,
  onModFilterChange,
  onContentPatcherOnlyChange,
  onCompatibleOnlyChange,
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
  scaleUpEditor,
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
  onOpenScaleUp,
  onScaleUpContentChange,
  onCloseScaleUpEditor,
}: BuildModsWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const panels: WorkspacePanelConfig[] = [
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
          compatibleOnly={compatibleOnly}
          onFilterChange={onModFilterChange}
          onContentPatcherOnlyChange={onContentPatcherOnlyChange}
          onCompatibleOnlyChange={onCompatibleOnlyChange}
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
          onOpenScaleUp={onOpenScaleUp}
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
          selectedTargetPath={selectedTargetPath}
          scaleUpEditor={scaleUpEditor}
          onScaleUpContentChange={onScaleUpContentChange}
          onCloseScaleUpEditor={onCloseScaleUpEditor}
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

  return panels.map((panel, index) => ({
    ...panel,
    content: withPreviewReveal(`workbench-mods-${panel.id}`, index, panel.content),
  }))
}

export type { BuildModsWorkspacePanelsOptions }
