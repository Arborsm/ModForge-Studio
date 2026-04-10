export const LAUNCHER_DISCOVER_TOOLBAR_STORAGE_KEY = 'modforge:launcher-discover-toolbar:v1'

const DISCOVER_SORT_OPTIONS = ['newest', 'updated', 'trending', 'downloads', 'endorsements', 'name'] as const
const DISCOVER_TIME_RANGE_OPTIONS = ['all', 'day', 'week', 'month', 'year'] as const
const DISCOVER_PAGE_SIZE_OPTIONS = [20, 40, 80] as const

export type LauncherDiscoverToolbarState = {
  sort: (typeof DISCOVER_SORT_OPTIONS)[number]
  ascending: boolean
  timeRange: (typeof DISCOVER_TIME_RANGE_OPTIONS)[number]
  pageSize: number
  filtersHidden: boolean
}

export const DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE: LauncherDiscoverToolbarState = {
  sort: 'newest',
  ascending: false,
  timeRange: 'all',
  pageSize: 20,
  filtersHidden: false,
}

function isDiscoverSort(value: unknown): value is LauncherDiscoverToolbarState['sort'] {
  return typeof value === 'string' && DISCOVER_SORT_OPTIONS.includes(value as LauncherDiscoverToolbarState['sort'])
}

function isDiscoverTimeRange(value: unknown): value is LauncherDiscoverToolbarState['timeRange'] {
  return (
    typeof value === 'string' &&
    DISCOVER_TIME_RANGE_OPTIONS.includes(value as LauncherDiscoverToolbarState['timeRange'])
  )
}

function isDiscoverPageSize(value: unknown): value is number {
  return typeof value === 'number' && DISCOVER_PAGE_SIZE_OPTIONS.includes(value as (typeof DISCOVER_PAGE_SIZE_OPTIONS)[number])
}

export function readStoredLauncherDiscoverToolbarState(): LauncherDiscoverToolbarState {
  if (typeof window === 'undefined') {
    return DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE
  }

  try {
    const raw = window.localStorage.getItem(LAUNCHER_DISCOVER_TOOLBAR_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE
    }

    const parsed = JSON.parse(raw) as Partial<LauncherDiscoverToolbarState>
    return {
      sort: isDiscoverSort(parsed.sort) ? parsed.sort : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.sort,
      ascending:
        typeof parsed.ascending === 'boolean'
          ? parsed.ascending
          : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.ascending,
      timeRange: isDiscoverTimeRange(parsed.timeRange)
        ? parsed.timeRange
        : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.timeRange,
      pageSize: isDiscoverPageSize(parsed.pageSize) ? parsed.pageSize : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.pageSize,
      filtersHidden:
        typeof parsed.filtersHidden === 'boolean'
          ? parsed.filtersHidden
          : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.filtersHidden,
    }
  } catch {
    return DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE
  }
}

export function persistLauncherDiscoverToolbarState(nextState: Partial<LauncherDiscoverToolbarState>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const current = readStoredLauncherDiscoverToolbarState()
    window.localStorage.setItem(
      LAUNCHER_DISCOVER_TOOLBAR_STORAGE_KEY,
      JSON.stringify({
        ...current,
        ...nextState,
      }),
    )
  } catch {
    // Ignore blocked storage writes and keep discover toolbar state in-memory.
  }
}
