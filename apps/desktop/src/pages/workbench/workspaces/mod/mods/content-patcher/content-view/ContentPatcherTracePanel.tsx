import type { LoadContentPatcherResultAssetResult } from '@entities/mod/api'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'
import { contentPatcherStatusClass } from '../content-model/presentation'

type ContentPatcherTracePanelProps = {
  result: LoadContentPatcherResultAssetResult | null
}

export function ContentPatcherTracePanel({ result }: ContentPatcherTracePanelProps) {
  const trace = result?.trace ?? []

  return (
    <PanelFrame
      title="Patch Trace"
      subtitle={result?.target.path ?? 'Selected target patch flow'}
      className="h-full"
      bodyClassName="overflow-auto"
      headerAction={<span className="dock-chip">{trace.length}</span>}
    >
      <div className="space-y-3 p-3">
        {trace.length ? (
          trace.map((entry) => (
            <PanelSection
              key={entry.patchId}
              title={entry.logName}
              subtitle={entry.changeSummary || entry.reasonSummary || 'No details'}
              action={<span className={contentPatcherStatusClass(entry.status)}>{entry.status}</span>}
              bodyClassName="space-y-2"
            >
              <div className="kv-row compact-kv-row">
                <span>Action</span>
                <span>{entry.action}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>Source</span>
                <span>{entry.sourcePath}</span>
              </div>
            </PanelSection>
          ))
        ) : (
          <PanelEmptyState>No trace entries for this target.</PanelEmptyState>
        )}
      </div>
    </PanelFrame>
  )
}
