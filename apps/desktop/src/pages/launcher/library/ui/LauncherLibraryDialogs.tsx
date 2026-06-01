import type { Dispatch, RefObject, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type { InspectLauncherArchiveResult, InstallLauncherArchiveResult, LauncherInstallBackupSummary } from '@features/launcher/api'
import type { LauncherLibraryItem } from '@features/launcher/model/types'
import { useLauncherImage } from '@features/launcher/model/imageLoader'
import { LauncherArchiveInstallDialog } from '@features/launcher/ui/shared/LauncherArchiveInstallDialog'
import { LauncherInstallBackupsDialog } from '@features/launcher/ui/shared/LauncherInstallBackupsDialog'
import { LauncherInstallSummaryDialog } from '@features/launcher/ui/shared/LauncherInstallSummaryDialog'
import {
  LauncherChildModsDialogs,
  type LauncherChildModManagerState,
  type LauncherChildModPickerState,
} from '@features/launcher/ui/shared/LauncherChildModsDialogs'
import type {
  ArchivePreviewState,
  FolderDialogState,
  GalleryCoverDialogState,
  InstallBackupsState,
  PackDialogState,
} from '../model/launcherLibraryDialogs'

type LauncherLibraryDialogsLabels = {
  createPack: string
  renameCurrentPack: string
  deleteCurrentPack: string
  renameCurrentPackPrompt: (name: string) => string
  deleteCurrentPackConfirm: (name: string) => string
  newPackPlaceholder: string
  cancelEdit: string
  saveChanges: string
  galleryCoverTitle: string
  galleryCoverSubtitle: string
  galleryCoverImageLabel: (index: number) => string
  setCover: string
  chooseChildMods: string
  chooseChildModsSubtitle: (name: string) => string
  confirmChildMods: string
  manageChildMods: string
  parentModLabel: (name: string) => string
  removeFromParent: string
  closeDialog: string
  renameLibraryFolder: string
  renameLibraryFolderPrompt: (name: string) => string
  newLibraryFolderName: string
}

type LauncherLibraryDialogsProps = {
  archivePreviewState: ArchivePreviewState
  archivePreviews: InspectLauncherArchiveResult[]
  selectedArchivePreviewPath: string | null
  archivePreviewError: string | null
  installingArchive: boolean
  installResult: InstallLauncherArchiveResult | null
  installBackupsOpen: boolean
  installBackupsState: InstallBackupsState
  installBackups: LauncherInstallBackupSummary[]
  installBackupsError: string | null
  restoringBackupId: string | null
  childModPicker: LauncherChildModPickerState | null
  childModManager: LauncherChildModManagerState | null
  mods: LauncherLibraryItem[]
  galleryCoverDialog: GalleryCoverDialogState | null
  packDialog: PackDialogState | null
  folderDialog: FolderDialogState | null
  packDialogInputRef: RefObject<HTMLInputElement | null>
  labels: LauncherLibraryDialogsLabels
  onCloseArchivePreview: () => void
  onConfirmArchiveInstall: () => void
  onSelectArchivePreviewPath: (path: string) => void
  onCloseInstallSummary: () => void
  onOpenInstallBackupsFromSummary: () => void
  onCloseInstallBackupsDialog: () => void
  onRestoreInstallBackup: (backupId: string) => void
  onCloseChildModPicker: () => void
  onToggleChildModPickerSelection: (modId: string) => void
  onSubmitChildModPicker: () => void
  onCloseChildModManager: () => void
  onRemoveChildMod: (modId: string) => void
  onChildModManagerChildrenChange: (childMods: LauncherLibraryItem[]) => void
  onCloseGalleryCoverDialog: () => void
  onSelectGalleryCover: (url: string) => void
  onApplyGalleryCover: () => void
  onClosePackDialog: () => void
  onPackDialogChange: Dispatch<SetStateAction<PackDialogState | null>>
  onSubmitPackDialog: () => void
  onCloseFolderDialog: () => void
  onFolderDialogChange: Dispatch<SetStateAction<FolderDialogState | null>>
  onSubmitFolderDialog: () => void
}

function GalleryCoverOption({ url, selected, label, onSelect }: { url: string; selected: boolean; label: string; onSelect: () => void }) {
  const image = useLauncherImage(url)
  return (
    <button
      type="button"
      className={selected ? 'launcher-gallery-cover-option launcher-gallery-cover-option-selected' : 'launcher-gallery-cover-option'}
      aria-label={label}
      onClick={onSelect}
    >
      <div className="launcher-gallery-cover-frame">
        {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-gallery-cover-image" /> : null}
        {!image.imageUrl ? <span className="launcher-gallery-cover-loading">{label}</span> : null}
      </div>
    </button>
  )
}

export function LauncherLibraryDialogs({
  archivePreviewState,
  archivePreviews,
  selectedArchivePreviewPath,
  archivePreviewError,
  installingArchive,
  installResult,
  installBackupsOpen,
  installBackupsState,
  installBackups,
  installBackupsError,
  restoringBackupId,
  childModPicker,
  childModManager,
  mods,
  galleryCoverDialog,
  packDialog,
  folderDialog,
  packDialogInputRef,
  labels,
  onCloseArchivePreview,
  onConfirmArchiveInstall,
  onSelectArchivePreviewPath,
  onCloseInstallSummary,
  onOpenInstallBackupsFromSummary,
  onCloseInstallBackupsDialog,
  onRestoreInstallBackup,
  onCloseChildModPicker,
  onToggleChildModPickerSelection,
  onSubmitChildModPicker,
  onCloseChildModManager,
  onRemoveChildMod,
  onChildModManagerChildrenChange,
  onCloseGalleryCoverDialog,
  onSelectGalleryCover,
  onApplyGalleryCover,
  onClosePackDialog,
  onPackDialogChange,
  onSubmitPackDialog,
  onCloseFolderDialog,
  onFolderDialogChange,
  onSubmitFolderDialog,
}: LauncherLibraryDialogsProps) {
  return createPortal(
    <div className="launcher-shell launcher-shell-routed launcher-dialog-portal-root">
      <LauncherArchiveInstallDialog
        open={archivePreviewState !== 'idle'}
        loading={archivePreviewState === 'loading'}
        installing={installingArchive}
        previews={archivePreviews}
        selectedArchivePath={selectedArchivePreviewPath}
        error={archivePreviewState === 'error' ? archivePreviewError : null}
        onClose={onCloseArchivePreview}
        onConfirm={onConfirmArchiveInstall}
        onSelectArchive={onSelectArchivePreviewPath}
      />

      <LauncherInstallSummaryDialog
        open={Boolean(installResult)}
        result={installResult}
        onClose={onCloseInstallSummary}
        onManageBackups={onOpenInstallBackupsFromSummary}
      />

      <LauncherInstallBackupsDialog
        open={installBackupsOpen}
        loading={installBackupsState === 'loading'}
        backups={installBackups}
        error={installBackupsState === 'error' ? installBackupsError : null}
        restoringBackupId={restoringBackupId}
        onClose={onCloseInstallBackupsDialog}
        onRestore={onRestoreInstallBackup}
      />

      <LauncherChildModsDialogs
        picker={childModPicker}
        manager={childModManager}
        mods={mods}
        labels={{
          chooseChildMods: labels.chooseChildMods,
          chooseChildModsSubtitle: labels.chooseChildModsSubtitle,
          confirmChildMods: labels.confirmChildMods,
          cancelEdit: labels.cancelEdit,
          manageChildMods: labels.manageChildMods,
          parentModLabel: labels.parentModLabel,
          removeFromParent: labels.removeFromParent,
          closeDialog: labels.closeDialog,
        }}
        onClosePicker={onCloseChildModPicker}
        onTogglePickerSelection={onToggleChildModPickerSelection}
        onSubmitPicker={onSubmitChildModPicker}
        onCloseManager={onCloseChildModManager}
        onRemoveChild={onRemoveChildMod}
        onManagerChildrenChange={onChildModManagerChildrenChange}
      />

      {galleryCoverDialog ? (
        <div
          className="launcher-modal-backdrop launcher-library-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !galleryCoverDialog.applying) {
              onCloseGalleryCoverDialog()
            }
          }}
        >
          <section
            className="launcher-library-dialog launcher-gallery-cover-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={labels.galleryCoverTitle}
          >
            <div className="launcher-library-dialog-header">
              <h2 className="launcher-library-dialog-title">{labels.galleryCoverTitle}</h2>
              <p className="launcher-library-dialog-copy">{labels.galleryCoverSubtitle}</p>
            </div>

            <div className="launcher-gallery-cover-grid">
              {galleryCoverDialog.imageUrls.map((url, index) => (
                <GalleryCoverOption
                  key={url}
                  url={url}
                  selected={galleryCoverDialog.selectedImageUrl === url}
                  label={labels.galleryCoverImageLabel(index + 1)}
                  onSelect={() => onSelectGalleryCover(url)}
                />
              ))}
            </div>

            <div className="launcher-library-dialog-actions">
              <button
                type="button"
                className="control-button launcher-library-secondary-action"
                onClick={onCloseGalleryCoverDialog}
                disabled={galleryCoverDialog.applying}
              >
                {labels.cancelEdit}
              </button>
              <button
                type="button"
                className="control-button control-button-primary"
                onClick={onApplyGalleryCover}
                disabled={galleryCoverDialog.applying}
              >
                {labels.setCover}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {packDialog ? (
        <div
          className="launcher-modal-backdrop launcher-library-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClosePackDialog()
            }
          }}
        >
          <section
            className="launcher-library-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              packDialog.kind === 'create'
                ? labels.createPack
                : packDialog.kind === 'rename'
                  ? labels.renameCurrentPack
                  : labels.deleteCurrentPack
            }
          >
            <div className="launcher-library-dialog-header">
              <h2 className="launcher-library-dialog-title">
                {packDialog.kind === 'create'
                  ? labels.createPack
                  : packDialog.kind === 'rename'
                    ? labels.renameCurrentPack
                    : labels.deleteCurrentPack}
              </h2>
              {packDialog.kind === 'rename' ? (
                <p className="launcher-library-dialog-copy">{labels.renameCurrentPackPrompt(packDialog.pack.name)}</p>
              ) : null}
              {packDialog.kind === 'delete' ? (
                <p className="launcher-library-dialog-copy">{labels.deleteCurrentPackConfirm(packDialog.pack.name)}</p>
              ) : null}
            </div>

            {packDialog.kind === 'delete' ? (
              <div className="launcher-library-dialog-actions">
                <button type="button" className="control-button launcher-library-secondary-action" onClick={onClosePackDialog}>
                  {labels.cancelEdit}
                </button>
                <button type="button" className="control-button launcher-library-danger-action" onClick={onSubmitPackDialog}>
                  {labels.deleteCurrentPack}
                </button>
              </div>
            ) : (
              <form
                className="launcher-library-dialog-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  onSubmitPackDialog()
                }}
              >
                <label className="launcher-library-dialog-field">
                  <span className="sr-only">{packDialog.kind === 'create' ? labels.createPack : labels.renameCurrentPack}</span>
                  <input
                    ref={packDialogInputRef}
                    value={packDialog.value}
                    onChange={(event) =>
                      onPackDialogChange((current) =>
                        current && current.kind !== 'delete'
                          ? {
                              ...current,
                              value: event.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder={labels.newPackPlaceholder}
                    spellCheck={false}
                  />
                </label>
                <div className="launcher-library-dialog-actions">
                  <button type="button" className="control-button launcher-library-secondary-action" onClick={onClosePackDialog}>
                    {labels.cancelEdit}
                  </button>
                  <button type="submit" className="control-button control-button-primary launcher-library-primary-action">
                    {packDialog.kind === 'create' ? labels.createPack : labels.saveChanges}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {folderDialog ? (
        <div
          className="launcher-modal-backdrop launcher-library-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onCloseFolderDialog()
            }
          }}
        >
          <section className="launcher-library-dialog" role="dialog" aria-modal="true" aria-label={labels.renameLibraryFolder}>
            <div className="launcher-library-dialog-header">
              <h2 className="launcher-library-dialog-title">{labels.renameLibraryFolder}</h2>
              <p className="launcher-library-dialog-copy">{labels.renameLibraryFolderPrompt(folderDialog.folder.name)}</p>
            </div>

            <form
              className="launcher-library-dialog-form"
              onSubmit={(event) => {
                event.preventDefault()
                onSubmitFolderDialog()
              }}
            >
              <label className="launcher-library-dialog-field">
                <span className="sr-only">{labels.renameLibraryFolder}</span>
                <input
                  value={folderDialog.value}
                  onChange={(event) =>
                    onFolderDialogChange((current) =>
                      current
                        ? {
                            ...current,
                            value: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder={labels.newLibraryFolderName}
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <div className="launcher-library-dialog-actions">
                <button type="button" className="control-button launcher-library-secondary-action" onClick={onCloseFolderDialog}>
                  {labels.cancelEdit}
                </button>
                <button type="submit" className="control-button control-button-primary launcher-library-primary-action">
                  {labels.saveChanges}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
