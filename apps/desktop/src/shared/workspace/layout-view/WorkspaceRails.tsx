import { createElement, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { cx } from '@shared/lib/helper'
import type { DockArea, PanelRect, RailId, SlotId, WorkspacePanelConfig, WorkspacePanelState, WorkspaceSlotState } from '@shared/contracts'
import type { RailSortTarget } from '@shared/workspace/layoutDragTargets'
import { getOrderedPanelIdsForSlot } from '@shared/workspace/layoutState'
import { getPanelIcon } from './workspacePanelPresentation'
import { ToolWindowMenu } from './WorkspaceToolWindowMenu'

export function WorkspaceRail({
  rail,
  railRect,
  panels,
  panelMap,
  panelStates,
  slots,
  draggedPanelId,
  railSortTarget,
  railButtonRefs,
  onUndock,
  onHide,
  onDock,
  onRailButtonClick,
  onBeginRailDrag,
}: {
  rail: RailId
  railRect: PanelRect | null | undefined
  panels: WorkspacePanelConfig[]
  panelMap: Record<string, WorkspacePanelConfig>
  panelStates: Record<string, WorkspacePanelState>
  slots: Record<SlotId, WorkspaceSlotState>
  draggedPanelId: string | null
  railSortTarget: RailSortTarget
  railButtonRefs: RefObject<Record<string, HTMLButtonElement | null>>
  onUndock: (panelId: string) => void
  onHide: (panelId: string) => void
  onDock: (panelId: string, area: DockArea) => void
  onRailButtonClick: (slot: SlotId, panelId: string, event: ReactMouseEvent<HTMLButtonElement>) => void
  onBeginRailDrag: (panelId: string, event: ReactPointerEvent<HTMLElement>) => void
}) {
  if (!railRect || rail === 'bottom') {
    return null
  }

  const topSlot = rail === 'left' ? 'left-top' : 'right-top'
  const bottomSlot = rail === 'left' ? 'left-bottom' : 'right-bottom'
  const bottomDockSlot = rail === 'left' ? 'bottom-left' : 'bottom-right'
  const renderButtons = (slot: SlotId) =>
    getOrderedPanelIdsForSlot(panels, panelStates, slots, slot).map((panelId) => {
      const panel = panelMap[panelId]
      const Icon = getPanelIcon(panelId)
      const slotState = slots[slot]
      const isCurrent = slotState.activePanelId === panelId
      const isExpanded = isCurrent && slotState.expanded
      const isDragging = draggedPanelId === panelId
      const isSortTarget = railSortTarget?.slot === slot && railSortTarget.panelId === panelId

      return (
        <ToolWindowMenu
          key={panelId}
          onFloat={() => onUndock(panelId)}
          onHide={() => onHide(panelId)}
          onDock={(area) => onDock(panelId, area)}
        >
          <button
            type="button"
            ref={(node) => {
              railButtonRefs.current[`${slot}:${panelId}`] = node
            }}
            data-slot={slot}
            data-panel-id={panelId}
            className={cx(
              'workspace-tool-button',
              isCurrent && 'workspace-tool-button-current',
              isExpanded && 'workspace-tool-button-active',
              isDragging && 'workspace-tool-button-dragging',
              isSortTarget && 'workspace-tool-button-drop-target',
              isSortTarget && railSortTarget?.position === 'after' && 'workspace-tool-button-drop-target-after',
            )}
            onClick={(event) => onRailButtonClick(slot, panelId, event)}
            onPointerDown={(event) => onBeginRailDrag(panelId, event)}
            title={`${panel.title}${isExpanded ? ' (expanded)' : ''}`}
          >
            <Icon className="h-4.5 w-4.5" />
          </button>
        </ToolWindowMenu>
      )
    })

  return (
    <aside
      className={cx('workspace-tool-rail', rail === 'left' ? 'workspace-tool-rail-left' : 'workspace-tool-rail-right')}
      style={{
        left: `${railRect.x}px`,
        top: `${railRect.y}px`,
        width: `${railRect.width}px`,
        height: `${railRect.height}px`,
      }}
    >
      <div className="workspace-tool-group">{renderButtons(topSlot)}</div>
      <div className="workspace-tool-divider" />
      <div className="workspace-tool-group">{renderButtons(bottomSlot)}</div>
      <div className="workspace-tool-spacer" />
      <div className="workspace-tool-group">{renderButtons(bottomDockSlot)}</div>
    </aside>
  )
}

export function WorkspaceDragOverlay({
  draggedPanelId,
  dockGuides,
  dragDockTarget,
  dragPreview,
  panelMap,
  onDragDockTargetChange,
  onDropToDock,
  onEndToolDrag,
}: {
  draggedPanelId: string | null
  dockGuides: Array<{ area: DockArea; rect: PanelRect; label: string }>
  dragDockTarget: DockArea | null
  dragPreview: { panelId: string; x: number; y: number } | null
  panelMap: Record<string, WorkspacePanelConfig>
  onDragDockTargetChange: (area: DockArea | null) => void
  onDropToDock: (area: DockArea, panelId?: string | null) => void
  onEndToolDrag: () => void
}) {
  if (!draggedPanelId) {
    return null
  }

  return (
    <div className="workspace-drop-overlay" onDragOver={(event) => event.preventDefault()} onDrop={onEndToolDrag}>
      {dockGuides.map(({ area, rect, label }) => (
        <div
          key={area}
          className={cx('workspace-drop-zone', dragDockTarget === area && 'workspace-drop-zone-active')}
          style={{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          onDragEnter={() => onDragDockTargetChange(area)}
          onDragOver={(event) => {
            event.preventDefault()
            if (dragDockTarget !== area) {
              onDragDockTargetChange(area)
            }
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return
            }
            if (dragDockTarget === area) {
              onDragDockTargetChange(null)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            onDropToDock(area, event.dataTransfer.getData('text/plain') || null)
          }}
          title={label}
        >
          <span>{label}</span>
        </div>
      ))}
      {dragPreview ? <WorkspaceDragPreview dragPreview={dragPreview} panelMap={panelMap} /> : null}
    </div>
  )
}

function WorkspaceDragPreview({
  dragPreview,
  panelMap,
}: {
  dragPreview: { panelId: string; x: number; y: number }
  panelMap: Record<string, WorkspacePanelConfig>
}) {
  const panel = panelMap[dragPreview.panelId]

  return (
    <div
      className="workspace-drag-preview"
      style={{
        left: `${dragPreview.x + 14}px`,
        top: `${dragPreview.y + 14}px`,
      }}
    >
      <span className="workspace-drag-preview-icon">{createElement(getPanelIcon(dragPreview.panelId), { className: 'h-4 w-4' })}</span>
      <span>{panel?.title ?? dragPreview.panelId}</span>
    </div>
  )
}
