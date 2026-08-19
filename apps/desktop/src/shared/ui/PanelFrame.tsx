/** @file Panel frame with optional header (title, subtitle, action) and scrollable body. */

import type { ReactNode } from 'react'
import { cx } from '@shared/lib/helper'

type PanelFrameProps = {
  title: string
  subtitle?: string
  headerAction?: ReactNode
  className?: string
  bodyClassName?: string
  hideHeader?: boolean
  flat?: boolean
  children: ReactNode
}

/** Panel surface with an optional header (title, subtitle, header action) and a body region. */
export function PanelFrame({ title, subtitle, headerAction, className, bodyClassName, hideHeader, flat, children }: PanelFrameProps) {
  return (
    <section className={cx(flat ? 'bg-surface-panel rounded-panel' : 'panel-surface', 'h-full', className)}>
      {!hideHeader ? (
        <header className="panel-header">
          <div className="min-w-0">
            <p className="panel-title">{title}</p>
            {subtitle ? <p className="panel-subtitle truncate">{subtitle}</p> : null}
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </header>
      ) : null}
      <div className={cx('panel-body', bodyClassName)}>{children}</div>
    </section>
  )
}
