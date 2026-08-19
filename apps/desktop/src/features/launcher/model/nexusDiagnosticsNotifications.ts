/**
 * @file Nexus diagnostics notification builder and sync helper: publishes or
 * dismisses the launcher diagnostics notification based on route health.
 */
import { dismissNotification, publishNotification, type NotificationChip, type PublishNotificationRequest } from '@shared/ui/notifications'
import type { LauncherCopy } from '@locales/api'
import type { LauncherNexusDiagnosticsResult } from './launcherContracts'
import {
  canAutoCheckLauncherUpdates,
  canAutoLoadLauncherDiscover,
  getLauncherNexusWarningRoutes,
  hasLoadingLauncherNexusRoutes,
} from './nexusDiagnostics'

/** Stable notification id for the launcher Nexus diagnostics banner. */
export const LAUNCHER_NEXUS_DIAGNOSTICS_NOTIFICATION_ID = 'launcher-nexus-diagnostics'

type LauncherDiagnosticsNotificationContent = Omit<PublishNotificationRequest, 'id' | 'autoDismissMs'>

type LauncherDiagnosticsNotificationActions = {
  onRetry?: (() => void | Promise<void>) | null
  onViewDetails?: (() => void | Promise<void>) | null
}

function getLauncherDiagnosticsChipLabel(routeId: string, fallbackLabel: string) {
  switch (routeId) {
    case 'publicGraphql':
      return 'GraphQL'
    case 'privateGraphql':
      return 'Private GraphQL'
    case 'nexusImages':
      return 'Image CDN'
    case 'nexusApi':
      return 'Nexus API'
    case 'smapi':
      return 'SMAPI'
    default:
      return fallbackLabel
  }
}

function buildLauncherDiagnosticsNotificationChips(diagnostics: LauncherNexusDiagnosticsResult) {
  return getLauncherNexusWarningRoutes(diagnostics)
    .slice(0, 4)
    .map<NotificationChip>((route) => ({
      label: getLauncherDiagnosticsChipLabel(route.routeId, route.label),
      tone: 'warning',
    }))
}

/** Builds notification content from warning routes and impacted targets, or null when no warnings exist. */
export function buildLauncherDiagnosticsNotificationContent(
  copy: LauncherCopy,
  diagnostics: LauncherNexusDiagnosticsResult,
  actions: LauncherDiagnosticsNotificationActions = {},
): LauncherDiagnosticsNotificationContent | null {
  const warningRoutes = getLauncherNexusWarningRoutes(diagnostics)
  if (!warningRoutes.length) {
    return null
  }

  const impactedTargets: string[] = []
  if (!canAutoLoadLauncherDiscover(diagnostics, { sort: 'trending' })) {
    impactedTargets.push(copy.configuration.nexusMessagePreviewDiscoverTarget)
  }
  if (!canAutoCheckLauncherUpdates(diagnostics)) {
    impactedTargets.push(copy.configuration.nexusMessagePreviewUpdatesTarget)
  }

  const hasPausedTargets = impactedTargets.length > 0
  const impactSummary = hasPausedTargets
    ? copy.configuration.nexusDiagnosticsNotificationImpact(impactedTargets.join(' / '))
    : copy.configuration.nexusDiagnosticsNotificationLimitedImpact

  return {
    level: hasPausedTargets ? 'error' : 'warning',
    variant: 'diagnostic' as const,
    title: copy.configuration.nexusDiagnosticsNotificationTitle,
    summary: impactSummary,
    description: copy.configuration.nexusDiagnosticsNotificationBody(warningRoutes.length),
    note: copy.configuration.nexusDiagnosticsNotificationNote,
    chips: buildLauncherDiagnosticsNotificationChips(diagnostics),
    secondaryAction: actions.onRetry
      ? {
          label: copy.actions.retry,
          callback: actions.onRetry,
        }
      : undefined,
    action: actions.onViewDetails
      ? {
          label: copy.actions.viewDetails,
          callback: actions.onViewDetails,
          tone: 'primary',
        }
      : undefined,
  }
}

/** Publishes or dismisses the diagnostics notification to match the current route health. */
export function syncLauncherDiagnosticsNotification(
  copy: LauncherCopy,
  diagnostics: LauncherNexusDiagnosticsResult | null | undefined,
  actions: LauncherDiagnosticsNotificationActions = {},
) {
  if (!diagnostics?.routes.length || hasLoadingLauncherNexusRoutes(diagnostics)) {
    return
  }

  const warningRoutes = getLauncherNexusWarningRoutes(diagnostics)
  if (!warningRoutes.length) {
    dismissNotification(LAUNCHER_NEXUS_DIAGNOSTICS_NOTIFICATION_ID)
    return
  }

  const notificationContent = buildLauncherDiagnosticsNotificationContent(copy, diagnostics, actions)
  if (!notificationContent) {
    dismissNotification(LAUNCHER_NEXUS_DIAGNOSTICS_NOTIFICATION_ID)
    return
  }

  publishNotification({
    id: LAUNCHER_NEXUS_DIAGNOSTICS_NOTIFICATION_ID,
    ...notificationContent,
    autoDismissMs: null,
  })
}
