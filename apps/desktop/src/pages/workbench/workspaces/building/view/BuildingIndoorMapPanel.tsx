import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { BuildingWorkspaceEntry } from '@entities/building'
import type { LocaleCode, ThemeMode } from '@locales/api'
import type { BuildingsPanelCopy } from '@locales/api'
import type { MapDocument } from '@entities/map'
import { MapViewport, type MapViewportHandle } from '@entities/map'

export type BuildingIndoorMapPanelProps = {
  building: BuildingWorkspaceEntry
  activeIndoorMapDocument: MapDocument
  showGrid: boolean
  indoorVisibleLayerIds: number[]
  indoorVisibleObjectGroupIds: number[]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  copy: BuildingsPanelCopy
  onZoomChange?: (zoom: number) => void
}

/**
 * Indoor map pane. Only mount when a map document exists.
 * Exposes MapViewport zoom controls for the workspace toolbar.
 */
export const BuildingIndoorMapPanel = forwardRef<MapViewportHandle, BuildingIndoorMapPanelProps>(
  function BuildingIndoorMapPanel(props, ref) {
    const viewportRef = useRef<MapViewportHandle | null>(null)

    useImperativeHandle(ref, () => ({
      zoomIn: () => viewportRef.current?.zoomIn(),
      zoomOut: () => viewportRef.current?.zoomOut(),
      fitToScreen: () => viewportRef.current?.fitToScreen(),
      setOneToOne: () => viewportRef.current?.setOneToOne(),
      centerView: () => viewportRef.current?.centerView(),
      resetPan: () => viewportRef.current?.resetPan(),
      focusObject: (target) => viewportRef.current?.focusObject(target),
      exportPng: async () => {
        if (!viewportRef.current) {
          throw new Error('Map viewport is not ready')
        }
        return viewportRef.current.exportPng()
      },
    }))

    return (
      <div className="building-workspace-square">
        <span className="building-workspace-square-title">{props.copy.interiorTitle}</span>
        <div className="building-workspace-square-map">
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
            showStatsChips={false}
            onZoomChange={(nextZoom) => props.onZoomChange?.(nextZoom)}
          />
        </div>
      </div>
    )
  },
)
