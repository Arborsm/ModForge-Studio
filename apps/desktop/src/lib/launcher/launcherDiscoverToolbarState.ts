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

type LauncherDiscoverToolbarStateInput = {
  sort?: string | null
  ascending?: boolean | string | null
  timeRange?: string | null
  pageSize?: number | string | null
  filtersHidden?: boolean | string | null
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

function parseOptionalBoolean(value: boolean | string | null | undefined) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return null
}

function parseDiscoverPageSize(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeLauncherDiscoverToolbarState(
  input?: LauncherDiscoverToolbarStateInput | null,
): LauncherDiscoverToolbarState {
  const ascending = parseOptionalBoolean(input?.ascending)
  const filtersHidden = parseOptionalBoolean(input?.filtersHidden)
  const pageSize = parseDiscoverPageSize(input?.pageSize)

  return {
    sort: isDiscoverSort(input?.sort) ? input.sort : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.sort,
    ascending: ascending ?? DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.ascending,
    timeRange: isDiscoverTimeRange(input?.timeRange)
      ? input.timeRange
      : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.timeRange,
    pageSize: isDiscoverPageSize(pageSize) ? pageSize : DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.pageSize,
    filtersHidden: filtersHidden ?? DEFAULT_LAUNCHER_DISCOVER_TOOLBAR_STATE.filtersHidden,
  }
}
