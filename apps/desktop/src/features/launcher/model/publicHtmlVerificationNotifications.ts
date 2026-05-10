import {
  dismissNotification,
  publishNotification,
  type PublishNotificationRequest,
} from '@shared/ui/notifications'
import type { LauncherCopy } from '@locales/editor-shell'
import type { LauncherPort } from './launcherPort'
import type { LauncherPublicHtmlVerificationSnapshot } from './launcherContracts'

export const LAUNCHER_PUBLIC_HTML_VERIFICATION_NOTIFICATION_ID = 'launcher-public-html-verification'

const DEFAULT_PUBLIC_HTML_VERIFICATION_URL = 'https://www.nexusmods.com/stardewvalley'

type PublicHtmlVerificationNotificationActions = {
  openPublicHtmlVerification: LauncherPort['openPublicHtmlVerification']
  saveSettings: LauncherPort['saveSettings']
  closePublicHtmlVerification: LauncherPort['closePublicHtmlVerification']
}

function shouldShowPublicHtmlVerificationNotification(state: LauncherPublicHtmlVerificationSnapshot) {
  return !state.disablePublicHtmlRoute && (state.state === 'opening' || state.state === 'waitingForUser')
}

export function buildPublicHtmlVerificationNotificationContent(
  copy: LauncherCopy,
  state: LauncherPublicHtmlVerificationSnapshot,
  actions: PublicHtmlVerificationNotificationActions,
): Omit<PublishNotificationRequest, 'id' | 'autoDismissMs'> | null {
  if (!shouldShowPublicHtmlVerificationNotification(state)) {
    return null
  }

  const targetUrl = state.targetUrl ?? DEFAULT_PUBLIC_HTML_VERIFICATION_URL
  const reason = state.reason ?? 'diagnostics'
  const message = state.message?.trim() || copy.cloudflareChallenge.detail

  return {
    level: 'warning',
    variant: 'diagnostic',
    title: copy.cloudflareChallenge.title,
    summary: message,
    description: copy.cloudflareChallenge.detail,
    note: targetUrl,
    secondaryAction: {
      label: copy.cloudflareChallenge.disablePublicHtmlLabel,
      callback: async () => {
        await actions.saveSettings({ disablePublicHtmlRoute: true })
        await actions.closePublicHtmlVerification()
      },
      closeOnClick: false,
    },
    action: {
      label: copy.settings.openVerificationAction,
      callback: async () => {
        await actions.openPublicHtmlVerification({
          targetUrl,
          reason,
        })
      },
      tone: 'primary',
      closeOnClick: false,
    },
  }
}

export function syncPublicHtmlVerificationNotification(
  copy: LauncherCopy,
  state: LauncherPublicHtmlVerificationSnapshot,
  actions: PublicHtmlVerificationNotificationActions,
) {
  const content = buildPublicHtmlVerificationNotificationContent(copy, state, actions)
  if (!content) {
    dismissNotification(LAUNCHER_PUBLIC_HTML_VERIFICATION_NOTIFICATION_ID)
    return
  }

  publishNotification({
    id: LAUNCHER_PUBLIC_HTML_VERIFICATION_NOTIFICATION_ID,
    ...content,
    autoDismissMs: null,
  })
}
