import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLauncherNexusDiagnostics, searchLauncherCatalog, type LauncherNexusDiagnosticsResult } from '../desktop'
import { useLauncherDiscover } from './useLauncherDiscover'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    loadLauncherNexusDiagnostics: vi.fn(),
    searchLauncherCatalog: vi.fn(),
  }
})

const loadLauncherNexusDiagnosticsMock = vi.mocked(loadLauncherNexusDiagnostics)
const searchLauncherCatalogMock = vi.mocked(searchLauncherCatalog)

function createLauncherDiagnosticsResult(
  overrides: Partial<Record<string, { status: 'loading' | 'warning' | 'success'; available: boolean; message: string }>> = {},
): LauncherNexusDiagnosticsResult {
  const defaults: Record<
    string,
    { label: string; endpoint: string; status: 'loading' | 'warning' | 'success'; available: boolean; message: string }
  > = {
    publicGraphql: {
      label: 'Nexus Public GraphQL',
      endpoint: 'https://api-router.nexusmods.com/graphql',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    privateGraphql: {
      label: 'Nexus Private GraphQL',
      endpoint: 'https://graphql.nexusmods.com/',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    nexusApi: {
      label: 'Nexus API',
      endpoint: 'https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
  }

  return {
    routes: Object.entries(defaults).map(([routeId, route]) => ({
      routeId,
      attempts: 1,
      maxAttempts: 3,
      ...route,
      ...(overrides[routeId] ?? {}),
    })),
  }
}

describe('useLauncherDiscover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(createLauncherDiagnosticsResult())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('hydrates toolbar preferences from the provided app ui snapshot', async () => {
    searchLauncherCatalogMock.mockResolvedValue({
      page: 1,
      pageSize: 40,
      totalCount: 0,
      hasMore: false,
      facets: { categories: [], languages: [], tags: [] },
      results: [],
    })

    const { result } = renderHook(() =>
      useLauncherDiscover({
        sort: 'downloads',
        ascending: true,
        timeRange: 'week',
        pageSize: 40,
        filtersHidden: true,
      }),
    )

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

  it('uses updated toolbar preferences when sorting controls change', async () => {
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

    await act(async () => {
      vi.advanceTimersByTime(320)
      await Promise.resolve()
    })

    expect(searchLauncherCatalogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: 'downloads',
        ascending: true,
        timeRange: 'month',
        pageSize: 80,
      }),
    )
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

  it('skips automatic discover searches when all discover routes are unavailable', async () => {
    loadLauncherNexusDiagnosticsMock.mockResolvedValue(
      createLauncherDiagnosticsResult({
        publicGraphql: {
          status: 'warning',
          available: false,
          message: 'Forced offline by debug override.',
        },
        privateGraphql: {
          status: 'warning',
          available: false,
          message: 'Forced offline by debug override.',
        },
        nexusApi: {
          status: 'warning',
          available: false,
          message: 'Forced offline by debug override.',
        },
      }),
    )
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

    expect(searchLauncherCatalogMock).not.toHaveBeenCalled()
    expect(result.current.blockedReason).toContain('Nexus Public GraphQL')
    expect(result.current.blockedReason).toContain('Forced offline by debug override.')
  })
})
