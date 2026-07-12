import { useCallback, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { useWorkbenchGameDirectory } from './useWorkbenchGameDirectory'
import { useWorkbenchRecentDirectories } from './useWorkbenchRecentDirectories'

type GuardRunner = (action: () => void | Promise<void>) => Promise<boolean>

/** Owns game-directory validation, persistence, and initialization overlay state. */
export function useWorkbenchDirectoryController({
  active,
  desktopHost,
  appUiStateReady,
  runWithModuleGuard,
  runWithProjectGuard,
}: {
  active: boolean
  desktopHost: boolean
  appUiStateReady: boolean
  runWithModuleGuard: GuardRunner
  runWithProjectGuard: GuardRunner
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
      await runWithProjectGuard(async () => {
        const info = await directory.validateCurrentDirectory()
        if (info) setOverlayOpen(false)
      })
    })
  }, [directory.validateCurrentDirectory, runWithModuleGuard, runWithProjectGuard])

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
