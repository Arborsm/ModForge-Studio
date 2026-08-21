/** @file Panel section sub-components: section with header/body and an empty-state wrapper. */

import type { ReactNode } from 'react'
import { cx } from '@shared/lib/helper'

type PanelSectionProps = {
  /** Section header title; header renders when title, subtitle or action is set. */
  title?: string
  /** Secondary line in the section header. */
  subtitle?: string
  /** Right-aligned header content. */
  action?: ReactNode
  /** Extra class on the root section. */
  className?: string
  /** Extra class on the header element. */
  headerClassName?: string
  /** Extra class on the body wrapper. */
  bodyClassName?: string
  /** Surface treatment: `default`, `muted` (recessed) or `accent` (accent-tinted). */
  variant?: 'default' | 'muted' | 'accent'
  /** Section body content. */
  children: ReactNode
}

/** Sub-section within a panel, with an optional header (title, subtitle, action) and variant styling. */
export function PanelSection({
  title,
  subtitle,
  action,
  className,
  headerClassName,
  bodyClassName,
  variant = 'default',
  children,
}: PanelSectionProps) {
  const showHeader = title || subtitle || action

  return (
    <section
      className={cx(
        'panel-section',
        variant === 'muted' && 'panel-section-muted',
        variant === 'accent' && 'panel-section-accent',
        className,
      )}
    >
      {showHeader ? (
        <header className={cx('panel-section-header', headerClassName)}>
          <div className="min-w-0">
            {title ? <p className="panel-section-title">{title}</p> : null}
            {subtitle ? <p className="panel-section-subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cx('panel-section-body', bodyClassName)}>{children}</div>
    </section>
  )
}

type PanelEmptyStateProps = {
  className?: string
  children: ReactNode
}

/** Empty-state wrapper for a panel section body. */
export function PanelEmptyState({ className, children }: PanelEmptyStateProps) {
  return <div className={cx('panel-empty-state', className)}>{children}</div>
}
