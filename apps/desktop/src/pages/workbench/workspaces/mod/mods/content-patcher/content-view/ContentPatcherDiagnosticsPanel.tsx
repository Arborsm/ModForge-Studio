import type { LoadContentPatcherResultAssetResult } from '@entities/mod/api'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'
import { contentPatcherStatusClass } from '../content-model/presentation'

type ContentPatcherDiagnosticsPanelProps = {
  result: LoadContentPatcherResultAssetResult | null
}

export function ContentPatcherDiagnosticsPanel({ result }: ContentPatcherDiagnosticsPanelProps) {
  const diagnostics = result?.diagnostics ?? []

  return (
    <PanelFrame
      title="Diagnostics"
      subtitle={result?.target.path ?? 'Selected target diagnostics'}
      className="h-full"
      bodyClassName="overflow-auto"
      headerAction={<span className="dock-chip">{diagnostics.length}</span>}
    >
      <div className="space-y-3 p-3">
        {diagnostics.length ? (
          diagnostics.map((diagnostic, index) => (
            <PanelSection
              key={`${diagnostic.message}:${index}`}
              title={diagnostic.message}
              subtitle={diagnostic.field ?? 'No field'}
              action={<span className={contentPatcherStatusClass(diagnostic.severity)}>{diagnostic.severity}</span>}
            >
              <div className="text-xs leading-5 text-[var(--text-secondary)]">
                {diagnostic.field ?? 'No additional diagnostic field information.'}
              </div>
            </PanelSection>
          ))
        ) : (
          <PanelEmptyState>No diagnostics for the selected target.</PanelEmptyState>
        )}
      </div>
    </PanelFrame>
  )
}
