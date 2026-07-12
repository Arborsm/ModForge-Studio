import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherPort } from './launcherPortContext'
import type { LauncherSettings } from './launcherContracts'
import { reportAppEvent } from '@platform/observability'
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
    left.gmcmParsingEnabled === right.gmcmParsingEnabled
  )
}

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
  const settingsVersionRef = useRef(0)

  const refreshWithVersion = useCallback(
    async (settingsVersionAtStart: number) => {
      setState('loading')
      setError(null)

      try {
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
        const resolved = resolveLauncherSettings(nextSettings)
        if (settingsVersionRef.current === settingsVersionAtStart) {
          setSettingsState(resolved)
        }
        setLastPersistedSettings(persisted)
        setState('ready')
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : launcherCopy.settings.loadFailed
        setError(message)
        setState('error')
        reportAppEvent({
          level: 'error',
          title: launcherCopy.settings.loadFailed,
          description: message,
          keyValues: {
            source: 'launcher-settings',
            operation: 'load',
          },
        })
      }
    },
    [launcherCopy.settings.loadFailed, launcherPort],
  )

  const refresh = useCallback(async () => {
    await refreshWithVersion(settingsVersionRef.current)
  }, [refreshWithVersion])

  useEffect(() => {
    const settingsVersionAtSchedule = settingsVersionRef.current
    const handle = window.setTimeout(() => {
      void refreshWithVersion(settingsVersionAtSchedule)
    }, 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [refreshWithVersion])

  const resolvedSettings = useMemo<LauncherSettings>(() => resolveLauncherSettings(settings), [settings])

  useLayoutEffect(() => {
    stateRef.current = state
    resolvedSettingsRef.current = resolvedSettings
    lastPersistedSettingsRef.current = lastPersistedSettings
    saveSettingsRef.current = launcherPort.saveSettings
  }, [lastPersistedSettings, launcherPort.saveSettings, resolvedSettings, state])

  const setSettings = useCallback((nextSettings: SetStateAction<LauncherSettings>) => {
    settingsVersionRef.current += 1
    setSettingsState(nextSettings)
    setSaveMessage(null)
  }, [])

  const updateField = useCallback(<TKey extends keyof LauncherSettings>(field: TKey, value: LauncherSettings[TKey]) => {
    settingsVersionRef.current += 1
    setSettingsState((current) => ({
      ...current,
      [field]: value,
    }))
    setSaveMessage(null)
  }, [])

  const persistSettings = useCallback(
    async (nextSettings: LauncherSettings, options?: { notifySuccess?: boolean }) => {
      const notifySuccess = options?.notifySuccess ?? true
      const settingsVersionAtStart = settingsVersionRef.current

      setError(null)
      setSaveMessage(null)
      reportAppEvent({
        level: 'debug',
        title: 'Saving launcher settings',
        notify: false,
        keyValues: {
          source: 'launcher-settings',
          operation: 'save',
        },
      })

      try {
        const persisted = resolveLauncherSettings(await launcherPort.saveSettings(nextSettings))
        if (settingsVersionRef.current === settingsVersionAtStart) {
          setSettingsState(persisted)
        }
        setLastPersistedSettings(persisted)
        setSaveMessage('saved')
        setState('ready')
        if (notifySuccess) {
          reportAppEvent({
            level: 'success',
            title: launcherCopy.settings.saved,
            keyValues: {
              source: 'launcher-settings',
              operation: 'save',
              game_path: persisted.gamePath ?? undefined,
            },
          })
        }
        return persisted
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : launcherCopy.settings.saveFailed
        setError(message)
        setSaveMessage('error')
        setState('error')
        reportAppEvent({
          level: 'error',
          title: launcherCopy.settings.saveFailed,
          description: message,
          keyValues: {
            source: 'launcher-settings',
            operation: 'save',
          },
        })
        throw nextError
      }
    },
    [launcherCopy.settings.saveFailed, launcherCopy.settings.saved, launcherPort],
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
