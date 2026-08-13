import { useBuildingsCopy } from '@locales/provider'
import { MapViewport } from '@entities/map'
import { BuildingSpritePreview, type BuildingTextureAssetState, type BuildingWorkspaceEntry } from '@entities/building'
import type { LocaleCode, ViewportLabels, ThemeMode } from '@locales/api'
import type { MapDocument, ViewportWorldPoint } from '@entities/map'

export type BuildingPrimaryPreviewProps = {
  building: BuildingWorkspaceEntry
  activeTextureState: BuildingTextureAssetState | null
  activeExteriorMapDocument: MapDocument | null
  activeExteriorMapMessage: string
  activeExteriorFocusPoint: ViewportWorldPoint | null
  activeExteriorMapPath: string | null
  locale: LocaleCode
  viewportLabels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  showGrid: boolean
  exteriorVisibleLayerIds: number[]
  exteriorVisibleObjectGroupIds: number[]
  /** Fallback fit box when the container has not been measured yet. */
  fitSize?: number
  /**
   * Fill the parent pane and auto-fit the sprite to the measured box.
   * Use for both dual body pane and solo body-only canvas.
   */
  fillContainer?: boolean
}

/**
 * Building body sprite or exterior map viewport content.
 *
 * Constructible buildings render through the shared `BuildingSpritePreview` so
 * the codex and the authoring preview assemble a texture identically; world
 * buildings have no sheet of their own and fall back to their exterior map.
 */
export function BuildingPrimaryPreview({
  building,
  activeTextureState,
  activeExteriorMapDocument,
  activeExteriorMapMessage,
  activeExteriorFocusPoint,
  locale,
  theme,
  accentColor,
  showGrid,
  exteriorVisibleLayerIds,
  exteriorVisibleObjectGroupIds,
  fitSize = 280,
  fillContainer = false,
}: BuildingPrimaryPreviewProps) {
  const copy = useBuildingsCopy()
  const isConstructible = building.sourceKind === 'constructible'

  if (!isConstructible && activeExteriorMapDocument) {
    const map = (
      <div className="building-workspace-square-map">
        <MapViewport
          key={`${building.key}:${activeExteriorMapDocument.relativePath}`}
          locale={locale}
          mapDocument={activeExteriorMapDocument}
          visibleLayerIds={exteriorVisibleLayerIds}
          visibleObjectGroupIds={exteriorVisibleObjectGroupIds}
          theme={theme}
          accentColor={accentColor}
          showGrid={showGrid}
          showStatsChips={false}
          focusWorldPoint={activeExteriorFocusPoint}
        />
      </div>
    )
    return fillContainer ? map : <div className="building-workspace-square relative h-full min-h-64 w-full max-w-xl">{map}</div>
  }

  if (!isConstructible) {
    return <p className="text-text-secondary px-4 text-center text-sm">{activeExteriorMapMessage || copy.noExteriorMap}</p>
  }

  return <BuildingSpritePreview building={building} textureState={activeTextureState} fitSize={fitSize} fillContainer={fillContainer} />
}
