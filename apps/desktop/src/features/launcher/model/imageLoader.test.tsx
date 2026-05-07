import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLauncherImage } from './imageLoader'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort.ts'
import type { LauncherPort } from './launcherPort'

function createWrapper(port: LauncherPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <LauncherTestWrapper port={port}>{children}</LauncherTestWrapper>
  }
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
})
