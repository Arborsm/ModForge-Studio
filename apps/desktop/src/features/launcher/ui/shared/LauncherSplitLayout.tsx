import type { ReactNode } from 'react'
import { cx } from '@shared/lib/cx'

type LauncherSplitLayoutProps = {
  primary: ReactNode
  secondary?: ReactNode
  tertiary?: ReactNode
  className?: string
}

export function LauncherSplitLayout({ primary, secondary, tertiary, className }: LauncherSplitLayoutProps) {
  const triple = Boolean(secondary && tertiary)

  return (
    <section className={cx('launcher-split-layout', triple && 'launcher-split-layout-triple', className)}>
      <div className="launcher-split-layout-panel launcher-split-layout-primary">{primary}</div>
      {secondary ? <div className="launcher-split-layout-panel launcher-split-layout-secondary">{secondary}</div> : null}
      {tertiary ? <div className="launcher-split-layout-panel launcher-split-layout-tertiary">{tertiary}</div> : null}
    </section>
  )
}
