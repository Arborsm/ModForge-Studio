import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchLauncherCatalog } from '../desktop'
import { useLauncherDiscover } from './useLauncherDiscover'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    searchLauncherCatalog: vi.fn(),
  }
})

const searchLauncherCatalogMock = vi.mocked(searchLauncherCatalog)

describe('useLauncherDiscover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('re-runs the catalog request when refresh is triggered from the first page', async () => {
    searchLauncherCatalogMock.mockResolvedValue({
      page: 1,
      hasMore: false,
      results: [],
    })

    const { result } = renderHook(() => useLauncherDiscover())

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(searchLauncherCatalogMock).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.refresh()
    })

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(searchLauncherCatalogMock).toHaveBeenCalledTimes(2)
  })

  it('loads the next page without waiting for the search debounce window', async () => {
    searchLauncherCatalogMock
      .mockResolvedValueOnce({
        page: 1,
        hasMore: true,
        results: [],
      })
      .mockResolvedValueOnce({
        page: 2,
        hasMore: false,
        results: [],
      })

    const { result } = renderHook(() => useLauncherDiscover())

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(searchLauncherCatalogMock).toHaveBeenCalledTimes(1)
    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith({
      query: '',
      page: 1,
      sort: 'newest',
      ascending: false,
    })

    act(() => {
      result.current.loadMore()
    })

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(searchLauncherCatalogMock).toHaveBeenCalledTimes(2)
    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith({
      query: '',
      page: 2,
      sort: 'newest',
      ascending: false,
    })
  })
})
