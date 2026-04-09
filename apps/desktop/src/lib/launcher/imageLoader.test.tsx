import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLauncherImage } from './imageLoader'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((value: string) => `asset:${value}`),
}))

vi.mock('../desktop', () => ({
  resolveLauncherImage: vi.fn(),
}))

import { resolveLauncherImage } from '../desktop'

const resolveLauncherImageMock = vi.mocked(resolveLauncherImage)

describe('useLauncherImage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('clears the previous image while a new launcher image is loading', async () => {
    let resolveSecond: (value: { sourceUrl: string; localPath: string; mimeType: string }) => void = () => {}
    resolveLauncherImageMock.mockImplementation(async (request) => {
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
    })

    const { result, rerender } = renderHook(({ url }) => useLauncherImage(url), {
      initialProps: { url: 'https://example.com/a.png' as string | null },
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
})
