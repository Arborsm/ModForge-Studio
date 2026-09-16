/**
 * @file useLauncherSettings hook: launcher settings load/save with autosave,
 * default-path derivation, and exit-time flush.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherPort } from './launcherPortContext'
import type { LauncherSettings } from './launcherContracts'
import { appEvent } from '@platform/observability'
import { TaskCancelledError, useExclusiveMutationTask, useLatestTask } from '@shared/lib/task-runtime'
import type { LauncherViewState } from './types'

const DEFAULT_SETTINGS: LauncherSettings = {
  gamePath: null,
  modsPath: null,
  downloadPath: null,
  nexusApiKey: null,
  autoInstallDownloads: false,
  keepDownloadedArchives: false,
  autoCheckModUpdates: true,
  gmcmParsingEnabled: true,
  showConsoleWindow: false,
}

const AUTOSAVE_DELAY_MS = 700

function defaultDownloadPath() {
  const home =
    typeof process !== 'undefined' && typeof process.env?.USERPROFILE === 'string'
      ? process.env.USERPROFILE
      : typeof process !== 'undefined' && typeof process.env?.HOME === 'string'
        ? process.env.HOME
        : null

  return home ? `${home.replace(/[\\/]+$/, '')}\\Downloads\\ModForge Studio` : null
}

function deriveModsPath(gamePath: string) {
  const trimmedPath = gamePath.trim().replace(/[\\/]+$/, '')
  if (!trimmedPath) {
    return null
  }

  const separator = trimmedPath.includes('\\') ? '\\' : '/'
  return `${trimmedPath}${separator}Mods`
}

function normalizePersistedLauncherSettings(settings: LauncherSettings): LauncherSettings {
  return {
    ...settings,
    gamePath: settings.gamePath?.trim() ? settings.gamePath : null,
    modsPath: settings.modsPath?.trim() ? settings.modsPath : null,
    downloadPath: settings.downloadPath?.trim() ? settings.downloadPath : null,
    nexusApiKey: settings.nexusApiKey?.trim() ? settings.nexusApiKey : null,
    autoCheckModUpdates: settings.autoCheckModUpdates ?? true,
    gmcmParsingEnabled: settings.gmcmParsingEnabled ?? true,
    showConsoleWindow: settings.showConsoleWindow ?? false,
  }
}

function resolveLauncherSettings(settings: LauncherSettings): LauncherSettings {
  const normalized = normalizePersistedLauncherSettings(settings)
  const nextGamePath = normalized.gamePath
  const nextModsPath = normalized.modsPath?.trim() ? normalized.modsPath : nextGamePath ? deriveModsPath(nextGamePath) : null
  const nextDownloadPath = normalized.downloadPath?.trim() ? normalized.downloadPath : defaultDownloadPath()

  return {
    ...normalized,
    gamePath: nextGamePath,
    modsPath: nextModsPath,
    downloadPath: nextDownloadPath,
  }
}

function launcherSettingsEqual(left: LauncherSettings | null, right: LauncherSettings | null) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return (
    left.gamePath === right.gamePath &&
    left.modsPath === right.modsPath &&
    left.downloadPath === right.downloadPath &&
    left.nexusApiKey === right.nexusApiKey &&
    left.autoInstallDownloads === right.autoInstallDownloads &&
    left.keepDownloadedArchives === right.keepDownloadedArchives &&
    left.autoCheckModUpdates === right.autoCheckModUpdates &&
    left.gmcmParsingEnabled === right.gmcmParsingEnabled &&
    left.showConsoleWindow === right.showConsoleWindow
  )
}

/** Manages launcher settings: load, edit, autosave, default-path derivation, and exit-time flush. */
export function useLauncherSettings() {
  const launcherPort = useLauncherPort()
  const launcherCopy = useEditorCopy().launcher
  const [settings, setSettingsState] = useState<LauncherSettings>(DEFAULT_SETTINGS)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [lastPersistedSettings, setLastPersistedSettings] = useState<LauncherSettings | null>(null)
  const stateRef = useRef(state)
  const resolvedSettingsRef = useRef<LauncherSettings>(DEFAULT_SETTINGS)
  const lastPersistedSettingsRef = useRef(lastPersistedSettings)
  const saveSettingsRef = useRef(launcherPort.saveSettings)
  const exitFlushRequestedRef = useRef(false)
  const loadSettingsTask = useLatestTask('launcher-settings-load')
  const saveSettingsTask = useExclusiveMutationTask('launcher-settings')

  const refreshWithTask = useCallback(async () => {
    setState('loading')
    setError(null)

    try {
      await loadSettingsTask(async (scope) => {
        const persisted = normalizePersistedLauncherSettings(await launcherPort.loadSettings())
        const nextSettings = { ...persisted }
        if (!nextSettings.gamePath?.trim()) {
          try {
            const detectedGamePath = await launcherPort.detectDefaultGameDirectory()
            if (detectedGamePath?.trim()) {
              nextSettings.gamePath = detectedGamePath
              if (!nextSettings.modsPath?.trim()) {
                nextSettings.modsPath = deriveModsPath(detectedGamePath)
              }
            }
          } catch {
            // Detection failure should not block loading persisted launcher settings.
          }
        }
        if (!scope.isCurrent()) {
          return
        }
        const resolved = resolveLauncherSettings(nextSettings)
        setSettingsState(resolved)
        setLastPersistedSettings(persisted)
        setState('ready')
      })
    } catch (nextError) {
      if (nextError instanceof TaskCancelledError) {
        return
      }
      const message = nextError instanceof Error ? nextError.message : launcherCopy.settings.loadFailed
      setError(message)
      setState('error')
      appEvent('error', launcherCopy.settings.loadFailed)
        .description(message)
        .context({
          source: 'launcher-settings',
          operation: 'load',
        })
        .emit()
    }
  }, [launcherCopy.settings.loadFailed, launcherPort, loadSettingsTask])

  const refresh = useCallback(async () => {
    await refreshWithTask()
  }, [refreshWithTask])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refreshWithTask()
    }, 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [refreshWithTask])

  const resolvedSettings = useMemo<LauncherSettings>(() => resolveLauncherSettings(settings), [settings])

  useLayoutEffect(() => {
    stateRef.current = state
    resolvedSettingsRef.current = resolvedSettings
    lastPersistedSettingsRef.current = lastPersistedSettings
    saveSettingsRef.current = launcherPort.saveSettings
  }, [lastPersistedSettings, launcherPort.saveSettings, resolvedSettings, state])

  // A user edit supersedes any in-flight load so its result cannot clobber the edit.
  const supersedeInFlightLoad = useCallback(() => {
    void loadSettingsTask(async () => undefined).catch((error) => {
      if (!(error instanceof TaskCancelledError)) throw error
    })
  }, [loadSettingsTask])

  const setSettings = (nextSettings: SetStateAction<LauncherSettings>) => {
    supersedeInFlightLoad()
    setSettingsState(nextSettings)
    setSaveMessage(null)
  }

  const updateField = useCallback(
    <TKey extends keyof LauncherSettings>(field: TKey, value: LauncherSettings[TKey]) => {
      supersedeInFlightLoad()
      setSettingsState((current) => ({
        ...current,
        [field]: value,
      }))
      setSaveMessage(null)
    },
    [supersedeInFlightLoad],
  )

  const persistSettings = useCallback(
    async (nextSettings: LauncherSettings, options?: { notifySuccess?: boolean }) => {
      const notifySuccess = options?.notifySuccess ?? true

      setError(null)
      setSaveMessage(null)
      appEvent('debug', 'Saving launcher settings')
        .context({
          source: 'launcher-settings',
          operation: 'save',
        })
        .emit({ notify: false })

      try {
        return await saveSettingsTask(async (scope) => {
          const persisted = resolveLauncherSettings(await launcherPort.saveSettings(nextSettings))
          // Supersede any older load that may still be resolving; the save result owns the state now.
          await loadSettingsTask(async () => undefined)
          if (scope.isCurrent()) {
            setSettingsState(persisted)
          }
          setLastPersistedSettings(persisted)
          setSaveMessage('saved')
          setState('ready')
          if (notifySuccess) {
            appEvent('success', launcherCopy.settings.saved)
              .context({
                source: 'launcher-settings',
                operation: 'save',
                gamePath: persisted.gamePath ?? undefined,
              })
              .emit()
          }
          return persisted
        })
      } catch (nextError) {
        if (nextError instanceof TaskCancelledError) {
          return undefined
        }
        const message = nextError instanceof Error ? nextError.message : launcherCopy.settings.saveFailed
        setError(message)
        setSaveMessage('error')
        setState('error')
        appEvent('error', launcherCopy.settings.saveFailed)
          .description(message)
          .context({
            source: 'launcher-settings',
            operation: 'save',
          })
          .emit()
        throw nextError
      }
    },
    [launcherCopy.settings.saveFailed, launcherCopy.settings.saved, launcherPort, loadSettingsTask, saveSettingsTask],
  )

  const flushPendingSettings = useCallback(async () => {
    if (exitFlushRequestedRef.current || stateRef.current !== 'ready') {
      return
    }

    const currentResolved = resolvedSettingsRef.current
    const currentPersisted = lastPersistedSettingsRef.current
    if (launcherSettingsEqual(currentResolved, currentPersisted)) {
      return
    }

    exitFlushRequestedRef.current = true

    try {
      await saveSettingsRef.current(currentResolved)
    } catch {
      // Exit-time flush is best effort; the normal autosave path still reports save errors.
    }
  }, [])

  const save = useCallback(
    async (options?: { notifySuccess?: boolean }) => {
      return persistSettings(resolvedSettings, options)
    },
    [persistSettings, resolvedSettings],
  )

  useEffect(() => {
    if (state !== 'ready' || launcherSettingsEqual(resolvedSettings, lastPersistedSettings)) {
      return
    }

    const handle = window.setTimeout(() => {
      void persistSettings(resolvedSettings, { notifySuccess: false })
    }, AUTOSAVE_DELAY_MS)

    return () => {
      window.clearTimeout(handle)
    }
  }, [lastPersistedSettings, persistSettings, resolvedSettings, state])

  useEffect(() => {
    const handlePageExit = () => {
      void flushPendingSettings()
    }

    window.addEventListener('beforeunload', handlePageExit)
    window.addEventListener('pagehide', handlePageExit)

    return () => {
      window.removeEventListener('beforeunload', handlePageExit)
      window.removeEventListener('pagehide', handlePageExit)
      void flushPendingSettings()
    }
  }, [flushPendingSettings])

  const pickDirectory = useCallback(
    async (field: 'gamePath' | 'modsPath' | 'downloadPath', title: string) => {
      const selected = await launcherPort.chooseDirectory(title)
      if (!selected) {
        return null
      }

      updateField(field, selected)
      if (field === 'gamePath' && !resolvedSettings.modsPath) {
        updateField('modsPath', `${selected}\\Mods`)
      }
      return selected
    },
    [resolvedSettings.modsPath, updateField, launcherPort],
  )

  return {
    settings: resolvedSettings,
    state,
    error,
    saveMessage,
    setSettings,
    updateField,
    save,
    refresh,
    pickDirectory,
  }
}
