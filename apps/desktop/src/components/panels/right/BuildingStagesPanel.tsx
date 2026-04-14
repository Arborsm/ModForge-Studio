import { useBuildingsCopy } from '../../../lib/app/localeContext'
import type { BuildingWorkspaceEntry } from '../../../lib/app/buildingWorkspace'
import { cx } from '../../../lib/cx'
import { PanelFrame } from '../../ui/PanelFrame'
import { PanelEmptyState } from '../../ui/PanelSection'

type BuildingStagesPanelProps = {
  building: BuildingWorkspaceEntry | null
  upgradeChain: BuildingWorkspaceEntry[]
  onSelectStage: (buildingKey: string) => void
}

function getStageBadge(copy: ReturnType<typeof useBuildingsCopy>, stage: BuildingWorkspaceEntry, currentKey: string | null) {
  if (stage.key === currentKey) {
    return copy.currentBadge
  }

  if (stage.stageIndex === 0) {
    return copy.baseBadge
  }

  if (stage.stageIndex === stage.stageCount - 1) {
    return copy.finalBadge
  }

  return copy.upgradeBadge
}

export function BuildingStagesPanel({
  building,
  upgradeChain,
  onSelectStage,
}: BuildingStagesPanelProps) {
  const copy = useBuildingsCopy()

  return (
    <PanelFrame title={copy.stagesPanelTitle} subtitle={copy.stagesPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 overflow-auto p-3">
        {!building || upgradeChain.length === 0 ? (
          <PanelEmptyState>{copy.stagesPanelEmpty}</PanelEmptyState>
        ) : (
          upgradeChain.map((stage) => {
            const isActive = stage.key === building.key
            return (
              <button
                key={stage.key}
                type="button"
                className={cx(
                  'panel-list-card panel-list-card-interactive text-left',
                  isActive
                    ? 'panel-list-card-active'
                    : 'hover:bg-[color-mix(in_srgb,var(--bg-active)_66%,transparent)]',
                )}
                onClick={() => onSelectStage(stage.key)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{stage.displayName}</p>
                    <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{stage.internalName}</p>
                  </div>
                  <span className="dock-chip shrink-0">{getStageBadge(copy, stage, building.key)}</span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                  <p>{copy.buildCostLabel}: {stage.buildCost}</p>
                  <p>{copy.materialCountLabel}: {stage.buildMaterials.length}</p>
                  <p>{copy.indoorMapLabel}: {stage.indoorMapAssetName ? stage.indoorMapPathLabel : copy.noneLabel}</p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </PanelFrame>
  )
}
