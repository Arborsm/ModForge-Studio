import { useState, type ReactNode } from 'react'
import { formatPoint, formatRect } from '@shared/infra/game-formats/geometryFormatting'
import { useBuildingsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ModSourceList } from '@shared/ui/ModSourceList'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import { buildAbsoluteSpriteLayerStyle, getResolvedSourceRect } from './buildingViewHelpers'

export type BuildingDetailTab = 'overview' | 'maps' | 'extend' | 'assets'

export type BuildingDetailPaneProps = {
  building: BuildingWorkspaceEntry | null
  textureState: BuildingTextureAssetState | null
  activeIndoorMapPath: string | null
  activeExteriorMapPath: string | null
  modSources?: ModSourceEntry[]
}

function renderKv(label: string, value: string) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <span className="max-w-[58%] truncate text-right" title={value}>
        {value}
      </span>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="panel-section-title mb-3">{title}</p>
      {children}
    </section>
  )
}

function renderDictionary(entries: Record<string, string>, noneLabel: string) {
  const keys = Object.keys(entries)
  if (keys.length === 0) {
    return null
  }

  return (
    <div>
      {keys.map((key) => (
        <div key={key} className="kv-row">
          <span className="truncate" title={key}>
            {key}
          </span>
          <span className="max-w-[58%] truncate text-right" title={entries[key]}>
            {entries[key] || noneLabel}
          </span>
        </div>
      ))}
    </div>
  )
}

function BuildingHeroPreview({
  building,
  textureState,
}: {
  building: BuildingWorkspaceEntry
  textureState: BuildingTextureAssetState | null
}) {
  const sourceRect = getResolvedSourceRect(building, textureState)
  if (!sourceRect || !textureState?.url || !textureState.width || !textureState.height) {
    return (
      <div className="building-workspace-hero-preview">
        <span className="text-2xl font-bold text-(--text-tertiary)">{building.displayName.slice(0, 1)}</span>
      </div>
    )
  }

  const scale = Math.max(0.8, Math.min(2.4, Math.min(88 / sourceRect.Width, 72 / sourceRect.Height)))

  return (
    <div className="building-workspace-hero-preview">
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
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      />
    </div>
  )
}

/**
 * Right-rail building detail: hero identity plus tabbed dense field stacks.
 * Empty supplemental blocks are omitted rather than showing empty-state cards.
 */
export function BuildingDetailPane({
  building,
  textureState,
  activeIndoorMapPath,
  activeExteriorMapPath,
  modSources = [],
}: BuildingDetailPaneProps) {
  const copy = useBuildingsCopy()
  const [activeTab, setActiveTab] = useState<BuildingDetailTab>('overview')
  const { yesLabel, noLabel, noneLabel } = copy

  if (!building) {
    return (
      <section className="building-workspace-pane h-full">
        <div className="flex h-full min-h-0 items-center justify-center px-6 text-center">
          <p className="building-workspace-empty-notice max-w-sm">{copy.detailsEmpty}</p>
        </div>
      </section>
    )
  }

  const isConstructible = building.sourceKind === 'constructible'
  const hasIndoor = Boolean(activeIndoorMapPath || building.indoorMapAssetName || building.nonInstancedIndoorLocation)
  const stageChip = copy.stageLabel.replace('{current}', String(building.stageIndex + 1)).replace('{total}', String(building.stageCount))
  const tabs: Array<{ id: BuildingDetailTab; label: string }> = [
    { id: 'overview', label: copy.overviewTab },
    { id: 'maps', label: copy.mapsTab },
    { id: 'extend', label: copy.extendTab },
    { id: 'assets', label: copy.assetsTab },
  ]

  const metadataKeys = Object.keys(building.metadata)
  const modDataKeys = Object.keys(building.modData)
  const customFieldKeys = Object.keys(building.customFields)

  return (
    <section className="building-workspace-pane h-full">
      <div className="border-b border-(--border-color)/65 px-5 py-6">
        <div className="flex items-start gap-4">
          <BuildingHeroPreview building={building} textureState={textureState} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.5rem] font-extrabold tracking-tight text-(--text-primary)">{building.displayName}</h2>
            <p className="mt-1 truncate font-mono text-xs text-(--text-tertiary)">
              {building.internalName}
              {building.texturePathLabel ? ` · ${building.texturePathLabel}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="building-workspace-pill building-workspace-pill-accent">
                {isConstructible ? copy.sourceConstructibleLabel : copy.sourceWorldLabel}
              </span>
              {isConstructible && building.builder ? (
                <span className="building-workspace-pill building-workspace-pill-muted">{building.builder}</span>
              ) : null}
              {!isConstructible && building.exteriorMapName ? (
                <span className="building-workspace-pill building-workspace-pill-muted">{building.exteriorMapName}</span>
              ) : null}
              {isConstructible ? <span className="building-workspace-pill building-workspace-pill-info">{stageChip}</span> : null}
              {hasIndoor ? <span className="building-workspace-pill building-workspace-pill-success">{copy.hasIndoorBadge}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap gap-2 px-4 pt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                tab.id === activeTab
                  ? 'bg-(--accent-soft) text-(--accent)'
                  : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto px-4 py-4">
          {activeTab === 'overview' ? (
            <div className="detail-sections-stack">
              <DetailSection title={copy.basics}>
                {renderKv(copy.displayNameLabel, building.displayName)}
                {renderKv(copy.internalNameLabel, building.internalName)}
                {renderKv(copy.sourceKindLabel, isConstructible ? copy.sourceConstructibleLabel : copy.sourceWorldLabel)}
                {renderKv(copy.groupLabel, building.groupDisplayName)}
                {renderKv(copy.builderLabel, building.builder ?? noneLabel)}
                {renderKv(copy.typeLabel, building.buildingClassName ?? noneLabel)}
                {renderKv(copy.descriptionLabel, building.description ?? noneLabel)}
              </DetailSection>

              <DetailSection title={copy.construction}>
                {renderKv(copy.buildDaysLabel, String(building.buildDays))}
                {renderKv(copy.buildCostLabel, String(building.buildCost))}
                {renderKv(copy.buildConditionLabel, building.buildCondition ?? noneLabel)}
                {renderKv(copy.magicalLabel, building.magicalConstruction ? yesLabel : noLabel)}
                {renderKv(copy.upgradeFromLabel, building.upgradeFromKey ?? noneLabel)}
                {renderKv(copy.upgradeToLabel, building.upgradeToKeys.join(', ') || noneLabel)}
                {renderKv(copy.entranceCountLabel, String(building.worldEntrances.length))}
              </DetailSection>

              {isConstructible ? (
                <DetailSection title={copy.placementTitle}>
                  {renderKv(copy.additionalPlacementTilesLabel, String(building.additionalPlacementTiles.length))}
                  {renderKv(copy.collisionMapLabel, building.collisionMap ?? noneLabel)}
                  {renderKv(copy.fadeWhenBehindLabel, building.fadeWhenBehind ? yesLabel : noLabel)}
                  {renderKv(copy.flooringLabel, building.allowsFlooringUnderneath ? yesLabel : noLabel)}
                  {renderKv(copy.additionalTileRadiusLabel, String(building.additionalTilePropertyRadius))}
                </DetailSection>
              ) : building.worldEntrances.length > 0 ? (
                <DetailSection title={copy.worldEntrancesTitle}>
                  {building.worldEntrances.map((entrance, index) => (
                    <div key={`${building.key}:entrance:${index}`} className="border-b border-(--border-color)/65 py-2 last:border-b-0">
                      <p className="text-sm font-semibold text-(--text-primary)">{entrance.sourceMapName}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-(--text-secondary)">
                        <p>
                          {copy.triggerLabel}: {entrance.trigger}
                        </p>
                        <p>
                          {copy.sourceTileLabel}: {formatPoint(entrance.sourceTile, noneLabel)}
                        </p>
                        <p>
                          {copy.targetTileLabel}: {formatPoint(entrance.targetTile, noneLabel)}
                        </p>
                      </div>
                    </div>
                  ))}
                </DetailSection>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'maps' ? (
            <div className="detail-sections-stack">
              <DetailSection title={copy.indoor}>
                {renderKv(copy.sizeLabel, building.size ? `${building.size.X} x ${building.size.Y}` : noneLabel)}
                {renderKv(copy.humanDoorLabel, formatPoint(building.humanDoor, noneLabel))}
                {renderKv(copy.animalDoorLabel, formatRect(building.animalDoor, noneLabel))}
                {renderKv(copy.indoorMapLabel, activeIndoorMapPath ?? (building.indoorMapPathLabel || noneLabel))}
                {renderKv(copy.indoorTypeLabel, building.indoorMapType ?? noneLabel)}
                {renderKv(copy.nonInstancedIndoorLabel, building.nonInstancedIndoorLocation ?? noneLabel)}
                {renderKv(copy.exteriorMapLabel, activeExteriorMapPath ?? building.exteriorMapPathLabel ?? noneLabel)}
                {renderKv(copy.exteriorEntryLabel, formatPoint(building.exteriorEntryTile, noneLabel))}
              </DetailSection>

              <DetailSection title={copy.occupantsSectionTitle}>
                {renderKv(copy.occupantsLabel, String(building.maxOccupants))}
                {renderKv(copy.validOccupantsLabel, building.validOccupantTypes.join(', ') || noneLabel)}
                {renderKv(copy.hayCapacityLabel, String(building.hayCapacity))}
                {renderKv(copy.pregnancyLabel, building.allowAnimalPregnancy ? yesLabel : noLabel)}
              </DetailSection>
            </div>
          ) : null}

          {activeTab === 'extend' ? (
            <div className="detail-sections-stack">
              <DetailSection title={copy.runtimeDataTitle}>
                {renderKv(copy.chestsLabel, String(building.chests.length))}
                {renderKv(copy.actionTilesLabel, String(building.actionTiles.length))}
                {renderKv(copy.tilePropertiesLabel, String(building.tileProperties.length))}
                {renderKv(copy.itemConversionsLabel, String(building.itemConversions.length))}
                {renderKv(copy.drawLayersLabel, String(building.drawLayers.length))}
                {renderKv(copy.indoorItemsLabel, String(building.indoorItems.length))}
                {renderKv(copy.indoorItemMovesLabel, String(building.indoorItemMoves.length))}
                {renderKv(copy.addMailLabel, building.addMailOnBuild.join(', ') || noneLabel)}
              </DetailSection>

              {metadataKeys.length > 0 ? (
                <DetailSection title={copy.metadataLabel}>{renderDictionary(building.metadata, noneLabel)}</DetailSection>
              ) : null}
              {modDataKeys.length > 0 ? (
                <DetailSection title={copy.modDataLabel}>{renderDictionary(building.modData, noneLabel)}</DetailSection>
              ) : null}
              {customFieldKeys.length > 0 ? (
                <DetailSection title={copy.customFieldsLabel}>{renderDictionary(building.customFields, noneLabel)}</DetailSection>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'assets' ? (
            <div className="detail-sections-stack">
              <DetailSection title={copy.assets}>
                {renderKv(copy.textureLabel, building.texturePathLabel)}
                {renderKv(
                  copy.textureSizeLabel,
                  textureState?.width && textureState?.height ? `${textureState.width} x ${textureState.height}` : noneLabel,
                )}
                {renderKv(copy.sourceRectLabel, formatRect(building.sourceRect, noneLabel))}
                {renderKv(copy.drawOffsetLabel, formatPoint(building.drawOffset, noneLabel))}
                {renderKv(copy.mapPathLabel, activeIndoorMapPath ?? (building.indoorMapPathLabel || noneLabel))}
              </DetailSection>

              {modSources.length > 0 ? (
                <DetailSection title={copy.modSourcesTitle}>
                  <div className="mt-1">
                    <ModSourceList sources={modSources} variant="flat" />
                  </div>
                </DetailSection>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
