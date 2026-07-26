import { useId } from 'react'
import { CheckCircle2, History, Package, PackageCheck } from 'lucide-react'
import type { InstallLauncherArchiveResult } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type LauncherInstallSummaryDialogProps = {
  open: boolean
  result: InstallLauncherArchiveResult | null
  onClose: () => void
  onManageBackups: () => void
}

export function LauncherInstallSummaryDialog({ open, result, onClose, onManageBackups }: LauncherInstallSummaryDialogProps) {
  const editorCopy = useEditorCopy()
  const copy = editorCopy.launcher
  const titleId = useId()

  if (!result) {
    return null
  }

  return (
    <Dialog open={open} onClose={onClose} size="xl" labelledBy={titleId}>
      <DialogHeader
        icon={<PackageCheck className="h-4 w-4" />}
        title={copy.library.installSummaryTitle}
        subtitle={copy.library.installSummarySubtitle}
        onClose={onClose}
        closeLabel={copy.actions.closeDialog}
        id={titleId}
      />
      <DialogBody>
        <div className="launcher-install-summary">
          <section className="launcher-install-result-hero">
            <span className="launcher-install-result-icon" aria-hidden="true">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="launcher-install-result-main">
              <h3>{result.modName}</h3>
              <p className="launcher-install-mono">{result.targetPath}</p>
              {result.version || result.uniqueId ? (
                <div className="launcher-install-result-badges">
                  {result.version ? <span className="dock-chip">{`v${result.version}`}</span> : null}
                  {result.uniqueId ? <span className="dock-chip">{result.uniqueId}</span> : null}
                </div>
              ) : null}
            </div>
          </section>

          <div className="launcher-install-metric-row">
            <div className="launcher-install-metric">
              <strong>{result.installedMods.length}</strong>
              <span>{copy.overview.installedMods}</span>
            </div>
            <div className="launcher-install-metric" data-tone={result.preservedConfig ? 'ok' : 'muted'}>
              <strong>{result.preservedConfig ? editorCopy.common.yes : editorCopy.common.no}</strong>
              <span>{copy.library.installSummaryPreservedConfig}</span>
            </div>
            <div className="launcher-install-metric">
              <strong>{result.preservedI18nFiles}</strong>
              <span>{copy.library.installSummaryPreservedI18n}</span>
            </div>
          </div>

          <section className="launcher-install-summary-section">
            <div className="launcher-install-section-head">
              <h3>{copy.overview.installedMods}</h3>
              <span>{copy.library.installSummaryInstalledMods(result.installedMods.length)}</span>
            </div>
            <div className="launcher-install-mod-list">
              {result.installedMods.map((item) => (
                <article key={`${item.targetPath}:${item.uniqueId ?? item.modName}`} className="launcher-install-mod-card">
                  <span className="launcher-install-mod-icon" aria-hidden="true">
                    <Package className="h-4 w-4" />
                  </span>
                  <div className="launcher-install-mod-main">
                    <div className="launcher-install-mod-title">
                      <strong>{item.modName}</strong>
                      {item.version ? <span className="launcher-install-version-pill">{`v${item.version}`}</span> : null}
                    </div>
                    <p className="launcher-install-mono">{item.targetPath}</p>
                    {item.uniqueId ? (
                      <p className="launcher-install-mod-uid">
                        <span>{copy.fields.uniqueId}</span>
                        <span className="launcher-install-mono">{item.uniqueId}</span>
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="launcher-install-summary-section">
            <div className="launcher-install-section-head">
              <h3>{copy.library.installBackupsTitle}</h3>
            </div>
            <div className="launcher-install-backup-summary">
              <span className="launcher-install-mod-icon" aria-hidden="true">
                <History className="h-4 w-4" />
              </span>
              <div className="launcher-install-mod-main">
                <div className="launcher-install-mod-title">
                  <span className="launcher-install-field-label">{copy.library.installBackupIdLabel}</span>
                  <span className="launcher-install-mono-strong">{result.backupId}</span>
                </div>
                <p className="launcher-install-mono">{result.backupPath}</p>
                <p className="launcher-install-backup-hint">{copy.library.installSummaryBackupSubtitle}</p>
              </div>
            </div>
          </section>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.actions.closeDialog}</DialogAction>
        <DialogAction tone="primary" onClick={onManageBackups}>
          {copy.library.manageInstallBackups}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
