import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

type PanelSectionProps = {
  title?: string
  subtitle?: string
  action?: ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  variant?: 'default' | 'muted' | 'accent'
  children: ReactNode
}

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

export function PanelEmptyState({ className, children }: PanelEmptyStateProps) {
  return <div className={cx('panel-empty-state', className)}>{children}</div>
}
