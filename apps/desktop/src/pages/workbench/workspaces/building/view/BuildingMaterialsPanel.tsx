import { getSpringObjectsSourceRect } from '@entities/event'
import { buildAbsoluteSpriteLayerStyle } from './buildingViewHelpers'
import { formatPoint } from '@shared/lib/geometryFormatting'
import { useBuildingsCopy } from '@locales/provider'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, WorldBuildingEntrance } from '../entities/building'
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
    <div className="panel-list-card flex items-center gap-2 px-3 py-2">
      <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
        {sourceRect && springObjectsState.url && springObjectsState.width && springObjectsState.height ? (
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
              transform: 'translate(-50%, -50%) scale(2)',
              transformOrigin: 'center center',
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[var(--text-secondary)] uppercase">
            {label.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-secondary)]">x{amount}</p>
      </div>
    </div>
  )
}

function WorldEntranceCard({ entrance }: { entrance: WorldBuildingEntrance }) {
  const copy = useBuildingsCopy()
  return (
    <div className="panel-list-card px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{entrance.sourceMapName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">{entrance.sourceMapPathLabel}</p>
        </div>
        <span className="dock-chip shrink-0">{entrance.trigger}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
        <p>
          {copy.sourceTileLabel}: {formatPoint(entrance.sourceTile, copy.noneLabel)}
        </p>
        <p>
          {copy.targetTileLabel}: {formatPoint(entrance.targetTile, copy.noneLabel)}
        </p>
      </div>
    </div>
  )
}

export function BuildingMaterialsPanel(props: BuildingMaterialsPanelProps) {
  const isConstructible = props.building.sourceKind === 'constructible'

  return (
    <div className="panel-surface panel-surface-muted min-h-0">
      <div className="panel-header">
        <div>
          <p className="panel-title">{isConstructible ? props.copy.materialsTitle : props.copy.worldEntrancesTitle}</p>
          <p className="panel-subtitle">
            {isConstructible
              ? `${props.copy.materialCountLabel}: ${props.building.buildMaterials.length}`
              : `${props.copy.entranceCountLabel}: ${props.building.worldEntrances.length}`}
          </p>
        </div>
      </div>
      <div className="panel-body min-h-[180px] overflow-auto p-3">
        {isConstructible ? (
          props.building.buildMaterials.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
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
          ) : (
            <div className="panel-empty-state">{props.copy.materialsEmpty}</div>
          )
        ) : props.building.worldEntrances.length ? (
          <div className="space-y-2">
            {props.building.worldEntrances.map((entrance, index) => (
              <WorldEntranceCard key={`${props.building.key}:${index}`} entrance={entrance} />
            ))}
          </div>
        ) : (
          <div className="panel-empty-state">{props.copy.worldEntrancesEmpty}</div>
        )}
      </div>
    </div>
  )
}
