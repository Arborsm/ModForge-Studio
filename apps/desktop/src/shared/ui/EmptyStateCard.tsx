/** @file Shared empty-state card for loading, empty, and unavailable result states. */

import { type ReactNode } from 'react'
import { SearchX } from 'lucide-react'
import { cx } from '@shared/lib/helper'

export type EmptyStateCardProps = {
  /** Small label rendered above the title. */
  eyebrow?: string
  /** Heading text. */
  title: string
  /** Supporting text under the title. */
  detail: string
  /** Primary action content (e.g. a `control-button control-button-primary` button). */
  primaryAction?: ReactNode
  /** Secondary action rendered next to the primary one. */
  secondaryAction?: ReactNode
  /** Custom icon replacing the default illustration core. */
  illustrationIcon?: ReactNode
  /** Extra accent element overlaid on the illustration. */
  illustrationAccent?: ReactNode
  /** `compact` shrinks paddings for inline/sidebar use. */
  density?: 'default' | 'compact'
  /** @internal Host legacy theming hook; not part of the plugin-facing API. */
  legacyClassName?: string
  /** Extra class on the root section. */
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
