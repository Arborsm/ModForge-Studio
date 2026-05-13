import type { PlatformDragDropPayload, PlatformUnlistenFn } from '@shared/contracts'
import { canUseDesktopHost, getPlatformPorts } from './runtime'

export const LAUNCHER_ARCHIVE_FILE_DIALOG_EXTENSIONS = ['zip', '7z', 'rar', 'tar', 'tgz', 'gz'] as const
export const LAUNCHER_ARCHIVE_FILE_SUFFIXES = ['.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.tar'] as const

export type LauncherArchiveDragDropPayload = PlatformDragDropPayload
export type UnlistenFn = PlatformUnlistenFn

export async function chooseGameDirectory() {
  if (!canUseDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  return getPlatformPorts().dialog.chooseDirectory('Select the Stardew Valley game folder')
}

export async function chooseDirectory(title: string) {
  if (!canUseDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  return getPlatformPorts().dialog.chooseDirectory(title)
}

export function isSupportedLauncherArchivePath(path: string) {
  const normalized = path.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return LAUNCHER_ARCHIVE_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

export function listenToLauncherArchiveDragDrop(
  listener: (payload: LauncherArchiveDragDropPayload) => void,
): Promise<UnlistenFn> {
  if (!canUseDesktopHost()) {
    return Promise.resolve(() => {})
  }

  return getPlatformPorts().hostEvents.listenWindowDragDrop(listener)
}

export async function chooseArchiveFile(title: string) {
  if (!canUseDesktopHost()) {
    throw new Error('File selection requires the desktop host.')
  }

  return getPlatformPorts().dialog.chooseFile({
    title,
    filters: [
      {
        name: 'Archives',
        extensions: LAUNCHER_ARCHIVE_FILE_DIALOG_EXTENSIONS,
      },
    ],
  })
}

export async function chooseImageFile(title: string) {
  if (!canUseDesktopHost()) {
    throw new Error('File selection requires the desktop host.')
  }

  return getPlatformPorts().dialog.chooseFile({
    title,
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
      },
    ],
  })
}
