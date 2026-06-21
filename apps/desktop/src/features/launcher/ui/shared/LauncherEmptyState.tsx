import { type ReactNode } from 'react'
import { SearchX } from 'lucide-react'
import { cx } from '@shared/lib/helper'

type LauncherEmptyStateProps = {
  eyebrow: string
  title: string
  detail: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  illustrationAccent?: ReactNode
  className?: string
}

/** Centered empty-results card for launcher discover. Mirrors the visual
 * skeleton of {@link LauncherBlockedState} but swaps the warning orb for an
 * accent-tinted one and a SearchX core, so the empty state sits at the same
 * visual tier as the blocked/error cards instead of degrading to an inline
 * banner. Uses the `launcher-empty-card` class namespace to stay decoupled
 * from the pre-existing inline `launcher-empty-state` styles. */
export function LauncherEmptyState({
  eyebrow,
  title,
  detail,
  primaryAction,
  secondaryAction,
  illustrationAccent,
  className,
}: LauncherEmptyStateProps) {
  return (
    <section className={cx('launcher-empty-card', className)}>
      <div className="launcher-empty-card-illustration" aria-hidden="true">
        <span className="launcher-empty-card-illustration-orb launcher-empty-card-illustration-orb-back" />
        <span className="launcher-empty-card-illustration-orb launcher-empty-card-illustration-orb-front" />
        <span className="launcher-empty-card-illustration-core">
          <SearchX className="h-7 w-7" />
        </span>
        {illustrationAccent ? <span className="launcher-empty-card-illustration-accent">{illustrationAccent}</span> : null}
      </div>

      <div className="launcher-empty-card-copy">
        <p className="launcher-empty-card-eyebrow">{eyebrow}</p>
        <h2 className="launcher-empty-card-title">{title}</h2>
        <p className="launcher-empty-card-detail">{detail}</p>
      </div>

      {primaryAction || secondaryAction ? (
        <div className="launcher-empty-card-actions">
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  )
}
