import { Grip, PanelBottom, PanelLeft, PanelRight, Pin, SquareDashedMousePointer, X } from 'lucide-react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { cx } from '@shared/lib/cx'
import type { DockArea, PanelRect, WorkspacePanelConfig, WorkspacePanelState } from '@shared/contracts'
import { getDockLabel } from './workspacePanelPresentation'
import { ToolWindowMenu } from './WorkspaceToolWindowMenu'

export function WorkspacePanelShell({
  panel,
  panelState,
  rect,
  hideWhileDragging,
  hideDockHeader,
  children,
  onBringToFront,
  onBeginMove,
  onBeginRailDrag,
  onStopHeaderDrag,
  onDock,
  onUndock,
  onHide,
  onRestoreToSidebar,
  onCollapseDockedPanel,
  onBeginFloatResize,
}: {
  panel: WorkspacePanelConfig
  panelState: WorkspacePanelState
  rect: PanelRect
  hideWhileDragging: boolean
  hideDockHeader: boolean
  children: ReactNode
  onBringToFront: (panelId: string) => void
  onBeginMove: (panelId: string, event: ReactPointerEvent<HTMLElement>) => void
  onBeginRailDrag: (panelId: string, event: ReactPointerEvent<HTMLElement>, source: 'rail' | 'floating') => void
  onStopHeaderDrag: (event: ReactPointerEvent<HTMLElement>) => void
  onDock: (panelId: string, area: DockArea) => void
  onUndock: (panelId: string) => void
  onHide: (panelId: string) => void
  onRestoreToSidebar: (panelId: string) => void
  onCollapseDockedPanel: (panelId: string) => void
  onBeginFloatResize: (panelId: string, event: ReactPointerEvent<HTMLDivElement>) => void
}) {
  return (
    <section
      className={cx(
        'workspace-panel-shell',
        panel.shellClassName,
        panelState.mode === 'floating' ? 'workspace-panel-floating' : 'workspace-panel-docked',
      )}
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        visibility: hideWhileDragging ? 'hidden' : 'visible',
        pointerEvents: hideWhileDragging ? 'none' : undefined,
        zIndex:
          panelState.mode === 'floating'
            ? 30 + panelState.zIndex
            : panelState.dock === 'center'
              ? 4
              : panelState.dock.startsWith('bottom')
                ? 11
                : 12,
      }}
      onPointerDown={() => {
        if (panelState.mode === 'floating') {
          onBringToFront(panel.id)
        }
      }}
    >
      {!hideDockHeader ? (
        <ToolWindowMenu onFloat={() => onUndock(panel.id)} onHide={() => onHide(panel.id)} onDock={(area) => onDock(panel.id, area)}>
          <header className="workspace-panel-header" onPointerDown={(event) => onBeginMove(panel.id, event)}>
            <div className="workspace-panel-header-main flex min-w-0 items-center gap-2">
              <div
                className="workspace-panel-grip cursor-grab active:cursor-grabbing"
                onPointerDown={
                  panelState.mode === 'floating'
                    ? (event) => {
                        event.stopPropagation()
                        onBeginRailDrag(panel.id, event, 'floating')
                      }
                    : undefined
                }
              >
                <Grip className="h-3.5 w-3.5" />
              </div>
              <div className="workspace-panel-labels min-w-0">
                <p className="workspace-panel-title">{panel.title}</p>
                <p className="workspace-panel-subtitle">{panel.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1" data-panel-no-drag="true" onPointerDown={onStopHeaderDrag}>
                {panelState.mode !== 'floating' ? (
                  <>
                    <span className="workspace-panel-mode-pill" title={getDockLabel(panelState.dock)}>
                      {getDockLabel(panelState.dock)}
                    </span>
                    <button
                      type="button"
                      className="workspace-panel-action"
                      data-panel-no-drag="true"
                      onPointerDown={onStopHeaderDrag}
                      onClick={() => onDock(panel.id, 'left-top')}
                      title="Dock left"
                    >
                      <PanelLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="workspace-panel-action"
                      data-panel-no-drag="true"
                      onPointerDown={onStopHeaderDrag}
                      onClick={() => onDock(panel.id, 'right-top')}
                      title="Dock right"
                    >
                      <PanelRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="workspace-panel-action"
                      data-panel-no-drag="true"
                      onPointerDown={onStopHeaderDrag}
                      onClick={() => onDock(panel.id, 'bottom-left')}
                      title="Dock bottom"
                    >
                      <PanelBottom className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="workspace-panel-action"
                      data-panel-no-drag="true"
                      onPointerDown={onStopHeaderDrag}
                      onClick={() => onDock(panel.id, 'center')}
                      title="Dock center"
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="workspace-panel-action"
                      data-panel-no-drag="true"
                      onPointerDown={onStopHeaderDrag}
                      onClick={() => onUndock(panel.id)}
                      title="Float window"
                    >
                      <SquareDashedMousePointer className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="workspace-panel-action"
                  data-panel-no-drag="true"
                  onPointerDown={onStopHeaderDrag}
                  onClick={() =>
                    panelState.mode === 'floating'
                      ? onRestoreToSidebar(panel.id)
                      : panelState.dock !== 'center'
                        ? onCollapseDockedPanel(panel.id)
                        : onHide(panel.id)
                  }
                  title={
                    panelState.mode === 'floating' ? 'Restore to sidebar' : panelState.dock !== 'center' ? 'Collapse to sidebar' : 'Hide'
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </header>
        </ToolWindowMenu>
      ) : null}

      {children}

      {panelState.mode === 'floating' ? (
        <div className="workspace-float-resizer" onPointerDown={(event) => onBeginFloatResize(panel.id, event)} />
      ) : null}
    </section>
  )
}
