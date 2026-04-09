import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  chooseDirectory,
  detectDefaultGameDirectory,
  loadLauncherSettings,
  saveLauncherSettings,
  type LauncherSettings,
} from '../desktop'
import { getLauncherCopy, type LocaleCode } from '../editor-shell'
import { reportAppEvent } from '../app/observability'
import type { LauncherViewState } from './types'

const DEFAULT_SETTINGS: LauncherSettings = {
  gamePath: null,
  modsPath: null,
  downloadPath: null,
  nexusApiKey: null,
  nexusCookie: null,
  autoInstallDownloads: false,
  keepDownloadedArchives: false,
}

function deriveModsPath(gamePath: string) {
  const trimmedPath = gamePath.trim().replace(/[\\/]+$/, '')
  if (!trimmedPath) {
    return null
  }

  const separator = trimmedPath.includes('\\') ? '\\' : '/'
  return `${trimmedPath}${separator}Mods`
}

type UseLauncherSettingsOptions = {
  locale?: LocaleCode
}

export function useLauncherSettings({ locale = 'en-US' }: UseLauncherSettingsOptions = {}) {
  const launcherCopy = getLauncherCopy(locale)
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setState('loading')
    setError(null)

    try {
      const nextSettings = await loadLauncherSettings()
      if (!nextSettings.gamePath?.trim()) {
        try {
          const detectedGamePath = await detectDefaultGameDirectory()
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
      setSettings(nextSettings)
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
  }, [launcherCopy.settings.loadFailed])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [refresh])

  const resolvedSettings = useMemo<LauncherSettings>(() => {
    const nextGamePath = settings.gamePath?.trim() ? settings.gamePath : null
    const nextModsPath = settings.modsPath?.trim() ? settings.modsPath : nextGamePath ? deriveModsPath(nextGamePath) : null

    if (nextGamePath === settings.gamePath && nextModsPath === settings.modsPath) {
      return settings
    }

    return {
      ...settings,
      gamePath: nextGamePath,
      modsPath: nextModsPath,
    }
  }, [settings])

  const updateField = useCallback(<TKey extends keyof LauncherSettings>(field: TKey, value: LauncherSettings[TKey]) => {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }))
    setSaveMessage(null)
  }, [])

  const save = useCallback(async () => {
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
      const persisted = await saveLauncherSettings(resolvedSettings)
      setSettings(persisted)
      setSaveMessage('saved')
      setState('ready')
      reportAppEvent({
        level: 'success',
        title: launcherCopy.settings.saved,
        keyValues: {
          source: 'launcher-settings',
          operation: 'save',
          game_path: persisted.gamePath ?? undefined,
        },
      })
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
  }, [launcherCopy.settings.saveFailed, launcherCopy.settings.saved, resolvedSettings])

  const pickDirectory = useCallback(
    async (field: 'gamePath' | 'modsPath' | 'downloadPath', title: string) => {
      const selected = await chooseDirectory(title)
      if (!selected) {
        return null
      }

      updateField(field, selected)
      if (field === 'gamePath' && !resolvedSettings.modsPath) {
        updateField('modsPath', `${selected}\\Mods`)
      }
      return selected
    },
    [resolvedSettings.modsPath, updateField],
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
