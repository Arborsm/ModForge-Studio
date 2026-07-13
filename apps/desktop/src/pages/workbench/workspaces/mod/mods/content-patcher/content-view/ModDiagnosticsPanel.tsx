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
    return 'border-(--danger) bg-(--danger-soft) text-(--danger)'
  }
  if (severity === 'warning') {
    return 'border-(--warning) bg-(--warning-soft) text-(--warning)'
  }
  return 'border-(--success) bg-(--success-soft) text-(--success)'
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
      <div className="flex h-full items-center justify-center bg-(--bg-panel) px-8 text-center">
        <div>
          <p className="text-base font-semibold text-(--text-primary)">{copy.diagnosticsTitle}</p>
          <p className="mt-2 text-sm text-(--text-secondary)">{copy.browserLibraryHasProjectsDescription}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="custom-scrollbar h-full overflow-auto bg-(--bg-panel)">
      <header className="border-b border-(--border-color)/65 bg-(--bg-elevated) px-5 py-4">
        <h2 className="text-xl font-semibold text-(--text-primary)">{activeProject.summary.name}</h2>
        <p className="mt-1 font-mono text-xs text-(--text-tertiary)">
          {activeProject.summary.uniqueId ?? activeProject.summary.folderName}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-sm bg-(--success-soft) px-2 py-1 font-semibold text-(--success)">Content Patcher</span>
          <span className="rounded-sm bg-(--accent-soft) px-2 py-1 text-(--accent)">
            {activeProject.summary.version ?? copy.noVersionLabel}
          </span>
          <span className="rounded-sm bg-(--bg-panel-muted) px-2 py-1 text-(--text-secondary)">
            {activeProject.summary.author ?? copy.unknownLabel}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-(--border-color)/55 pt-3">
          <span className="text-xs text-(--text-tertiary)">
            {copy.includesLabel} <strong className="ml-1 text-(--text-primary)">{contentSummary.includeCount}</strong>
          </span>
          <span className="text-xs text-(--text-tertiary)">
            {copy.dynamicTokensLabel} <strong className="ml-1 text-(--text-primary)">{contentSummary.dynamicTokenCount}</strong>
          </span>
          <span className="text-xs text-(--text-tertiary)">
            {copy.configKeysLabel} <strong className="ml-1 text-(--text-primary)">{contentSummary.configKeys.length}</strong>
          </span>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        <section>
          <p className="mb-2 text-[11px] font-semibold text-(--text-tertiary) uppercase">{copy.sourcePath}</p>
          <div className="divide-y divide-(--border-color)/45 border-y border-(--border-color)/55 text-xs">
            {[
              [copy.sourcePath, activeProject.summary.absolutePath],
              [copy.manifestPathLabel, activeProject.summary.manifestPath],
              [copy.contentPathLabel, activeProject.summary.contentPath ?? copy.unknownLabel],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 py-2.5">
                <span className="text-(--text-tertiary)">{label}</span>
                <span className="font-mono break-all text-(--text-primary)">{value}</span>
              </div>
            ))}
          </div>
          {statusMessage ? <p className="mt-3 text-xs text-(--text-secondary)">{statusMessage}</p> : null}
        </section>

        <section>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-(--text-tertiary) uppercase">{copy.diagnosticsListTitle}</p>
            </div>
          </div>

          <div className="mt-2 divide-y divide-(--border-color)/45 border-y border-(--border-color)/55">
            {diagnostics.length ? (
              diagnostics.map((diagnostic, index) =>
                (() => {
                  const isSelectable = Boolean(onSelectDiagnostic && isSelectableDiagnosticField(diagnostic.field))
                  const className = `w-full py-3 text-left${isSelectable ? ' hover:bg-(--bg-panel-muted)' : ''}`
                  const content = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-(--text-primary)">{diagnostic.message}</p>
                        {diagnostic.field ? <p className="mt-1 text-xs text-(--text-secondary)">{diagnostic.field}</p> : null}
                      </div>
                      <span
                        className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${toneClass(diagnostic.severity)}`}
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
              <div className="flex min-h-24 items-center justify-center px-4 text-center text-sm text-(--text-secondary)">
                {copy.noDiagnosticsLabel}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
