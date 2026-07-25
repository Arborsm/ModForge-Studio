import { useCallback, useLayoutEffect, useState } from 'react'

/**
 * Installer light/dark theme preference.
 *
 * Defaults to following the OS (`prefers-color-scheme`) and tracks live OS
 * changes while the preference stays on `system`. Toggling from the titlebar
 * pins an explicit mode and persists it to localStorage so the next installer
 * run (install or uninstall) restores it.
 */

export type InstallerThemePreference = 'system' | 'light' | 'dark'
export type ResolvedInstallerTheme = 'light' | 'dark'

const STORAGE_KEY = 'modforge.installer.theme-preference'

function readStoredPreference(): InstallerThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    /* localStorage unavailable — fall through to system */
  }
  return 'system'
}

function resolveSystemTheme(): ResolvedInstallerTheme {
  if (typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToDocument(resolved: ResolvedInstallerTheme) {
  const root = document.documentElement
  root.classList.toggle('light', resolved === 'light')
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.themeMode = resolved
  root.style.colorScheme = resolved
}

export function useInstallerTheme() {
  const [preference, setPreference] = useState<InstallerThemePreference>(readStoredPreference)
  const [systemTheme, setSystemTheme] = useState<ResolvedInstallerTheme>(resolveSystemTheme)

  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const resolvedTheme: ResolvedInstallerTheme = preference === 'system' ? systemTheme : preference

  useLayoutEffect(() => {
    applyThemeToDocument(resolvedTheme)
  }, [resolvedTheme])

  const toggleTheme = useCallback(() => {
    const next: ResolvedInstallerTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    setPreference(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* persistence is best-effort */
    }
  }, [resolvedTheme])

  return { resolvedTheme, toggleTheme }
}
