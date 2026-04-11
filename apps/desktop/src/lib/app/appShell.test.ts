import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_MODE_STORAGE_KEY,
  DEBUG_ENABLED_STORAGE_KEY,
  LAUNCHER_PAGE_STORAGE_KEY,
  NOTIFICATION_SOUND_ENABLED_STORAGE_KEY,
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
      notificationSoundEnabled: true,
    })
  })

  it('reads valid persisted app mode, launcher page, debug mode, and notification sound mode', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'debug')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'true')
    window.localStorage.setItem(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY, 'false')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'debug',
      debugEnabled: true,
      notificationSoundEnabled: false,
    })
  })

  it('migrates the legacy persisted settings page value to debug', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'launcher')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'settings')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'debug',
      debugEnabled: false,
      notificationSoundEnabled: true,
    })
  })

  it('falls back to defaults for unsupported persisted values', () => {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, 'invalid')
    window.localStorage.setItem(LAUNCHER_PAGE_STORAGE_KEY, 'downloads')
    window.localStorage.setItem(DEBUG_ENABLED_STORAGE_KEY, 'verbose')
    window.localStorage.setItem(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY, 'loud')

    expect(readStoredAppShellState()).toEqual({
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
      notificationSoundEnabled: true,
    })
  })

  it('persists mode, page, debug mode, and notification sound mode independently', () => {
    persistAppShellState({
      appMode: 'launcher',
      launcherPage: 'discover',
      debugEnabled: true,
      notificationSoundEnabled: false,
    })

    expect(window.localStorage.getItem(APP_MODE_STORAGE_KEY)).toBe('launcher')
    expect(window.localStorage.getItem(LAUNCHER_PAGE_STORAGE_KEY)).toBe('discover')
    expect(window.localStorage.getItem(DEBUG_ENABLED_STORAGE_KEY)).toBe('true')
    expect(window.localStorage.getItem(NOTIFICATION_SOUND_ENABLED_STORAGE_KEY)).toBe('false')
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
      notificationSoundEnabled: true,
    })
    expect(() =>
      persistAppShellState({
        appMode: 'launcher',
        launcherPage: 'library',
        debugEnabled: false,
        notificationSoundEnabled: true,
      }),
    ).not.toThrow()

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })
})
