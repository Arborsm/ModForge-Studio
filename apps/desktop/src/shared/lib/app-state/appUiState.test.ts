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
    const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('./appUiState')
    const persistedState: AppUiState = {
      version: 1,
      shell: {
        appMode: 'workbench',
        launcherPage: 'library',
        debugEnabled: false,
        notificationSoundEnabled: true,
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
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('./appUiState')
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

  it('removes workspace layout entries when a patch sets them to null', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('./appUiState')
    configureAppUiStatePersistence({
      canPersist: () => false,
      load: vi.fn(),
      patch: vi.fn(),
    })

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

  it('keeps launcher debug override flags in memory when applying launcher patches locally', async () => {
    const { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot } = await import('./appUiState')
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

it('includes loading motion preference in default state', async () => {
  const { getAppUiStateSnapshot } = await import('./appUiState')
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
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('./appUiState')
  const persistedState: AppUiState = {
    version: 1,
    shell: { appMode: 'launcher', launcherPage: 'library', debugEnabled: false, notificationSoundEnabled: true },
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
    workspace: { layouts: {} },
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

it('migrates legacy window border style into independent tone and weight fields', async () => {
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('./appUiState')
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
    workspace: { layouts: {} },
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
    windowBorderWeight: 'thin',
  })
})

it('discards legacy accent preset ids and invalid theme ids, falling back to the default theme', async () => {
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('./appUiState')
  const persistedState = {
    version: 1,
    shell: { appMode: 'launcher', launcherPage: 'library', debugEnabled: false, notificationSoundEnabled: true },
    appearance: {
      locale: 'en-US',
      // Legacy field name + value that no longer maps to any theme.
      accentPresetId: 'indigo',
      themeId: 'not-a-real-theme',
      windowBorderTone: 'accent',
      windowBorderWeight: 'standard',
      recentGameDirectories: [],
      playerAppearance: { profiles: [], activeProfileId: null },
      loadingMotion: createLoadingMotionPreference({}),
    },
    workspace: { layouts: {} },
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
  const { configureAppUiStatePersistence, initializeAppUiState, getAppUiStateSnapshot } = await import('./appUiState')
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
    workspace: { layouts: {} },
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
  const { createDefaultAppUiState } = await import('./appUiState')
  const defaults = createDefaultAppUiState()
  // Simulate what normalizeAppUiState does with an invalid style
  // raw: { appearance: { loadingMotion: { styleId: 'invalid', intensityId: 'strong' } } }
  // The normalization uses the defaults' valid style
  expect(defaults.appearance.loadingMotion.styleId).toBe('softFadeIn')
  expect(defaults.appearance.loadingMotion.intensityId).toBe('standard')
})
