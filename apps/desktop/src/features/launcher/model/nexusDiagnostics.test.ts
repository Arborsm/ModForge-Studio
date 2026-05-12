import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canAutoCheckLauncherUpdates,
  canAutoLoadLauncherDiscover,
  getLauncherNexusWarningRoutes,
  loadSettledLauncherNexusDiagnostics,
  mergeLauncherNexusDiagnostics,
} from './nexusDiagnostics'

describe('loadSettledLauncherNexusDiagnostics', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
