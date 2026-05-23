import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'
import type { LauncherSettings } from './launcherContracts'
import { getLauncherCopy, type LocaleCode } from '@locales/editor-shell'
import { reportAppEvent } from '@shared/lib/observability'
import type { LauncherViewState } from './types'

const DEFAULT_SETTINGS: LauncherSettings = {
  gamePath: null,
  modsPath: null,
  downloadPath: null,
  nexusApiKey: null,
  autoInstallDownloads: false,
  keepDownloadedArchives: false,
  autoCheckModUpdates: true,
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
    left.autoCheckModUpdates === right.autoCheckModUpdates
  )
}

type UseLauncherSettingsOptions = {
  locale?: LocaleCode
}

export function useLauncherSettings({ locale = 'en-US' }: UseLauncherSettingsOptions = {}) {
  const launcherPort = useLauncherPort()
  const launcherCopy = getLauncherCopy(locale)
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [lastPersistedSettings, setLastPersistedSettings] = useState<LauncherSettings | null>(null)
  const stateRef = useRef(state)
  const resolvedSettingsRef = useRef<LauncherSettings>(DEFAULT_SETTINGS)
  const lastPersistedSettingsRef = useRef(lastPersistedSettings)
  const saveSettingsRef = useRef(launcherPort.saveSettings)
  const exitFlushRequestedRef = useRef(false)

  const refresh = useCallback(async () => {
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
      setSettings(resolved)
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
  }, [launcherCopy.settings.loadFailed, launcherPort])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [refresh])

  const resolvedSettings = useMemo<LauncherSettings>(() => resolveLauncherSettings(settings), [settings])

  useLayoutEffect(() => {
    stateRef.current = state
    resolvedSettingsRef.current = resolvedSettings
    lastPersistedSettingsRef.current = lastPersistedSettings
    saveSettingsRef.current = launcherPort.saveSettings
  }, [lastPersistedSettings, launcherPort.saveSettings, resolvedSettings, state])

  const updateField = useCallback(<TKey extends keyof LauncherSettings>(field: TKey, value: LauncherSettings[TKey]) => {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }))
    setSaveMessage(null)
  }, [])

  const persistSettings = useCallback(
    async (nextSettings: LauncherSettings, options?: { notifySuccess?: boolean }) => {
      const notifySuccess = options?.notifySuccess ?? true

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
        setSettings(persisted)
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
