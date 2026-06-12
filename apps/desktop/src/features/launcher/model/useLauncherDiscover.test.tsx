import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauncherNexusDiagnosticsResult } from '@features/launcher/api'
import { useLauncherDiscover } from '@features/launcher'
import { LauncherTestWrapper } from '@test/launcherTestWrapper.tsx'
import { createMockLauncherPort } from '@test/launcherTestPort.ts'
import type { LauncherPort } from './launcherPort'

function createLauncherDiagnosticsResult(
  overrides: Partial<Record<string, { status: 'loading' | 'warning' | 'success'; available: boolean; message: string }>> = {},
): LauncherNexusDiagnosticsResult {
  const defaults: Record<
    string,
    { label: string; endpoint: string; status: 'loading' | 'warning' | 'success'; available: boolean; message: string }
  > = {
    publicGraphql: {
      label: 'Nexus Public GraphQL',
      endpoint: 'https://api.nexusmods.com/v2/graphql',
      status: 'success',
      available: true,
      message: 'Connected after 1 attempt.',
    },
    privateGraphql: {
      label: 'Nexus Private GraphQL',
      endpoint: 'https://api.nexusmods.com/v2/graphql',
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
      ...overrides[routeId],
    })),
  }
}

let launcherPort: LauncherPort

function Wrapper({ children }: { children: ReactNode }) {
  return <LauncherTestWrapper port={launcherPort}>{children}</LauncherTestWrapper>
}

describe('useLauncherDiscover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    launcherPort = createMockLauncherPort({
      loadNexusDiagnostics: vi.fn().mockResolvedValue(createLauncherDiagnosticsResult()),
      searchCatalog: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('hydrates toolbar preferences from the provided app ui snapshot', async () => {
    vi.mocked(launcherPort.searchCatalog).mockResolvedValue({
      page: 1,
      pageSize: 40,
      totalCount: 0,
      hasMore: false,
      facets: { categories: [], languages: [], tags: [] },
      results: [],
    })

    const { result } = renderHook(
      () =>
        useLauncherDiscover({
          sort: 'downloads',
          ascending: true,
          timeRange: 'week',
          pageSize: 40,
          filtersHidden: true,
        }),
      { wrapper: Wrapper },
    )

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(result.current.sort).toBe('downloads')
    expect(result.current.ascending).toBe(true)
    expect(result.current.timeRange).toBe('week')
    expect(result.current.pageSize).toBe(40)
    expect(launcherPort.searchCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: 'downloads',
        ascending: true,
        timeRange: 'week',
        pageSize: 40,
      }),
    )
  })

  it('uses updated toolbar preferences when sorting controls change', async () => {
    vi.mocked(launcherPort.searchCatalog).mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
      facets: { categories: [], languages: [], tags: [] },
      results: [],
    })

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
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

    expect(launcherPort.searchCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: 'downloads',
        ascending: true,
        timeRange: 'month',
        pageSize: 80,
      }),
    )
  })

  it('re-runs the catalog request when refresh is triggered from the first page', async () => {
    vi.mocked(launcherPort.searchCatalog).mockResolvedValue({
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

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(launcherPort.searchCatalog).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.refresh()
    })

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(launcherPort.searchCatalog).toHaveBeenCalledTimes(2)
  })

  it('navigates to an explicit remote page without waiting for the search debounce window', async () => {
    vi.mocked(launcherPort.searchCatalog)
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

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(launcherPort.searchCatalog).toHaveBeenCalledTimes(1)
    expect(launcherPort.searchCatalog).toHaveBeenLastCalledWith({
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

    expect(launcherPort.searchCatalog).toHaveBeenCalledTimes(2)
    expect(launcherPort.searchCatalog).toHaveBeenLastCalledWith({
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
    vi.mocked(launcherPort.searchCatalog)
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

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
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
    expect(launcherPort.searchCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 80,
      }),
    )
  })

  it('resets back to page 1 when a filter changes and exposes total pages', async () => {
    vi.mocked(launcherPort.searchCatalog)
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

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
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
    expect(launcherPort.searchCatalog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        category: 'Maps',
      }),
    )
  })

  it('keeps base remote facet options while applying counts from narrowed result facets', async () => {
    vi.mocked(launcherPort.searchCatalog)
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        totalCount: 1445,
        hasMore: true,
        facets: {
          categories: [
            { name: 'Gameplay Mechanics', count: 1100 },
            { name: 'Characters', count: 865 },
            { name: 'Portraits', count: 545 },
          ],
          languages: [
            { name: 'English', count: 16098 },
            { name: 'Chinese', count: 1200 },
          ],
          tags: [
            { name: 'SMAPI', count: 18839 },
            { name: 'Content Patcher', count: 12000 },
          ],
        },
        results: [],
      })
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        totalCount: 1100,
        hasMore: true,
        facets: {
          categories: [
            { name: 'Gameplay Mechanics', count: 1100 },
            { name: 'Portraits', count: 90 },
          ],
          languages: [{ name: 'English', count: 900 }],
          tags: [{ name: 'SMAPI', count: 800 }],
        },
        results: [],
      })

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(result.current.facets.categories.map((category) => category.name)).toEqual(['Gameplay Mechanics', 'Characters', 'Portraits'])

    act(() => {
      result.current.updateFilter('category', 'Gameplay Mechanics')
    })

    await act(async () => {
      vi.advanceTimersByTime(320)
      await Promise.resolve()
    })

    expect(result.current.facets.categories.map((category) => category.name)).toEqual(['Gameplay Mechanics', 'Characters', 'Portraits'])
    expect(result.current.facets.categories.map((category) => category.count)).toEqual([1100, 865, 90])
    expect(result.current.facets.languages.map((language) => language.name)).toEqual(['English', 'Chinese'])
    expect(result.current.facets.tags.map((tag) => tag.name)).toEqual(['SMAPI', 'Content Patcher'])
  })

  it('skips automatic discover searches when all discover routes are unavailable', async () => {
    vi.mocked(launcherPort.loadNexusDiagnostics).mockResolvedValue(
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
    vi.mocked(launcherPort.searchCatalog).mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 0,
      hasMore: false,
      facets: { categories: [], languages: [], tags: [] },
      results: [],
    })

    const { result } = renderHook(() => useLauncherDiscover(), { wrapper: Wrapper })
    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(launcherPort.searchCatalog).not.toHaveBeenCalled()
    expect(result.current.blockedReason).toContain('Nexus Public GraphQL')
    expect(result.current.blockedReason).toContain('Forced offline by debug override.')
  })
})
