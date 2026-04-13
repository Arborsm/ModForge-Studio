import {
  loadLauncherNexusDiagnostics,
  type LauncherNexusDiagnosticsResult,
  type LauncherNexusRouteSnapshot,
} from '../desktop'

const AUTO_REMOTE_COVER_DETAIL_ROUTE_IDS = ['publicGraphql', 'publicHtml'] as const
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
