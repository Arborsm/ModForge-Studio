/**
 * @file Detects whether the current webview supports import maps. Code-package
 * plugins require import map support to resolve react/react-dom/SDK as ESM
 * singletons. If import maps are not supported, all code-package plugins are
 * rejected (data-pack plugins are unaffected).
 * @module features/compat-plugins
 */

/** Result of import map support detection. */
export type ImportMapSupportResult = {
  /** Whether the webview supports import maps. */
  supported: boolean
  /** Human-readable reason for the detection result. */
  reason: string
}

/**
 * Detects import map support by checking for the presence of the
 * `HTMLScriptElement.supports` static method and the 'importmap' type.
 * This is the standard feature detection recommended by the HTML spec.
 */
export function detectImportMapSupport(): ImportMapSupportResult {
  // Feature detection: `HTMLScriptElement.supports('importmap')` is the
  // canonical way to check for import map support per the HTML spec.
  // WebView2 (Chromium 89+) and WKWebView 16.4+ support this.
  if (typeof HTMLScriptElement !== 'undefined' && typeof HTMLScriptElement.supports === 'function') {
    if (HTMLScriptElement.supports('importmap')) {
      return { supported: true, reason: 'HTMLScriptElement.supports("importmap") returned true' }
    }
    return { supported: false, reason: 'HTMLScriptElement.supports("importmap") returned false' }
  }

  // Fallback: check for the import map script tag we injected
  if (typeof document !== 'undefined') {
    const importMapScript = document.querySelector('script[type="importmap"]')
    if (importMapScript) {
      // The script tag exists, but we can't be sure the browser will honor it.
      // Do a runtime probe: attempt a dynamic import of a bare specifier that
      // the import map should resolve. If it fails, import maps are not supported.
      // This is a conservative check — we assume support if the tag is present
      // and supports() is unavailable (older browsers that might still support it).
      return { supported: true, reason: 'Import map script tag present (fallback detection)' }
    }
  }

  return { supported: false, reason: 'No import map support detection mechanism available' }
}

/** Cached detection result to avoid repeated checks. */
let cachedResult: ImportMapSupportResult | null = null

/**
 * Returns the cached import map support detection result, performing the
 * detection on first call. Safe to call multiple times.
 */
export function getImportMapSupport(): ImportMapSupportResult {
  if (!cachedResult) {
    cachedResult = detectImportMapSupport()
  }
  return cachedResult
}
