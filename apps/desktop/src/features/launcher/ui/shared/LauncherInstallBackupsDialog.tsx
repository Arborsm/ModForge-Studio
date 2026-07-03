import type { LauncherInstallBackupSummary } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/localeContext'
import { PanelEmptyState } from '@shared/ui/PanelSection'
import { useState } from 'react'

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
  if (!open) {
    return null
  }

  return (
    <LauncherInstallBackupsDialogContent
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

type LauncherInstallBackupsDialogContentProps = Omit<LauncherInstallBackupsDialogProps, 'open'>

function LauncherInstallBackupsDialogContent({
  loading,
  backups,
  error,
  restoringBackupId,
  modsPath,
  onClose,
  onRestore,
}: LauncherInstallBackupsDialogContentProps) {
  const copy = useEditorCopy().launcher
  const [pendingRestoreBackupId, setPendingRestoreBackupId] = useState<string | null>(null)

  const closeDialog = () => {
    setPendingRestoreBackupId(null)
    onClose()
  }

  return (
    <div
      className="launcher-modal-backdrop launcher-library-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !restoringBackupId) {
          closeDialog()
        }
      }}
    >
      <section
        className="launcher-library-dialog launcher-library-install-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={copy.library.installBackupsTitle}
      >
        <div className="launcher-library-dialog-header">
          <h2 className="launcher-library-dialog-title">{copy.library.installBackupsTitle}</h2>
          <p className="launcher-library-dialog-copy">{copy.library.installBackupsSubtitle}</p>
        </div>

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
                      <button
                        type="button"
                        className="control-button control-button-primary launcher-library-primary-action"
                        disabled={Boolean(restoringBackupId)}
                        onClick={() => setPendingRestoreBackupId(backup.backupId)}
                      >
                        {restoring ? `${copy.library.restoreInstallBackup}...` : copy.library.restoreInstallBackup}
                      </button>
                    </div>
                    {pendingRestoreBackupId === backup.backupId ? (
                      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{copy.library.restoreInstallBackupConfirmTitle}</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {copy.library.restoreInstallBackupConfirmMessage(
                            backup.backupId,
                            modsPath ?? '',
                            backup.deleteCount,
                            backup.overwriteCount,
                          )}
                        </p>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            className="control-button launcher-library-secondary-action"
                            disabled={Boolean(restoringBackupId)}
                            onClick={() => setPendingRestoreBackupId(null)}
                          >
                            {copy.actions.closeDialog}
                          </button>
                          <button
                            type="button"
                            className="control-button control-button-primary launcher-library-primary-action"
                            disabled={Boolean(restoringBackupId)}
                            onClick={() => onRestore(backup.backupId)}
                          >
                            {copy.library.restoreInstallBackupConfirmAction}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })
            : null}
        </div>

        <div className="launcher-library-dialog-actions">
          <button
            type="button"
            className="control-button launcher-library-secondary-action"
            onClick={closeDialog}
            disabled={Boolean(restoringBackupId)}
          >
            {copy.actions.closeDialog}
          </button>
        </div>
      </section>
    </div>
  )
}
