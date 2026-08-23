/**
 * @file Launcher blocked-state card: eyebrow, title, issue summary, and
 * copy-to-clipboard detail toggle for unavailable launcher surfaces.
 */
import { type ReactNode } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'

type LauncherBlockedStateProps = {
  /** Which launcher surface owns the copy slice. */
  scene: 'discover' | 'updates'
  /** blocked = surface unavailable with diagnostics; error = request failed. */
  variant: 'blocked' | 'error'
  issueSummary?: string | null
  detailsText?: string | null
  detailsExpanded?: boolean
  onToggleDetails?: (() => void) | null
  onCopyDetails?: (() => void) | null
  primaryAction: ReactNode
  secondaryAction?: ReactNode
  tone?: 'warning' | 'error'
  illustrationAccent?: ReactNode
  className?: string
}

export function LauncherBlockedState({
  scene,
  variant,
  issueSummary,
  detailsText,
  detailsExpanded,
  onToggleDetails,
  onCopyDetails,
  primaryAction,
  secondaryAction,
  tone = 'warning',
  illustrationAccent,
  className,
}: LauncherBlockedStateProps) {
  const copy = useEditorCopy().launcher
  const text =
    scene === 'discover'
      ? {
          eyebrow: copy.discover.title,
          title: variant === 'blocked' ? copy.discover.blockedTitle : copy.discover.errorTitle,
          detail: variant === 'blocked' ? copy.discover.blockedDetail : copy.discover.errorDetail,
          issueLabel: copy.discover.blockedIssueLabel,
          detailsToggleLabel: detailsExpanded ? copy.discover.blockedDetailsCollapseAction : copy.discover.blockedDetailsExpandAction,
          copyLabel: copy.discover.blockedCopyLogsAction,
        }
      : {
          eyebrow: copy.updates.title,
          title: variant === 'blocked' ? copy.updates.blockedTitle : copy.updates.checkFailedTitle,
          detail: variant === 'blocked' ? copy.updates.blockedDetail : copy.updates.checkFailedDetail,
          issueLabel: copy.updates.issueLabel,
          detailsToggleLabel: detailsExpanded ? copy.updates.detailsCollapseAction : copy.updates.detailsExpandAction,
          copyLabel: copy.updates.copyLogsAction,
        }
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
        <p className="launcher-blocked-eyebrow">{text.eyebrow}</p>
        <h2 className="launcher-blocked-title">{text.title}</h2>
        <p className="launcher-blocked-detail">{text.detail}</p>
      </div>

      {issueSummary ? (
        <div className="launcher-blocked-highlight">
          <span className="launcher-blocked-highlight-label">{text.issueLabel}</span>
          <strong className="launcher-blocked-highlight-value">{issueSummary}</strong>
        </div>
      ) : null}

      {detailsText ? (
        <div className="launcher-blocked-details">
          <div className="launcher-blocked-details-toolbar">
            {onToggleDetails ? (
              <button type="button" className="control-button" onClick={onToggleDetails}>
                <span>{text.detailsToggleLabel}</span>
              </button>
            ) : null}
            {onCopyDetails ? (
              <button type="button" className="control-button" onClick={onCopyDetails}>
                <Copy className="h-4 w-4" />
                <span>{text.copyLabel}</span>
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
