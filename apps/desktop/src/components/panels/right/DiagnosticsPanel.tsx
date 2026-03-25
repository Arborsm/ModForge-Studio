import { Activity } from 'lucide-react'
import { PanelFrame } from '../../ui/PanelFrame'
import type { DiagnosticsPanelProps } from './shared'

export function DiagnosticsPanel({
  copy,
  directoryInfo,
  visibleLayerIds,
  visibleObjectGroupIds,
  workspaceStatus,
}: DiagnosticsPanelProps) {
  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.diagnostics}
      subtitle={copy.rightDock.projectFacts}
      headerAction={<Activity className="h-4 w-4 text-[var(--text-secondary)]" />}
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
                <span className="metric-label">{copy.statusBar.scanned}</span>
                <strong className="metric-value">{directoryInfo.mapCount}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.rightDock.workspaceStatus}</span>
                <strong className="metric-value">{copy.statusTone[workspaceStatus.tone]}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2.5">
              <div className="kv-row compact-kv-row">
                <span>{copy.common.executable}</span>
                <span>{directoryInfo.executablePath}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.leftDock.preferredMaps}</span>
                <span>{directoryInfo.preferredMapsPath ?? copy.common.none}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.unpackedMaps}</span>
                <span>{directoryInfo.unpackedMapsPath ?? copy.common.none}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.xnbMaps}</span>
                <span>{directoryInfo.xnbMapsPath ?? copy.common.none}</span>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-3 text-xs text-[var(--text-secondary)]">
              {workspaceStatus.message || copy.common.none}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
            {copy.rightDock.diagnosticsPrompt}
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
