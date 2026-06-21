import { useCallback, useEffect, useState } from 'react'
import { detectDefaultGameDirectory, listKnownGameDirectories, validateGameDirectory, type GameDirectoryInfo } from '@entities/game/api'
import { canUseDesktopHost, chooseGameDirectory } from '@platform/host'
import type { EditorCopy } from '@locales'
import type { WorkspaceStatus } from '@entities/map'

type UseWorkbenchGameDirectoryOptions = {
  active: boolean
  desktopHost: boolean
  copy: EditorCopy
}

/** Owns the lightweight game-directory lifecycle shared by all workbench runtimes. */
export function useWorkbenchGameDirectory({ active, desktopHost, copy }: UseWorkbenchGameDirectoryOptions) {
  const [gameDirectory, setGameDirectory] = useState('')
  const [directoryInfo, setDirectoryInfo] = useState<GameDirectoryInfo | null>(null)
  const [knownGameDirectories, setKnownGameDirectories] = useState<string[]>([])
  const [directoryStatus, setDirectoryStatus] = useState<WorkspaceStatus>({ tone: 'idle', message: '' })

  const handleDirectoryInvalid = useCallback(
    (message: string) => {
      setDirectoryInfo(null)
      setDirectoryStatus({ tone: 'error', message })
    },
    [setDirectoryInfo],
  )

  const validateDirectory = useCallback(
    async (path: string = gameDirectory) => {
      const trimmedPath = path.trim()
      if (!trimmedPath) {
        setDirectoryStatus({ tone: 'error', message: copy.messages.enterFolderBeforeValidating })
        return null
      }

      setDirectoryStatus({ tone: 'working', message: copy.messages.validatingDirectory })

      try {
        const info = await validateGameDirectory(trimmedPath)
        setDirectoryInfo(info)
        setGameDirectory(info.rootPath)
        setDirectoryStatus({ tone: 'ready', message: copy.messages.validatedDirectory(info.rootPath) })
        return info
      } catch (error) {
        setDirectoryInfo(null)
        setDirectoryStatus({
          tone: 'error',
          message: `${copy.messages.validationFailed} ${error instanceof Error ? error.message : String(error)}`,
        })
        return null
      }
    },
    [copy.messages, gameDirectory],
  )

  const chooseDirectory = useCallback(async () => {
    try {
      const selectedPath = await chooseGameDirectory()
      if (!selectedPath) {
        return null
      }

      setGameDirectory(selectedPath)
      setDirectoryStatus({ tone: 'idle', message: copy.messages.detectedKnownPath(selectedPath) })
      return selectedPath
    } catch (error) {
      setDirectoryStatus({
        tone: 'error',
        message: `${copy.messages.directorySelectionFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    }
  }, [copy.messages])

  const detectKnownPath = useCallback(async () => {
    if (!canUseDesktopHost()) {
      setDirectoryStatus({ tone: 'error', message: copy.messages.browserHostPrompt })
      return null
    }

    setDirectoryStatus({ tone: 'working', message: copy.messages.detectingDefaultInstall })

    try {
      const detectedPath = await detectDefaultGameDirectory()
      if (!detectedPath) {
        setDirectoryStatus({ tone: 'error', message: copy.messages.automaticDetectionFailed })
        return null
      }

      setGameDirectory(detectedPath)
      setDirectoryStatus({ tone: 'ready', message: copy.messages.detectedKnownPath(detectedPath) })
      return detectedPath
    } catch (error) {
      setDirectoryStatus({
        tone: 'error',
        message: `${copy.messages.automaticDetectionFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    }
  }, [copy.messages])

  const validateCurrentDirectory = useCallback(() => validateDirectory(gameDirectory), [gameDirectory, validateDirectory])

  useEffect(() => {
    if (!active || !desktopHost || directoryInfo?.rootPath) {
      return
    }

    let cancelled = false

    async function detectAndValidateKnownPath() {
      setDirectoryStatus({ tone: 'working', message: copy.messages.detectingDefaultInstall })

      try {
        const detectedPath = await detectDefaultGameDirectory()
        if (cancelled) {
          return
        }

        if (!detectedPath) {
          setDirectoryStatus({ tone: 'idle', message: copy.messages.automaticDetectionFailed })
          return
        }

        setGameDirectory(detectedPath)
        const info = await validateGameDirectory(detectedPath)
        if (cancelled) {
          return
        }

        setDirectoryInfo(info)
        setGameDirectory(info.rootPath)
        setDirectoryStatus({ tone: 'ready', message: copy.messages.validatedDirectory(info.rootPath) })
      } catch (error) {
        if (!cancelled) {
          setDirectoryStatus({
            tone: 'error',
            message: `${copy.messages.automaticDetectionFailed} ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    }

    void detectAndValidateKnownPath()

    return () => {
      cancelled = true
    }
  }, [active, copy.messages, desktopHost, directoryInfo?.rootPath])

  useEffect(() => {
    if (!active || !desktopHost) {
      return
    }

    let disposed = false

    void listKnownGameDirectories()
      .then((paths) => {
        if (!disposed) {
          setKnownGameDirectories(paths)
        }
      })
      .catch(() => {
        if (!disposed) {
          setKnownGameDirectories([])
        }
      })

    return () => {
      disposed = true
    }
  }, [active, desktopHost])

  return {
    gameDirectory,
    setGameDirectory,
    directoryInfo,
    setDirectoryInfo,
    knownGameDirectories,
    directoryStatus,
    setDirectoryStatus,
    handleDirectoryInvalid,
    validateDirectory,
    validateCurrentDirectory,
    chooseDirectory,
    detectKnownPath,
  }
}
