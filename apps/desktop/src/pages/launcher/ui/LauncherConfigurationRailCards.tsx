import { AlertTriangle, Check, Crown, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import type { useLauncherSettings } from '@features/launcher'

export type ConfigStepTone = 'ok' | 'warn' | 'danger'

export type ConfigStep = {
  id: string
  label: string
  detail: string
  tone: ConfigStepTone
}

function getStepIcon(tone: ConfigStepTone) {
  if (tone === 'danger') {
    return <X className="h-3.5 w-3.5" />
  }

  if (tone === 'warn') {
    return <AlertTriangle className="h-3.5 w-3.5" />
  }

  return <Check className="h-3.5 w-3.5" />
}

function getInitials(name: string) {
  const cleaned = name.trim()
  if (!cleaned) {
    return 'NX'
  }

  const words = cleaned.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
  }

  return cleaned.slice(0, 2).toUpperCase()
}

export function ConfigCompletionRail({ title, steps }: { title: string; steps: ConfigStep[] }) {
  return (
    <LoadingMotionReveal
      itemId="launcher-config-completion-rail"
      index={3}
      as="section"
      className="launcher-config-rail-panel launcher-config-completion-rail"
      data-testid="launcher-config-completion-rail"
    >
      <div className="launcher-config-rail-title">{title}</div>
      <div className="launcher-config-stepper">
        {steps.map((step, index) => (
          <LoadingMotionRevealItem
            key={step.id}
            index={index}
            as="div"
            className={cx('launcher-config-step', `launcher-config-step-${step.tone}`)}
            data-testid={`launcher-config-${step.id}-step`}
          >
            <span className="launcher-config-step-mark" aria-hidden="true">
              {getStepIcon(step.tone)}
            </span>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </LoadingMotionReveal>
  )
}

export function ConfigDownloadDefaults({ settingsState }: { settingsState: ReturnType<typeof useLauncherSettings> }) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const { settings } = settingsState
  const defaults = [
    {
      field: 'autoCheckModUpdates' as const,
      label: copy.toggles.autoCheckModUpdates,
      checked: settings.autoCheckModUpdates,
    },
    {
      field: 'autoInstallDownloads' as const,
      label: copy.toggles.autoInstallDownloads,
      checked: settings.autoInstallDownloads,
    },
    {
      field: 'keepDownloadedArchives' as const,
      label: copy.toggles.keepDownloadedArchives,
      checked: settings.keepDownloadedArchives,
    },
    {
      field: 'gmcmParsingEnabled' as const,
      label: copy.toggles.gmcmParsingEnabled,
      checked: settings.gmcmParsingEnabled !== false,
    },
  ]

  return (
    <LoadingMotionReveal
      itemId="launcher-config-download-defaults"
      index={5}
      as="section"
      className="launcher-config-rail-panel launcher-config-download-defaults"
      data-testid="launcher-config-download-defaults"
    >
      <div className="launcher-config-rail-title">{copy.settings.downloadDefaultsTitle}</div>
      <div className="launcher-config-defaults">
        {defaults.map((item, index) => (
          <LoadingMotionRevealItem key={item.label} index={index} as="div" className="launcher-config-default-row">
            <span>{item.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={item.checked}
              className={cx('launcher-config-mini-switch', item.checked && 'launcher-config-mini-switch-active')}
              aria-label={item.label}
              title={item.checked ? rootCopy.common.yes : rootCopy.common.no}
              onClick={() => settingsState.updateField(item.field, !item.checked)}
            >
              <span aria-hidden="true" />
            </button>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </LoadingMotionReveal>
  )
}

type ConfigAccountCardProps = {
  account: {
    apiKeyStatus: {
      userName?: string | null
      avatarUrl?: string | null
      isPremium?: boolean | null
      premiumExpiresAt?: string | null
    } | null
    apiKeyError: string | null
    apiKeyChecking: boolean
    hasApiKey: boolean
  }
  premiumExpiryLabel: string | null
  onRefresh: () => void
}

export function ConfigAccountCard({ account, premiumExpiryLabel, onRefresh }: ConfigAccountCardProps) {
  const copy = useEditorCopy().launcher
  const accountName = account.apiKeyStatus?.userName ?? 'Nexus'
  const avatarUrl = account.apiKeyStatus?.avatarUrl?.trim() || null
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const shouldShowAvatarImage = avatarUrl != null && avatarUrl !== failedAvatarUrl
  const accountStatus = account.apiKeyError ? copy.settings.nexusApiUnavailable : copy.settings.nexusNormalStatus
  const isPremium = account.apiKeyStatus?.isPremium === true
  const tierLabel = isPremium ? copy.diagnostics.premiumActive : copy.diagnostics.premiumFree

  return (
    <LoadingMotionReveal
      itemId="launcher-config-account-card"
      index={4}
      as="section"
      className="launcher-config-account-row"
      data-testid="launcher-config-account-card"
    >
      <div className="launcher-config-account-cover" aria-hidden="true" />
      <button
        type="button"
        className="launcher-config-account-refresh"
        disabled={!account.hasApiKey || account.apiKeyChecking}
        aria-busy={account.apiKeyChecking}
        aria-label={copy.diagnostics.validateApiKeyAction}
        title={copy.diagnostics.validateApiKeyAction}
        onClick={onRefresh}
      >
        <RefreshCw className={cx('h-4 w-4', account.apiKeyChecking && 'animate-spin')} aria-hidden="true" />
      </button>
      <div className="launcher-config-account-card">
        <div className="launcher-config-avatar-wrap">
          {shouldShowAvatarImage ? (
            <img
              className="launcher-config-avatar launcher-config-avatar-image"
              src={avatarUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedAvatarUrl(avatarUrl)}
            />
          ) : (
            <span className="launcher-config-avatar">{getInitials(accountName)}</span>
          )}
          <span
            className={cx('launcher-config-online-dot', account.apiKeyError && 'launcher-config-online-dot-danger')}
            title={accountStatus}
          />
        </div>
        <div className="launcher-config-account-meta">
          <strong>{accountName}</strong>
          <span
            className={cx('launcher-config-tier-badge', isPremium ? 'launcher-config-premium-badge' : 'launcher-config-tier-badge-free')}
            title={tierLabel}
          >
            {isPremium ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {isPremium ? tierLabel.toUpperCase() : tierLabel}
          </span>
          {premiumExpiryLabel ? <span className="launcher-config-premium-expiry">{premiumExpiryLabel}</span> : null}
        </div>
      </div>
    </LoadingMotionReveal>
  )
}
