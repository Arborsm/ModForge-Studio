import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { AppUiState } from '@shared/contracts'
import { createLoadingMotionPreference } from '@shared/lib/loading-motion'

describe('uiState store', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('hydrates the in-memory snapshot from the desktop bridge when available', async () => {
    const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
    const persistedState: AppUiState = {
      version: 1,
      shell: {
        appMode: 'workbench',
        launcherPage: 'library',
        debugEnabled: false,
        notificationSoundEnabled: true,
        windowCloseBehavior: 'quit',
        rememberCloseChoice: false,
      },
      appearance: {
        locale: 'en-US',
        themeId: 'slate-blue',
        windowBorderTone: 'neutral',
        windowBorderWeight: 'thin',
        recentGameDirectories: ['C:\\Games\\Stardew Valley'],
        playerAppearance: {
          profiles: [],
          activeProfileId: null,
        },
        loadingMotion: createLoadingMotionPreference({
          styleId: 'softFadeIn',
          intensityId: 'standard',
        }),
      },
      workspace: {
        location: { kind: 'module', moduleId: 'map-browser' },
        navigation: { collapsed: false, expandedSections: ['browse', 'tools'] },
        expertMode: false,
        modules: {},
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
        forceNonPremium: true,
      },
    }

    configureAppUiStatePersistence({
      canPersist: () => true,
      load: vi.fn(async () => persistedState),
      patch: vi.fn(),
    })

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
        forceNonPremium: true,
      },
    })
  })

  it('keeps state in memory without desktop persistence when the desktop host is unavailable', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
    const patch = vi.fn()
    configureAppUiStatePersistence({
      canPersist: () => false,
      load: vi.fn(),
      patch,
    })

    await expect(
      applyAppUiStatePatch({
        shell: {
          appMode: 'workbench',
          launcherPage: 'library',
          debugEnabled: true,
          notificationSoundEnabled: false,
          windowCloseBehavior: 'quit',
          rememberCloseChoice: false,
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
    expect(patch).not.toHaveBeenCalled()
  })

  it('merges and removes individual module state entries', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
    configureAppUiStatePersistence({
      canPersist: () => false,
      load: vi.fn(),
      patch: vi.fn(),
    })

    await applyAppUiStatePatch({
      workspace: {
        modules: {
          'map-browser': { layout: { panels: { sidebar: { visible: true } } }, selection: 'Town' },
          'item-browser': { layout: { panels: { inspector: { visible: false } } } },
        },
      },
    })

    await applyAppUiStatePatch({
      workspace: {
        modules: {
          'map-browser': { selection: 'Farm' },
          'item-browser': null,
        },
      },
    })

    expect(getAppUiStateSnapshot().workspace.modules).toEqual({
      'map-browser': { layout: { panels: { sidebar: { visible: true } } }, selection: 'Farm' },
    })
  })

  it('keeps workspace location and navigation when applying a module-only patch locally', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
    configureAppUiStatePersistence({
      canPersist: () => false,
      load: vi.fn(),
      patch: vi.fn(),
    })

    await applyAppUiStatePatch({
      workspace: {
        location: { kind: 'module', moduleId: 'map-browser' },
        navigation: { collapsed: false, expandedSections: ['browse'] },
      },
    })

    await applyAppUiStatePatch({
      workspace: {
        modules: {
          'map-browser': { layout: { panels: { sidebar: { visible: true } } } },
        },
      },
    })

    expect(getAppUiStateSnapshot().workspace).toMatchObject({
      location: { kind: 'module', moduleId: 'map-browser' },
      navigation: { collapsed: false, expandedSections: ['browse'] },
      modules: {
        'map-browser': { layout: { panels: { sidebar: { visible: true } } } },
      },
    })
  })

  it('keeps later patches working after a persisted patch rejects', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence } = await import('@shared/lib/app-state/appUiState')
    const patch = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce({
        version: 1,
        shell: {
          appMode: 'workbench',
          launcherPage: 'library',
          debugEnabled: true,
          notificationSoundEnabled: true,
          windowCloseBehavior: 'quit',
          rememberCloseChoice: false,
        },
        appearance: {
          locale: 'en-US',
          themeId: 'neutral-tool',
          windowBorderTone: 'accent',
          windowBorderWeight: 'standard',
          recentGameDirectories: [],
          playerAppearance: {
            profiles: [],
            activeProfileId: null,
          },
          loadingMotion: createLoadingMotionPreference({}),
        },
        workspace: {
          location: { kind: 'home' },
          navigation: { collapsed: true, expandedSections: ['browse'] },
          expertMode: false,
          modules: {},
        },
        launcher: {
          discoverToolbar: {
            sort: 'newest',
            ascending: false,
            timeRange: 'all',
            pageSize: 20,
            filtersHidden: false,
          },
          forceOffline: false,
          forceNonPremium: false,
        },
      } satisfies AppUiState)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    configureAppUiStatePersistence({
      canPersist: () => true,
      load: vi.fn(),
      patch,
    })

    await expect(applyAppUiStatePatch({ shell: { ...getDefaultShell(), debugEnabled: true } })).rejects.toThrow('disk unavailable')
    await expect(applyAppUiStatePatch({ shell: { ...getDefaultShell(), appMode: 'workbench', debugEnabled: true } })).resolves.toBeTruthy()
    expect(patch).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy).toHaveBeenCalledWith('[appUiState] patch failed', expect.any(Error))
  })

  it('rejects persistence reconfiguration after initialization starts', async () => {
    const { configureAppUiStatePersistence, initializeAppUiState } = await import('@shared/lib/app-state/appUiState')
    configureAppUiStatePersistence({
      canPersist: () => false,
      load: vi.fn(),
      patch: vi.fn(),
    })

    await initializeAppUiState()

    expect(() =>
      configureAppUiStatePersistence({
        canPersist: () => false,
        load: vi.fn(),
        patch: vi.fn(),
      }),
    ).toThrow('configureAppUiStatePersistence must be called before initializeAppUiState')
  })

  it('keeps launcher debug override flags in memory when applying launcher patches locally', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
    configureAppUiStatePersistence({
      canPersist: () => false,
      load: vi.fn(),
      patch: vi.fn(),
    })

    await applyAppUiStatePatch({
      launcher: {
        forceOffline: true,
        forceNonPremium: true,
      },
    })

    expect(getAppUiStateSnapshot()).toMatchObject({
      launcher: {
        forceOffline: true,
        forceNonPremium: true,
      },
    })
  })
})

function getDefaultShell(): AppUiState['shell'] {
  return {
    appMode: 'launcher',
    launcherPage: 'library',
    debugEnabled: false,
    notificationSoundEnabled: true,
    windowCloseBehavior: 'quit',
    rememberCloseChoice: false,
  }
}

it('includes loading motion preference in default state', async () => {
  vi.resetModules()
  const { getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
  const snapshot = getAppUiStateSnapshot()
  expect(snapshot.appearance.loadingMotion).toEqual({
    styleId: 'softFadeIn',
    intensityId: 'standard',
    speedMode: 'preset',
    speedId: 'standard',
    speedMultiplier: 1,
  })
})

it('normalizes loading motion from persisted state', async () => {
  vi.resetModules()
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
  const persistedState: AppUiState = {
    version: 1,
    shell: {
      appMode: 'launcher',
      launcherPage: 'library',
      debugEnabled: false,
      notificationSoundEnabled: true,
      windowCloseBehavior: 'quit',
      rememberCloseChoice: false,
    },
    appearance: {
      locale: 'en-US',
      themeId: 'warm-paper',
      windowBorderTone: 'accent',
      windowBorderWeight: 'thin',
      recentGameDirectories: [],
      playerAppearance: { profiles: [], activeProfileId: null },
      loadingMotion: createLoadingMotionPreference({
        styleId: 'bounceIn',
        intensityId: 'strong',
        speedMode: 'custom',
        speedId: 'fast',
        speedMultiplier: 0.68,
      }),
    },
    workspace: {
      location: { kind: 'home' },
      navigation: { collapsed: true, expandedSections: ['browse'] },
      expertMode: false,
      modules: {},
    },
    launcher: {
      discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false },
      forceOffline: false,
      forceNonPremium: false,
    },
  }

  configureAppUiStatePersistence({
    canPersist: () => true,
    load: vi.fn(async () => persistedState),
    patch: vi.fn(),
  })
  await initializeAppUiState()
  expect(getAppUiStateSnapshot().appearance.loadingMotion).toEqual({
    styleId: 'bounceIn',
    intensityId: 'strong',
    speedMode: 'custom',
    speedId: 'fast',
    speedMultiplier: 0.68,
  })
})

it('ignores the removed window border style field', async () => {
  vi.resetModules()
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
  const persistedState = {
    version: 1,
    shell: { appMode: 'launcher', launcherPage: 'library', debugEnabled: false, notificationSoundEnabled: true },
    appearance: {
      locale: 'en-US',
      themeId: 'warm-paper',
      windowBorderStyle: 'subtle',
      recentGameDirectories: [],
      playerAppearance: { profiles: [], activeProfileId: null },
      loadingMotion: createLoadingMotionPreference({}),
    },
    workspace: {
      location: { kind: 'home' },
      navigation: { collapsed: true, expandedSections: ['browse'] },
      expertMode: false,
      modules: {},
    },
    launcher: {
      discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false },
      forceOffline: false,
      forceNonPremium: false,
    },
  }

  configureAppUiStatePersistence({
    canPersist: () => true,
    load: vi.fn(async () => persistedState as unknown as AppUiState),
    patch: vi.fn(),
  })
  await initializeAppUiState()
  expect(getAppUiStateSnapshot().appearance).toMatchObject({
    windowBorderTone: 'accent',
    windowBorderWeight: 'standard',
  })
})

it('ignores removed accent preset ids and normalizes invalid theme ids', async () => {
  vi.resetModules()
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
  const persistedState = {
    version: 1,
    shell: { appMode: 'launcher', launcherPage: 'library', debugEnabled: false, notificationSoundEnabled: true },
    appearance: {
      locale: 'en-US',
      accentPresetId: 'indigo',
      themeId: 'not-a-real-theme',
      windowBorderTone: 'accent',
      windowBorderWeight: 'standard',
      recentGameDirectories: [],
      playerAppearance: { profiles: [], activeProfileId: null },
      loadingMotion: createLoadingMotionPreference({}),
    },
    workspace: {
      location: { kind: 'home' },
      navigation: { collapsed: true, expandedSections: ['browse'] },
      expertMode: false,
      modules: {},
    },
    launcher: {
      discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false },
      forceOffline: false,
      forceNonPremium: false,
    },
  }

  configureAppUiStatePersistence({
    canPersist: () => true,
    load: vi.fn(async () => persistedState as unknown as AppUiState),
    patch: vi.fn(),
  })
  await initializeAppUiState()
  expect(getAppUiStateSnapshot().appearance.themeId).toBe('neutral-tool')
})

it('keeps a valid persisted theme id', async () => {
  vi.resetModules()
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('@shared/lib/app-state/appUiState')
  const persistedState = {
    version: 1,
    shell: { appMode: 'launcher', launcherPage: 'library', debugEnabled: false, notificationSoundEnabled: true },
    appearance: {
      locale: 'en-US',
      themeId: 'stardew-wood',
      windowBorderTone: 'accent',
      windowBorderWeight: 'standard',
      recentGameDirectories: [],
      playerAppearance: { profiles: [], activeProfileId: null },
      loadingMotion: createLoadingMotionPreference({}),
    },
    workspace: {
      location: { kind: 'home' },
      navigation: { collapsed: true, expandedSections: ['browse'] },
      expertMode: false,
      modules: {},
    },
    launcher: {
      discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false },
      forceOffline: false,
      forceNonPremium: false,
    },
  }

  configureAppUiStatePersistence({
    canPersist: () => true,
    load: vi.fn(async () => persistedState as unknown as AppUiState),
    patch: vi.fn(),
  })
  await initializeAppUiState()
  expect(getAppUiStateSnapshot().appearance.themeId).toBe('stardew-wood')
})

it('invalid loading style falls back to default without affecting intensity', async () => {
  vi.resetModules()
  const { configureAppUiStatePersistence, createDefaultAppUiState, getAppUiStateSnapshot, initializeAppUiState } =
    await import('@shared/lib/app-state/appUiState')
  const persistedState = createDefaultAppUiState()
  persistedState.appearance.loadingMotion = {
    ...persistedState.appearance.loadingMotion,
    styleId: 'invalid' as never,
    intensityId: 'strong',
  }
  configureAppUiStatePersistence({
    canPersist: () => true,
    load: vi.fn(async () => persistedState),
    patch: vi.fn(),
  })

  await initializeAppUiState()

  expect(getAppUiStateSnapshot().appearance.loadingMotion.styleId).toBe('softFadeIn')
  expect(getAppUiStateSnapshot().appearance.loadingMotion.intensityId).toBe('strong')
})
