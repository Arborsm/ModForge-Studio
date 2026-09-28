import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useId } from 'react'
import type { InspectLauncherArchiveResult, InstallLauncherArchiveResult, LauncherInstallBackupSummary } from '@features/launcher/api'
import type { LauncherLibraryItem } from '@features/launcher/model/types'
import { useLauncherImage } from '@features/launcher/model/imageLoader'
import { LauncherArchiveInstallDialog } from '@features/launcher/ui/shared/LauncherArchiveInstallDialog'
import { LauncherInstallBackupsDialog } from '@features/launcher/ui/shared/LauncherInstallBackupsDialog'
import { LauncherInstallSummaryDialog } from '@features/launcher/ui/shared/LauncherInstallSummaryDialog'
import { LauncherChildModsDialogs, type LauncherChildModManagerState } from '@features/launcher/ui/shared/LauncherChildModsDialogs'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import type {
  ArchivePreviewState,
  FolderDialogState,
  GalleryCoverDialogState,
  InstallBackupsState,
  PackDialogState,
} from '../model/launcherLibraryDialogs'

type LauncherLibraryDialogsProps = {
  archiveInstall: {
    archivePreviewState: ArchivePreviewState
    archivePreviews: InspectLauncherArchiveResult[]
    selectedArchivePreviewPath: string | null
    archivePreviewError: string | null
    installingArchive: boolean
    installResult: InstallLauncherArchiveResult | null
  }
  backupsDialog: {
    installBackupsOpen: boolean
    installBackupsState: InstallBackupsState
    installBackups: LauncherInstallBackupSummary[]
    installBackupsError: string | null
    restoringBackupId: string | null
    modsPath: string | null
  }
  dialogs: {
    childModManager: LauncherChildModManagerState | null
    galleryCoverDialog: GalleryCoverDialogState | null
    packDialog: PackDialogState | null
    folderDialog: FolderDialogState | null
    packDialogInputRef: RefObject<HTMLInputElement | null>
  }
  actions: {
    closeArchivePreview: () => void
    confirmArchiveInstall: () => void
    selectArchivePreviewPath: (path: string) => void
    closeInstallSummary: () => void
    openInstallBackupsFromSummary: () => void
    closeInstallBackupsDialog: () => void
    restoreInstallBackup: (backupId: string) => void
    closeChildModManager: () => void
    removeChildMod: (modId: string) => void
    childModManagerChildrenChange: (childMods: LauncherLibraryItem[]) => void
    closeGalleryCoverDialog: () => void
    selectGalleryCover: (url: string) => void
    applyGalleryCover: () => void
    closePackDialog: () => void
    packDialogChange: Dispatch<SetStateAction<PackDialogState | null>>
    submitPackDialog: () => void
    closeFolderDialog: () => void
    folderDialogChange: Dispatch<SetStateAction<FolderDialogState | null>>
    submitFolderDialog: () => void
  }
}

function GalleryCoverOption({ url, selected, label, onSelect }: { url: string; selected: boolean; label: string; onSelect: () => void }) {
  const image = useLauncherImage(url)
  return (
    <button
      type="button"
      className={selected ? 'launcher-gallery-cover-option launcher-gallery-cover-option-selected' : 'launcher-gallery-cover-option'}
      aria-label={label}
      aria-busy={image.loading ? 'true' : undefined}
      onClick={onSelect}
    >
      <div className="launcher-gallery-cover-frame">
        {image.loading ? <ImageSkeleton overlay rounded={false} className="launcher-gallery-cover-skeleton" /> : null}
        {image.imageUrl ? <img src={image.imageUrl} alt="" className="launcher-gallery-cover-image" /> : null}
        {!image.imageUrl && !image.loading ? <span className="launcher-gallery-cover-loading">{label}</span> : null}
      </div>
    </button>
  )
}

export function LauncherLibraryDialogs({ archiveInstall, backupsDialog, dialogs, actions }: LauncherLibraryDialogsProps) {
  const { archivePreviewState, archivePreviews, selectedArchivePreviewPath, archivePreviewError, installingArchive, installResult } =
    archiveInstall
  const { installBackupsOpen, installBackupsState, installBackups, installBackupsError, restoringBackupId, modsPath } = backupsDialog
  const { childModManager, galleryCoverDialog, packDialog, folderDialog, packDialogInputRef } = dialogs
  const {
    closeArchivePreview: onCloseArchivePreview,
    confirmArchiveInstall: onConfirmArchiveInstall,
    selectArchivePreviewPath: onSelectArchivePreviewPath,
    closeInstallSummary: onCloseInstallSummary,
    openInstallBackupsFromSummary: onOpenInstallBackupsFromSummary,
    closeInstallBackupsDialog: onCloseInstallBackupsDialog,
    restoreInstallBackup: onRestoreInstallBackup,
    closeChildModManager: onCloseChildModManager,
    removeChildMod: onRemoveChildMod,
    childModManagerChildrenChange: onChildModManagerChildrenChange,
    closeGalleryCoverDialog: onCloseGalleryCoverDialog,
    selectGalleryCover: onSelectGalleryCover,
    applyGalleryCover: onApplyGalleryCover,
    closePackDialog: onClosePackDialog,
    packDialogChange: onPackDialogChange,
    submitPackDialog: onSubmitPackDialog,
    closeFolderDialog: onCloseFolderDialog,
    folderDialogChange: onFolderDialogChange,
    submitFolderDialog: onSubmitFolderDialog,
  } = actions
  const copy = useEditorCopy().launcher
  const labels = {
    createPack: copy.actions.createPack,
    editPackInfo: copy.library.editPackInfo,
    deleteCurrentPack: copy.library.deleteCurrentPack,
    editPackInfoPrompt: copy.library.editPackInfoPrompt,
    syncGlobalFolders: copy.library.syncGlobalFolders,
    syncGlobalFoldersHint: copy.library.syncGlobalFoldersHint,
    deleteCurrentPackConfirm: copy.library.deleteCurrentPackConfirm,
    newPackPlaceholder: copy.library.newPackPlaceholder,
    cancelEdit: copy.library.cancelEdit,
    saveChanges: copy.library.saveChanges,
    galleryCoverTitle: copy.library.galleryCoverTitle,
    galleryCoverSubtitle: copy.library.galleryCoverSubtitle,
    galleryCoverImageLabel: copy.library.galleryCoverImageLabel,
    setCover: copy.actions.setCover,
    manageChildMods: copy.library.manageChildMods,
    parentModLabel: copy.library.parentModLabel,
    removeFromParent: copy.library.removeFromParent,
    closeDialog: copy.actions.closeDialog,
    renameLibraryFolder: copy.library.renameLibraryFolder,
    renameLibraryFolderPrompt: copy.library.renameLibraryFolderPrompt,
    newLibraryFolderName: copy.library.newLibraryFolderName,
  }
  const galleryTitleId = useId()
  const packTitleId = useId()
  const folderTitleId = useId()

  return (
    <>
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
        modsPath={modsPath}
        onClose={onCloseInstallBackupsDialog}
        onRestore={onRestoreInstallBackup}
      />

      <LauncherChildModsDialogs
        manager={childModManager}
        onCloseManager={onCloseChildModManager}
        onRemoveChild={onRemoveChildMod}
        onManagerChildrenChange={onChildModManagerChildrenChange}
      />

      {galleryCoverDialog ? (
        <Dialog
          open
          onClose={onCloseGalleryCoverDialog}
          size="xl"
          labelledBy={galleryTitleId}
          closeOnBackdrop={!galleryCoverDialog.applying}
          closeOnEscape={!galleryCoverDialog.applying}
        >
          <DialogHeader
            title={labels.galleryCoverTitle}
            subtitle={labels.galleryCoverSubtitle}
            onClose={onCloseGalleryCoverDialog}
            closeLabel={labels.cancelEdit}
            closeDisabled={galleryCoverDialog.applying}
            id={galleryTitleId}
          />
          <DialogBody>
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
          </DialogBody>
          <DialogFooter>
            <DialogAction onClick={onCloseGalleryCoverDialog} disabled={galleryCoverDialog.applying}>
              {labels.cancelEdit}
            </DialogAction>
            <DialogAction tone="primary" onClick={onApplyGalleryCover} disabled={galleryCoverDialog.applying}>
              {labels.setCover}
            </DialogAction>
          </DialogFooter>
        </Dialog>
      ) : null}

      {packDialog ? (
        <Dialog open onClose={onClosePackDialog} size={packDialog.kind === 'delete' ? 'sm' : 'md'} labelledBy={packTitleId}>
          <DialogHeader
            title={
              packDialog.kind === 'create' ? labels.createPack : packDialog.kind === 'edit' ? labels.editPackInfo : labels.deleteCurrentPack
            }
            subtitle={packDialog.kind === 'edit' ? labels.editPackInfoPrompt(packDialog.pack.name) : undefined}
            tone={packDialog.kind === 'delete' ? 'warning' : 'default'}
            onClose={onClosePackDialog}
            closeLabel={labels.cancelEdit}
            id={packTitleId}
          />
          <DialogBody>
            {packDialog.kind === 'delete' ? (
              <p className="text-text-secondary text-xs">{labels.deleteCurrentPackConfirm(packDialog.pack.name)}</p>
            ) : (
              <form
                id="pack-dialog-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  onSubmitPackDialog()
                }}
              >
                <label className="launcher-library-dialog-field">
                  <span className="sr-only">{packDialog.kind === 'create' ? labels.createPack : labels.editPackInfo}</span>
                  <input
                    ref={packDialogInputRef}
                    value={packDialog.value}
                    autoFocus
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
                <label className="launcher-library-dialog-field launcher-library-dialog-checkbox-field">
                  <input
                    type="checkbox"
                    checked={packDialog.syncGlobalFolders}
                    onChange={(event) =>
                      onPackDialogChange((current) =>
                        current && current.kind !== 'delete'
                          ? {
                              ...current,
                              syncGlobalFolders: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />
                  <span>
                    <span>{labels.syncGlobalFolders}</span>
                    <small>{labels.syncGlobalFoldersHint}</small>
                  </span>
                </label>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogAction onClick={onClosePackDialog}>{labels.cancelEdit}</DialogAction>
            {packDialog.kind === 'delete' ? (
              <DialogAction tone="danger" onClick={onSubmitPackDialog}>
                {labels.deleteCurrentPack}
              </DialogAction>
            ) : (
              <DialogAction type="submit" tone="primary" form="pack-dialog-form">
                {packDialog.kind === 'create' ? labels.createPack : labels.saveChanges}
              </DialogAction>
            )}
          </DialogFooter>
        </Dialog>
      ) : null}

      {folderDialog ? (
        <Dialog open onClose={onCloseFolderDialog} size="md" labelledBy={folderTitleId}>
          <DialogHeader
            title={labels.renameLibraryFolder}
            subtitle={labels.renameLibraryFolderPrompt(folderDialog.folder.name)}
            onClose={onCloseFolderDialog}
            closeLabel={labels.cancelEdit}
            id={folderTitleId}
          />
          <DialogBody>
            <form
              id="folder-dialog-form"
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
            </form>
          </DialogBody>
          <DialogFooter>
            <DialogAction onClick={onCloseFolderDialog}>{labels.cancelEdit}</DialogAction>
            <DialogAction type="submit" tone="primary" form="folder-dialog-form">
              {labels.saveChanges}
            </DialogAction>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  )
}
