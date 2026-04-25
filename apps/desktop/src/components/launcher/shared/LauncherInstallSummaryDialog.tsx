import type { InstallLauncherArchiveResult } from '../../../lib/desktop'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { PanelSection } from '../../ui/PanelSection'

type LauncherInstallSummaryDialogProps = {
  open: boolean
  result: InstallLauncherArchiveResult | null
  onClose: () => void
  onManageBackups: () => void
}

export function LauncherInstallSummaryDialog({
  open,
  result,
  onClose,
  onManageBackups,
}: LauncherInstallSummaryDialogProps) {
  const editorCopy = useEditorCopy()
  const copy = editorCopy.launcher

  if (!open || !result) {
    return null
  }

  return (
    <div className="launcher-modal-backdrop launcher-library-dialog-backdrop" role="presentation">
      <section className="launcher-library-dialog launcher-library-install-dialog" role="dialog" aria-modal="true" aria-label={copy.library.installSummaryTitle}>
        <div className="launcher-library-dialog-header">
          <h2 className="launcher-library-dialog-title">{copy.library.installSummaryTitle}</h2>
          <p className="launcher-library-dialog-copy">{copy.library.installSummarySubtitle}</p>
        </div>

        <div className="launcher-library-install-dialog-grid">
          <PanelSection title={result.modName} subtitle={result.targetPath}>
            <div className="launcher-stats-row">
              <div className="launcher-stat-card">
                <span>{copy.overview.installedMods}</span>
                <strong>{result.installedMods.length}</strong>
              </div>
              <div className="launcher-stat-card">
                <span>{copy.library.installSummaryPreservedConfig}</span>
                <strong>{result.preservedConfig ? editorCopy.common.yes : editorCopy.common.no}</strong>
              </div>
              <div className="launcher-stat-card">
                <span>{copy.library.installSummaryPreservedI18n}</span>
                <strong>{result.preservedI18nFiles}</strong>
              </div>
            </div>
          </PanelSection>

          <PanelSection title={copy.overview.installedMods} subtitle={copy.library.installSummaryInstalledMods(result.installedMods.length)}>
            <div className="launcher-library-install-list">
              {result.installedMods.map((item) => (
                <article key={`${item.targetPath}:${item.uniqueId ?? item.modName}`} className="launcher-library-install-card">
                  <div className="launcher-library-install-card-header">
                    <strong>{item.modName}</strong>
                    {item.version ? <span>{`v${item.version}`}</span> : null}
                  </div>
                  <p className="launcher-library-install-card-path">{item.targetPath}</p>
                  {item.uniqueId ? (
                    <p className="launcher-library-install-card-meta">
                      <span>{copy.fields.uniqueId}</span>
                      <span>{item.uniqueId}</span>
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </PanelSection>

          <PanelSection title={copy.library.installBackupsTitle} subtitle={copy.library.installSummaryBackupSubtitle}>
            <div className="launcher-library-install-backup-card">
              <p className="launcher-library-install-card-meta">
                <span>{copy.library.installBackupIdLabel}</span>
                <strong>{result.backupId}</strong>
              </p>
              <p className="launcher-library-install-card-path">{result.backupPath}</p>
            </div>
          </PanelSection>
        </div>

        <div className="launcher-library-dialog-actions">
          <button type="button" className="control-button launcher-library-secondary-action" onClick={onClose}>
            {copy.actions.closeDialog}
          </button>
          <button type="button" className="control-button control-button-primary launcher-library-primary-action" onClick={onManageBackups}>
            {copy.library.manageInstallBackups}
          </button>
        </div>
      </section>
    </div>
  )
}
