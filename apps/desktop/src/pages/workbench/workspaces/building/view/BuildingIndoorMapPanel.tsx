import { useRef } from 'react'
import { Grid2x2 } from 'lucide-react'
import type { BuildingWorkspaceEntry } from '../entities/building'
import type { LocaleCode, ViewportLabels, ThemeMode } from '@locales/api'
import type { BuildingsPanelCopy } from '@locales/api'
import type { MapDocument } from '@entities/map'
import { cx } from '@shared/lib/helper'
import { MapViewport, type MapViewportHandle } from '@entities/map'

export type BuildingIndoorMapPanelProps = {
  building: BuildingWorkspaceEntry
  activeIndoorMapDocument: MapDocument | null
  activeIndoorMapPath: string | null
  activeIndoorMapMessage: string
  activeExteriorMapPath: string | null
  showGrid: boolean
  onToggleGrid: () => void
  zoomLevel: number
  onZoomChange: (zoom: number) => void
  indoorVisibleLayerIds: number[]
  indoorVisibleObjectGroupIds: number[]
  locale: LocaleCode
  viewportLabels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  copy: BuildingsPanelCopy
}

export function BuildingIndoorMapPanel(props: BuildingIndoorMapPanelProps) {
  const isConstructible = props.building.sourceKind === 'constructible'
  const viewportRef = useRef<MapViewportHandle | null>(null)
  const zoomLabel = props.viewportLabels.zoomLabel(props.zoomLevel)

  return (
    <aside className="panel-surface panel-surface-muted min-h-0">
      <div className="panel-header">
        <div>
          <p className="panel-title">{props.copy.interiorTitle}</p>
          <p className="panel-subtitle">{props.activeIndoorMapPath ?? props.building.indoorMapPathLabel}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-(--border-color) bg-(--bg-panel) p-1">
          <button
            type="button"
            className={cx('tool-button', props.showGrid && 'tool-button-active')}
            onClick={props.onToggleGrid}
            title={props.showGrid ? 'Hide grid' : 'Show grid'}
          >
            <Grid2x2 className="h-4 w-4" />
          </button>
          <span className="dock-chip">{zoomLabel}</span>
        </div>
      </div>

      <div className="panel-body flex h-full min-h-0 flex-col gap-3 p-3">
        {props.activeIndoorMapDocument ? (
          <div className="relative min-h-105 flex-1">
            <MapViewport
              key={`${props.building.key}:${props.activeIndoorMapDocument.relativePath}`}
              locale={props.locale}
              ref={viewportRef}
              mapDocument={props.activeIndoorMapDocument}
              visibleLayerIds={props.indoorVisibleLayerIds}
              visibleObjectGroupIds={props.indoorVisibleObjectGroupIds}
              theme={props.theme}
              accentColor={props.accentColor}
              showGrid={props.showGrid}
              showStatsChips
              onZoomChange={(nextZoom) => props.onZoomChange(nextZoom)}
            />
          </div>
        ) : (
          <div className="panel-canvas-empty min-h-105 flex-1 px-6">
            {props.building.indoorMapAssetName || props.building.nonInstancedIndoorLocation
              ? props.activeIndoorMapMessage || props.copy.noIndoorMap
              : props.copy.noIndoorMap}
          </div>
        )}

        <div className="panel-section p-3">
          <p className="panel-section-title">{isConstructible ? props.copy.indoorDataTitle : props.copy.exteriorDataTitle}</p>
          <div className="mt-3 space-y-2 text-sm text-(--text-primary)">
            <p>
              {props.copy.indoorMapLabel}: {props.building.indoorMapAssetName ? props.building.indoorMapPathLabel : props.copy.noneLabel}
            </p>
            <p>
              {props.copy.indoorTypeLabel}: {props.building.indoorMapType ?? props.copy.noneLabel}
            </p>
            <p>
              {props.copy.nonInstancedIndoorLabel}: {props.building.nonInstancedIndoorLocation ?? props.copy.noneLabel}
            </p>
            <p>
              {props.copy.validOccupantsLabel}: {props.building.validOccupantTypes.join(', ') || props.copy.noneLabel}
            </p>
            {!isConstructible ? (
              <p>
                {props.copy.exteriorMapLabel}: {props.activeExteriorMapPath ?? props.building.exteriorMapPathLabel ?? props.copy.noneLabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  )
}
