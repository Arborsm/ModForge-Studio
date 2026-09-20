import { ANDROID_ACTIVITY_RESUME_EVENT, androidAiRequest } from '@platform/android'
import type { AndroidAiResponse } from '@platform/android'
import { loadAiSettings } from '@platform/host/ai'
import { getPlatformPorts } from '@platform/host/runtime'
import type { AiProviderPreset, AiProviderProfile } from '@shared/contracts'

/**
 * @file Android bridge facade for the launcher's game-log AI features. All
 * platform touches live here (mirroring `launcherDesktopApi.ts`): the analysis
 * consumes the existing workbench AI settings through the same host commands
 * as the desktop AI panel (bridged natively), the log line-count cursor
 * persists in the platform key-value storage, and the provider HTTP hop goes
 * through the native `android:ai_request` proxy with profileId-based auth.
 */

const CURSOR_STORAGE_KEY = 'modforge.launcher.gameLogCursor'

/**
 * Resolves the workbench profile that log analysis should use: the configured
 * default profile, falling back to the first saved profile when no default is
 * set. Also returns the matching preset so callers can tell keyless presets
 * apart from key-backed ones. Null when no profile exists at all.
 */
export async function loadLogAnalysisProfile(): Promise<{ profile: AiProviderProfile; preset: AiProviderPreset | null } | null> {
  const snapshot = await loadAiSettings()
  const profile = snapshot.defaultProfileId ? snapshot.profiles.find((candidate) => candidate.id === snapshot.defaultProfileId) : undefined
  const resolved = profile ?? snapshot.profiles[0] ?? null
  if (!resolved) {
    return null
  }
  const preset = snapshot.presets.find((candidate) => candidate.id === resolved.presetId) ?? null
  return { profile: resolved, preset }
}

/** Reads the persisted log line-count cursor; absent or corrupt values yield null. */
export function loadGameLogCursor(): number | null {
  try {
    const raw = getPlatformPorts().storage.getItem(CURSOR_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  } catch {
    return null
  }
}

export function saveGameLogCursor(cursor: number) {
  getPlatformPorts().storage.setItem(CURSOR_STORAGE_KEY, String(cursor))
}

/**
 * Subscribes to launcher-activity resume boundaries (returning from the game
 * activity or another paused surface). The game task never finishes the
 * launcher activity, so the web app does not remount on return; this event is
 * the session boundary the mount-time log watch cannot see. Resolves to the
 * unsubscribe callback once the platform listener is attached.
 */
export async function listenLauncherResume(callback: () => void): Promise<() => void> {
  return getPlatformPorts().hostEvents.listen(ANDROID_ACTIVITY_RESUME_EVENT, callback)
}

/** Pipes one provider request through the native HTTP proxy; the stored credential is attached by profileId. */
export function requestLogAnalysisAi(request: {
  profileId: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}): Promise<AndroidAiResponse> {
  return androidAiRequest(request)
}
