import type { LauncherSettings } from '../desktop'
import { useLauncherDownloads } from './useLauncherDownloads'
import { useLauncherSettings } from './useLauncherSettings'

export type LauncherWarningState = {
  missingGamePath: boolean
  missingModsPath: boolean
  missingDownloadPath: boolean
  missingCredentials: boolean
}

export function hasLauncherCredentials(settings: LauncherSettings) {
  return Boolean(settings.nexusApiKey?.trim() || settings.nexusCookie?.trim())
}

export function getLauncherWarningState(settings: LauncherSettings): LauncherWarningState {
  return {
    missingGamePath: !settings.gamePath?.trim(),
    missingModsPath: !settings.modsPath?.trim(),
    missingDownloadPath: !settings.downloadPath?.trim(),
    missingCredentials: !hasLauncherCredentials(settings),
  }
}

export function useLauncherRuntime() {
  const settingsState = useLauncherSettings()
  const downloads = useLauncherDownloads(settingsState.settings)
  const warningState = getLauncherWarningState(settingsState.settings)
  const downloadsBadgeCount =
    downloads.counts.failed > 0
      ? downloads.counts.failed
      : downloads.counts.queued + downloads.counts.downloading + downloads.counts.readyToInstall

  return {
    settingsState,
    downloads,
    credentialsReady: hasLauncherCredentials(settingsState.settings),
    warningState,
    settingsWarning: Object.values(warningState).some(Boolean),
    downloadsBadgeCount,
    downloadsHasFailure: downloads.counts.failed > 0,
  }
}
