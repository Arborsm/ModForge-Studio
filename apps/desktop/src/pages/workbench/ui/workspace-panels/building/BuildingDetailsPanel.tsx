import { formatPoint } from '@shared/lib/geometryFormatting'
import { useBuildingsCopy } from '@locales/localeContext'
import type { BuildingWorkspaceEntry } from '../../../workspaces/building'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'

type BuildingDetailsPanelProps = {
  building: BuildingWorkspaceEntry | null
}

function renderDictionary(entries: Record<string, string>, noneLabel: string) {
  const keys = Object.keys(entries)
  if (keys.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">{noneLabel}</p>
  }

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div key={key} className="kv-row">
          <span className="truncate" title={key}>
            {key}
          </span>
          <span className="max-w-[55%] truncate text-right" title={entries[key]}>
            {entries[key]}
          </span>
        </div>
      ))}
    </div>
  )
}

export function BuildingDetailsPanel({ building }: BuildingDetailsPanelProps) {
  const copy = useBuildingsCopy()

  return (
    <PanelFrame title={copy.detailsTitle} subtitle={copy.detailsSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 overflow-auto p-3">
        {!building ? (
          <PanelEmptyState>{copy.detailsEmpty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection title={building.sourceKind === 'constructible' ? copy.placementTitle : copy.worldEntrancesTitle}>
              {building.sourceKind === 'constructible' ? (
                <div className="space-y-2 text-sm text-[var(--text-primary)]">
                  <p>
                    {copy.additionalPlacementTilesLabel}: {building.additionalPlacementTiles.length}
                  </p>
                  <p>
                    {copy.collisionMapLabel}: {building.collisionMap ?? copy.noneLabel}
                  </p>
                  <p>
                    {copy.fadeWhenBehindLabel}: {building.fadeWhenBehind ? copy.yesLabel : copy.noLabel}
                  </p>
                  <p>
                    {copy.flooringLabel}: {building.allowsFlooringUnderneath ? copy.yesLabel : copy.noLabel}
                  </p>
                  <p>
                    {copy.additionalTileRadiusLabel}: {building.additionalTilePropertyRadius}
                  </p>
                </div>
              ) : building.worldEntrances.length ? (
                <div className="space-y-2">
                  {building.worldEntrances.map((entrance, index) => (
                    <div key={`${building.key}:${index}`} className="panel-list-card px-3 py-2 text-sm text-[var(--text-primary)]">
                      <p className="font-semibold">{entrance.sourceMapName}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {copy.triggerLabel}: {entrance.trigger}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {copy.sourceTileLabel}: {formatPoint(entrance.sourceTile, copy.noneLabel)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {copy.targetTileLabel}: {formatPoint(entrance.targetTile, copy.noneLabel)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">{copy.worldEntrancesEmpty}</div>
              )}
            </PanelSection>

            <PanelSection title={copy.runtimeDataTitle}>
              <div className="space-y-2 text-sm text-[var(--text-primary)]">
                <p>
                  {copy.chestsLabel}: {building.chests.length}
                </p>
                <p>
                  {copy.actionTilesLabel}: {building.actionTiles.length}
                </p>
                <p>
                  {copy.tilePropertiesLabel}: {building.tileProperties.length}
                </p>
                <p>
                  {copy.itemConversionsLabel}: {building.itemConversions.length}
                </p>
                <p>
                  {copy.drawLayersLabel}: {building.drawLayers.length}
                </p>
                <p>
                  {copy.indoorItemsLabel}: {building.indoorItems.length}
                </p>
                <p>
                  {copy.indoorItemMovesLabel}: {building.indoorItemMoves.length}
                </p>
                <p>
                  {copy.addMailLabel}: {building.addMailOnBuild.join(', ') || copy.noneLabel}
                </p>
              </div>
            </PanelSection>

            <PanelSection title={copy.metadataTitle}>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">{copy.metadataLabel}</p>
                  <div className="mt-2">{renderDictionary(building.metadata, copy.noneLabel)}</div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">{copy.modDataLabel}</p>
                  <div className="mt-2">{renderDictionary(building.modData, copy.noneLabel)}</div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">
                    {copy.customFieldsLabel}
                  </p>
                  <div className="mt-2">{renderDictionary(building.customFields, copy.noneLabel)}</div>
                </div>
              </div>
            </PanelSection>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
