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
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('restores persisted toolbar preferences for sorting controls', async () => {
    window.localStorage.setItem(
      'modforge:launcher-discover-toolbar:v1',
      JSON.stringify({
        sort: 'downloads',
        ascending: true,
        timeRange: 'week',
        pageSize: 40,
        filtersHidden: true,
      }),
    )

    searchLauncherCatalogMock.mockResolvedValue({
      page: 1,
      pageSize: 40,
      totalCount: 0,
      hasMore: false,
      facets: { categories: [], languages: [], tags: [] },
      results: [],
    })

    const { result } = renderHook(() => useLauncherDiscover())

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(result.current.sort).toBe('downloads')
    expect(result.current.ascending).toBe(true)
    expect(result.current.timeRange).toBe('week')
    expect(result.current.pageSize).toBe(40)
    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: 'downloads',
        ascending: true,
        timeRange: 'week',
        pageSize: 40,
      }),
    )
  })

  it('persists toolbar preferences when sorting controls change', async () => {
    searchLauncherCatalogMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
      facets: { categories: [], languages: [], tags: [] },
      results: [],
    })

    const { result } = renderHook(() => useLauncherDiscover())

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    act(() => {
      result.current.setSort('downloads')
      result.current.setAscending(true)
      result.current.setTimeRange('month')
      result.current.setPageSize(80)
    })

    const persisted = JSON.parse(window.localStorage.getItem('modforge:launcher-discover-toolbar:v1') ?? '{}')
    expect(persisted).toMatchObject({
      sort: 'downloads',
      ascending: true,
      timeRange: 'month',
      pageSize: 80,
    })
  })

  it('re-runs the catalog request when refresh is triggered from the first page', async () => {
    searchLauncherCatalogMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
      facets: {
        categories: [],
        languages: [],
        tags: [],
      },
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

  it('navigates to an explicit remote page without waiting for the search debounce window', async () => {
    searchLauncherCatalogMock
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        totalCount: 24,
        hasMore: true,
        facets: {
          categories: [],
          languages: [],
          tags: [],
        },
        results: [],
      })
      .mockResolvedValueOnce({
        page: 2,
        pageSize: 20,
        totalCount: 24,
        hasMore: false,
        facets: {
          categories: [],
          languages: [],
          tags: [],
        },
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
      titleQuery: '',
      descriptionQuery: '',
      authorQuery: '',
      uploaderQuery: '',
      page: 1,
      pageSize: 20,
      timeRange: 'all',
      sort: 'newest',
      ascending: false,
      category: null,
      language: null,
      tagsInclude: null,
      tagsExclude: null,
      includeAdult: false,
      minFileSize: null,
      maxFileSize: null,
      minDownloads: null,
      maxDownloads: null,
      minEndorsements: null,
      maxEndorsements: null,
    })

    act(() => {
      result.current.setPage(2)
    })

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(searchLauncherCatalogMock).toHaveBeenCalledTimes(2)
    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith({
      query: '',
      titleQuery: '',
      descriptionQuery: '',
      authorQuery: '',
      uploaderQuery: '',
      page: 2,
      pageSize: 20,
      timeRange: 'all',
      sort: 'newest',
      ascending: false,
      category: null,
      language: null,
      tagsInclude: null,
      tagsExclude: null,
      includeAdult: false,
      minFileSize: null,
      maxFileSize: null,
      minDownloads: null,
      maxDownloads: null,
      minEndorsements: null,
      maxEndorsements: null,
    })
  })

  it('resets back to page 1 when page size changes', async () => {
    searchLauncherCatalogMock
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        totalCount: 1445,
        hasMore: true,
        facets: { categories: [], languages: [], tags: [] },
        results: [],
      })
      .mockResolvedValueOnce({
        page: 3,
        pageSize: 20,
        totalCount: 1445,
        hasMore: true,
        facets: { categories: [], languages: [], tags: [] },
        results: [],
      })
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 80,
        totalCount: 1445,
        hasMore: true,
        facets: { categories: [], languages: [], tags: [] },
        results: [],
      })

    const { result } = renderHook(() => useLauncherDiscover())

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    act(() => {
      result.current.setPage(3)
    })

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(result.current.page).toBe(3)

    act(() => {
      result.current.setPageSize(80)
    })

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(result.current.page).toBe(1)
    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 80,
      }),
    )
  })

  it('resets back to page 1 when a filter changes and exposes total pages', async () => {
    searchLauncherCatalogMock
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        totalCount: 1445,
        hasMore: true,
        facets: { categories: [], languages: [], tags: [] },
        results: [],
      })
      .mockResolvedValueOnce({
        page: 5,
        pageSize: 20,
        totalCount: 1445,
        hasMore: true,
        facets: { categories: [], languages: [], tags: [] },
        results: [],
      })
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        totalCount: 1445,
        hasMore: true,
        facets: { categories: [], languages: [], tags: [] },
        results: [],
      })

    const { result } = renderHook(() => useLauncherDiscover())

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(result.current.totalPages).toBe(73)

    act(() => {
      result.current.setPage(5)
    })

    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
    })

    expect(result.current.page).toBe(5)

    act(() => {
      result.current.updateFilter('category', 'Maps')
    })

    await act(async () => {
      vi.advanceTimersByTime(320)
      await Promise.resolve()
    })

    expect(result.current.page).toBe(1)
    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        category: 'Maps',
      }),
    )
  })
})
