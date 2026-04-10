import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_MODE_STORAGE_KEY,
  DEBUG_ENABLED_STORAGE_KEY,
  LAUNCHER_PAGE_STORAGE_KEY,
  persistAppShellState,
  readStoredAppShellState,
} from './appShell'

describe('appShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns defaults when there is no persisted shell state', () => {
    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
    })
  })

  it('reads valid persisted app mode, launcher page, and debug mode', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'debug')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'true')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'debug',
      debugEnabled: true,
    })
  })

  it('migrates the legacy persisted settings page value to debug', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'settings')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'debug',
      debugEnabled: false,
    })
  })

  it('falls back to defaults for unsupported persisted values', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'invalid')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'downloads')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'verbose')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
    })
  })

  it('persists mode, page, and debug mode independently', () => {
    persistAppShellState({
      appMode: 'launcher',
      launcherPage: 'discover',
      debugEnabled: true,
    })

    expect(window.localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('launcher')
    expect(window.localStorage.getItem(LAUNCHER_PAGE_STORAGE_KEY)).toBe('discover')
    expect(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY)).toBe('true')
  })

  it('keeps running when localStorage throws', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
    })
    expect(() =>
      persistAppShellState({
        appMode: 'launcher',
        launcherPage: 'library',
        debugEnabled: false,
      }),
    ).not.toThrow()

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })
})
