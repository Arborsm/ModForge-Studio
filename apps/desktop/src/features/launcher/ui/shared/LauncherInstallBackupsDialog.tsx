import { useId, useState } from 'react'
import { AlertTriangle, History } from 'lucide-react'
import type { LauncherInstallBackupSummary } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogHeader } from '@shared/ui/Dialog'
import { LauncherInstallStateView } from './LauncherInstallStateView'

type LauncherInstallBackupsDialogProps = {
  open: boolean
  loading: boolean
  backups: LauncherInstallBackupSummary[]
  error: string | null
  restoringBackupId: string | null
  modsPath?: string | null
  onClose: () => void
  onRestore: (backupId: string) => void
}

export function LauncherInstallBackupsDialog({
  open,
  loading,
  backups,
  error,
  restoringBackupId,
  modsPath,
  onClose,
  onRestore,
}: LauncherInstallBackupsDialogProps) {
  const copy = useEditorCopy().launcher
  const titleId = useId()
  const [pendingRestoreBackupId, setPendingRestoreBackupId] = useState<string | null>(null)
  const busy = Boolean(restoringBackupId)

  const closeDialog = () => {
    if (busy) {
      return
    }
    setPendingRestoreBackupId(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={closeDialog} size="xl" labelledBy={titleId} closeOnBackdrop={!busy} closeOnEscape={!busy}>
      <DialogHeader
        icon={<History className="h-4 w-4" />}
        title={copy.library.installBackupsTitle}
        subtitle={copy.library.installBackupsSubtitle}
        onClose={closeDialog}
        closeLabel={copy.actions.closeDialog}
        closeDisabled={busy}
        id={titleId}
      />
      <DialogBody>
        {loading ? <LauncherInstallStateView tone="loading" title={copy.library.installBackupsLoading} /> : null}
        {!loading && error ? <LauncherInstallStateView tone="error" title={copy.library.installBackupsError} detail={error} /> : null}
        {!loading && !error && !backups.length ? <LauncherInstallStateView tone="empty" title={copy.library.installBackupsEmpty} /> : null}

        {!loading && !error && backups.length ? (
          <div className="launcher-install-backup-list">
            {backups.map((backup) => {
              const restoring = restoringBackupId === backup.backupId
              const pending = pendingRestoreBackupId === backup.backupId
              return (
                <article key={backup.backupId} className="launcher-install-backup-card" data-pending={pending || undefined}>
                  <span className="launcher-install-mod-icon" aria-hidden="true">
                    <History className="h-4 w-4" />
                  </span>
                  <div className="launcher-install-mod-main">
                    <div className="launcher-install-mod-title">
                      <span className="launcher-install-mono-strong">{backup.backupId}</span>
                      <span className="launcher-install-change-chip" data-tone="danger">
                        {copy.library.installBackupDeleteCount(backup.deleteCount)}
                      </span>
                      <span className="launcher-install-change-chip" data-tone="warning">
                        {copy.library.installBackupOverwriteCount(backup.overwriteCount)}
                      </span>
                    </div>
                    <p className="launcher-install-mono">{backup.backupPath}</p>
                  </div>
                  <div className="launcher-install-backup-actions">
                    <DialogAction disabled={busy} onClick={() => setPendingRestoreBackupId(backup.backupId)}>
                      {restoring ? `${copy.library.restoreInstallBackup}...` : copy.library.restoreInstallBackup}
                    </DialogAction>
                  </div>
                  {pending ? (
                    <div className="launcher-install-restore-panel">
                      <span className="launcher-install-restore-icon" aria-hidden="true">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="launcher-install-restore-main">
                        <p className="launcher-install-restore-title">{copy.library.restoreInstallBackupConfirmTitle}</p>
                        <p className="launcher-install-restore-message">
                          {copy.library.restoreInstallBackupConfirmMessage(
                            backup.backupId,
                            modsPath ?? '',
                            backup.deleteCount,
                            backup.overwriteCount,
                          )}
                        </p>
                        <div className="launcher-install-restore-actions">
                          <DialogAction disabled={busy} onClick={() => setPendingRestoreBackupId(null)}>
                            {copy.actions.closeDialog}
                          </DialogAction>
                          <DialogAction tone="warning" disabled={busy} onClick={() => onRestore(backup.backupId)}>
                            {copy.library.restoreInstallBackupConfirmAction}
                          </DialogAction>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}
      </DialogBody>
    </Dialog>
  )
}
