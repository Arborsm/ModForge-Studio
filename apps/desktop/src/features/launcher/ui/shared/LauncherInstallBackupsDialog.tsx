import type { LauncherInstallBackupSummary } from '../../model/launcherContracts'
import { useEditorCopy } from '@locales/localeContext'
import { PanelEmptyState } from '@shared/ui/PanelSection'

type LauncherInstallBackupsDialogProps = {
  open: boolean
  loading: boolean
  backups: LauncherInstallBackupSummary[]
  error: string | null
  restoringBackupId: string | null
  onClose: () => void
  onRestore: (backupId: string) => void
}

export function LauncherInstallBackupsDialog({
  open,
  loading,
  backups,
  error,
  restoringBackupId,
  onClose,
  onRestore,
}: LauncherInstallBackupsDialogProps) {
  const copy = useEditorCopy().launcher

  if (!open) {
    return null
  }

  return (
    <div
      className="launcher-modal-backdrop launcher-library-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !restoringBackupId) {
          onClose()
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
                        onClick={() => onRestore(backup.backupId)}
                      >
                        {restoring ? `${copy.library.restoreInstallBackup}...` : copy.library.restoreInstallBackup}
                      </button>
                    </div>
                  </article>
                )
              })
            : null}
        </div>

        <div className="launcher-library-dialog-actions">
          <button
            type="button"
            className="control-button launcher-library-secondary-action"
            onClick={onClose}
            disabled={Boolean(restoringBackupId)}
          >
            {copy.actions.closeDialog}
          </button>
        </div>
      </section>
    </div>
  )
}
