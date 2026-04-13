import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../desktop', () => ({
  canUseDesktopHost: vi.fn(),
  loadAppUiState: vi.fn(),
  patchAppUiState: vi.fn(),
}))

describe('uiState store', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates the in-memory snapshot from the desktop bridge when available', async () => {
    const desktop = await import('../desktop')
    vi.mocked(desktop.canUseDesktopHost).mockReturnValue(true)
    vi.mocked(desktop.loadAppUiState).mockResolvedValue({
      version: 1,
      shell: {
        appMode: 'workbench',
        launcherPage: 'library',
        debugEnabled: false,
        notificationSoundEnabled: true,
      },
      appearance: {
        locale: 'en-US',
        accentPresetId: 'cyan',
        recentGameDirectories: ['C:\\Games\\Stardew Valley'],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
      },
      workspace: {
        layouts: {},
      },
      launcher: {
        discoverToolbar: {
          sort: 'downloads',
          ascending: true,
          timeRange: 'month',
          pageSize: 40,
          filtersHidden: true,
        },
        forceOffline: true,
      },
    })
    const { initializeAppUiState, getAppUiStateSnapshot } = await import('./uiState')

    await expect(initializeAppUiState()).resolves.toMatchObject({
      shell: {
        appMode: 'workbench',
      },
      appearance: {
        locale: 'en-US',
      },
    })
    expect(getAppUiStateSnapshot()).toMatchObject({
      launcher: {
        discoverToolbar: {
          sort: 'downloads',
          filtersHidden: true,
        },
        forceOffline: true,
      },
    })
  })

  it('keeps state in memory without desktop persistence when the desktop host is unavailable', async () => {
    const desktop = await import('../desktop')
    vi.mocked(desktop.canUseDesktopHost).mockReturnValue(false)
    const { applyAppUiStatePatch, getAppUiStateSnapshot } = await import('./uiState')

    await expect(
      applyAppUiStatePatch({
        shell: {
          appMode: 'workbench',
          launcherPage: 'library',
          debugEnabled: true,
          notificationSoundEnabled: false,
        },
      }),
    ).resolves.toMatchObject({
      shell: {
        appMode: 'workbench',
        debugEnabled: true,
      },
    })
    expect(getAppUiStateSnapshot()).toMatchObject({
      shell: {
        appMode: 'workbench',
        debugEnabled: true,
      },
    })
    expect(desktop.patchAppUiState).not.toHaveBeenCalled()
  })

  it('removes workspace layout entries when a patch sets them to null', async () => {
    const desktop = await import('../desktop')
    vi.mocked(desktop.canUseDesktopHost).mockReturnValue(false)
    const { applyAppUiStatePatch, getAppUiStateSnapshot } = await import('./uiState')

    await applyAppUiStatePatch({
      workspace: {
        layouts: {
          'modforge:workspace-layout:v12:map': { panels: { sidebar: { visible: true } } },
          'modforge:workspace-layout:v12:items': { panels: { inspector: { visible: false } } },
        },
      },
    })

    await applyAppUiStatePatch({
      workspace: {
        layouts: {
          'modforge:workspace-layout:v12:map': null,
        },
      },
    })

    expect(getAppUiStateSnapshot().workspace.layouts).toEqual({
      'modforge:workspace-layout:v12:items': { panels: { inspector: { visible: false } } },
    })
  })

  it('keeps the launcher force-offline flag in memory when applying launcher patches locally', async () => {
    const desktop = await import('../desktop')
    vi.mocked(desktop.canUseDesktopHost).mockReturnValue(false)
    const { applyAppUiStatePatch, getAppUiStateSnapshot } = await import('./uiState')

    await applyAppUiStatePatch({
      launcher: {
        forceOffline: true,
      },
    })

    expect(getAppUiStateSnapshot()).toMatchObject({
      launcher: {
        forceOffline: true,
      },
    })
  })
})
