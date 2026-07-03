import { useId } from 'react'
import type { LauncherInstallBackupSummary } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/provider'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import { useState } from 'react'
import { Dialog, DialogAction, DialogBody, DialogHeader } from '@shared/ui/Dialog'

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
  return (
    <LauncherInstallBackupsDialogContent
      open={open}
      loading={loading}
      backups={backups}
      error={error}
      restoringBackupId={restoringBackupId}
      modsPath={modsPath}
      onClose={onClose}
      onRestore={onRestore}
    />
  )
}

type LauncherInstallBackupsDialogContentProps = LauncherInstallBackupsDialogProps

function LauncherInstallBackupsDialogContent({
  open,
  loading,
  backups,
  error,
  restoringBackupId,
  modsPath,
  onClose,
  onRestore,
}: LauncherInstallBackupsDialogContentProps) {
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
        title={copy.library.installBackupsTitle}
        subtitle={copy.library.installBackupsSubtitle}
        onClose={closeDialog}
        closeLabel={copy.actions.closeDialog}
        closeDisabled={busy}
        id={titleId}
      />
      <DialogBody>
        <div className="launcher-library-install-list">
          {loading ? <PanelEmptyState>{copy.library.installBackupsLoading}</PanelEmptyState> : null}
          {!loading && error ? <PanelEmptyState>{error}</PanelEmptyState> : null}
          {!loading && !error && !backups.length ? <PanelEmptyState>{copy.library.installBackupsEmpty}</PanelEmptyState> : null}

          {!loading && !error
            ? backups.map((backup) => {
                const restoring = restoringBackupId === backup.backupId
                return (
                  <article key={backup.backupId} className="launcher-library-install-card">
                    <div className="launcher-library-install-card-header">
                      <strong>{backup.backupId}</strong>
                    </div>
                    <p className="launcher-library-install-card-path">{backup.backupPath}</p>
                    <div className="launcher-library-dialog-actions launcher-library-install-card-actions">
                      <DialogAction tone="primary" disabled={busy} onClick={() => setPendingRestoreBackupId(backup.backupId)}>
                        {restoring ? `${copy.library.restoreInstallBackup}...` : copy.library.restoreInstallBackup}
                      </DialogAction>
                    </div>
                    {pendingRestoreBackupId === backup.backupId ? (
                      <div className="launcher-library-install-restore-confirm">
                        <p className="text-sm font-semibold text-(--text-primary)">{copy.library.restoreInstallBackupConfirmTitle}</p>
                        <p className="mt-1 text-xs text-(--text-secondary)">
                          {copy.library.restoreInstallBackupConfirmMessage(
                            backup.backupId,
                            modsPath ?? '',
                            backup.deleteCount,
                            backup.overwriteCount,
                          )}
                        </p>
                        <div className="mt-3 flex justify-end gap-2">
                          <DialogAction disabled={busy} onClick={() => setPendingRestoreBackupId(null)}>
                            {copy.actions.closeDialog}
                          </DialogAction>
                          <DialogAction tone="primary" disabled={busy} onClick={() => onRestore(backup.backupId)}>
                            {copy.library.restoreInstallBackupConfirmAction}
                          </DialogAction>
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })
            : null}
        </div>
      </DialogBody>
    </Dialog>
  )
}
