import { describe, expect, it, vi } from 'vitest'
import { createResourceCache } from './resourceCache'

describe('createResourceCache', () => {
  it('reuses completed entries and deduplicates inflight loads', async () => {
    const cache = createResourceCache<string>({
      maxEntries: 4,
      getSize: (value) => value.length,
    })
    const loader = vi.fn(async () => ({
      value: 'cover-a',
      dispose: vi.fn(),
    }))

    const [first, second] = await Promise.all([
      cache.load('mod:cover:a', loader),
      cache.load('mod:cover:a', loader),
    ])

    expect(first).toBe('cover-a')
    expect(second).toBe('cover-a')
    expect(loader).toHaveBeenCalledTimes(1)

    const third = await cache.load('mod:cover:a', loader)
    expect(third).toBe('cover-a')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.getStats()).toEqual({
      entries: 1,
      inflight: 0,
      totalBytes: 7,
    })
  })

  it('drops failed inflight entries so the next request can retry', async () => {
    const cache = createResourceCache<string>({
      maxEntries: 2,
    })
    const loader = vi
      .fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ value: 'retry-ok' })

    await expect(cache.load('mod:cover:b', loader)).rejects.toThrow('boom')
    expect(cache.getStats()).toEqual({
      entries: 0,
      inflight: 0,
      totalBytes: 0,
    })

    await expect(cache.load('mod:cover:b', loader)).resolves.toBe('retry-ok')
    expect(loader).toHaveBeenCalledTimes(2)
    expect(cache.getStats()).toEqual({
      entries: 1,
      inflight: 0,
      totalBytes: 1,
    })
  })

  it('evicts least-recently-used entries by byte budget and disposes them', async () => {
    const disposedA = vi.fn()
    const disposedB = vi.fn()
    const disposedC = vi.fn()
    const cache = createResourceCache<string>({
      maxEntries: 8,
      maxBytes: 10,
      getSize: (value) => value.length,
    })

    await cache.load('a', async () => ({ value: '1111', dispose: disposedA }))
    await cache.load('b', async () => ({ value: '2222', dispose: disposedB }))
    await cache.load('a', async () => ({ value: 'unused-a' }))
    await cache.load('c', async () => ({ value: '3333', dispose: disposedC }))

    expect(disposedA).not.toHaveBeenCalled()
    expect(disposedB).toHaveBeenCalledTimes(1)
    expect(disposedC).not.toHaveBeenCalled()
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('c')).toBe(true)
    expect(cache.getStats()).toEqual({
      entries: 2,
      inflight: 0,
      totalBytes: 8,
    })
  })

  it('invalidates a single key and clears the whole cache', async () => {
    const disposedA = vi.fn()
    const disposedB = vi.fn()
    const cache = createResourceCache<string>({
      maxEntries: 4,
      getSize: (value) => value.length,
    })

    await cache.load('a', async () => ({ value: 'aaaa', dispose: disposedA }))
    await cache.load('b', async () => ({ value: 'bb', dispose: disposedB }))

    cache.invalidate('a')
    expect(disposedA).toHaveBeenCalledTimes(1)
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)

    cache.clear()
    expect(disposedB).toHaveBeenCalledTimes(1)
    expect(cache.getStats()).toEqual({
      entries: 0,
      inflight: 0,
      totalBytes: 0,
    })
  })
})
