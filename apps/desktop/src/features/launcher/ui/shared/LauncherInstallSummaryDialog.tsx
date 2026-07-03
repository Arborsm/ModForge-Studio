import { useId } from 'react'
import type { InstallLauncherArchiveResult } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/provider'
import { PanelSection } from '@shared/ui/PanelSection'
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
        title={copy.library.installSummaryTitle}
        subtitle={copy.library.installSummarySubtitle}
        onClose={onClose}
        closeLabel={copy.actions.closeDialog}
        id={titleId}
      />
      <DialogBody>
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

          <PanelSection
            title={copy.overview.installedMods}
            subtitle={copy.library.installSummaryInstalledMods(result.installedMods.length)}
          >
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
