import { Settings2 } from 'lucide-react'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { useEditorCopy } from '@locales/provider'
import type { InspectorPanelProps } from '../common/rightShared'
import { ModSourceList } from '@shared/ui/ModSourceList'

export function InspectorPanel({ mapDocument, modSources = [] }: InspectorPanelProps) {
  const copy = useEditorCopy()

  return (
    <PanelFrame
      hideHeader
      title={copy.rightDock.inspector}
      subtitle={copy.rightDock.sceneSummary}
      headerAction={<Settings2 className="text-text-secondary h-4 w-4" />}
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

            <div className="border-border-subtle bg-surface-panel-muted rounded-xl border px-2.5">
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
            <div className="border-border-subtle bg-surface-panel-muted rounded-xl border px-3 py-3">
              <p className="text-text-secondary text-meta-px tracking-ui-wider font-semibold uppercase">Mod Sources</p>
              <div className="mt-3">
                <ModSourceList sources={modSources} />
              </div>
            </div>
          </>
        ) : (
          <div className="border-border-subtle text-text-secondary rounded-xl border border-dashed px-4 py-5 text-sm">
            {copy.center.noSceneLoaded}
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
