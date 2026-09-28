import { Activity } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { PanelFrame } from '@shared/ui/PanelFrame'
import type { DiagnosticsPanelProps } from '../common/rightShared'

export function DiagnosticsPanel({ directoryInfo, visibleLayerIds, visibleObjectGroupIds, workspaceStatus }: DiagnosticsPanelProps) {
  const copy = useEditorCopy()

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.diagnostics}
      subtitle={copy.rightDock.projectFacts}
      headerAction={<Activity className="text-text-secondary h-4 w-4" />}
    >
      <div className="space-y-2.5 p-2.5">
        {directoryInfo ? (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.visibleLayers}</span>
                <strong className="metric-value">{visibleLayerIds.length}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.visibleObjects}</span>
                <strong className="metric-value">{visibleObjectGroupIds.length}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.scanned}</span>
                <strong className="metric-value">{directoryInfo.mapCount}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.rightDock.workspaceStatus}</span>
                <strong className="metric-value">{copy.statusTone[workspaceStatus.tone]}</strong>
              </div>
            </div>

            <div className="border-border-subtle bg-surface-panel-muted rounded-xl border px-2.5">
              <div className="kv-row compact-kv-row">
                <span>{copy.common.executable}</span>
                <span>{directoryInfo.executablePath}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.leftDock.preferredMaps}</span>
                <span>{directoryInfo.mapsPath ?? copy.common.none}</span>
              </div>
            </div>
            <div className="border-border-subtle bg-surface-panel-muted text-text-secondary rounded-xl border px-3 py-3 text-xs">
              {workspaceStatus.message || copy.common.none}
            </div>
          </>
        ) : (
          <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
            {copy.rightDock.diagnosticsPrompt}
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
