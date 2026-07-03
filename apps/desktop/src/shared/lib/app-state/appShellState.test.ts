import { describe, expect, it } from 'vite-plus/test'
import { DEFAULT_APP_SHELL_STATE, normalizeAppShellState } from './appShellState'

describe('appShell', () => {
  it('returns defaults when no shell state is provided', () => {
    expect(normalizeAppShellState()).toEqual(DEFAULT_APP_SHELL_STATE)
    expect(normalizeAppShellState(null)).toEqual(DEFAULT_APP_SHELL_STATE)
  })

  it('keeps valid app mode, launcher page, and boolean flags', () => {
    expect(
      normalizeAppShellState({
        appMode: 'launcher',
        launcherPage: 'configuration',
        debugEnabled: true,
        notificationSoundEnabled: false,
      }),
    ).toEqual({
      appMode: 'launcher',
      launcherPage: 'configuration',
      debugEnabled: true,
      notificationSoundEnabled: false,
    })
  })

  it('falls back to defaults for unsupported values', () => {
    expect(
      normalizeAppShellState({
        appMode: 'invalid',
        launcherPage: 'downloads',
        debugEnabled: 'verbose',
        notificationSoundEnabled: 'loud',
      } as never),
    ).toEqual(DEFAULT_APP_SHELL_STATE)
  })
})
