import type { OpenDialogOptions } from '../shared/contracts/platform'

/** Transport-agnostic browser-storage adapter shared by the Tauri and Electron platform adapters. */
export function createBrowserStorage() {
  return {
    getItem(key: string) {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key)
    },
    setItem(key: string, value: string) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value)
      }
    },
    removeItem(key: string) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    },
  }
}

/**
 * Dialog choosers shared by both platform adapters; only the transport-level
 * openDialog call differs, so it is injected.
 */
export function createDialogChoosers(openDialog: (options?: OpenDialogOptions) => Promise<string | string[] | null>) {
  return {
    async chooseDirectory(title?: string) {
      const selected = await openDialog({ title, directory: true, multiple: false })
      return typeof selected === 'string' ? selected : null
    },
    async chooseFile(options?: OpenDialogOptions) {
      const selected = await openDialog({ ...options, directory: false, multiple: false })
      return typeof selected === 'string' ? selected : null
    },
  }
}
