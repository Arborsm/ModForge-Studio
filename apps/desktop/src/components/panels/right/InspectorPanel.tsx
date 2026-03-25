import { Settings2 } from 'lucide-react'
import { PanelFrame } from '../../ui/PanelFrame'
import type { InspectorPanelProps } from './shared'

export function InspectorPanel({ copy, mapDocument, moduleBlueprint }: InspectorPanelProps) {
  if (moduleBlueprint) {
    return (
      <PanelFrame
        hideHeader
        title={copy.center.moduleInspector}
        subtitle={moduleBlueprint.inspectorTitle}
        headerAction={<span className="dock-chip">{moduleBlueprint.state}</span>}
      >
        <div className="space-y-4 p-3">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{moduleBlueprint.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{moduleBlueprint.summary}</p>
          </div>
          <div className="space-y-2">
            {moduleBlueprint.bullets.map((bullet) => (
              <div
                key={bullet}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-3 text-xs text-[var(--text-secondary)]"
              >
                {bullet}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {moduleBlueprint.lanes.map((lane) => (
              <div key={lane} className="dock-chip justify-center rounded-lg py-2 text-center">
                {lane}
              </div>
            ))}
          </div>
        </div>
      </PanelFrame>
    )
  }

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.inspector}
      subtitle={copy.rightDock.sceneSummary}
      headerAction={<Settings2 className="h-4 w-4 text-[var(--text-secondary)]" />}
    >
      <div className="space-y-2.5 p-2.5">
        {mapDocument ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.dimensions}</span>
                <strong className="metric-value">
                  {mapDocument.width} x {mapDocument.height}
                </strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.tileSize}</span>
                <strong className="metric-value">
                  {mapDocument.tileWidth} x {mapDocument.tileHeight}
                </strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.tilesets}</span>
                <strong className="metric-value">{mapDocument.tilesets.length}</strong>
              </div>
              <div className="metric-card compact-metric-card">
                <span className="metric-label">{copy.common.objectGroups}</span>
                <strong className="metric-value">{mapDocument.objectGroups.length}</strong>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2.5">
              <div className="kv-row compact-kv-row">
                <span>{copy.common.path}</span>
                <span>{mapDocument.relativePath}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.orientation}</span>
                <span>{mapDocument.orientation}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.renderOrder}</span>
                <span>{mapDocument.renderOrder}</span>
              </div>
              <div className="kv-row compact-kv-row">
                <span>{copy.common.format}</span>
                <span>{mapDocument.format.toUpperCase()}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
            {copy.center.noSceneLoaded}
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
