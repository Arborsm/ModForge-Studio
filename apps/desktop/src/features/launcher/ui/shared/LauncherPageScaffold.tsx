import type { ReactNode } from 'react'
import { cx } from '@shared/lib/cx'

type LauncherPageScaffoldProps = {
  eyebrow?: string
  title: string
  subtitle: string
  actions?: ReactNode
  stats?: ReactNode
  children: ReactNode
  className?: string
}

export function LauncherPageScaffold({
  eyebrow,
  title,
  subtitle,
  actions,
  stats,
  children,
  className,
}: LauncherPageScaffoldProps) {
  return (
    <section className={cx('launcher-page-scaffold', className)}>
      <header className="launcher-page-shell">
        <div className="launcher-page-shell-copy">
          {eyebrow ? <p className="launcher-page-shell-eyebrow">{eyebrow}</p> : null}
          <h1 className="launcher-page-shell-title">{title}</h1>
          <p className="launcher-page-shell-subtitle">{subtitle}</p>
        </div>
        {actions ? <div className="launcher-page-shell-actions">{actions}</div> : null}
      </header>

      {stats ? <div className="launcher-page-shell-stats">{stats}</div> : null}

      <div className="launcher-page-shell-body">{children}</div>
    </section>
  )
}
