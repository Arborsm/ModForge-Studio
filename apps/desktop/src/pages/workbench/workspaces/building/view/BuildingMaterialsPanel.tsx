import { getSpringObjectsSourceRect } from '@entities/event'
import { formatPoint } from '@shared/infra/game-formats/geometryFormatting'
import { useBuildingsCopy } from '@locales/provider'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import {
  buildAbsoluteSpriteLayerStyle,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
  type WorldBuildingEntrance,
} from '@entities/building'
import type { BuildingsPanelCopy } from '@locales/api'

export type BuildingMaterialsPanelProps = {
  building: BuildingWorkspaceEntry
  springObjectsState: BuildingTextureAssetState
  copy: BuildingsPanelCopy
}

function MaterialChip({
  label,
  amount,
  objectIndex,
  springObjectsState,
}: {
  label: string
  amount: number
  objectIndex: number | null
  springObjectsState: BuildingTextureAssetState
}) {
  const sourceRect = objectIndex != null ? getSpringObjectsSourceRect(objectIndex) : null

  return (
    <div className="building-workspace-material-chip">
      <div className="building-workspace-thumb relative">
        {springObjectsState.loading && sourceRect ? (
          <ImageSkeleton overlay rounded={false} />
        ) : sourceRect && springObjectsState.url && springObjectsState.width && springObjectsState.height ? (
          <div
            className="absolute top-1/2 left-1/2"
            style={{
              ...buildAbsoluteSpriteLayerStyle({
                url: springObjectsState.url,
                sheetWidth: springObjectsState.width,
                sheetHeight: springObjectsState.height,
                sourceX: sourceRect.x,
                sourceY: sourceRect.y,
                width: sourceRect.width,
                height: sourceRect.height,
              }),
              transform: 'translate(-50%, -50%) scale(1.75)',
              transformOrigin: 'center center',
            }}
          />
        ) : (
          <span className="text-text-secondary text-caption font-semibold uppercase">{label.slice(0, 1)}</span>
        )}
      </div>
      <span className="text-text-primary max-w-24 truncate text-xs font-semibold">{label}</span>
      <span className="text-text-primary font-mono text-xs font-bold">×{amount}</span>
    </div>
  )
}

function WorldEntranceRow({ entrance }: { entrance: WorldBuildingEntrance }) {
  const copy = useBuildingsCopy()
  return (
    <div className="building-workspace-material-row items-start">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-text-primary truncate text-sm font-semibold">{entrance.sourceMapName}</p>
          <span className="dock-chip shrink-0">{entrance.trigger}</span>
        </div>
        <p className="text-text-secondary mt-0.5 text-xs">
          {copy.sourceTileLabel} {formatPoint(entrance.sourceTile, copy.noneLabel)} → {copy.targetTileLabel}{' '}
          {formatPoint(entrance.targetTile, copy.noneLabel)}
        </p>
      </div>
    </div>
  )
}

/**
 * Materials chips or world entrances.
 * Returns null when empty (no empty-state placeholder).
 */
export function BuildingMaterialsPanel(props: BuildingMaterialsPanelProps) {
  const isConstructible = props.building.sourceKind === 'constructible'

  if (isConstructible) {
    if (props.building.buildMaterials.length === 0) {
      return null
    }
    return (
      <div>
        <p className="building-workspace-section-title mb-1.5">{props.copy.materialsTitle}</p>
        <div className="flex flex-wrap gap-2">
          {props.building.buildMaterials.map((material) => (
            <MaterialChip
              key={`${props.building.key}:${material.itemId}`}
              label={material.displayName}
              amount={material.amount}
              objectIndex={material.objectIndex}
              springObjectsState={props.springObjectsState}
            />
          ))}
        </div>
      </div>
    )
  }

  if (props.building.worldEntrances.length === 0) {
    return null
  }

  return (
    <div>
      <p className="building-workspace-section-title mb-1.5">{props.copy.worldEntrancesTitle}</p>
      <div>
        {props.building.worldEntrances.map((entrance, index) => (
          <WorldEntranceRow key={`${props.building.key}:${index}`} entrance={entrance} />
        ))}
      </div>
    </div>
  )
}
