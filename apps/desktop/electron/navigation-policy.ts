/**
 * Navigation policy for the Electron renderer. The renderer holds a privileged
 * preload bridge, so it must stay on the local application document: any other
 * target is handed to the system browser instead of being loaded in-app.
 */
export type NavigationPolicy = {
  /** Dev server document URL, when the app runs against the Vite dev server. */
  devUrl?: string
  /** Absolute path of the packaged renderer entry document. */
  appFilePath?: string
}

function normalizeFileUrl(value: string) {
  return decodeURIComponent(value).replace(/\\/gu, '/')
}

/** True when a navigation target is the application document itself. */
export function isInternalNavigationUrl(target: string, policy: NavigationPolicy) {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }

  if (url.protocol === 'file:') {
    if (!policy.appFilePath) {
      return false
    }
    return normalizeFileUrl(url.pathname) === normalizeFileUrl(`/${policy.appFilePath.replace(/^\/+/u, '')}`)
  }

  if (!policy.devUrl) {
    return false
  }

  try {
    return url.origin === new URL(policy.devUrl).origin
  } catch {
    return false
  }
}

/** True when a navigation target may be handed to the system browser. */
export function isExternalBrowserUrl(target: string) {
  try {
    const { protocol } = new URL(target)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
