import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { useLauncherImage } from '@features/launcher/model/imageLoader'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort.ts'
import type { LauncherPort } from '@features/launcher/model/launcherPort'

function createWrapper(port: LauncherPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <LauncherTestWrapper port={port}>{children}</LauncherTestWrapper>
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('useLauncherImage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clears the previous image while a new launcher image is loading', async () => {
    let resolveSecond: (value: { sourceUrl: string; localPath: string; mimeType: string }) => void = () => {}
    const port = createMockLauncherPort({
      resolveImage: vi.fn().mockImplementation(async (request) => {
        if (request.url === 'https://example.com/a.png') {
          return {
            sourceUrl: request.url,
            localPath: 'a.png',
            mimeType: 'image/png',
          }
        }

        return new Promise<{ sourceUrl: string; localPath: string; mimeType: string }>((resolve) => {
          resolveSecond = resolve
        })
      }),
      toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
    })

    const { result, rerender } = renderHook(({ url }) => useLauncherImage(url), {
      initialProps: { url: 'https://example.com/a.png' as string | null },
      wrapper: createWrapper(port),
    })

    await waitFor(() => {
      expect(result.current.imageUrl).toBe('asset:a.png')
    })

    rerender({ url: 'https://example.com/b.png' })

    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })
    expect(result.current.imageUrl).toBeNull()

    resolveSecond({
      sourceUrl: 'https://example.com/b.png',
      localPath: 'b.png',
      mimeType: 'image/png',
    })

    await waitFor(() => {
      expect(result.current.imageUrl).toBe('asset:b.png')
    })
  })

  it('returns a cached launcher image immediately on remount without re-entering loading', async () => {
    const port = createMockLauncherPort({
      resolveImage: vi.fn().mockResolvedValue({
        sourceUrl: 'https://example.com/cached-cover.png',
        localPath: 'cached-cover.png',
        mimeType: 'image/png',
      }),
      toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
    })

    const first = renderHook(() => useLauncherImage('https://example.com/cached-cover.png'), {
      wrapper: createWrapper(port),
    })
    await waitFor(() => {
      expect(first.result.current.imageUrl).toBe('asset:cached-cover.png')
    })

    first.unmount()

    const second = renderHook(() => useLauncherImage('https://example.com/cached-cover.png'), {
      wrapper: createWrapper(port),
    })
    expect(second.result.current.imageUrl).toBe('asset:cached-cover.png')
    expect(second.result.current.loading).toBe(false)
    expect(port.resolveImage).toHaveBeenCalledTimes(1)
  })

  it('uses a local or disk cached launcher image before starting the network resolver', async () => {
    const port = createMockLauncherPort({
      resolveCachedImage: vi.fn().mockResolvedValue({
        sourceUrl: 'https://example.com/local-cover.png',
        localPath: 'local-cover.png',
        mimeType: 'image/png',
      }),
      resolveImage: vi.fn().mockResolvedValue({
        sourceUrl: 'https://example.com/local-cover.png',
        localPath: 'network-cover.png',
        mimeType: 'image/png',
      }),
      toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
    })

    const { result } = renderHook(() => useLauncherImage('https://example.com/local-cover.png', '101'), {
      wrapper: createWrapper(port),
    })

    await waitFor(() => {
      expect(result.current.imageUrl).toBe('asset:local-cover.png')
    })
    expect(port.resolveCachedImage).toHaveBeenCalledWith({
      url: 'https://example.com/local-cover.png',
      refresh: false,
      modKey: '101',
    })
    expect(port.resolveImage).not.toHaveBeenCalled()
  })

  it('surfaces backend disabled errors after the local cache phase misses', async () => {
    const port = createMockLauncherPort({
      loadImageFailures: vi.fn().mockResolvedValue({
        entries: [
          {
            modKey: '101',
            failureCount: 3,
            blocked: true,
            lastError: 'HTTP 404',
            lastFailedAtMs: 123,
          },
        ],
      }),
      resolveCachedImage: vi.fn().mockResolvedValue(null),
      resolveImage: vi.fn().mockRejectedValue(new Error('Launcher image loading is disabled for mod 101 after repeated failures.')),
      toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
    })

    const { result } = renderHook(() => useLauncherImage('https://example.com/blocked-cover.png', '101'), {
      wrapper: createWrapper(port),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error?.error).toContain('disabled')
    })
    expect(result.current.imageUrl).toBeNull()
    expect(port.loadImageFailures).not.toHaveBeenCalled()
    expect(port.resolveCachedImage).toHaveBeenCalledWith({
      url: 'https://example.com/blocked-cover.png',
      refresh: false,
      modKey: '101',
    })
    expect(port.resolveImage).toHaveBeenCalledWith({
      url: 'https://example.com/blocked-cover.png',
      refresh: false,
      modKey: '101',
    })
  })

  it('passes the mod key through when resolving an uncached library cover', async () => {
    const port = createMockLauncherPort({
      resolveCachedImage: vi.fn().mockResolvedValue(null),
      resolveImage: vi.fn().mockResolvedValue({
        sourceUrl: 'https://example.com/library-cover.png',
        localPath: 'library-cover.png',
        mimeType: 'image/png',
      }),
      toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
    })

    const { result } = renderHook(() => useLauncherImage('https://example.com/library-cover.png', '101'), {
      wrapper: createWrapper(port),
    })

    await waitFor(() => {
      expect(result.current.imageUrl).toBe('asset:library-cover.png')
    })
    expect(port.resolveCachedImage).toHaveBeenCalledWith({
      url: 'https://example.com/library-cover.png',
      refresh: false,
      modKey: '101',
    })
    expect(port.resolveImage).toHaveBeenCalledWith({
      url: 'https://example.com/library-cover.png',
      refresh: false,
      modKey: '101',
    })
  })

  it('waits for the current local cache lookup batch before starting network image requests', async () => {
    const slowLocal = createDeferred<null>()
    const port = createMockLauncherPort({
      resolveCachedImage: vi.fn().mockImplementation(async (request) => {
        if (request.url === 'https://example.com/slow-local.png') {
          return slowLocal.promise
        }
        return null
      }),
      resolveImage: vi.fn().mockResolvedValue({
        sourceUrl: 'https://example.com/network-cover.png',
        localPath: 'network-cover.png',
        mimeType: 'image/png',
      }),
      toDesktopAssetUrl: vi.fn((value: string) => `asset:${value}`),
    })

    renderHook(
      () => {
        const first = useLauncherImage('https://example.com/slow-local.png', '101')
        const second = useLauncherImage('https://example.com/network-cover.png', '102')
        return { first, second }
      },
      {
        wrapper: createWrapper(port),
      },
    )

    await waitFor(() => {
      expect(port.resolveCachedImage).toHaveBeenCalledTimes(2)
    })
    expect(port.resolveImage).not.toHaveBeenCalled()

    slowLocal.resolve(null)

    await waitFor(() => {
      expect(port.resolveImage).toHaveBeenCalledWith({
        url: 'https://example.com/network-cover.png',
        refresh: false,
        modKey: '102',
      })
    })
  })
})
