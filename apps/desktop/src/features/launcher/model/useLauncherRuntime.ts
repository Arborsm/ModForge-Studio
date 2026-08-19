/**
 * @file useLauncherRuntime hook: aggregates settings, downloads, and updates
 * badge counts into a single runtime state object for the launcher shell.
 */
import type { LauncherSettings } from './launcherContracts'
import { useLauncherDownloads } from './useLauncherDownloads'
import { useLauncherUpdatesBadgeCount } from './useLauncherUpdatesBadgeCount'
import { useLauncherSettings } from './useLauncherSettings'

/** Launcher configuration warning flags derived from settings. */
export type LauncherWarningState = {
  missingGamePath: boolean
  missingModsPath: boolean
  missingDownloadPath: boolean
  missingCredentials: boolean
}

/** Returns true when a Nexus API key is configured. */
export function hasLauncherCredentials(settings: LauncherSettings) {
  return Boolean(settings.nexusApiKey?.trim())
}

/** Derives configuration warning flags (missing paths/credentials) from settings. */
export function getLauncherWarningState(settings: LauncherSettings): LauncherWarningState {
  return {
    missingGamePath: !settings.gamePath?.trim(),
    missingModsPath: !settings.modsPath?.trim(),
    missingDownloadPath: !settings.downloadPath?.trim(),
    missingCredentials: !hasLauncherCredentials(settings),
  }
}

/** Aggregates settings, downloads, and updates badge counts into one runtime state object. */
export function useLauncherRuntime() {
  const settingsState = useLauncherSettings()
  const downloads = useLauncherDownloads(settingsState.settings)
  const updatesBadgeCount = useLauncherUpdatesBadgeCount(settingsState.settings)
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
    updatesBadgeCount,
    downloadsBadgeCount,
    downloadsProgressPercent: downloads.downloadProgressPercent,
    downloadsHasFailure: downloads.counts.failed > 0,
  }
}
