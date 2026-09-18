import { androidAiRequest } from '@platform/android'
import type { AndroidAiResponse } from '@platform/android'
import { getPlatformPorts } from '@platform/host/runtime'
import type { LogAnalysisAiConfig } from '../model/logAnalysisAi'

/**
 * @file Android bridge facade for the launcher's self-contained AI features.
 * All platform touches for the game-log analysis live here (mirroring
 * `launcherDesktopApi.ts` for desktop host commands): the minimal provider
 * config and the log line-count cursor persist in the platform key-value
 * storage, and the provider HTTP hop goes through the native
 * `android:ai_request` proxy.
 */

const CONFIG_STORAGE_KEY = 'modforge.launcher.logAnalysisAi'
const CURSOR_STORAGE_KEY = 'modforge.launcher.gameLogCursor'

/** Reads the persisted log-analysis config; invalid or partial payloads yield null. */
export function loadLogAnalysisAiConfig(): LogAnalysisAiConfig | null {
  try {
    const raw = getPlatformPorts().storage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<LogAnalysisAiConfig>
    if (typeof parsed.providerId !== 'string' || typeof parsed.model !== 'string' || typeof parsed.apiKey !== 'string') {
      return null
    }
    return { providerId: parsed.providerId, model: parsed.model, apiKey: parsed.apiKey }
  } catch {
    return null
  }
}

export function saveLogAnalysisAiConfig(config: LogAnalysisAiConfig) {
  getPlatformPorts().storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
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

/** Pipes one provider request through the native HTTP proxy. */
export function requestLogAnalysisAi(request: {
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}): Promise<AndroidAiResponse> {
  return androidAiRequest(request)
}
