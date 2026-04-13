import type {
  ContentPatcherProjectSnapshot,
  ContentPatcherSimulationResult,
  LoadContentPatcherResultAssetResult,
  ModProjectDetail,
  ModProjectDiagnostic,
  SaveModProjectResult,
} from '../../lib/desktop'
import type { ContentPatcherBackendSimulationContext } from '../../lib/plugins/contentPatcher'
import { useModWorkspaceCopy } from '../../lib/app/localeContext'
import type { WorkspacePluginDefinition } from '../../lib/plugins/types'
import { ContentPatcherResultPreview } from './content-patcher/ContentPatcherResultPreview'
import { ContentPatcherScaleUpPanel } from './content-patcher/attached/scaleup/ContentPatcherScaleUpPanel'

type PatchSummary = {
  id: string
  action: string
  target: string
  fromFile: string | null
  logName: string
  hasWhen: boolean
  whenKeys: string[]
  updateKeys: string[]
}

type ContentPatcherWorkspaceProps = {
  pluginDefinition: WorkspacePluginDefinition | null
  projectDetail: ModProjectDetail | null
  diagnostics: ModProjectDiagnostic[]
  statusMessage: string
  lastSaveResult: SaveModProjectResult | null
  gameRootPath: string | null
  manifestEditor: {
    text: string
    value: unknown | null
    error: string | null
  }
  contentEditor: {
    text: string
    value: unknown | null
    error: string | null
  }
  contentSummary: {
    format: string | null
    changeCount: number
    includeCount: number
    dynamicTokenCount: number
    configKeys: string[]
    configEntries?: Array<{
      key: string
      defaultValue: unknown
    }>
    patches: PatchSummary[]
  }
  selectedPatchId: string | null
  selectedPatch: Record<string, unknown> | null
  patchWhenError: string | null
  hasUnsavedChanges: boolean
  canPersist: boolean
  contentPatcherSnapshot: ContentPatcherProjectSnapshot | null
  contentPatcherSimulation: ContentPatcherSimulationResult | null
  contentPatcherResultAsset: LoadContentPatcherResultAssetResult | null
  contentPatcherResultLoading: boolean
  contentPatcherResultError: string | null
  simulationContext: ContentPatcherBackendSimulationContext
  onSimulationContextChange: (next: ContentPatcherBackendSimulationContext) => void
  onManifestFieldChange: (field: string, value: string) => void
  onManifestTextChange: (value: string) => void
  onContentTextChange: (value: string) => void
  onPatchFieldChange: (field: string, value: string) => void
  onPatchWhenChange: (value: string) => void
  onAddPatch: () => void
  onRemoveSelectedPatch: () => void
  onSaveProject: () => void
  onExportProject: () => void
  selectedTargetPath?: string | null
  scaleUpEditor?: {
    targetPath: string
    focusSection: 'preview' | 'settings'
  } | null
  onScaleUpContentChange?: (nextContent: unknown) => void
  onCloseScaleUpEditor?: () => void
}

export function ContentPatcherWorkspace({
  projectDetail,
  contentEditor,
  contentSummary,
  hasUnsavedChanges,
  canPersist,
  contentPatcherSimulation,
  contentPatcherResultAsset,
  contentPatcherResultLoading,
  contentPatcherResultError,
  simulationContext,
  selectedTargetPath,
  scaleUpEditor,
  onSimulationContextChange,
  onSaveProject,
  onExportProject,
  onScaleUpContentChange,
  onCloseScaleUpEditor,
}: ContentPatcherWorkspaceProps) {
  const copy = useModWorkspaceCopy()
  if (!projectDetail?.contentPatcher) {
    return <div className="panel-empty-state h-full">{copy.noProject}</div>
  }

  const activeScaleUpPanel = scaleUpEditor
    && selectedTargetPath === scaleUpEditor.targetPath
    && contentPatcherResultAsset?.target.path === scaleUpEditor.targetPath
    && contentPatcherResultAsset.result.kind === 'image'
    && contentPatcherResultAsset.result.imageDataUrl
      ? {
          focusSection: scaleUpEditor.focusSection,
          imageDataUrl: contentPatcherResultAsset.result.imageDataUrl,
          result: contentPatcherResultAsset,
        }
      : null

  return (
    <div className="cp-debugger-shell h-full">
      <header className="cp-debugger-header">
        <div className="cp-debugger-title-group">
          <h1 className="cp-debugger-title">{projectDetail.summary.name}</h1>
        </div>
        <div className="cp-debugger-chip-row">
          <span className={`status-pill ${hasUnsavedChanges ? 'status-pill-working' : 'status-pill-ready'}`}>
            {hasUnsavedChanges ? copy.dirtyLabel : copy.cleanLabel}
          </span>
          <span className="dock-chip">{`${contentSummary.changeCount} patches`}</span>
          <span className="dock-chip">{`${contentPatcherSimulation?.targets.length ?? 0} targets`}</span>
          <button type="button" className="control-button" disabled={!canPersist} onClick={onSaveProject}>
            {copy.saveProject}
          </button>
          <button type="button" className="control-button" disabled={!canPersist} onClick={onExportProject}>
            {copy.exportProject}
          </button>
        </div>
      </header>

      <section className="cp-debugger-body">
        <ContentPatcherResultPreview
          result={contentPatcherResultAsset}
          loading={contentPatcherResultLoading}
          error={contentPatcherResultError}
          simulationContext={simulationContext}
          simulationConfigEntries={contentSummary.configEntries ?? contentSummary.configKeys.map((key) => ({ key, defaultValue: null }))}
          onSimulationContextChange={onSimulationContextChange}
        />
        {activeScaleUpPanel && onScaleUpContentChange && onCloseScaleUpEditor ? (
          <ContentPatcherScaleUpPanel
            targetPath={activeScaleUpPanel.result.target.path}
            focusSection={activeScaleUpPanel.focusSection}
            content={contentEditor.value}
            resultImageDataUrl={activeScaleUpPanel.imageDataUrl}
            originalImageDataUrl={activeScaleUpPanel.result.result.originalImageDataUrl}
            onContentChange={onScaleUpContentChange}
            onClose={onCloseScaleUpEditor}
          />
        ) : null}
      </section>
    </div>
  )
}
