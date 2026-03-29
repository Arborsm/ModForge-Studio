import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Grid2x2 } from 'lucide-react'
import { getSpringObjectsSourceRect } from '../lib/app/eventStageShared'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, WorldBuildingEntrance } from '../lib/app/buildingWorkspace'
import type { LocaleCode, ThemeMode, ViewportLabels, BuildingsPanelCopy } from '../lib/editor-shell'
import type { MapDocument } from '../lib/maps/types'
import { cx } from '../lib/cx'
import { MapViewport, type MapViewportHandle, type ViewportWorldPoint } from './MapViewport'

type BuildingWorkspaceProps = {
  locale: LocaleCode
  copy: BuildingsPanelCopy
  viewportLabels: ViewportLabels
  theme: ThemeMode
  accentColor: string
  building: BuildingWorkspaceEntry | null
  upgradeChain: BuildingWorkspaceEntry[]
  activeTextureState: BuildingTextureAssetState | null
  chainTextureStates: Record<string, BuildingTextureAssetState>
  activeIndoorMapDocument: MapDocument | null
  activeIndoorMapPath: string | null
  activeIndoorMapMessage: string
  activeExteriorMapDocument: MapDocument | null
  activeExteriorMapPath: string | null
  activeExteriorMapMessage: string
  activeExteriorFocusPoint: ViewportWorldPoint | null
  springObjectsState: BuildingTextureAssetState
  onSelectBuildingStage: (buildingKey: string) => void
}

function buildAbsoluteSpriteLayerStyle({
  url,
  sheetWidth,
  sheetHeight,
  sourceX,
  sourceY,
  width,
  height,
}: {
  url: string
  sheetWidth: number
  sheetHeight: number
  sourceX: number
  sourceY: number
  width: number
  height: number
}): CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url("${url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sourceX}px -${sourceY}px`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    imageRendering: 'pixelated',
  }
}

function formatPoint(value: { X: number; Y: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y}` : fallback
}

function formatRect(value: { X: number; Y: number; Width: number; Height: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y} / ${value.Width} x ${value.Height}` : fallback
}

function getResolvedSourceRect(entry: BuildingWorkspaceEntry, textureState: BuildingTextureAssetState | null) {
  if (entry.sourceRect) {
    return entry.sourceRect
  }

  if (textureState?.width && textureState?.height) {
    return {
      X: 0,
      Y: 0,
      Width: textureState.width,
      Height: textureState.height,
    }
  }

  return null
}

function getStageBadge(copy: BuildingsPanelCopy, stage: BuildingWorkspaceEntry, currentKey: string | null) {
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

function getVisibleLayerIds(document: MapDocument | null) {
  return document?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []
}

function getVisibleObjectGroupIds(document: MapDocument | null) {
  return document?.objectGroups.filter((group) => group.visible).map((group) => group.id) ?? []
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
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
      <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
        {sourceRect && springObjectsState.url && springObjectsState.width && springObjectsState.height ? (
          <div
            className="absolute left-1/2 top-1/2"
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
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase text-[var(--text-secondary)]">
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

function StageCard({
  copy,
  stage,
  textureState,
  isActive,
  onSelect,
}: {
  copy: BuildingsPanelCopy
  stage: BuildingWorkspaceEntry
  textureState: BuildingTextureAssetState | null
  isActive: boolean
  onSelect: () => void
}) {
  const sourceRect = getResolvedSourceRect(stage, textureState)
  const previewScale =
    sourceRect && sourceRect.Width > 0 && sourceRect.Height > 0
      ? Math.max(1, Math.min(3.2, Math.min(184 / sourceRect.Width, 132 / sourceRect.Height)))
      : 1

  return (
    <button
      type="button"
      className={cx(
        'w-[240px] shrink-0 rounded-[28px] border p-3 text-left transition-colors',
        isActive
          ? 'border-[var(--accent)] bg-[var(--bg-active)]'
          : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)]',
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

      <div className="mt-3 flex min-h-[152px] items-center justify-center rounded-[24px] border border-[var(--border-color)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_38%),var(--bg-panel-muted)] px-3 py-4">
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

function WorldEntranceCard({
  copy,
  entrance,
}: {
  copy: BuildingsPanelCopy
  entrance: WorldBuildingEntrance
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{entrance.sourceMapName}</p>
          <p className="truncate text-xs text-[var(--text-secondary)]">{entrance.sourceMapPathLabel}</p>
        </div>
        <span className="dock-chip shrink-0">{entrance.trigger}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
        <p>{copy.sourceTileLabel}: {formatPoint(entrance.sourceTile, copy.noneLabel)}</p>
        <p>{copy.targetTileLabel}: {formatPoint(entrance.targetTile, copy.noneLabel)}</p>
      </div>
    </div>
  )
}

export default function BuildingWorkspace({
  locale,
  copy,
  viewportLabels,
  theme,
  accentColor,
  building,
  upgradeChain,
  activeTextureState,
  chainTextureStates,
  activeIndoorMapDocument,
  activeIndoorMapPath,
  activeIndoorMapMessage,
  activeExteriorMapDocument,
  activeExteriorMapPath,
  activeExteriorMapMessage,
  activeExteriorFocusPoint,
  springObjectsState,
  onSelectBuildingStage,
}: BuildingWorkspaceProps) {
  const [showGrid, setShowGrid] = useState(true)
  const [zoomLabel, setZoomLabel] = useState(() => viewportLabels.zoomLabel(1))
  const viewportRef = useRef<MapViewportHandle | null>(null)

  useEffect(() => {
    setZoomLabel(viewportLabels.zoomLabel(1))
  }, [building?.key, viewportLabels])

  const indoorVisibleLayerIds = useMemo(() => getVisibleLayerIds(activeIndoorMapDocument), [activeIndoorMapDocument])
  const indoorVisibleObjectGroupIds = useMemo(
    () => getVisibleObjectGroupIds(activeIndoorMapDocument),
    [activeIndoorMapDocument],
  )
  const exteriorVisibleLayerIds = useMemo(() => getVisibleLayerIds(activeExteriorMapDocument), [activeExteriorMapDocument])
  const exteriorVisibleObjectGroupIds = useMemo(
    () => getVisibleObjectGroupIds(activeExteriorMapDocument),
    [activeExteriorMapDocument],
  )

  if (!building) {
    return (
      <div className="panel-surface h-full border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--text-secondary)]">
          {copy.inspectorEmpty}
        </div>
      </div>
    )
  }

  const isConstructible = building.sourceKind === 'constructible'
  const sourceRect = getResolvedSourceRect(building, activeTextureState)
  const previewScale =
    sourceRect && sourceRect.Width > 0 && sourceRect.Height > 0
      ? Math.max(1.2, Math.min(4, Math.min(420 / sourceRect.Width, 280 / sourceRect.Height)))
      : 1

  return (
    <div className="panel-surface h-full border-[var(--border-color)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_96%,transparent),var(--bg-panel))]">
      <div className="panel-header">
        <div>
          <p className="panel-title">{copy.workspaceTitle}</p>
          <p className="panel-subtitle">
            {building.displayName} / {copy.workspaceSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="dock-chip">{isConstructible ? copy.sourceConstructibleLabel : copy.sourceWorldLabel}</span>
          <span className="dock-chip">{isConstructible ? (building.builder ?? copy.noneLabel) : (building.exteriorMapName ?? copy.noneLabel)}</span>
          <span className="dock-chip">
            {isConstructible
              ? copy.stageLabel.replace('{current}', String(building.stageIndex + 1)).replace('{total}', String(building.stageCount))
              : `${copy.entranceCountLabel}: ${building.worldEntrances.length}`}
          </span>
        </div>
      </div>

      <div className="grid h-[calc(100%-58px)] min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="grid min-h-0 gap-3">
          <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
            <div className="panel-header">
              <div>
                <p className="panel-title">{isConstructible ? copy.bodyTitle : copy.exteriorTitle}</p>
                <p className="panel-subtitle">
                  {isConstructible ? building.texturePathLabel : (activeExteriorMapPath ?? building.exteriorMapPathLabel ?? copy.noneLabel)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isConstructible ? (
                  <>
                    <span className="dock-chip">{copy.sizeLabel}: {building.size ? `${building.size.X} x ${building.size.Y}` : copy.noneLabel}</span>
                    <span className="dock-chip">{copy.sourceRectLabel}: {formatRect(sourceRect, copy.noneLabel)}</span>
                  </>
                ) : (
                  <>
                    <span className="dock-chip">{copy.exteriorEntryLabel}: {formatPoint(building.exteriorEntryTile, copy.noneLabel)}</span>
                    <span className="dock-chip">{copy.entranceCountLabel}: {building.worldEntrances.length}</span>
                  </>
                )}
              </div>
            </div>

            <div className="panel-body flex min-h-0 flex-col gap-3 p-3">
              <div className="flex min-h-[340px] flex-1 items-center justify-center overflow-hidden rounded-[32px] border border-[var(--border-color)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%),linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_84%,transparent),var(--bg-viewport))] p-6">
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
                    <div className="rounded-3xl border border-dashed border-[var(--border-color)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                      {copy.noTexture}
                    </div>
                  )
                ) : activeExteriorMapDocument ? (
                  <div className="h-full min-h-[340px] w-full">
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
                  <div className="rounded-3xl border border-dashed border-[var(--border-color)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                    {activeExteriorMapMessage}
                  </div>
                )}
              </div>

              {isConstructible ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.builderLabel}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{building.builder ?? copy.noneLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.humanDoorLabel}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{formatPoint(building.humanDoor, copy.noneLabel)}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.animalDoorLabel}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{formatRect(building.animalDoor, copy.noneLabel)}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.occupantsLabel}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{building.maxOccupants}</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.exteriorMapLabel}</p>
                    <p className="mt-1 truncate text-sm text-[var(--text-primary)]">{building.exteriorMapName ?? copy.noneLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.exteriorEntryLabel}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{formatPoint(building.exteriorEntryTile, copy.noneLabel)}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.indoorMapLabel}</p>
                    <p className="mt-1 truncate text-sm text-[var(--text-primary)]">{activeIndoorMapPath ?? building.indoorMapPathLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{copy.entranceCountLabel}</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{building.worldEntrances.length}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
              <div className="panel-header">
                <div>
                  <p className="panel-title">{isConstructible ? copy.materialsTitle : copy.worldEntrancesTitle}</p>
                  <p className="panel-subtitle">
                    {isConstructible ? `${copy.materialCountLabel}: ${building.buildMaterials.length}` : `${copy.entranceCountLabel}: ${building.worldEntrances.length}`}
                  </p>
                </div>
              </div>
              <div className="panel-body min-h-[180px] overflow-auto p-3">
                {isConstructible ? (
                  building.buildMaterials.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {building.buildMaterials.map((material) => (
                        <MaterialChip
                          key={`${building.key}:${material.itemId}`}
                          label={material.displayName}
                          amount={material.amount}
                          objectIndex={material.objectIndex}
                          springObjectsState={springObjectsState}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                      {copy.materialsEmpty}
                    </div>
                  )
                ) : building.worldEntrances.length ? (
                  <div className="space-y-2">
                    {building.worldEntrances.map((entrance, index) => (
                      <WorldEntranceCard key={`${building.key}:${index}`} copy={copy} entrance={entrance} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                    {copy.worldEntrancesEmpty}
                  </div>
                )}
              </div>
            </div>

            <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
              <div className="panel-header">
                <div>
                  <p className="panel-title">{isConstructible ? copy.skinsTitle : copy.exteriorDataTitle}</p>
                  <p className="panel-subtitle">
                    {isConstructible ? `${copy.skinCountLabel}: ${building.skins.length}` : (activeExteriorMapPath ?? building.exteriorMapPathLabel ?? copy.noneLabel)}
                  </p>
                </div>
              </div>
              <div className="panel-body min-h-[180px] overflow-auto p-3">
                {isConstructible ? (
                  building.skins.length ? (
                    <div className="space-y-2">
                      {building.skins.map((skin) => (
                        <div key={`${building.key}:${skin.id}`} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{skin.displayName}</p>
                              <p className="truncate text-xs text-[var(--text-secondary)]">{skin.texturePathLabel}</p>
                            </div>
                            {skin.showAsSeparateConstructionEntry ? <span className="dock-chip">{copy.separateBuildBadge}</span> : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">
                            {skin.description ?? skin.condition ?? copy.noneLabel}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                      {copy.skinsEmpty}
                    </div>
                  )
                ) : (
                  <div className="rounded-[26px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                    <div className="space-y-2 text-sm text-[var(--text-primary)]">
                      <p>{copy.sourceMapLabel}: {building.exteriorMapName ?? copy.noneLabel}</p>
                      <p>{copy.exteriorMapLabel}: {activeExteriorMapPath ?? building.exteriorMapPathLabel ?? copy.noneLabel}</p>
                      <p>{copy.exteriorEntryLabel}: {formatPoint(building.exteriorEntryTile, copy.noneLabel)}</p>
                      <p>{copy.indoorMapLabel}: {activeIndoorMapPath ?? building.indoorMapPathLabel}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {isConstructible ? (
            <div className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
              <div className="panel-header">
                <div>
                  <p className="panel-title">{copy.upgradeTitle}</p>
                  <p className="panel-subtitle">{`${building.rootKey} -> ${building.leafKey}`}</p>
                </div>
              </div>
              <div className="panel-body min-h-[260px] overflow-auto p-3">
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {upgradeChain.map((stage) => (
                    <StageCard
                      key={stage.key}
                      copy={copy}
                      stage={stage}
                      textureState={chainTextureStates[stage.key] ?? null}
                      isActive={stage.key === building.key}
                      onSelect={() => onSelectBuildingStage(stage.key)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="panel-surface min-h-0 border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
          <div className="panel-header">
            <div>
              <p className="panel-title">{copy.interiorTitle}</p>
              <p className="panel-subtitle">{activeIndoorMapPath ?? building.indoorMapPathLabel}</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1">
              <button
                type="button"
                className={cx('tool-button', showGrid && 'tool-button-active')}
                onClick={() => setShowGrid((current) => !current)}
                title={showGrid ? 'Hide grid' : 'Show grid'}
              >
                <Grid2x2 className="h-4 w-4" />
              </button>
              <span className="dock-chip">{zoomLabel}</span>
            </div>
          </div>

          <div className="panel-body flex h-full min-h-0 flex-col gap-3 p-3">
            {activeIndoorMapDocument ? (
              <div className="relative min-h-[420px] flex-1">
                <MapViewport
                  key={`${building.key}:${activeIndoorMapDocument.relativePath}`}
                  locale={locale}
                  ref={viewportRef}
                  mapDocument={activeIndoorMapDocument}
                  visibleLayerIds={indoorVisibleLayerIds}
                  visibleObjectGroupIds={indoorVisibleObjectGroupIds}
                  labels={viewportLabels}
                  theme={theme}
                  accentColor={accentColor}
                  showGrid={showGrid}
                  showStatsChips
                  onZoomChange={(nextZoom) => setZoomLabel(viewportLabels.zoomLabel(nextZoom))}
                />
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-[32px] border border-dashed border-[var(--border-color)] px-6 text-center text-sm text-[var(--text-secondary)]">
                {building.indoorMapAssetName || building.nonInstancedIndoorLocation ? activeIndoorMapMessage || copy.noIndoorMap : copy.noIndoorMap}
              </div>
            )}

            <div className="rounded-[26px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                {isConstructible ? copy.indoorDataTitle : copy.exteriorDataTitle}
              </p>
              <div className="mt-3 space-y-2 text-sm text-[var(--text-primary)]">
                <p>{copy.indoorMapLabel}: {building.indoorMapAssetName ? building.indoorMapPathLabel : copy.noneLabel}</p>
                <p>{copy.indoorTypeLabel}: {building.indoorMapType ?? copy.noneLabel}</p>
                <p>{copy.nonInstancedIndoorLabel}: {building.nonInstancedIndoorLocation ?? copy.noneLabel}</p>
                <p>{copy.validOccupantsLabel}: {building.validOccupantTypes.join(', ') || copy.noneLabel}</p>
                {!isConstructible ? <p>{copy.exteriorMapLabel}: {activeExteriorMapPath ?? building.exteriorMapPathLabel ?? copy.noneLabel}</p> : null}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
