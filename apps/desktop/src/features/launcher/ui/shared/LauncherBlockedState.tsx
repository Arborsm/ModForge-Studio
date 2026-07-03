import { type ReactNode } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'
import { cx } from '@shared/lib/helper'

type LauncherBlockedStateProps = {
  eyebrow: string
  title: string
  detail: string
  issueLabel: string
  issueSummary?: string | null
  detailsText?: string | null
  detailsExpanded?: boolean
  detailsToggleLabel?: string | null
  copyLabel?: string | null
  onToggleDetails?: (() => void) | null
  onCopyDetails?: (() => void) | null
  primaryAction: ReactNode
  secondaryAction?: ReactNode
  tone?: 'warning' | 'error'
  illustrationAccent?: ReactNode
  className?: string
}

export function LauncherBlockedState({
  eyebrow,
  title,
  detail,
  issueLabel,
  issueSummary,
  detailsText,
  detailsExpanded,
  detailsToggleLabel,
  copyLabel,
  onToggleDetails,
  onCopyDetails,
  primaryAction,
  secondaryAction,
  tone = 'warning',
  illustrationAccent,
  className,
}: LauncherBlockedStateProps) {
  return (
    <section className={cx('launcher-blocked-state', `launcher-blocked-state-${tone}`, className)}>
      <div className="launcher-blocked-illustration" aria-hidden="true">
        <span className="launcher-blocked-illustration-orb launcher-blocked-illustration-orb-back" />
        <span className="launcher-blocked-illustration-orb launcher-blocked-illustration-orb-front" />
        <span className="launcher-blocked-illustration-core">
          <AlertTriangle className="h-7 w-7" />
        </span>
        {illustrationAccent ? <span className="launcher-blocked-illustration-accent">{illustrationAccent}</span> : null}
      </div>

      <div className="launcher-blocked-copy">
        <p className="launcher-blocked-eyebrow">{eyebrow}</p>
        <h2 className="launcher-blocked-title">{title}</h2>
        <p className="launcher-blocked-detail">{detail}</p>
      </div>

      {issueSummary ? (
        <div className="launcher-blocked-highlight">
          <span className="launcher-blocked-highlight-label">{issueLabel}</span>
          <strong className="launcher-blocked-highlight-value">{issueSummary}</strong>
        </div>
      ) : null}

      {detailsText ? (
        <div className="launcher-blocked-details">
          <div className="launcher-blocked-details-toolbar">
            {onToggleDetails && detailsToggleLabel ? (
              <button type="button" className="control-button" onClick={onToggleDetails}>
                <span>{detailsToggleLabel}</span>
              </button>
            ) : null}
            {copyLabel ? (
              <button type="button" className="control-button" onClick={onCopyDetails ?? undefined}>
                <Copy className="h-4 w-4" />
                <span>{copyLabel}</span>
              </button>
            ) : null}
          </div>
          {detailsExpanded ? <pre className="launcher-blocked-pre">{detailsText}</pre> : null}
        </div>
      ) : null}

      <div className="launcher-blocked-actions">
        {primaryAction}
        {secondaryAction}
      </div>
    </section>
  )
}
