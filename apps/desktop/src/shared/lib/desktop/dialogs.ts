import type { PlatformDragDropPayload, PlatformUnlistenFn } from '@shared/contracts'
import { canUseDesktopHost, getPlatformPorts } from './runtime'

/** Archive extensions accepted by the launcher install file dialog. */
export const LAUNCHER_ARCHIVE_FILE_DIALOG_EXTENSIONS = ['zip', '7z', 'rar', 'tar', 'tgz', 'gz'] as const
/** Archive suffixes accepted by drag-and-drop and path validation. */
export const LAUNCHER_ARCHIVE_FILE_SUFFIXES = ['.zip', '.7z', '.rar', '.tar.gz', '.tgz', '.tar'] as const

/** Drag-drop payload emitted by the desktop window host. */
export type LauncherArchiveDragDropPayload = PlatformDragDropPayload
/** Callback returned by desktop listener registrations. */
export type UnlistenFn = PlatformUnlistenFn

/** Opens the standard game directory picker. */
export async function chooseGameDirectory() {
  if (!canUseDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  return getPlatformPorts().dialog.chooseDirectory('Select the Stardew Valley game folder')
}

/** Opens a desktop directory picker with a caller-provided title. */
export async function chooseDirectory(title: string) {
  if (!canUseDesktopHost()) {
    throw new Error('Directory selection requires the desktop host.')
  }

  return getPlatformPorts().dialog.chooseDirectory(title)
}

/** Returns whether a path points at an installable archive format. */
export function isSupportedLauncherArchivePath(path: string) {
  const normalized = path.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return LAUNCHER_ARCHIVE_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

/** Subscribes to desktop window archive drag-and-drop events. */
export function listenToLauncherArchiveDragDrop(
  listener: (payload: LauncherArchiveDragDropPayload) => void,
): Promise<UnlistenFn> {
  if (!canUseDesktopHost()) {
    return Promise.resolve(() => {})
  }

  return getPlatformPorts().hostEvents.listenWindowDragDrop(listener)
}

/** Opens a desktop file picker restricted to launcher archive formats. */
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

/** Opens a desktop file picker restricted to supported cover image formats. */
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
