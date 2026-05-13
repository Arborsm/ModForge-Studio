import { useMemo, useState } from 'react'
import {
  exportContentPatcherAsset,
  type ContentPatcherProjectSnapshot,
  type LoadContentPatcherResultAssetResult,
} from '@entities/mod/api'
import { chooseDirectory } from '@shared/lib/desktop'
import { useModWorkspaceCopy } from '@locales/localeContext'
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

function inferExportExtension(result: LoadContentPatcherResultAssetResult) {
  if (result.result.kind === 'image') {
    return 'png'
  }
  return 'json'
}

function toExportFilename(target: string, extension: string) {
  const normalizedTarget = target.replaceAll('/', '-').replaceAll('\\', '-')
  const safeTarget = normalizedTarget.replace(/[<>:"|?*]/g, '_').trim() || 'content-patcher-result'
  return `${safeTarget}.${extension}`
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

    const extension = inferExportExtension(result)
    const outputPath = `${folder}\\${toExportFilename(selectedTargetPath, extension)}`

    try {
      const exported = await exportContentPatcherAsset({
        ...simulationRequest,
        target: selectedTargetPath,
        outputPath,
      })
      setExportStatus(copy.exportSuccess(exported.outputPath))
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <PanelFrame
      title="Export"
      subtitle={selectedTargetPath ?? 'Selected target export'}
      className="h-full"
      bodyClassName="overflow-auto"
      headerAction={
        <span className={result?.exportable ? 'cp-debugger-pill cp-debugger-pill-ok' : 'cp-debugger-pill cp-debugger-pill-warn'}>
          {result?.exportable ? 'ready' : 'blocked'}
        </span>
      }
    >
      <div className="space-y-3 p-3">
        {!selectedTargetPath || !result ? (
          <PanelEmptyState>Select a target to export its result.</PanelEmptyState>
        ) : (
          <>
            <PanelSection title="Result Target" subtitle={selectedTargetPath}>
              <div className="text-xs leading-5 text-[var(--text-secondary)]">
                {result.exportable
                  ? 'The selected target can be exported from the current simulation.'
                  : 'This target is indeterminate or errored, so export is blocked.'}
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
              {result.result.kind === 'image' ? 'Export PNG Result' : 'Export JSON Result'}
            </button>

            {exportStatus ? (
              <PanelSection title="Last Export" subtitle="Most recent result">
                <div className="text-xs leading-5 text-[var(--text-secondary)]">{exportStatus}</div>
              </PanelSection>
            ) : null}
          </>
        )}
      </div>
    </PanelFrame>
  )
}
