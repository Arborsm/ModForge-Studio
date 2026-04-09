import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_MODE_STORAGE_KEY,
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
    })
  })

  it('reads valid persisted app mode and launcher page', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'settings')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'settings',
    })
  })

  it('falls back to defaults for unsupported persisted values', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'invalid')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'downloads')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'library',
    })
  })

  it('persists mode and page independently', () => {
    persistAppShellState({
      appMode: 'launcher',
      launcherPage: 'discover',
    })

    expect(window.localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('launcher')
    expect(window.localStorage.getItem(LAUNCHER_PAGE_STORAGE_KEY)).toBe('discover')
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
    })
    expect(() =>
      persistAppShellState({
        appMode: 'launcher',
        launcherPage: 'library',
      }),
    ).not.toThrow()

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })
})
