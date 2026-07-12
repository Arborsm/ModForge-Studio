import type { ReactNode } from 'react'
import { cx } from '@shared/lib/helper'
import type { PanelRect, WorkspacePanelConfig } from '@shared/contracts'

export function WorkspacePanelShell({
  panel,
  rect,
  children,
  hideDockHeader,
}: {
  panel: WorkspacePanelConfig
  rect: PanelRect
  children: ReactNode
  hideDockHeader: boolean
}) {
  return (
    <section
      className={cx('workspace-panel-shell', panel.shellClassName)}
      data-workspace-panel={panel.id}
      data-layout-area={panel.area}
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      {!hideDockHeader ? (
        <header className="workspace-panel-header">
          <div className="workspace-panel-labels min-w-0">
            <p className="workspace-panel-title">{panel.title}</p>
            <p className="workspace-panel-subtitle">{panel.subtitle}</p>
          </div>
        </header>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  )
}
