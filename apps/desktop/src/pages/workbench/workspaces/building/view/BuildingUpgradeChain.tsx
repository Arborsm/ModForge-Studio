import { useBuildingsCopy } from '@locales/localeContext'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import type { BuildingsPanelCopy } from '@locales/editor-shell'
import { cx } from '@shared/lib/cx'
import { buildAbsoluteSpriteLayerStyle, getResolvedSourceRect, getStageBadge } from './buildingViewHelpers'

export type BuildingUpgradeChainProps = {
  upgradeChain: BuildingWorkspaceEntry[]
  activeBuildingKey: string
  chainTextureStates: Record<string, BuildingTextureAssetState>
  onSelectBuildingStage: (buildingKey: string) => void
  copy: BuildingsPanelCopy
}

function StageCard({
  stage,
  textureState,
  isActive,
  onSelect,
}: {
  stage: BuildingWorkspaceEntry
  textureState: BuildingTextureAssetState | null
  isActive: boolean
  onSelect: () => void
}) {
  const copy = useBuildingsCopy()
  const sourceRect = getResolvedSourceRect(stage, textureState)
  const previewScale =
    sourceRect && sourceRect.Width > 0 && sourceRect.Height > 0
      ? Math.max(1, Math.min(3.2, Math.min(184 / sourceRect.Width, 132 / sourceRect.Height)))
      : 1

  return (
    <button
      type="button"
      className={cx(
        'panel-list-card panel-list-card-interactive w-[240px] shrink-0 p-3 text-left',
        isActive
          ? 'panel-list-card-active'
          : 'hover:bg-[color-mix(in_srgb,var(--bg-active)_66%,transparent)]',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{stage.displayName}</p>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{stage.internalName}</p>
        </div>
        <span className="dock-chip shrink-0">{getStageBadge(copy, stage, isActive ? stage.key : null)}</span>
      </div>

      <div className="panel-canvas-soft mt-3 flex min-h-[152px] items-center justify-center px-3 py-4">
        {sourceRect && textureState?.url && textureState.width && textureState.height ? (
          <div
            style={{
              ...buildAbsoluteSpriteLayerStyle({
                url: textureState.url,
                sheetWidth: textureState.width,
                sheetHeight: textureState.height,
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
          <p className="text-sm text-[var(--text-secondary)]">{copy.noTexture}</p>
        )}
      </div>

      <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
        <p>{copy.indoorMapLabel}: {stage.indoorMapAssetName ? stage.indoorMapPathLabel : copy.noneLabel}</p>
        <p>{copy.buildCostLabel}: {stage.buildCost}</p>
        <p>{copy.materialCountLabel}: {stage.buildMaterials.length}</p>
      </div>
    </button>
  )
}

export function BuildingUpgradeChain(props: BuildingUpgradeChainProps) {
  return (
    <div className="panel-surface panel-surface-muted min-h-0">
      <div className="panel-header">
        <div>
          <p className="panel-title">{props.copy.upgradeTitle}</p>
          <p className="panel-subtitle">{`${props.upgradeChain[0]?.rootKey ?? ''} -> ${props.upgradeChain[props.upgradeChain.length - 1]?.leafKey ?? ''}`}</p>
        </div>
      </div>
      <div className="panel-body min-h-[260px] overflow-auto p-3">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {props.upgradeChain.map((stage) => (
            <StageCard
              key={stage.key}
              stage={stage}
              textureState={props.chainTextureStates[stage.key] ?? null}
              isActive={stage.key === props.activeBuildingKey}
              onSelect={() => props.onSelectBuildingStage(stage.key)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
