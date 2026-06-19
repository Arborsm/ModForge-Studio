import { useBuildingsCopy } from '@locales/provider'
import { MapViewport } from '@entities/map'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import type { LocaleCode, ViewportLabels, ThemeMode } from '@locales/api'
import type { MapDocument, ViewportWorldPoint } from '@shared/contracts'
import { buildAbsoluteSpriteLayerStyle, getResolvedSourceRect } from './buildingViewHelpers'

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
}

export function BuildingPrimaryPreview({
  building,
  activeTextureState,
  activeExteriorMapDocument,
  activeExteriorMapMessage,
  activeExteriorFocusPoint,
  viewportLabels,
  locale,
  theme,
  accentColor,
  showGrid,
  exteriorVisibleLayerIds,
  exteriorVisibleObjectGroupIds,
}: BuildingPrimaryPreviewProps) {
  const copy = useBuildingsCopy()
  const isConstructible = building.sourceKind === 'constructible'
  const sourceRect = getResolvedSourceRect(building, activeTextureState)
  const previewScale =
    sourceRect && sourceRect.Width > 0 && sourceRect.Height > 0
      ? Math.max(1.2, Math.min(4, Math.min(420 / sourceRect.Width, 280 / sourceRect.Height)))
      : 1

  return (
    <div className="panel-canvas flex min-h-85 flex-1 items-center justify-center p-6">
      {isConstructible ? (
        sourceRect && activeTextureState?.url && activeTextureState.width && activeTextureState.height ? (
          <div
            style={{
              ...buildAbsoluteSpriteLayerStyle({
                url: activeTextureState.url,
                sheetWidth: activeTextureState.width,
                sheetHeight: activeTextureState.height,
                sourceX: sourceRect.X,
                sourceY: sourceRect.Y,
                width: sourceRect.Width,
                height: sourceRect.Height,
              }),
              transform: `scale(${previewScale})`,
              transformOrigin: 'center center',
            }}
          />
        ) : (
          <div className="panel-canvas-empty">{copy.noTexture}</div>
        )
      ) : activeExteriorMapDocument ? (
        <div className="h-full min-h-85 w-full">
          <MapViewport
            key={`${building.key}:${activeExteriorMapDocument.relativePath}`}
            locale={locale}
            mapDocument={activeExteriorMapDocument}
            visibleLayerIds={exteriorVisibleLayerIds}
            visibleObjectGroupIds={exteriorVisibleObjectGroupIds}
            labels={viewportLabels}
            theme={theme}
            accentColor={accentColor}
            showGrid={showGrid}
            showStatsChips
            focusWorldPoint={activeExteriorFocusPoint}
          />
        </div>
      ) : (
        <div className="panel-canvas-empty">{activeExteriorMapMessage}</div>
      )}
    </div>
  )
}
