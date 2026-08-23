import { useCallback, useEffect, useState } from 'react'
import { detectDefaultGameDirectory, listKnownGameDirectories, validateGameDirectory, type GameDirectoryInfo } from '@entities/game/api'
import { canUseDesktopHost, chooseGameDirectory } from '@platform/host'
import type { EditorCopy } from '@locales'
import { appEvent, reportRecovered } from '@platform/observability'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import type { WorkspaceStatus } from '@entities/map'

function isDirectorySelectionCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

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
  const [directoryStatus, setDirectoryStatus] = useState<WorkspaceStatus>({
    tone: 'idle',
    message: '',
  })

  const handleDirectoryInvalid = useCallback(
    (message: string) => {
      setDirectoryInfo(null)
      setDirectoryStatus({ tone: 'error', message })
    },
    [setDirectoryInfo],
  )

  const validateDirectory = async (path: string = gameDirectory) => {
    const trimmedPath = path.trim()
    if (!trimmedPath) {
      setDirectoryStatus({
        tone: 'error',
        message: copy.messages.enterFolderBeforeValidating,
      })
      return null
    }

    setDirectoryStatus({
      tone: 'working',
      message: copy.messages.validatingDirectory,
    })

    try {
      const info = await validateGameDirectory(trimmedPath)
      setDirectoryInfo(info)
      setGameDirectory(info.rootPath)
      setDirectoryStatus({
        tone: 'ready',
        message: copy.messages.validatedDirectory(info.rootPath),
      })
      return info
    } catch (error) {
      setDirectoryInfo(null)
      setDirectoryStatus({
        tone: 'error',
        message: `${copy.messages.validationFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
      reportRecovered(error, 'workbench-game-directory.validate')
      // observability-exempt: the caller treats this parse or read failure as an explicit empty result, so the fallback is recoverable and intentional
      return null
    }
  }

  const chooseDirectory = async () => {
    try {
      const selectedPath = await chooseGameDirectory()
      if (!selectedPath) {
        return null
      }

      setGameDirectory(selectedPath)
      setDirectoryStatus({
        tone: 'idle',
        message: copy.messages.detectedKnownPath(selectedPath),
      })
      return selectedPath
    } catch (error) {
      setDirectoryStatus({
        tone: 'error',
        message: `${copy.messages.directorySelectionFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
      if (!isDirectorySelectionCancelled(error)) {
        reportRecovered(error, 'workbench-game-directory.choose')
      }
      // observability-exempt: the caller treats this parse or read failure as an explicit empty result, so the fallback is recoverable and intentional
      return null
    }
  }

  const detectKnownPath = async () => {
    if (!canUseDesktopHost()) {
      setDirectoryStatus({
        tone: 'error',
        message: copy.messages.browserHostPrompt,
      })
      return null
    }

    setDirectoryStatus({
      tone: 'working',
      message: copy.messages.detectingDefaultInstall,
    })

    try {
      const detectedPath = await detectDefaultGameDirectory()
      if (!detectedPath) {
        setDirectoryStatus({
          tone: 'error',
          message: copy.messages.automaticDetectionFailed,
        })
        return null
      }

      setGameDirectory(detectedPath)
      setDirectoryStatus({
        tone: 'ready',
        message: copy.messages.detectedKnownPath(detectedPath),
      })
      return detectedPath
    } catch (error) {
      setDirectoryStatus({
        tone: 'error',
        message: `${copy.messages.automaticDetectionFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
      reportRecovered(error, 'workbench-game-directory.detect')
      // observability-exempt: the caller treats this parse or read failure as an explicit empty result, so the fallback is recoverable and intentional
      return null
    }
  }

  const validateCurrentDirectory = () => validateDirectory(gameDirectory)
  const runDirectoryDetection = useLatestTask('workbench-game-directory-detection')
  const runKnownDirectoriesLoad = useLatestTask('workbench-game-directory-list')

  useEffect(() => {
    if (!active || !desktopHost || directoryInfo?.rootPath) {
      return
    }

    void runDirectoryDetection(async (scope) => {
      setDirectoryStatus({
        tone: 'working',
        message: copy.messages.detectingDefaultInstall,
      })

      try {
        const detectedPath = await detectDefaultGameDirectory()
        if (scope.signal.aborted || !scope.isCurrent()) {
          return
        }

        if (!detectedPath) {
          setDirectoryStatus({
            tone: 'idle',
            message: copy.messages.automaticDetectionFailed,
          })
          return
        }

        setGameDirectory(detectedPath)
        const info = await validateGameDirectory(detectedPath)
        if (scope.signal.aborted || !scope.isCurrent()) {
          return
        }

        setDirectoryInfo(info)
        setGameDirectory(info.rootPath)
        setDirectoryStatus({
          tone: 'ready',
          message: copy.messages.validatedDirectory(info.rootPath),
        })
      } catch (error) {
        if (error instanceof TaskCancelledError || !scope.isCurrent()) {
          return
        }

        setDirectoryStatus({
          tone: 'error',
          message: `${copy.messages.automaticDetectionFailed} ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    }).catch((error: unknown) => {
      if (!(error instanceof TaskCancelledError)) {
        throw error
      }
    })
  }, [active, copy.messages, desktopHost, directoryInfo?.rootPath, runDirectoryDetection])

  useEffect(() => {
    if (!active || !desktopHost) {
      return
    }

    void runKnownDirectoriesLoad(async (scope) => {
      try {
        const paths = await listKnownGameDirectories()
        if (scope.signal.aborted || !scope.isCurrent()) {
          return
        }

        setKnownGameDirectories(paths)
      } catch (error: unknown) {
        if (error instanceof TaskCancelledError || !scope.isCurrent()) {
          return
        }

        appEvent('error', 'Known game directories failed to load')
          .error(error)
          .context({
            source: 'workbench-game-directory',
            operation: 'list-known-directories',
          })
          .emit({ notify: false })
        setKnownGameDirectories([])
        setDirectoryStatus({
          tone: 'error',
          message: copy.messages.knownDirectoriesLoadFailed,
        })
      }
    }).catch((error: unknown) => {
      if (!(error instanceof TaskCancelledError)) {
        throw error
      }
    })
  }, [active, copy.messages, desktopHost, runKnownDirectoriesLoad])

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
