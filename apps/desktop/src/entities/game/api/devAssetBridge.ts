import type { GameDirectoryInfo, MapAssetContent, ParsedEventAssetContent, ResourceRegistry, TextAssetContent } from './types'

function getDevAssetBridgeBaseUrl() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return null
  }

  const rawValue = new URLSearchParams(window.location.search).get('mfEventEditorAssetBridge')
  if (rawValue === null) {
    return null
  }

  const trimmed = rawValue.trim()
  if (!trimmed || trimmed === '1') {
    return 'http://127.0.0.1:5187'
  }

  return trimmed.replace(/\/+$/u, '')
}

/** Returns whether the dev HTTP asset bridge is enabled for the current browser URL. */
export function canUseDevAssetBridge() {
  return getDevAssetBridgeBaseUrl() !== null
}

async function fetchBridgeJson<T>(path: string, params: Record<string, string | undefined>) {
  const baseUrl = getDevAssetBridgeBaseUrl()
  if (!baseUrl) {
    return null
  }

  const url = new URL(`${baseUrl}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Dev asset bridge request failed: ${response.status} ${text}`)
  }

  return (await response.json()) as T
}

/** Loads a map through the dev HTTP bridge so plain Chrome can consume Rust-parsed assets. */
export function loadMapAssetFromDevBridge(rootPath: string, mapPath: string, locale?: string) {
  return fetchBridgeJson<MapAssetContent>('/load-map-asset', { rootPath, mapPath, locale })
}

/** Loads a text/data asset through the dev HTTP bridge so browser-only labs can reuse the desktop parser. */
export function loadTextAssetFromDevBridge(rootPath: string, assetPath: string, locale?: string) {
  return fetchBridgeJson<TextAssetContent>('/load-text-asset', { rootPath, assetPath, locale })
}

/** Loads a parsed event asset through the dev bridge. */
export function loadEventAssetFromDevBridge(rootPath: string, assetPath: string, locale?: string) {
  return fetchBridgeJson<ParsedEventAssetContent>('/load-event-asset', { rootPath, assetPath, locale })
}

/** Loads an image through the dev HTTP bridge so plain Chrome can consume Rust-decoded XNB textures. */
export function loadImageDataUrlFromDevBridge(path: string, locale?: string, options: { optional?: boolean } = {}) {
  return fetchBridgeJson<string | null>('/load-image-data-url', { path, locale, optional: options.optional ? '1' : undefined })
}

/** Validates a game directory through the dev HTTP bridge. */
export function validateGameDirectoryFromDevBridge(path: string) {
  return fetchBridgeJson<GameDirectoryInfo>('/validate-game-directory', { path })
}

/** Detects the default Stardew Valley directory through the dev HTTP bridge. */
export function detectDefaultGameDirectoryFromDevBridge() {
  return fetchBridgeJson<string | null>('/detect-default-game-directory', {})
}

/** Loads the desktop resource registry through the dev HTTP bridge for browser-only labs. */
export function loadResourceRegistryFromDevBridge(rootPath: string, locale?: string) {
  return fetchBridgeJson<ResourceRegistry>('/load-resource-registry', { rootPath, locale })
}
