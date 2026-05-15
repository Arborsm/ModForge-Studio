import type {
  LauncherLibraryScanResult,
  LauncherNexusDiagnosticsResult,
  LauncherNexusRouteSnapshot,
  LauncherRuntimeInfo,
  SsoSnapshot,
  ValidateApiKeyResult,
} from './launcherContracts'

const AUTO_REMOTE_COVER_DETAIL_ROUTE_IDS = ['publicGraphql'] as const
const AUTO_DISCOVER_GRAPHQL_ROUTE_IDS = ['privateGraphql', 'publicGraphql'] as const
const AUTO_DISCOVER_TRENDING_ROUTE_IDS = ['nexusApi', ...AUTO_DISCOVER_GRAPHQL_ROUTE_IDS] as const
const AUTO_UPDATE_ROUTE_IDS = ['smapi', 'privateGraphql', 'publicGraphql'] as const
const CONFIGURATION_API_ROUTE_CACHE_TTL_MS = 5 * 60 * 1000
const CONFIGURATION_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000
const CONFIGURATION_API_ROUTE_IDS = new Set(['nexusApi', 'privateGraphql'])

type CachedConfigurationDiagnostics = {
  diagnostics: LauncherNexusDiagnosticsResult
  cachedAt: number
  apiKeySignature: string
}

type CachedConfigurationApiKeyStatus = {
  status: ValidateApiKeyResult | null
  error: string | null
  cachedAt: number
  apiKeySignature: string
}

type CachedConfigurationLibraryScan = {
  result: LauncherLibraryScanResult
  cachedAt: number
  modsPath: string
}

type CachedConfigurationRuntimeInfo = {
  info: LauncherRuntimeInfo
  cachedAt: number
  gamePath: string
}

type CachedConfigurationSsoStatus = {
  snapshot: SsoSnapshot
  cachedAt: number
}

let cachedConfigurationDiagnostics: CachedConfigurationDiagnostics | null = null
let cachedConfigurationApiKeyStatus: CachedConfigurationApiKeyStatus | null = null
let cachedConfigurationLibraryScan: CachedConfigurationLibraryScan | null = null
let cachedConfigurationRuntimeInfo: CachedConfigurationRuntimeInfo | null = null
let cachedConfigurationSsoStatus: CachedConfigurationSsoStatus | null = null

function isSuccessfulRoute(route: LauncherNexusRouteSnapshot | null | undefined) {
  return route?.available === true && route.status === 'success'
}

export function getLauncherNexusRoute(diagnostics: LauncherNexusDiagnosticsResult | null | undefined, routeId: string) {
  return diagnostics?.routes.find((route) => route.routeId === routeId) ?? null
}

export function getLauncherNexusWarningRoutes(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  return (diagnostics?.routes ?? []).filter((route) => route.status === 'warning' || !route.available)
}

export function hasLoadingLauncherNexusRoutes(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  return (diagnostics?.routes ?? []).some((route) => route.status === 'loading')
}

export function mergeLauncherNexusDiagnostics(currentRoutes: LauncherNexusRouteSnapshot[], nextRoutes: LauncherNexusRouteSnapshot[]) {
  if (!currentRoutes.length) {
    return nextRoutes
  }

  const nextByRouteId = new Map(nextRoutes.map((route) => [route.routeId, route]))
  const mergedRoutes = currentRoutes.map((route) => nextByRouteId.get(route.routeId) ?? route)
  const currentRouteIds = new Set(currentRoutes.map((route) => route.routeId))
  for (const route of nextRoutes) {
    if (!currentRouteIds.has(route.routeId)) {
      mergedRoutes.push(route)
    }
  }

  return mergedRoutes
}

function hasRefreshableFailedRoute(routes: LauncherNexusRouteSnapshot[]) {
  return routes.some((route) => !CONFIGURATION_API_ROUTE_IDS.has(route.routeId) && (route.status === 'warning' || !route.available))
}

function hasLoadingConfigurationRoute(routes: LauncherNexusRouteSnapshot[]) {
  return routes.some((route) => route.status === 'loading')
}

function hasExpiredConfigurationApiRoute(cached: CachedConfigurationDiagnostics, now: number, apiKeySignature: string) {
  if (cached.apiKeySignature !== apiKeySignature) {
    return true
  }

  if (now - cached.cachedAt <= CONFIGURATION_API_ROUTE_CACHE_TTL_MS) {
    return false
  }

  return cached.diagnostics.routes.some((route) => CONFIGURATION_API_ROUTE_IDS.has(route.routeId))
}

/**
 * Caches configuration-page diagnostics so route rows do not re-enter the
 * loading state every time the user opens Settings.
 */
export function readCachedLauncherConfigurationDiagnostics(
  options: {
    now?: number
    apiKeySignature?: string | null
  } = {},
) {
  const cached = cachedConfigurationDiagnostics
  if (!cached) {
    return null
  }

  const now = options.now ?? Date.now()
  const apiKeySignature = options.apiKeySignature ?? ''
  const shouldRefresh =
    hasLoadingConfigurationRoute(cached.diagnostics.routes) ||
    hasRefreshableFailedRoute(cached.diagnostics.routes) ||
    hasExpiredConfigurationApiRoute(cached, now, apiKeySignature)

  return {
    diagnostics: cached.diagnostics,
    cachedAt: cached.cachedAt,
    shouldRefresh,
  }
}

/**
 * Stores the latest configuration diagnostics snapshot with the API-key
 * signature that affects authenticated Nexus routes.
 */
export function writeCachedLauncherConfigurationDiagnostics(
  diagnostics: LauncherNexusDiagnosticsResult,
  options: {
    now?: number
    apiKeySignature?: string | null
  } = {},
) {
  cachedConfigurationDiagnostics = {
    diagnostics,
    cachedAt: options.now ?? Date.now(),
    apiKeySignature: options.apiKeySignature ?? '',
  }
}

/** Clears configuration diagnostics cache for tests and explicit reset flows. */
export function clearCachedLauncherConfigurationDiagnostics() {
  cachedConfigurationDiagnostics = null
  cachedConfigurationApiKeyStatus = null
  cachedConfigurationLibraryScan = null
  cachedConfigurationRuntimeInfo = null
  cachedConfigurationSsoStatus = null
}

/**
 * Reads cached Nexus API-key validation for the configuration page.
 * The cache is keyed by the API-key signature and expires with API routes.
 */
export function readCachedLauncherConfigurationApiKeyStatus(
  options: {
    now?: number
    apiKeySignature?: string | null
  } = {},
) {
  const cached = cachedConfigurationApiKeyStatus
  if (!cached) {
    return null
  }

  const now = options.now ?? Date.now()
  const apiKeySignature = options.apiKeySignature ?? ''
  if (cached.apiKeySignature !== apiKeySignature) {
    return null
  }

  if (now - cached.cachedAt > CONFIGURATION_API_ROUTE_CACHE_TTL_MS) {
    return null
  }

  return cached
}

/** Stores Nexus API-key validation for configuration-page remounts. */
export function writeCachedLauncherConfigurationApiKeyStatus(
  value: {
    status: ValidateApiKeyResult | null
    error: string | null
  },
  options: {
    now?: number
    apiKeySignature?: string | null
  } = {},
) {
  cachedConfigurationApiKeyStatus = {
    ...value,
    cachedAt: options.now ?? Date.now(),
    apiKeySignature: options.apiKeySignature ?? '',
  }
}

function isFreshConfigurationSummaryCache(cachedAt: number, now: number) {
  return now - cachedAt <= CONFIGURATION_SUMMARY_CACHE_TTL_MS
}

/** Reads cached launcher library scan data for configuration-page summaries. */
export function readCachedLauncherConfigurationLibraryScan(
  options: {
    now?: number
    modsPath?: string | null
  } = {},
) {
  const cached = cachedConfigurationLibraryScan
  const modsPath = options.modsPath?.trim() ?? ''
  if (!cached || cached.modsPath !== modsPath) {
    return null
  }

  if (!isFreshConfigurationSummaryCache(cached.cachedAt, options.now ?? Date.now())) {
    return null
  }

  return cached
}

/** Stores launcher library scan data for configuration-page remounts. */
export function writeCachedLauncherConfigurationLibraryScan(
  result: LauncherLibraryScanResult,
  options: {
    now?: number
    modsPath?: string | null
  } = {},
) {
  cachedConfigurationLibraryScan = {
    result,
    cachedAt: options.now ?? Date.now(),
    modsPath: options.modsPath?.trim() ?? result.modsPath.trim(),
  }
}

/** Reads cached launcher runtime version information for configuration summaries. */
export function readCachedLauncherConfigurationRuntimeInfo(
  options: {
    now?: number
    gamePath?: string | null
  } = {},
) {
  const cached = cachedConfigurationRuntimeInfo
  const gamePath = options.gamePath?.trim() ?? ''
  if (!cached || cached.gamePath !== gamePath) {
    return null
  }

  if (!isFreshConfigurationSummaryCache(cached.cachedAt, options.now ?? Date.now())) {
    return null
  }

  return cached
}

/** Stores launcher runtime version information for configuration-page remounts. */
export function writeCachedLauncherConfigurationRuntimeInfo(
  info: LauncherRuntimeInfo,
  options: {
    now?: number
    gamePath?: string | null
  } = {},
) {
  cachedConfigurationRuntimeInfo = {
    info,
    cachedAt: options.now ?? Date.now(),
    gamePath: options.gamePath?.trim() ?? '',
  }
}

/** Reads cached Nexus SSO status for configuration-page remounts. */
export function readCachedLauncherConfigurationSsoStatus(options: { now?: number } = {}) {
  const cached = cachedConfigurationSsoStatus
  if (!cached) {
    return null
  }

  if (!isFreshConfigurationSummaryCache(cached.cachedAt, options.now ?? Date.now())) {
    return null
  }

  return cached
}

/** Stores Nexus SSO status for configuration-page remounts. */
export function writeCachedLauncherConfigurationSsoStatus(
  snapshot: SsoSnapshot,
  options: {
    now?: number
  } = {},
) {
  cachedConfigurationSsoStatus = {
    snapshot,
    cachedAt: options.now ?? Date.now(),
  }
}

function getRouteMessages(routes: LauncherNexusRouteSnapshot[]) {
  return routes.map((route) => `${route.label}: ${route.message}`).join('\n')
}

function getRelevantRoutes(diagnostics: LauncherNexusDiagnosticsResult | null | undefined, routeIds: readonly string[]) {
  return routeIds
    .map((routeId) => getLauncherNexusRoute(diagnostics, routeId))
    .filter((route): route is LauncherNexusRouteSnapshot => route != null)
}

function getUnavailableRouteMessages(diagnostics: LauncherNexusDiagnosticsResult | null | undefined, routeIds: readonly string[]) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return null
  }

  const unavailableRoutes = getRelevantRoutes(diagnostics, routeIds).filter((route) => route.status === 'warning' || !route.available)
  return unavailableRoutes.length ? getRouteMessages(unavailableRoutes) : null
}

function getDiscoverRouteIds(options?: { query?: string | null; sort?: string | null }) {
  const query = options?.query?.trim() ?? ''
  if (!query && options?.sort === 'trending') {
    return AUTO_DISCOVER_TRENDING_ROUTE_IDS
  }

  return AUTO_DISCOVER_GRAPHQL_ROUTE_IDS
}

export function canAutoFetchLauncherRemoteCovers(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return false
  }

  if (!isSuccessfulRoute(getLauncherNexusRoute(diagnostics, 'nexusImages'))) {
    return false
  }

  return AUTO_REMOTE_COVER_DETAIL_ROUTE_IDS.some((routeId) => isSuccessfulRoute(getLauncherNexusRoute(diagnostics, routeId)))
}

export function canAutoCheckLauncherUpdates(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return false
  }

  return AUTO_UPDATE_ROUTE_IDS.some((routeId) => {
    const route = getLauncherNexusRoute(diagnostics, routeId)
    return isSuccessfulRoute(route)
  })
}

export function canAutoLoadLauncherDiscover(
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  options?: { query?: string | null; sort?: string | null },
) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return false
  }

  return getDiscoverRouteIds(options).some((routeId) => {
    const route = getLauncherNexusRoute(diagnostics, routeId)
    return isSuccessfulRoute(route)
  })
}

export function getLauncherDiscoverUnavailableReason(
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  options?: { query?: string | null; sort?: string | null },
) {
  return getUnavailableRouteMessages(diagnostics, getDiscoverRouteIds(options))
}

export function getLauncherUpdateUnavailableReason(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  return getUnavailableRouteMessages(diagnostics, AUTO_UPDATE_ROUTE_IDS)
}

type LoadSettledLauncherNexusDiagnosticsOptions = {
  loadDiagnostics: () => Promise<LauncherNexusDiagnosticsResult>
  delayMs?: number
  maxAttempts?: number
}

export async function loadSettledLauncherNexusDiagnostics(options: LoadSettledLauncherNexusDiagnosticsOptions) {
  const loadDiagnostics = options.loadDiagnostics
  const delayMs = options.delayMs ?? 1000
  const maxAttempts = options.maxAttempts ?? 12
  let diagnostics = await loadDiagnostics()

  for (let attempt = 1; attempt < maxAttempts && hasLoadingLauncherNexusRoutes(diagnostics); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    diagnostics = await loadDiagnostics()
  }

  return diagnostics
}
