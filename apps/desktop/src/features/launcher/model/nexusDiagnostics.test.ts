import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSettledLauncherNexusDiagnostics } from './nexusDiagnostics'

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
            endpoint: 'https://api-router.nexusmods.com/graphql',
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
            endpoint: 'https://api-router.nexusmods.com/graphql',
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
          endpoint: 'https://api-router.nexusmods.com/graphql',
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
          endpoint: 'https://api-router.nexusmods.com/graphql',
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
          endpoint: 'https://api-router.nexusmods.com/graphql',
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

  it('keeps polling while a route is waiting for Public HTML verification', async () => {
    vi.useFakeTimers()
    const loadDiagnostics = vi
      .fn()
      .mockResolvedValueOnce({
        routes: [
          {
            routeId: 'publicHtml',
            label: 'Nexus Public HTML',
            endpoint: 'https://www.nexusmods.com/stardewvalley',
            status: 'verifying' as never,
            attempts: 1,
            maxAttempts: 3,
            available: true,
            message: 'Waiting for browser verification to complete.',
          },
        ],
      })
      .mockResolvedValueOnce({
        routes: [
          {
            routeId: 'publicHtml',
            label: 'Nexus Public HTML',
            endpoint: 'https://www.nexusmods.com/stardewvalley',
            status: 'success' as const,
            attempts: 2,
            maxAttempts: 3,
            available: true,
            message: 'Connected after verification.',
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
          routeId: 'publicHtml',
          label: 'Nexus Public HTML',
          endpoint: 'https://www.nexusmods.com/stardewvalley',
          status: 'success',
          attempts: 2,
          maxAttempts: 3,
          available: true,
          message: 'Connected after verification.',
        },
      ],
    })

    expect(loadDiagnostics).toHaveBeenCalledTimes(2)
  })
})
