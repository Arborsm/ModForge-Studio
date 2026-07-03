import type { ModProjectDetail, ModProjectDiagnostic, SaveModProjectResult } from '@entities/mod/api'
import { useModWorkspaceCopy } from '@locales/provider'
import type { WorkspacePluginDefinition } from '../content-model/types'

type ModDiagnosticsPanelProps = {
  pluginDefinition: WorkspacePluginDefinition | null
  activeProject: ModProjectDetail | null
  diagnostics: ModProjectDiagnostic[]
  hasUnsavedChanges: boolean
  lastSaveResult: SaveModProjectResult | null
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
    return 'border-red-500/25 bg-red-500/10 text-red-200'
  }
  if (severity === 'warning') {
    return 'border-amber-500/25 bg-amber-500/10 text-amber-200'
  }
  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
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
  pluginDefinition,
  activeProject,
  diagnostics,
  hasUnsavedChanges,
  lastSaveResult,
  statusMessage,
  contentSummary,
  onSelectDiagnostic,
}: ModDiagnosticsPanelProps) {
  const copy = useModWorkspaceCopy()
  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4">
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">{copy.diagnosticsTitle}</p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Status Summary</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{copy.projectFacts}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{hasUnsavedChanges ? copy.dirtyLabel : copy.cleanLabel}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{copy.capabilities}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{pluginDefinition?.capabilities.length ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{copy.includesLabel}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{contentSummary.includeCount}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{copy.dynamicTokensLabel}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{contentSummary.dynamicTokenCount}</p>
          </div>
        </div>
      </section>

      {activeProject ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4 text-sm text-[var(--text-secondary)]">
          <p>
            <strong className="text-[var(--text-primary)]">{copy.sourcePath}:</strong> {activeProject.summary.absolutePath}
          </p>
          <p className="mt-2">
            <strong className="text-[var(--text-primary)]">{copy.manifestPathLabel}:</strong> {activeProject.summary.manifestPath}
          </p>
          <p className="mt-2">
            <strong className="text-[var(--text-primary)]">{copy.contentPathLabel}:</strong>{' '}
            {activeProject.summary.contentPath ?? copy.unknownLabel}
          </p>
          {lastSaveResult ? (
            <p className="mt-2">
              <strong className="text-[var(--text-primary)]">{copy.outputPath}:</strong> {lastSaveResult.targetPath}
            </p>
          ) : null}
          {statusMessage ? <p className="mt-3 text-[var(--text-primary)]">{statusMessage}</p> : null}
        </section>
      ) : null}

      <section className="flex-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-app)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">{copy.diagnosticsListTitle}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{copy.diagnosticsSubtitle}</p>
          </div>
          <span className="dock-chip">
            {contentSummary.configKeys.length} {copy.configKeysLabel}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {diagnostics.length ? (
            diagnostics.map((diagnostic, index) =>
              (() => {
                const isSelectable = Boolean(onSelectDiagnostic && isSelectableDiagnosticField(diagnostic.field))
                const className = `w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3 text-left${isSelectable ? ' hover:border-[color-mix(in_srgb,var(--accent)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-elevated))]' : ''}`
                const content = (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{diagnostic.message}</p>
                      {diagnostic.field ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{diagnostic.field}</p> : null}
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase ${toneClass(diagnostic.severity)}`}
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
            <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 text-center text-sm text-[var(--text-secondary)]">
              {copy.noDiagnosticsLabel}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
