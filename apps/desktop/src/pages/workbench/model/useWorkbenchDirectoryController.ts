import { useCallback, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { useWorkbenchGameDirectory } from './useWorkbenchGameDirectory'
import { useWorkbenchRecentDirectories } from './useWorkbenchRecentDirectories'

type GuardRunner = (action: () => void | Promise<void>) => Promise<boolean>

/**
 * Owns game-directory validation, persistence, and initialization overlay state.
 * Validation only runs the module guard: switching the game directory reloads module-local
 * disk content but never touches the managed-project draft, so the project guard stays out.
 */
export function useWorkbenchDirectoryController({
  active,
  desktopHost,
  appUiStateReady,
  runWithModuleGuard,
}: {
  active: boolean
  desktopHost: boolean
  appUiStateReady: boolean
  runWithModuleGuard: GuardRunner
}) {
  const copy = useEditorCopy()
  const [overlayOpen, setOverlayOpen] = useState(false)
  const directory = useWorkbenchGameDirectory({ active, desktopHost, copy })
  useWorkbenchRecentDirectories(appUiStateReady, directory.directoryInfo?.rootPath ?? null)

  const chooseDirectory = useCallback(() => {
    void directory.chooseDirectory()
  }, [directory.chooseDirectory])

  const validateDirectory = useCallback(() => {
    void runWithModuleGuard(async () => {
      const info = await directory.validateCurrentDirectory()
      if (info) setOverlayOpen(false)
    })
  }, [directory.validateCurrentDirectory, runWithModuleGuard])

  return {
    ...directory,
    needsInitialization: !directory.directoryInfo,
    interactionLocked: directory.directoryStatus.tone === 'working',
    overlayOpen,
    overlayStatus: directory.directoryStatus.tone === 'error' ? null : directory.directoryStatus.message,
    overlayError: directory.directoryStatus.tone === 'error' ? directory.directoryStatus.message : null,
    openOverlay: () => setOverlayOpen(true),
    closeOverlay: () => setOverlayOpen(false),
    chooseDirectory,
    validateDirectory,
  }
}
