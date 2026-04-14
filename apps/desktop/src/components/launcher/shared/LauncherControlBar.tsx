import type { ReactNode } from 'react'
import { cx } from '../../../lib/cx'

type LauncherControlBarProps = {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function LauncherControlBar({
  title,
  subtitle,
  action,
  children,
  className,
}: LauncherControlBarProps) {
  return (
    <section className={cx('launcher-control-bar panel-section panel-section-muted', className)}>
      {title || subtitle || action ? (
        <header className="panel-section-header">
          <div className="min-w-0">
            {title ? <p className="panel-section-title">{title}</p> : null}
            {subtitle ? <p className="panel-section-subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className="launcher-control-bar-body">{children}</div>
    </section>
  )
}
