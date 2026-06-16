import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  canAutoCheckLauncherUpdates,
  canAutoLoadLauncherDiscover,
  clearCachedLauncherConfigurationDiagnostics,
  getLauncherNexusWarningRoutes,
  loadSettledLauncherNexusDiagnostics,
  mergeLauncherNexusDiagnostics,
  readCachedLauncherConfigurationApiKeyStatus,
  readCachedLauncherConfigurationDiagnostics,
  writeCachedLauncherConfigurationApiKeyStatus,
  writeCachedLauncherConfigurationDiagnostics,
} from './nexusDiagnostics'

function createRoute(overrides: Partial<Parameters<typeof writeCachedLauncherConfigurationDiagnostics>[0]['routes'][number]> = {}) {
  return {
    routeId: 'publicGraphql',
    label: 'Nexus Public GraphQL',
    endpoint: 'https://api.nexusmods.com/v2/graphql',
    status: 'success' as const,
    attempts: 1,
    maxAttempts: 3,
    available: true,
    message: 'Connected.',
    ...overrides,
  }
}

describe('loadSettledLauncherNexusDiagnostics', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    clearCachedLauncherConfigurationDiagnostics()
  })

  it('retries the injected diagnostics loader until loading routes settle', async () => {
    vi.useFakeTimers()
    const loadDiagnostics = vi
      .fn()
      .mockResolvedValueOnce({
        routes: [
          {
            routeId: 'publicGraphql',
            label: 'Nexus Public GraphQL',
            endpoint: 'https://api.nexusmods.com/v2/graphql',
            status: 'loading',
            attempts: 1,
            maxAttempts: 3,
            available: true,
            message: 'Attempt 1 of 3 is in progress.',
          },
        ],
      })
      .mockResolvedValueOnce({
        routes: [
          {
            routeId: 'publicGraphql',
            label: 'Nexus Public GraphQL',
            endpoint: 'https://api.nexusmods.com/v2/graphql',
            status: 'success',
            attempts: 2,
            maxAttempts: 3,
            available: true,
            message: 'Connected after 2 attempts.',
          },
        ],
      })

    const pending = loadSettledLauncherNexusDiagnostics({
      loadDiagnostics,
      delayMs: 100,
      maxAttempts: 3,
    })

    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success',
          attempts: 2,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 2 attempts.',
        },
      ],
    })

    expect(loadDiagnostics).toHaveBeenCalledTimes(2)
  })

  it('returns the last loading snapshot after exhausting max attempts', async () => {
    vi.useFakeTimers()
    const loadingDiagnostics = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'loading' as const,
          attempts: 3,
          maxAttempts: 3,
          available: true,
          message: 'Attempt 3 of 3 is in progress.',
        },
      ],
    }
    const loadDiagnostics = vi.fn().mockResolvedValue(loadingDiagnostics)

    const pending = loadSettledLauncherNexusDiagnostics({
      loadDiagnostics,
      delayMs: 100,
      maxAttempts: 3,
    })

    await vi.advanceTimersByTimeAsync(200)
    await expect(pending).resolves.toEqual(loadingDiagnostics)
    expect(loadDiagnostics).toHaveBeenCalledTimes(3)
  })

  it('does not schedule a retry once diagnostics are already settled', async () => {
    vi.useFakeTimers()
    const settledDiagnostics = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected.',
        },
      ],
    }
    const loadDiagnostics = vi.fn().mockResolvedValue(settledDiagnostics)

    await expect(
      loadSettledLauncherNexusDiagnostics({
        loadDiagnostics,
        delayMs: 100,
        maxAttempts: 3,
      }),
    ).resolves.toEqual(settledDiagnostics)

    await vi.advanceTimersByTimeAsync(300)
    expect(loadDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('does not poll again when diagnostics settle on a non-loading warning route', async () => {
    vi.useFakeTimers()
    const warningDiagnostics = {
      routes: [
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'warning' as const,
          attempts: 1,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 1 attempt: timeout',
        },
      ],
    }
    const loadDiagnostics = vi
      .fn()
      .mockResolvedValueOnce(warningDiagnostics)
      .mockResolvedValueOnce({
        routes: [
          {
            routeId: 'nexusImages',
            label: 'Nexus Image CDN',
            endpoint: 'https://staticdelivery.nexusmods.com/',
            status: 'success' as const,
            attempts: 2,
            maxAttempts: 3,
            available: true,
            message: 'Connected after retry.',
          },
        ],
      })

    const pending = loadSettledLauncherNexusDiagnostics({
      loadDiagnostics,
      delayMs: 100,
      maxAttempts: 3,
    })

    await expect(pending).resolves.toEqual(warningDiagnostics)

    await vi.advanceTimersByTimeAsync(300)
    expect(loadDiagnostics).toHaveBeenCalledTimes(1)
  })
})

describe('configuration diagnostics cache', () => {
  afterEach(() => {
    clearCachedLauncherConfigurationDiagnostics()
  })

  it('returns successful non-API routes from cache without requesting a refresh', () => {
    const diagnostics = {
      routes: [
        createRoute({ routeId: 'publicGraphql' }),
        createRoute({ routeId: 'nexusImages', label: 'Nexus Image CDN' }),
        createRoute({ routeId: 'smapi', label: 'SMAPI' }),
      ],
    }

    writeCachedLauncherConfigurationDiagnostics(diagnostics, {
      now: 1_000,
      apiKeySignature: '',
    })

    expect(
      readCachedLauncherConfigurationDiagnostics({
        now: 60 * 60 * 1000,
        apiKeySignature: '',
      }),
    ).toEqual({
      diagnostics,
      cachedAt: 1_000,
      shouldRefresh: false,
    })
  })

  it('refreshes cached API routes after their configuration cache expires', () => {
    const diagnostics = {
      routes: [
        createRoute({
          routeId: 'nexusApi',
          label: 'Nexus REST API',
          endpoint: 'https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json',
        }),
      ],
    }

    writeCachedLauncherConfigurationDiagnostics(diagnostics, {
      now: 1_000,
      apiKeySignature: 'api-key',
    })

    expect(
      readCachedLauncherConfigurationDiagnostics({
        now: 1_000 + 6 * 60 * 1000,
        apiKeySignature: 'api-key',
      })?.shouldRefresh,
    ).toBe(true)
  })

  it('refreshes non-API routes only when the cached route previously failed', () => {
    const diagnostics = {
      routes: [
        createRoute({
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          status: 'warning',
          available: false,
          message: 'Failed after 3 attempts: timeout',
        }),
      ],
    }

    writeCachedLauncherConfigurationDiagnostics(diagnostics, {
      now: 1_000,
      apiKeySignature: '',
    })

    expect(
      readCachedLauncherConfigurationDiagnostics({
        now: 2_000,
        apiKeySignature: '',
      })?.shouldRefresh,
    ).toBe(true)
  })

  it('refreshes cached loading snapshots instead of freezing the page on stale loading state', () => {
    writeCachedLauncherConfigurationDiagnostics(
      {
        routes: [
          createRoute({
            routeId: 'publicGraphql',
            status: 'loading',
            available: true,
            message: 'loading',
          }),
        ],
      },
      {
        now: 1_000,
        apiKeySignature: '',
      },
    )

    expect(
      readCachedLauncherConfigurationDiagnostics({
        now: 2_000,
        apiKeySignature: '',
      })?.shouldRefresh,
    ).toBe(true)
  })

  it('refreshes cached authenticated routes when the API key signature changes', () => {
    const diagnostics = {
      routes: [
        createRoute({
          routeId: 'privateGraphql',
          label: 'Nexus Private GraphQL',
        }),
      ],
    }

    writeCachedLauncherConfigurationDiagnostics(diagnostics, {
      now: 1_000,
      apiKeySignature: 'old-key',
    })

    expect(
      readCachedLauncherConfigurationDiagnostics({
        now: 1_100,
        apiKeySignature: 'new-key',
      })?.shouldRefresh,
    ).toBe(true)
  })

  it('keeps expired API key validation visible while marking it for refresh', () => {
    const status = {
      userName: 'ApiPilot',
      avatarUrl: 'https://staticdelivery.nexusmods.com/Images/Users/123/avatar.png',
      profileUrl: 'https://www.nexusmods.com/users/123',
      isPremium: true,
      dailyRemaining: 42,
      hourlyRemaining: 24,
      dailyResetAt: null,
      hourlyResetAt: null,
    }

    writeCachedLauncherConfigurationApiKeyStatus(
      {
        status,
        error: null,
      },
      {
        now: 1_000,
        apiKeySignature: 'api-key',
      },
    )

    expect(
      readCachedLauncherConfigurationApiKeyStatus({
        now: 1_000 + 4 * 60 * 1000,
        apiKeySignature: 'api-key',
      }),
    ).toEqual(expect.objectContaining({ status, shouldRefresh: false }))
    expect(
      readCachedLauncherConfigurationApiKeyStatus({
        now: 1_000 + 6 * 60 * 1000,
        apiKeySignature: 'api-key',
      }),
    ).toEqual(expect.objectContaining({ status, shouldRefresh: true }))
    expect(
      readCachedLauncherConfigurationApiKeyStatus({
        now: 1_100,
        apiKeySignature: 'different-key',
      }),
    ).toBeNull()
  })

  it('never auto-refreshes permanent API key validation entries', () => {
    const status = {
      userName: 'LifetimePilot',
      avatarUrl: null,
      profileUrl: 'https://www.nexusmods.com/users/124',
      isPremium: true,
      isLifetimePremium: true,
      dailyRemaining: 42,
      hourlyRemaining: 24,
      dailyResetAt: null,
      hourlyResetAt: null,
    }

    writeCachedLauncherConfigurationApiKeyStatus(
      {
        status,
        error: null,
      },
      {
        now: 1_000,
        expiresAtMs: null,
        apiKeySignature: 'api-key',
      },
    )

    expect(
      readCachedLauncherConfigurationApiKeyStatus({
        now: 1_000 + 365 * 24 * 60 * 60 * 1000,
        apiKeySignature: 'api-key',
      }),
    ).toEqual(expect.objectContaining({ status, shouldRefresh: false }))
  })
})

describe('Nexus route availability helpers', () => {
  it('uses unrelated successful routes even when an optional image route is unavailable', () => {
    const diagnostics = {
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
        {
          routeId: 'smapi',
          label: 'SMAPI',
          endpoint: 'https://smapi.io/api/v3.0/mods',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'warning' as const,
          attempts: 1,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 1 attempt: timeout',
        },
      ],
    }

    expect(canAutoLoadLauncherDiscover(diagnostics, { sort: 'trending' })).toBe(true)
    expect(canAutoCheckLauncherUpdates(diagnostics)).toBe(true)
  })

  it('classifies unavailable non-loading routes as warning routes', () => {
    const diagnostics = {
      routes: [
        {
          routeId: 'nexusImages',
          label: 'Nexus Image CDN',
          endpoint: 'https://staticdelivery.nexusmods.com/',
          status: 'warning' as const,
          attempts: 1,
          maxAttempts: 3,
          available: false,
          message: 'Failed after 1 attempt: timeout',
        },
      ],
    }

    expect(getLauncherNexusWarningRoutes(diagnostics)).toEqual(diagnostics.routes)
  })
})

describe('mergeLauncherNexusDiagnostics', () => {
  it('keeps untouched routes when a route retry returns only the retried snapshot', () => {
    expect(
      mergeLauncherNexusDiagnostics(
        [
          {
            routeId: 'publicGraphql',
            label: 'Nexus Public GraphQL',
            endpoint: 'https://api.nexusmods.com/v2/graphql',
            status: 'warning',
            attempts: 3,
            maxAttempts: 3,
            available: false,
            message: 'Failed after 3 attempts: timeout',
          },
          {
            routeId: 'nexusImages',
            label: 'Nexus Image CDN',
            endpoint: 'https://staticdelivery.nexusmods.com/',
            status: 'success',
            attempts: 1,
            maxAttempts: 3,
            available: true,
            message: 'Connected after 1 attempt.',
          },
        ],
        [
          {
            routeId: 'publicGraphql',
            label: 'Nexus Public GraphQL',
            endpoint: 'https://api.nexusmods.com/v2/graphql',
            status: 'success',
            attempts: 1,
            maxAttempts: 3,
            available: true,
            message: 'Connected after 1 attempt.',
          },
        ],
      ),
    ).toEqual([
      {
        routeId: 'publicGraphql',
        label: 'Nexus Public GraphQL',
        endpoint: 'https://api.nexusmods.com/v2/graphql',
        status: 'success',
        attempts: 1,
        maxAttempts: 3,
        available: true,
        message: 'Connected after 1 attempt.',
      },
      {
        routeId: 'nexusImages',
        label: 'Nexus Image CDN',
        endpoint: 'https://staticdelivery.nexusmods.com/',
        status: 'success',
        attempts: 1,
        maxAttempts: 3,
        available: true,
        message: 'Connected after 1 attempt.',
      },
    ])
  })
})
