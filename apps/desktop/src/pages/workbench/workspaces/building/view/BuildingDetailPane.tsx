import { useState, type ReactNode } from 'react'
import { formatPoint, formatRect } from '@shared/infra/game-formats/geometryFormatting'
import { useBuildingsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ModSourceList } from '@shared/ui/ModSourceList'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { AssetEntryCanvas, EMPTY_ASSET_RESOURCES, parseAssetEntry } from '@entities/asset-schema'
import {
  BUILDING_DATA_SCHEMA,
  buildAbsoluteSpriteLayerStyle,
  getResolvedSourceRect,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
} from '@entities/building'

export type BuildingDetailTab = 'overview' | 'assets'

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
 * Right-rail building detail: hero identity plus a read-only render of the
 * `Data/Buildings` record through the shared `AssetSchema`, so the codex and the
 * authoring page describe the same fields from one definition. World buildings
 * carry no data record and fall back to their map-derived identity and warps.
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
  const { noneLabel } = copy

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
    { id: 'assets', label: copy.assetsTab },
  ]

  const dataEntryDraft = Object.keys(building.rawEntry).length > 0 ? parseAssetEntry(BUILDING_DATA_SCHEMA, building.rawEntry) : null

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
            dataEntryDraft ? (
              <AssetEntryCanvas
                key={building.key}
                schema={BUILDING_DATA_SCHEMA}
                draft={dataEntryDraft}
                onDraftChange={() => undefined}
                resources={EMPTY_ASSET_RESOURCES}
                readOnly
              />
            ) : (
              <div className="detail-sections-stack">
                <DetailSection title={copy.basics}>
                  {renderKv(copy.displayNameLabel, building.displayName)}
                  {renderKv(copy.internalNameLabel, building.internalName)}
                  {renderKv(copy.sourceKindLabel, copy.sourceWorldLabel)}
                  {renderKv(copy.groupLabel, building.groupDisplayName)}
                  {renderKv(copy.typeLabel, building.buildingClassName ?? noneLabel)}
                  {renderKv(copy.descriptionLabel, building.description ?? noneLabel)}
                </DetailSection>

                {building.worldEntrances.length > 0 ? (
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
            )
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
                {renderKv(copy.indoorMapLabel, activeIndoorMapPath ?? (building.indoorMapPathLabel || noneLabel))}
                {renderKv(copy.exteriorMapLabel, activeExteriorMapPath ?? building.exteriorMapPathLabel ?? noneLabel)}
                {renderKv(copy.exteriorEntryLabel, formatPoint(building.exteriorEntryTile, noneLabel))}
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
