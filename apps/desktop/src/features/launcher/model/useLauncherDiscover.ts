import { useEffect, useRef, useState } from 'react'
import {
  loadLauncherNexusDiagnostics,
  searchLauncherCatalog,
  type LauncherCatalogFacets,
  type SearchLauncherCatalogRequest,
} from '@platform/desktop'
import {
  normalizeLauncherDiscoverToolbarState,
  type LauncherDiscoverToolbarState,
} from './launcherDiscoverToolbarState'
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

function parseOptionalNumber(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function useLauncherDiscover(initialToolbarState?: Partial<LauncherDiscoverToolbarState> | null) {
  const normalizedToolbarState = normalizeLauncherDiscoverToolbarState(initialToolbarState)
  const [items, setItems] = useState<LauncherDiscoverItem[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<NonNullable<SearchLauncherCatalogRequest['sort']>>(normalizedToolbarState.sort)
  const [ascending, setAscending] = useState(normalizedToolbarState.ascending)
  const [timeRange, setTimeRange] = useState<NonNullable<SearchLauncherCatalogRequest['timeRange']>>(normalizedToolbarState.timeRange)
  const [pageSize, setPageSize] = useState<NonNullable<SearchLauncherCatalogRequest['pageSize']>>(
    normalizedToolbarState.pageSize,
  )
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS)
  const [page, setPageState] = useState(1)
  const [refreshToken, setRefreshToken] = useState(0)
  const [requestDelayMs, setRequestDelayMs] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [facets, setFacets] = useState<LauncherCatalogFacets>(EMPTY_FACETS)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const manualRefreshBypassRef = useRef(false)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const bypassDiagnostics = manualRefreshBypassRef.current
    manualRefreshBypassRef.current = false
    const handle = window.setTimeout(() => {
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

      void (bypassDiagnostics
        ? Promise.resolve(null)
        : loadLauncherNexusDiagnostics().catch(() => null))
        .then((diagnostics) => {
          if (requestIdRef.current !== requestId) {
            return null
          }

          const unavailableReason =
            diagnostics && !canAutoLoadLauncherDiscover(diagnostics, { query, sort })
              ? getLauncherDiscoverUnavailableReason(diagnostics, { query, sort })
              : null
          if (unavailableReason) {
            setItems([])
            setTotalCount(0)
            setHasMore(false)
            setFacets(EMPTY_FACETS)
            setBlockedReason(unavailableReason)
            setState('ready')
            return null
          }

          return searchLauncherCatalog(requestPayload)
        })
        .then((result) => {
          if (!result || requestIdRef.current !== requestId) {
            return
          }

          setItems(result.results)
          setTotalCount(result.totalCount)
          setHasMore(result.hasMore)
          setFacets(result.facets)
          setBlockedReason(null)
          setState('ready')
        })
        .catch((nextError) => {
          if (requestIdRef.current !== requestId) {
            return
          }

          setBlockedReason(null)
          setError(nextError instanceof Error ? nextError.message : 'Failed to load launcher discover results.')
          setState('error')
        })
    }, requestDelayMs)

    return () => {
      window.clearTimeout(handle)
    }
  }, [ascending, filters, page, pageSize, query, refreshToken, requestDelayMs, sort, timeRange])

  const resetToFirstPage = () => {
    setPageState(1)
  }

  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0

  const setPage = (value: number) => {
    const normalized = Math.max(1, Math.trunc(value))
    const clamped = totalPages > 0 ? Math.min(normalized, totalPages) : normalized
    setRequestDelayMs(0)
    setPageState((current) => (current === clamped ? current : clamped))
  }

  const revalidate = () => {
    requestIdRef.current += 1
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
    facets,
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
      const normalized: NonNullable<SearchLauncherCatalogRequest['pageSize']> =
        value === 40 || value === 80 ? value : 20
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
  }
}
