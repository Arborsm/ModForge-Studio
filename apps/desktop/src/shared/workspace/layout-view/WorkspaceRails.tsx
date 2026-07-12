import { createElement } from 'react'
import { cx } from '@shared/lib/helper'
import type { DockArea, PanelRect, WorkspacePanelConfig } from '@shared/contracts'
import { getPanelIcon } from './workspacePanelPresentation'

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
