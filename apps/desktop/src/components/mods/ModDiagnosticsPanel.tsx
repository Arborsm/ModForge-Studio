import type { ModProjectDetail, ModProjectDiagnostic, SaveModProjectResult } from '../../lib/desktop'
import type { ModWorkspaceCopy } from '../../lib/plugins/copy'
import type { WorkspacePluginDefinition } from '../../lib/plugins/types'

type ModDiagnosticsPanelProps = {
  copy: ModWorkspaceCopy
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
}

export function ModDiagnosticsPanel({
  copy,
  pluginDefinition,
  activeProject,
  diagnostics,
  hasUnsavedChanges,
  lastSaveResult,
  statusMessage,
  contentSummary,
}: ModDiagnosticsPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-[var(--bg-panel)] p-3">
      <section className="panel-section panel-section-muted">
        <div className="panel-section-body space-y-2 text-sm text-[var(--text-secondary)]">
          <div className="kv-row">
            <span>{copy.capabilities}</span>
            <span>{pluginDefinition?.capabilities.length ?? 0}</span>
          </div>
          <div className="kv-row">
            <span>{copy.futureScopes}</span>
            <span>{pluginDefinition?.futureScopes.length ?? 0}</span>
          </div>
          <div className="kv-row">
            <span>{copy.includesLabel}</span>
            <span>{contentSummary.includeCount}</span>
          </div>
          <div className="kv-row">
            <span>{copy.dynamicTokensLabel}</span>
            <span>{contentSummary.dynamicTokenCount}</span>
          </div>
          <div className="kv-row">
            <span>{copy.configKeysLabel}</span>
            <span>{contentSummary.configKeys.length}</span>
          </div>
          <div className="kv-row">
            <span>{copy.projectFacts}</span>
            <span>{hasUnsavedChanges ? copy.dirtyLabel : copy.cleanLabel}</span>
          </div>
        </div>
      </section>

      {activeProject ? (
        <section className="panel-section">
          <div className="panel-section-body space-y-2 text-xs text-[var(--text-secondary)]">
            <p><strong className="text-[var(--text-primary)]">{copy.sourcePath}:</strong> {activeProject.summary.absolutePath}</p>
            <p><strong className="text-[var(--text-primary)]">{copy.manifestPathLabel}:</strong> {activeProject.summary.manifestPath}</p>
            <p><strong className="text-[var(--text-primary)]">{copy.contentPathLabel}:</strong> {activeProject.summary.contentPath ?? copy.unknownLabel}</p>
            {lastSaveResult ? (
              <p><strong className="text-[var(--text-primary)]">{copy.outputPath}:</strong> {lastSaveResult.targetPath}</p>
            ) : null}
            {statusMessage ? <p className="text-[var(--text-primary)]">{statusMessage}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="panel-section flex-1">
        <header className="panel-section-header">
          <div>
            <p className="panel-section-title">{copy.diagnosticsListTitle}</p>
            <p className="panel-section-subtitle">{copy.diagnosticsSubtitle}</p>
          </div>
        </header>
        <div className="panel-section-body space-y-2">
          {diagnostics.length ? (
            diagnostics.map((diagnostic, index) => (
              <div key={`${diagnostic.field ?? 'global'}:${index}`} className="panel-section-muted panel-section">
                <div className="panel-section-body space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`status-pill status-pill-${diagnostic.severity === 'error' ? 'error' : diagnostic.severity === 'warning' ? 'working' : 'ready'}`}>
                      {diagnostic.severity}
                    </span>
                    {diagnostic.field ? <span className="text-[11px] text-[var(--text-tertiary)]">{diagnostic.field}</span> : null}
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">{diagnostic.message}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="panel-empty-state">{copy.noDiagnosticsLabel}</div>
          )}
        </div>
      </section>
    </div>
  )
}
