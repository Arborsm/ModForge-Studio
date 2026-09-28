import type { ModProjectDetail, ModProjectDiagnostic } from '@entities/mod/api'
import { useModCopy } from '@locales/provider'

type ModDiagnosticsPanelProps = {
  activeProject: ModProjectDetail | null
  diagnostics: ModProjectDiagnostic[]
  statusMessage: string
  contentSummary: {
    includeCount: number
    dynamicTokenCount: number
    configKeys: string[]
  }
  onSelectDiagnostic?: (diagnostic: ModProjectDiagnostic) => void
}

function toneClass(severity: ModProjectDiagnostic['severity']) {
  if (severity === 'error') {
    return 'border-danger bg-danger-soft text-danger'
  }
  if (severity === 'warning') {
    return 'border-warning bg-warning-soft text-warning'
  }
  return 'border-success bg-success-soft text-success'
}

const manifestOverviewFields = new Set(['Name', 'Author', 'Version', 'UniqueID', 'Description', 'ContentPackFor'])

function isSelectableDiagnosticField(field?: string | null) {
  if (!field) {
    return false
  }

  if (field === 'patch.When') {
    return true
  }

  if (field === 'manifest' || field === 'content' || field === 'content.Format') {
    return true
  }

  if (field.match(/^(?:content\.)?Changes\[\d+\]\.(Action|Target|FromFile)$/)) {
    return true
  }

  if (field.startsWith('manifest.')) {
    const manifestField = field.slice('manifest.'.length).split('.')[0]
    return manifestOverviewFields.has(manifestField)
  }

  return false
}

export function ModDiagnosticsPanel({
  activeProject,
  diagnostics,
  statusMessage,
  contentSummary,
  onSelectDiagnostic,
}: ModDiagnosticsPanelProps) {
  const copy = useModCopy()
  if (!activeProject) {
    return (
      <div className="bg-surface-panel flex h-full items-center justify-center px-8 text-center">
        <div>
          <p className="text-text-primary text-base font-semibold">{copy.diagnosticsTitle}</p>
          <p className="text-text-secondary mt-2 text-sm">{copy.browserLibraryHasProjectsDescription}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="custom-scrollbar bg-surface-panel h-full overflow-auto">
      <header className="border-border-subtle/65 bg-surface-elevated border-b px-5 py-4">
        <h2 className="text-text-primary text-xl font-semibold">{activeProject.summary.name}</h2>
        <p className="text-text-tertiary mt-1 font-mono text-xs">{activeProject.summary.uniqueId ?? activeProject.summary.folderName}</p>
        <div className="text-meta-px mt-3 flex flex-wrap gap-1.5">
          <span className="bg-success-soft text-success rounded-sm px-2 py-1 font-semibold">Content Patcher</span>
          <span className="bg-accent-soft text-accent rounded-sm px-2 py-1">{activeProject.summary.version ?? copy.noVersionLabel}</span>
          <span className="bg-surface-panel-muted text-text-secondary rounded-sm px-2 py-1">
            {activeProject.summary.author ?? copy.unknownLabel}
          </span>
        </div>
        <div className="border-border-subtle/55 mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-3">
          <span className="text-text-tertiary text-xs">
            {copy.includesLabel} <strong className="text-text-primary ml-1">{contentSummary.includeCount}</strong>
          </span>
          <span className="text-text-tertiary text-xs">
            {copy.dynamicTokensLabel} <strong className="text-text-primary ml-1">{contentSummary.dynamicTokenCount}</strong>
          </span>
          <span className="text-text-tertiary text-xs">
            {copy.configKeysLabel} <strong className="text-text-primary ml-1">{contentSummary.configKeys.length}</strong>
          </span>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        <section>
          <p className="text-text-tertiary text-meta-px mb-2 font-semibold uppercase">{copy.sourcePath}</p>
          <div className="divide-border-subtle/45 border-border-subtle/55 divide-y border-y text-xs">
            {[
              [copy.sourcePath, activeProject.summary.absolutePath],
              [copy.manifestPathLabel, activeProject.summary.manifestPath],
              [copy.contentPathLabel, activeProject.summary.contentPath ?? copy.unknownLabel],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-2.5">
                <span className="text-text-tertiary">{label}</span>
                <span className="text-text-primary font-mono break-all">{value}</span>
              </div>
            ))}
          </div>
          {statusMessage ? <p className="text-text-secondary mt-3 text-xs">{statusMessage}</p> : null}
        </section>

        <section>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-text-tertiary text-meta-px font-semibold uppercase">{copy.diagnosticsListTitle}</p>
            </div>
          </div>

          <div className="divide-border-subtle/45 border-border-subtle/55 mt-2 divide-y border-y">
            {diagnostics.length ? (
              diagnostics.map((diagnostic, index) =>
                (() => {
                  const isSelectable = Boolean(onSelectDiagnostic && isSelectableDiagnosticField(diagnostic.field))
                  const className = `w-full py-3 text-left${isSelectable ? ' hover:bg-surface-panel-muted' : ''}`
                  const content = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-text-primary text-sm font-medium">{diagnostic.message}</p>
                        {diagnostic.field ? <p className="text-text-secondary mt-1 text-xs">{diagnostic.field}</p> : null}
                      </div>
                      <span
                        className={`text-caption-px inline-flex rounded-sm border px-1.5 py-0.5 font-semibold uppercase ${toneClass(diagnostic.severity)}`}
                      >
                        {diagnostic.severity}
                      </span>
                    </div>
                  )

                  return isSelectable ? (
                    <button
                      key={`${diagnostic.field ?? 'global'}:${index}`}
                      type="button"
                      className={className}
                      onClick={() => onSelectDiagnostic?.(diagnostic)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={`${diagnostic.field ?? 'global'}:${index}`} className={className}>
                      {content}
                    </div>
                  )
                })(),
              )
            ) : (
              <div className="text-text-secondary flex min-h-24 items-center justify-center px-4 text-center text-sm">
                {copy.noDiagnosticsLabel}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
