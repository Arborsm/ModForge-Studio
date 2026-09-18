/** @file Android-host download location tokens. The Android WebView host can only
 * write inside the app sandbox (API 30+ storage rules), so the download directory
 * is a choice between sandbox folders, stored as a token the native side resolves. */

export const ANDROID_DOWNLOAD_LOCATION_TOKENS = ['@downloads', '@picked'] as const

export type AndroidDownloadLocationToken = (typeof ANDROID_DOWNLOAD_LOCATION_TOKENS)[number]

export const ANDROID_DOWNLOAD_LOCATION_DEFAULT: AndroidDownloadLocationToken = '@downloads'

export function isAndroidDownloadLocationToken(value: string | null | undefined): value is AndroidDownloadLocationToken {
  return typeof value === 'string' && (ANDROID_DOWNLOAD_LOCATION_TOKENS as readonly string[]).includes(value)
}

/** Maps a stored downloadPath to a selectable token; legacy sandbox paths are
 * normalized by the native side, anything unknown falls back to the default. */
export function normalizeAndroidDownloadLocation(value: string | null | undefined): AndroidDownloadLocationToken {
  return isAndroidDownloadLocationToken(value) ? value : ANDROID_DOWNLOAD_LOCATION_DEFAULT
}
