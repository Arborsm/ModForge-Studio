import { useMemo, useState } from 'react'
import { exportContentPatcherAsset, type ContentPatcherProjectSnapshot, type LoadContentPatcherResultAssetResult } from '@entities/mod/api'
import { chooseDirectory } from '@shared/lib/desktop'
import { useModWorkspaceCopy } from '@locales/provider'
import { buildContentPatcherSimulationRequest, type ContentPatcherBackendSimulationContext } from '../content-model/contentPatcher'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'

type ContentPatcherExportPanelProps = {
  projectPath: string | null
  gameRootPath: string | null
  snapshot: ContentPatcherProjectSnapshot | null
  manifestJson: string
  contentJson: string
  simulationContext: ContentPatcherBackendSimulationContext
  selectedTargetPath: string | null
  result: LoadContentPatcherResultAssetResult | null
}

export function ContentPatcherExportPanel({
  projectPath,
  gameRootPath,
  snapshot,
  manifestJson,
  contentJson,
  simulationContext,
  selectedTargetPath,
  result,
}: ContentPatcherExportPanelProps) {
  const copy = useModWorkspaceCopy()
  const exportCopy = copy.contentPatcherExport
  const [exportStatus, setExportStatus] = useState('')

  const simulationRequest = useMemo(() => {
    if (!snapshot) {
      return null
    }
    return buildContentPatcherSimulationRequest(snapshot, simulationContext, {
      path: projectPath,
      gameRootPath,
      manifestJson,
      contentJson,
    })
  }, [contentJson, gameRootPath, manifestJson, projectPath, simulationContext, snapshot])

  async function handleExportResult() {
    if (!simulationRequest || !result || !result.exportable || !selectedTargetPath) {
      return
    }

    const folder = await chooseDirectory(copy.selectExportFolder)
    if (!folder) {
      return
    }

    try {
      const exported = await exportContentPatcherAsset({
        ...simulationRequest,
        target: selectedTargetPath,
        outputDirectory: folder,
      })
      setExportStatus(copy.exportSuccess(exported.outputPath))
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <PanelFrame
      title={exportCopy.title}
      subtitle={selectedTargetPath ?? exportCopy.defaultSubtitle}
      className="h-full"
      bodyClassName="overflow-auto"
      headerAction={
        <span className={result?.exportable ? 'cp-debugger-pill cp-debugger-pill-ok' : 'cp-debugger-pill cp-debugger-pill-warn'}>
          {result?.exportable ? exportCopy.readyLabel : exportCopy.blockedLabel}
        </span>
      }
    >
      <div className="space-y-3 p-3">
        {!selectedTargetPath || !result ? (
          <PanelEmptyState>{exportCopy.empty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection title={exportCopy.resultTargetTitle} subtitle={selectedTargetPath}>
              <div className="text-xs leading-5 text-[var(--text-secondary)]">
                {result.exportable ? exportCopy.exportableDescription : exportCopy.blockedDescription}
              </div>
            </PanelSection>

            <button
              type="button"
              className="control-button control-button-primary w-full"
              onClick={() => {
                void handleExportResult()
              }}
              disabled={!result.exportable}
            >
              {result.result.kind === 'image'
                ? exportCopy.exportPngResult
                : result.result.kind === 'map'
                  ? exportCopy.exportMapResult
                  : exportCopy.exportJsonResult}
            </button>

            {exportStatus ? (
              <PanelSection title={exportCopy.lastExportTitle} subtitle={exportCopy.lastExportSubtitle}>
                <div className="text-xs leading-5 text-[var(--text-secondary)]">{exportStatus}</div>
              </PanelSection>
            ) : null}
          </>
        )}
      </div>
    </PanelFrame>
  )
}
