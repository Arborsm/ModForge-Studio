import { useEffect, useRef, useState } from 'react'
import { useLauncherPort } from './launcherPortContext'
import { TaskCancelledError, useLatestTask, type TaskScope } from '@platform/task-runtime'
import type { LauncherCatalogFacets, SearchLauncherCatalogRequest } from './launcherContracts'
import { normalizeLauncherDiscoverToolbarState, type LauncherDiscoverToolbarState } from './launcherDiscoverToolbarState'
import { canAutoLoadLauncherDiscover, getLauncherDiscoverUnavailableReason } from './nexusDiagnostics'
import type { LauncherDiscoverItem, LauncherViewState } from './types'

type DiscoverFilters = {
  titleQuery: string
  descriptionQuery: string
  authorQuery: string
  uploaderQuery: string
  category: string
  language: string
  tagsInclude: string
  tagsExclude: string
  includeAdult: boolean
  minFileSize: string
  maxFileSize: string
  minDownloads: string
  maxDownloads: string
  minEndorsements: string
  maxEndorsements: string
}

const DEFAULT_FILTERS: DiscoverFilters = {
  titleQuery: '',
  descriptionQuery: '',
  authorQuery: '',
  uploaderQuery: '',
  category: '',
  language: '',
  tagsInclude: '',
  tagsExclude: '',
  includeAdult: false,
  minFileSize: '',
  maxFileSize: '',
  minDownloads: '',
  maxDownloads: '',
  minEndorsements: '',
  maxEndorsements: '',
}

const EMPTY_FACETS: LauncherCatalogFacets = {
  categories: [],
  languages: [],
  tags: [],
}

function parseFacetTokens(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isBaseFacetRequest(request: SearchLauncherCatalogRequest) {
  return (
    !request.query?.trim() &&
    !request.titleQuery?.trim() &&
    !request.descriptionQuery?.trim() &&
    !request.authorQuery?.trim() &&
    !request.uploaderQuery?.trim() &&
    !request.category &&
    !request.language &&
    !request.tagsInclude &&
    !request.tagsExclude &&
    !request.includeAdult &&
    request.minFileSize == null &&
    request.maxFileSize == null &&
    request.minDownloads == null &&
    request.maxDownloads == null &&
    request.minEndorsements == null &&
    request.maxEndorsements == null &&
    (!request.timeRange || request.timeRange === 'all')
  )
}

function mergeFacetOptions(
  baseOptions: LauncherCatalogFacets['categories'],
  currentOptions: LauncherCatalogFacets['categories'],
  selectedNames: string[],
) {
  const currentCounts = new Map(currentOptions.map((option) => [option.name.toLowerCase(), option.count]))
  const merged = new Map<string, { name: string; count: number }>()
  const seedOptions = baseOptions.length ? baseOptions : currentOptions

  for (const option of seedOptions) {
    const name = option.name.trim()
    if (!name) {
      continue
    }

    merged.set(name.toLowerCase(), {
      name,
      count: currentCounts.get(name.toLowerCase()) ?? option.count,
    })
  }

  for (const name of selectedNames) {
    const trimmed = name.trim()
    if (!trimmed || merged.has(trimmed.toLowerCase())) {
      continue
    }

    merged.set(trimmed.toLowerCase(), {
      name: trimmed,
      count: currentCounts.get(trimmed.toLowerCase()) ?? 0,
    })
  }

  return [...merged.values()]
}

function buildDisplayFacets(baseFacets: LauncherCatalogFacets, currentFacets: LauncherCatalogFacets, filters: DiscoverFilters) {
  return {
    categories: mergeFacetOptions(baseFacets.categories, currentFacets.categories, [filters.category]),
    languages: mergeFacetOptions(baseFacets.languages, currentFacets.languages, [filters.language]),
    tags: mergeFacetOptions(baseFacets.tags, currentFacets.tags, [
      ...parseFacetTokens(filters.tagsInclude),
      ...parseFacetTokens(filters.tagsExclude),
    ]),
  }
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function isAbortError(error: unknown) {
  return error instanceof TaskCancelledError || (error instanceof DOMException && error.name === 'AbortError')
}

function waitForDiscoverDelay(delayMs: number, scope: TaskScope) {
  if (delayMs <= 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    let handle: number | null = null
    const cleanup = () => {
      if (handle != null) {
        window.clearTimeout(handle)
        handle = null
      }
      scope.signal.removeEventListener('abort', abort)
    }
    const complete = () => {
      cleanup()
      resolve()
    }
    const abort = () => {
      cleanup()
      reject(scope.signal.reason ?? new TaskCancelledError('Launcher discover request was superseded.'))
    }

    if (scope.signal.aborted) {
      abort()
      return
    }

    scope.signal.addEventListener('abort', abort, { once: true })
    handle = window.setTimeout(complete, delayMs)
  })
}

export function useLauncherDiscover(initialToolbarState?: Partial<LauncherDiscoverToolbarState> | null) {
  const launcherPort = useLauncherPort()
  const runDiscoverTask = useLatestTask('launcher-discover')
  const normalizedToolbarState = normalizeLauncherDiscoverToolbarState(initialToolbarState)
  const [items, setItems] = useState<LauncherDiscoverItem[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<NonNullable<SearchLauncherCatalogRequest['sort']>>(normalizedToolbarState.sort)
  const [ascending, setAscending] = useState(normalizedToolbarState.ascending)
  const [timeRange, setTimeRange] = useState<NonNullable<SearchLauncherCatalogRequest['timeRange']>>(normalizedToolbarState.timeRange)
  const [pageSize, setPageSize] = useState<NonNullable<SearchLauncherCatalogRequest['pageSize']>>(normalizedToolbarState.pageSize)
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS)
  const [page, setPageState] = useState(1)
  const [refreshToken, setRefreshToken] = useState(0)
  const [requestDelayMs, setRequestDelayMs] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [facets, setFacets] = useState<LauncherCatalogFacets>(EMPTY_FACETS)
  const [baseFacets, setBaseFacets] = useState<LauncherCatalogFacets>(EMPTY_FACETS)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)
  const manualRefreshBypassRef = useRef(false)

  useEffect(() => {
    const bypassDiagnostics = manualRefreshBypassRef.current
    manualRefreshBypassRef.current = false
    void runDiscoverTask(async (scope) => {
      await waitForDiscoverDelay(requestDelayMs, scope)
      if (!scope.isCurrent()) {
        return
      }

      setState('loading')
      setError(null)
      setBlockedReason(null)

      const requestPayload = {
        query,
        titleQuery: filters.titleQuery,
        descriptionQuery: filters.descriptionQuery,
        authorQuery: filters.authorQuery,
        uploaderQuery: filters.uploaderQuery,
        page,
        pageSize,
        timeRange,
        sort,
        ascending,
        category: filters.category || null,
        language: filters.language || null,
        tagsInclude: filters.tagsInclude || null,
        tagsExclude: filters.tagsExclude || null,
        includeAdult: filters.includeAdult,
        minFileSize: parseOptionalNumber(filters.minFileSize),
        maxFileSize: parseOptionalNumber(filters.maxFileSize),
        minDownloads: parseOptionalNumber(filters.minDownloads),
        maxDownloads: parseOptionalNumber(filters.maxDownloads),
        minEndorsements: parseOptionalNumber(filters.minEndorsements),
        maxEndorsements: parseOptionalNumber(filters.maxEndorsements),
      } satisfies SearchLauncherCatalogRequest

      try {
        const diagnostics = bypassDiagnostics ? null : await launcherPort.loadNexusDiagnostics().catch(() => null)
        if (!scope.isCurrent()) {
          return
        }

        const unavailableReason =
          diagnostics && !canAutoLoadLauncherDiscover(diagnostics, { query, sort })
            ? getLauncherDiscoverUnavailableReason(diagnostics, { query, sort })
            : null
        if (unavailableReason) {
          setItems([])
          setTotalCount(0)
          setHasMore(false)
          setBlockedReason(unavailableReason)
          setState('ready')
          return
        }

        const result = await launcherPort.searchCatalog(requestPayload)
        if (!scope.isCurrent()) {
          return
        }

        setItems(result.results)
        setTotalCount(result.totalCount)
        setHasMore(result.hasMore)
        setFacets(result.facets)
        if (isBaseFacetRequest(requestPayload)) {
          setBaseFacets(result.facets)
        }
        setBlockedReason(null)
        setState('ready')
      } catch (nextError) {
        if (!scope.isCurrent() || isAbortError(nextError)) {
          return
        }

        setBlockedReason(null)
        setError(nextError instanceof Error ? nextError.message : 'Failed to load launcher discover results.')
        setState('error')
      }
    }).catch((nextError) => {
      if (!isAbortError(nextError)) {
        throw nextError
      }
    })
  }, [ascending, filters, page, pageSize, query, refreshToken, requestDelayMs, sort, timeRange, launcherPort, runDiscoverTask])

  const resetToFirstPage = () => {
    setPageState(1)
  }

  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0
  const displayFacets = buildDisplayFacets(baseFacets, facets, filters)

  const setPage = (value: number) => {
    const normalized = Math.max(1, Math.trunc(value))
    const clamped = totalPages > 0 ? Math.min(normalized, totalPages) : normalized
    setRequestDelayMs(0)
    setPageState((current) => (current === clamped ? current : clamped))
  }

  const revalidate = () => {
    setRequestDelayMs(0)
    resetToFirstPage()
    setRefreshToken((current) => current + 1)
  }

  return {
    items,
    query,
    sort,
    ascending,
    timeRange,
    pageSize,
    totalCount,
    totalPages,
    page,
    hasMore,
    facets: displayFacets,
    filters,
    state,
    error,
    blockedReason,
    setQuery: (value: string) => {
      setRequestDelayMs(320)
      setQuery(value)
      setPageState(1)
    },
    setSort: (value: NonNullable<SearchLauncherCatalogRequest['sort']>) => {
      setRequestDelayMs(320)
      setSort(value)
      resetToFirstPage()
    },
    setAscending: (value: boolean) => {
      setRequestDelayMs(320)
      setAscending(value)
      resetToFirstPage()
    },
    setTimeRange: (value: NonNullable<SearchLauncherCatalogRequest['timeRange']>) => {
      setRequestDelayMs(0)
      setTimeRange(value)
      resetToFirstPage()
    },
    setPageSize: (value: number) => {
      const normalized: NonNullable<SearchLauncherCatalogRequest['pageSize']> = value === 40 || value === 80 ? value : 20
      setRequestDelayMs(0)
      setPageSize(normalized)
      resetToFirstPage()
    },
    updateFilter: <Key extends keyof DiscoverFilters>(key: Key, value: DiscoverFilters[Key]) => {
      setRequestDelayMs(320)
      setFilters((current) => ({
        ...current,
        [key]: value,
      }))
      resetToFirstPage()
    },
    setPage,
    goToNextPage: () => {
      if (state === 'loading' || (totalPages > 0 && page >= totalPages)) {
        return
      }
      setPage(page + 1)
    },
    goToPreviousPage: () => {
      if (state === 'loading' || page <= 1) {
        return
      }
      setPage(page - 1)
    },
    revalidate,
    refresh: () => {
      manualRefreshBypassRef.current = true
      revalidate()
    },
    resetFilters: () => {
      setRequestDelayMs(0)
      setFilters(DEFAULT_FILTERS)
      resetToFirstPage()
    },
  }
}
