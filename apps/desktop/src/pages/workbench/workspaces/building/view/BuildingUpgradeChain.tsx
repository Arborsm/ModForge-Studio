import { useBuildingsCopy } from '@locales/provider'
import {
  buildAbsoluteSpriteLayerStyle,
  getResolvedSourceRect,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
} from '@entities/building'
import type { BuildingsPanelCopy } from '@locales/api'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'
import { cx } from '@shared/lib/helper'
import { getStageBadge } from './buildingViewHelpers'

export type BuildingUpgradeChainProps = {
  upgradeChain: BuildingWorkspaceEntry[]
  activeBuildingKey: string
  chainTextureStates: Record<string, BuildingTextureAssetState>
  onSelectBuildingStage: (buildingKey: string) => void
  copy: BuildingsPanelCopy
}

/** Preview well content box; keep slightly inside the 4.25rem well + padding. */
const STAGE_PREVIEW_MAX_WIDTH = 88
const STAGE_PREVIEW_MAX_HEIGHT = 58

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

  let previewScale = 1
  let frameWidth = 0
  let frameHeight = 0
  if (sourceRect && sourceRect.Width > 0 && sourceRect.Height > 0) {
    previewScale = Math.min(STAGE_PREVIEW_MAX_WIDTH / sourceRect.Width, STAGE_PREVIEW_MAX_HEIGHT / sourceRect.Height)
    // Never upscale tiny icons past 3x; always fit whole sprite into the well.
    previewScale = Math.min(previewScale, 3)
    frameWidth = Math.max(1, Math.round(sourceRect.Width * previewScale))
    frameHeight = Math.max(1, Math.round(sourceRect.Height * previewScale))
  }

  return (
    <button
      type="button"
      className={cx('building-workspace-stage-card', isActive && 'building-workspace-stage-card-active')}
      aria-pressed={isActive}
      onClick={onSelect}
    >
      <div className="building-workspace-stage-head">
        <p className="building-workspace-stage-name" title={stage.displayName}>
          {stage.displayName}
        </p>
        <span className="building-workspace-stage-badge">{getStageBadge(copy, stage, isActive ? stage.key : null)}</span>
      </div>

      <div className="building-workspace-stage-preview">
        {sourceRect && textureState?.url && textureState.width && textureState.height ? (
          <div className="building-workspace-stage-sprite-frame" style={{ width: frameWidth, height: frameHeight }}>
            <div
              className="building-workspace-stage-sprite"
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
              }}
            />
          </div>
        ) : (
          <p className="text-text-secondary text-meta px-1 text-center">{copy.noTexture}</p>
        )}
        {textureState?.loading ? <ImageSkeleton overlay className="building-stage-skeleton" rounded={false} /> : null}
      </div>

      <p className="building-workspace-stage-cost">
        {copy.buildCostLabel} {stage.buildCost}
      </p>
    </button>
  )
}

/** Multi-stage upgrade strip. Hidden when chain has only one stage. */
export function BuildingUpgradeChain(props: BuildingUpgradeChainProps) {
  if (props.upgradeChain.length <= 1) {
    return null
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="building-workspace-section-title">{props.copy.upgradeTitle}</p>
        <p className="text-text-tertiary text-meta truncate font-mono">
          {props.upgradeChain[0]?.rootKey ?? ''} → {props.upgradeChain[props.upgradeChain.length - 1]?.leafKey ?? ''}
        </p>
      </div>
      <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-0.5">
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
  )
}
