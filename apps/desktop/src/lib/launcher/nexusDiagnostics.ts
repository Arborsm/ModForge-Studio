import {
  loadLauncherNexusDiagnostics,
  type LauncherNexusDiagnosticsResult,
  type LauncherNexusRouteSnapshot,
} from '../desktop'

const AUTO_REMOTE_COVER_DETAIL_ROUTE_IDS = ['publicGraphql', 'publicHtml'] as const
const AUTO_DISCOVER_GRAPHQL_ROUTE_IDS = ['privateGraphql', 'publicGraphql'] as const
const AUTO_DISCOVER_TRENDING_ROUTE_IDS = ['nexusApi', ...AUTO_DISCOVER_GRAPHQL_ROUTE_IDS] as const
const AUTO_UPDATE_ROUTE_IDS = ['smapi', 'privateGraphql', 'publicGraphql', 'publicHtml'] as const

function isSuccessfulRoute(route: LauncherNexusRouteSnapshot | null | undefined) {
  return route?.available === true && route.status === 'success'
}

export function getLauncherNexusRoute(
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  routeId: string,
) {
  return diagnostics?.routes.find((route) => route.routeId === routeId) ?? null
}

export function getLauncherNexusWarningRoutes(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  return (diagnostics?.routes ?? []).filter((route) => route.status === 'warning' || route.available === false)
}

export function hasLoadingLauncherNexusRoutes(diagnostics: LauncherNexusDiagnosticsResult | null | undefined) {
  return (diagnostics?.routes ?? []).some((route) => route.status === 'loading')
}

function getRouteMessages(routes: LauncherNexusRouteSnapshot[]) {
  return routes.map((route) => `${route.label}: ${route.message}`).join('\n')
}

function getRelevantRoutes(
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  routeIds: readonly string[],
) {
  return routeIds
    .map((routeId) => getLauncherNexusRoute(diagnostics, routeId))
    .filter((route): route is LauncherNexusRouteSnapshot => route != null)
}

function getUnavailableRouteMessages(
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  routeIds: readonly string[],
) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return null
  }

  const unavailableRoutes = getRelevantRoutes(diagnostics, routeIds).filter(
    (route) => route.status === 'warning' || route.available === false,
  )
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

  return AUTO_UPDATE_ROUTE_IDS.some((routeId) => isSuccessfulRoute(getLauncherNexusRoute(diagnostics, routeId)))
}

export function canAutoLoadLauncherDiscover(
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  options?: { query?: string | null; sort?: string | null },
) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return false
  }

  return getDiscoverRouteIds(options).some((routeId) => isSuccessfulRoute(getLauncherNexusRoute(diagnostics, routeId)))
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
  delayMs?: number
  maxAttempts?: number
}

export async function loadSettledLauncherNexusDiagnostics(
  options: LoadSettledLauncherNexusDiagnosticsOptions = {},
) {
  const delayMs = options.delayMs ?? 1000
  const maxAttempts = options.maxAttempts ?? 12
  let diagnostics = await loadLauncherNexusDiagnostics()

  for (let attempt = 1; attempt < maxAttempts && hasLoadingLauncherNexusRoutes(diagnostics); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    diagnostics = await loadLauncherNexusDiagnostics()
  }

  return diagnostics
}
