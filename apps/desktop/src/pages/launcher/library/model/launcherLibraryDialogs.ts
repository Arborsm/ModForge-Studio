import type { InspectLauncherArchiveResult, InstallLauncherArchiveResult, LauncherInstallBackupSummary } from '@features/launcher/api'
import type { LauncherLibraryItem, LauncherPackPreset, LauncherVirtualFolder } from '@features/launcher/model/types'

export type ArchivePreviewState = 'idle' | 'loading' | 'ready' | 'error'
export type InstallBackupsState = 'idle' | 'loading' | 'ready' | 'error'

export type PackDialogState =
  | { kind: 'create'; value: string; syncGlobalFolders: boolean }
  | { kind: 'edit'; pack: LauncherPackPreset; value: string; syncGlobalFolders: boolean }
  | { kind: 'delete'; pack: LauncherPackPreset }

export type FolderDialogState = { kind: 'rename'; folder: LauncherVirtualFolder; value: string }

export type GalleryCoverDialogState = {
  mod: LauncherLibraryItem
  imageUrls: string[]
  selectedImageUrl: string
  applying: boolean
}

export type LauncherLibraryArchiveDialogState = {
  archivePreviewState: ArchivePreviewState
  archivePreviews: InspectLauncherArchiveResult[]
  selectedArchivePreviewPath: string | null
  archivePreviewError: string | null
  installingArchive: boolean
  installResult: InstallLauncherArchiveResult | null
}

export type LauncherLibraryInstallBackupsDialogState = {
  installBackupsOpen: boolean
  installBackupsState: InstallBackupsState
  installBackups: LauncherInstallBackupSummary[]
  installBackupsError: string | null
  restoringBackupId: string | null
}
