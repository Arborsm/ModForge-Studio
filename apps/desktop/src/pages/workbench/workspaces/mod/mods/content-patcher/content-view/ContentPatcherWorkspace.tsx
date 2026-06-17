import type {
  ContentPatcherProjectSnapshot,
  ContentPatcherSimulationResult,
  LoadContentPatcherResultAssetResult,
  ModProjectDetail,
  ModProjectDiagnostic,
  SaveModProjectResult,
} from '@entities/mod/api'
import type { ContentPatcherBackendSimulationContext } from '../content-model/contentPatcher'
import { useModWorkspaceCopy } from '@locales/provider'
import type { WorkspacePluginDefinition } from '../content-model/types'
import { ContentPatcherResultPreview } from './ContentPatcherResultPreview'
import { ContentPatcherPatchPropertiesPanel } from './ContentPatcherPatchPropertiesPanel'
import { ContentPatcherScaleUpPanel } from './scaleup/ContentPatcherScaleUpPanel'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'

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
    value: object | null
    error: string | null
  }
  contentEditor: {
    text: string
    value: object | null
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
  onPatchFieldChange: (field: string, value: string | boolean) => void
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
  selectedPatch,
  patchWhenError,
  selectedTargetPath,
  scaleUpEditor,
  onSimulationContextChange,
  onSaveProject,
  onExportProject,
  onPatchFieldChange,
  onPatchWhenChange,
  onAddPatch,
  onRemoveSelectedPatch,
  onScaleUpContentChange,
  onCloseScaleUpEditor,
}: ContentPatcherWorkspaceProps) {
  const copy = useModWorkspaceCopy()
  if (!projectDetail?.contentPatcher) {
    return <div className="panel-empty-state h-full">{copy.noProject}</div>
  }

  const activeScaleUpPanel =
    scaleUpEditor &&
    selectedTargetPath === scaleUpEditor.targetPath &&
    contentPatcherResultAsset?.target.path === scaleUpEditor.targetPath &&
    contentPatcherResultAsset.result.kind === 'image' &&
    contentPatcherResultAsset.result.imageDataUrl
      ? {
          focusSection: scaleUpEditor.focusSection,
          imageDataUrl: contentPatcherResultAsset.result.imageDataUrl,
          result: contentPatcherResultAsset,
        }
      : null

  return (
    <div className="cp-debugger-shell h-full">
      <LoadingMotionReveal itemId="mod-workspace-header" index={0}>
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
      </LoadingMotionReveal>

      <section className="cp-debugger-body" style={{ flexDirection: 'column', gap: 10 }}>
        <LoadingMotionReveal itemId="mod-workspace-patch-panel" index={1}>
          <ContentPatcherPatchPropertiesPanel
            patch={selectedPatch}
            patchWhenError={patchWhenError}
            onFieldChange={onPatchFieldChange}
            onWhenChange={onPatchWhenChange}
            onAddPatch={onAddPatch}
            onRemoveSelectedPatch={onRemoveSelectedPatch}
          />
        </LoadingMotionReveal>
        <LoadingMotionReveal itemId="mod-workspace-preview-panel" index={2}>
          <ContentPatcherResultPreview
            result={contentPatcherResultAsset}
            loading={contentPatcherResultLoading}
            error={contentPatcherResultError}
            simulationContext={simulationContext}
            simulationConfigEntries={contentSummary.configEntries ?? contentSummary.configKeys.map((key) => ({ key, defaultValue: null }))}
            onSimulationContextChange={onSimulationContextChange}
            dynamicTokens={contentPatcherSimulation?.dynamicTokens}
          />
        </LoadingMotionReveal>
        {activeScaleUpPanel && onScaleUpContentChange && onCloseScaleUpEditor ? (
          <LoadingMotionReveal itemId="mod-workspace-scaleup-panel" index={3}>
            <ContentPatcherScaleUpPanel
              key={`${activeScaleUpPanel.result.target.path}:${activeScaleUpPanel.focusSection}:${contentEditor.text}`}
              targetPath={activeScaleUpPanel.result.target.path}
              focusSection={activeScaleUpPanel.focusSection}
              content={contentEditor.value}
              resultImageDataUrl={activeScaleUpPanel.imageDataUrl}
              originalImageDataUrl={activeScaleUpPanel.result.result.originalImageDataUrl}
              onContentChange={onScaleUpContentChange}
              onClose={onCloseScaleUpEditor}
            />
          </LoadingMotionReveal>
        ) : null}
      </section>
    </div>
  )
}
