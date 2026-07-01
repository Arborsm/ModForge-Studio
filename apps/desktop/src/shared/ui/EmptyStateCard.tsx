import { type ReactNode } from 'react'
import { SearchX } from 'lucide-react'
import { cx } from '@shared/lib/helper'

export type EmptyStateCardProps = {
  eyebrow?: string
  title: string
  detail: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  illustrationIcon?: ReactNode
  illustrationAccent?: ReactNode
  density?: 'default' | 'compact'
  legacyClassName?: string
  className?: string
}

/** Shared empty-results card for business-agnostic loading, empty, and unavailable states. */
export function EmptyStateCard({
  eyebrow,
  title,
  detail,
  primaryAction,
  secondaryAction,
  illustrationIcon,
  illustrationAccent,
  density = 'default',
  legacyClassName,
  className,
}: EmptyStateCardProps) {
  const legacyClass = legacyClassName?.trim()
  const legacy = (suffix: string) => (legacyClass ? `${legacyClass}-${suffix}` : undefined)
  const compact = density === 'compact'

  return (
    <section className={cx('empty-state-card', compact && 'empty-state-card-compact', legacyClass, className)}>
      <div className={cx('empty-state-card-illustration', legacy('illustration'))} aria-hidden="true">
        <span
          className={cx(
            'empty-state-card-illustration-orb empty-state-card-illustration-orb-back',
            legacy('illustration-orb'),
            legacy('illustration-orb-back'),
          )}
        />
        <span
          className={cx(
            'empty-state-card-illustration-orb empty-state-card-illustration-orb-front',
            legacy('illustration-orb'),
            legacy('illustration-orb-front'),
          )}
        />
        <span className={cx('empty-state-card-illustration-core', legacy('illustration-core'))}>
          {illustrationIcon ?? <SearchX className="empty-state-card-default-icon" />}
        </span>
        {illustrationAccent ? (
          <span className={cx('empty-state-card-illustration-accent', legacy('illustration-accent'))}>{illustrationAccent}</span>
        ) : null}
      </div>

      <div className={cx('empty-state-card-copy', legacy('copy'))}>
        {eyebrow ? <p className={cx('empty-state-card-eyebrow', legacy('eyebrow'))}>{eyebrow}</p> : null}
        <h2 className={cx('empty-state-card-title', legacy('title'))}>{title}</h2>
        <p className={cx('empty-state-card-detail', legacy('detail'))}>{detail}</p>
      </div>

      {primaryAction || secondaryAction ? (
        <div className={cx('empty-state-card-actions', legacy('actions'))}>
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  )
}
