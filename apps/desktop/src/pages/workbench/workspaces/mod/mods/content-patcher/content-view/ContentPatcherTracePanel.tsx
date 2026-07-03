import type { LoadContentPatcherResultAssetResult } from '@entities/mod/api'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'
import { contentPatcherStatusClass } from '../content-model/presentation'
import { useModWorkspaceCopy } from '@locales/localeContext'

type ContentPatcherTracePanelProps = {
  result: LoadContentPatcherResultAssetResult | null
}

export function ContentPatcherTracePanel({ result }: ContentPatcherTracePanelProps) {
  const copy = useModWorkspaceCopy().contentPatcherTrace
  const trace = result?.trace ?? []

  return (
    <PanelFrame
      title={copy.title}
      subtitle={result?.target.path ?? copy.defaultSubtitle}
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
              subtitle={entry.changeSummary || entry.reasonSummary || copy.noDetails}
              action={<span className={contentPatcherStatusClass(entry.status)}>{entry.status}</span>}
              bodyClassName="space-y-2"
            >
              <div className="kv-row compact-kv-row">
                <span>{copy.action}</span>
                <span>{entry.action}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.source}</span>
                <span>{entry.sourcePath}</span>
              </div>
            </PanelSection>
          ))
        ) : (
          <PanelEmptyState>{copy.empty}</PanelEmptyState>
        )}
      </div>
    </PanelFrame>
  )
}
