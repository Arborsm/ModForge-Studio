import { useEffect, useRef, useState } from 'react'
import { searchLauncherCatalog, type SearchLauncherCatalogRequest } from '../desktop'
import type { LauncherDiscoverItem, LauncherViewState } from './types'

const DEFAULT_SORT: NonNullable<SearchLauncherCatalogRequest['sort']> = 'newest'

export function useLauncherDiscover() {
  const [items, setItems] = useState<LauncherDiscoverItem[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<NonNullable<SearchLauncherCatalogRequest['sort']>>(DEFAULT_SORT)
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(1)
  const [refreshToken, setRefreshToken] = useState(0)
  const [requestDelayMs, setRequestDelayMs] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<LauncherViewState>('idle')
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const handle = window.setTimeout(() => {
      setState('loading')
      setError(null)

      void searchLauncherCatalog({
        query,
        page,
        sort,
        ascending,
      })
        .then((result) => {
          if (requestIdRef.current !== requestId) {
            return
          }

          setItems((current) => (page === 1 ? result.results : [...current, ...result.results]))
          setHasMore(result.hasMore)
          setState('ready')
        })
        .catch((nextError) => {
          if (requestIdRef.current !== requestId) {
            return
          }

          setError(nextError instanceof Error ? nextError.message : 'Failed to load launcher discover results.')
          setState('error')
        })
    }, requestDelayMs)

    return () => {
      window.clearTimeout(handle)
    }
  }, [ascending, page, query, refreshToken, requestDelayMs, sort])

  const resetToFirstPage = () => {
    setPage(1)
  }

  return {
    items,
    query,
    sort,
    ascending,
    page,
    hasMore,
    state,
    error,
    setQuery: (value: string) => {
      setRequestDelayMs(320)
      setQuery(value)
      setPage(1)
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
    loadMore: () => {
      if (!hasMore || state === 'loading') {
        return
      }
      setRequestDelayMs(0)
      setPage((current) => current + 1)
    },
    refresh: () => {
      requestIdRef.current += 1
      setRequestDelayMs(0)
      resetToFirstPage()
      setItems([])
      setRefreshToken((current) => current + 1)
    },
  }
}
