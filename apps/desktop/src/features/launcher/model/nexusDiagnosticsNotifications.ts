import {
  dismissNotification,
  publishNotification,
  type NotificationChip,
  type PublishNotificationRequest,
} from '@shared/ui/notifications'
import type { LauncherCopy } from '@locales/editor-shell'
import type { LauncherNexusDiagnosticsResult } from '@features/launcher'
import {
  canAutoCheckLauncherUpdates,
  canAutoLoadLauncherDiscover,
  getLauncherNexusWarningRoutes,
  hasLoadingLauncherNexusRoutes,
} from './nexusDiagnostics'

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
    case 'publicHtml':
      return 'HTML'
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
  return getLauncherNexusWarningRoutes(diagnostics).slice(0, 4).map<NotificationChip>((route) => ({
    label: getLauncherDiagnosticsChipLabel(route.routeId, route.label),
    tone: 'warning',
  }))
}

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
    impactedTargets.push(copy.debug.nexusMessagePreviewDiscoverTarget)
  }
  if (!canAutoCheckLauncherUpdates(diagnostics)) {
    impactedTargets.push(copy.debug.nexusMessagePreviewUpdatesTarget)
  }

  const hasPausedTargets = impactedTargets.length > 0
  const impactSummary = hasPausedTargets
    ? copy.debug.nexusDiagnosticsNotificationImpact(impactedTargets.join(' / '))
    : copy.debug.nexusDiagnosticsNotificationLimitedImpact

  return {
    level: hasPausedTargets ? 'error' : 'warning',
    variant: 'diagnostic' as const,
    title: copy.debug.nexusDiagnosticsNotificationTitle,
    summary: impactSummary,
    description: copy.debug.nexusDiagnosticsNotificationBody(warningRoutes.length),
    note: copy.debug.nexusDiagnosticsNotificationNote,
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
