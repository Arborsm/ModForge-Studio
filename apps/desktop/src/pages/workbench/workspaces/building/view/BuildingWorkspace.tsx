import { useMemo, useState } from 'react'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import type { LocaleCode, ViewportLabels, ThemeMode } from '@locales/api'
import type { MapDocument, ViewportWorldPoint } from '@shared/contracts'
import { useBuildingsCopy } from '@locales/provider'
import { formatPoint, formatRect } from '@shared/lib/geometryFormatting'
import { getResolvedSourceRect, getVisibleLayerIds, getVisibleObjectGroupIds } from './buildingViewHelpers'
import { BuildingWorkspaceHeader } from './BuildingWorkspaceHeader'
import { BuildingPrimaryPreview } from './BuildingPrimaryPreview'
import { BuildingFactGrid } from './BuildingFactGrid'
import { BuildingMaterialsPanel } from './BuildingMaterialsPanel'
import { BuildingSkinsPanel } from './BuildingSkinsPanel'
import { BuildingUpgradeChain } from './BuildingUpgradeChain'
import { BuildingIndoorMapPanel } from './BuildingIndoorMapPanel'

type BuildingWorkspaceProps = {
  locale: LocaleCode
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

export default function BuildingWorkspace(props: BuildingWorkspaceProps) {
  const copy = useBuildingsCopy()
  const [showGrid, setShowGrid] = useState(true)

  if (!props.building) {
    return (
      <div className="panel-surface panel-surface-flat h-full">
        <div className="panel-canvas-empty h-full border-0 bg-transparent px-6">{copy.inspectorEmpty}</div>
      </div>
    )
  }

  return (
    <BuildingWorkspaceContent
      key={props.building.key}
      locale={props.locale}
      viewportLabels={props.viewportLabels}
      theme={props.theme}
      accentColor={props.accentColor}
      building={props.building}
      upgradeChain={props.upgradeChain}
      activeTextureState={props.activeTextureState}
      chainTextureStates={props.chainTextureStates}
      activeIndoorMapDocument={props.activeIndoorMapDocument}
      activeIndoorMapPath={props.activeIndoorMapPath}
      activeIndoorMapMessage={props.activeIndoorMapMessage}
      activeExteriorMapDocument={props.activeExteriorMapDocument}
      activeExteriorMapPath={props.activeExteriorMapPath}
      activeExteriorMapMessage={props.activeExteriorMapMessage}
      activeExteriorFocusPoint={props.activeExteriorFocusPoint}
      springObjectsState={props.springObjectsState}
      onSelectBuildingStage={props.onSelectBuildingStage}
      showGrid={showGrid}
      onToggleGrid={() => setShowGrid((current) => !current)}
    />
  )
}

type BuildingWorkspaceContentProps = Omit<BuildingWorkspaceProps, 'building'> & {
  building: BuildingWorkspaceEntry
  showGrid: boolean
  onToggleGrid: () => void
}

function BuildingWorkspaceContent(props: BuildingWorkspaceContentProps) {
  const copy = useBuildingsCopy()
  const [zoomLevel, setZoomLevel] = useState(1)
  const indoorVisibleLayerIds = useMemo(() => getVisibleLayerIds(props.activeIndoorMapDocument), [props.activeIndoorMapDocument])
  const indoorVisibleObjectGroupIds = useMemo(
    () => getVisibleObjectGroupIds(props.activeIndoorMapDocument),
    [props.activeIndoorMapDocument],
  )
  const exteriorVisibleLayerIds = useMemo(() => getVisibleLayerIds(props.activeExteriorMapDocument), [props.activeExteriorMapDocument])
  const exteriorVisibleObjectGroupIds = useMemo(
    () => getVisibleObjectGroupIds(props.activeExteriorMapDocument),
    [props.activeExteriorMapDocument],
  )

  const isConstructible = props.building.sourceKind === 'constructible'
  const sourceRect = getResolvedSourceRect(props.building, props.activeTextureState)

  return (
    <div className="panel-surface h-full">
      <BuildingWorkspaceHeader building={props.building} copy={copy} />

      <div className="grid h-[calc(100%-58px)] min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="grid min-h-0 gap-3">
          <div className="panel-surface panel-surface-muted min-h-0">
            <div className="panel-header">
              <div>
                <p className="panel-title">{isConstructible ? copy.bodyTitle : copy.exteriorTitle}</p>
                <p className="panel-subtitle">
                  {isConstructible
                    ? props.building.texturePathLabel
                    : (props.activeExteriorMapPath ?? props.building.exteriorMapPathLabel ?? copy.noneLabel)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isConstructible ? (
                  <>
                    <span className="dock-chip">
                      {copy.sizeLabel}: {props.building.size ? `${props.building.size.X} x ${props.building.size.Y}` : copy.noneLabel}
                    </span>
                    <span className="dock-chip">
                      {copy.sourceRectLabel}: {formatRect(sourceRect, copy.noneLabel)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="dock-chip">
                      {copy.exteriorEntryLabel}: {formatPoint(props.building.exteriorEntryTile, copy.noneLabel)}
                    </span>
                    <span className="dock-chip">
                      {copy.entranceCountLabel}: {props.building.worldEntrances.length}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="panel-body flex min-h-0 flex-col gap-3 p-3">
              <BuildingPrimaryPreview
                building={props.building}
                activeTextureState={props.activeTextureState}
                activeExteriorMapDocument={props.activeExteriorMapDocument}
                activeExteriorMapMessage={props.activeExteriorMapMessage}
                activeExteriorFocusPoint={props.activeExteriorFocusPoint}
                activeExteriorMapPath={props.activeExteriorMapPath}
                locale={props.locale}
                viewportLabels={props.viewportLabels}
                theme={props.theme}
                accentColor={props.accentColor}
                showGrid={props.showGrid}
                exteriorVisibleLayerIds={exteriorVisibleLayerIds}
                exteriorVisibleObjectGroupIds={exteriorVisibleObjectGroupIds}
              />
              <BuildingFactGrid building={props.building} activeIndoorMapPath={props.activeIndoorMapPath} copy={copy} />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <BuildingMaterialsPanel building={props.building} springObjectsState={props.springObjectsState} copy={copy} />
            <BuildingSkinsPanel building={props.building} _activeTextureState={props.activeTextureState} copy={copy} />
          </div>

          {isConstructible ? (
            <BuildingUpgradeChain
              upgradeChain={props.upgradeChain}
              activeBuildingKey={props.building.key}
              chainTextureStates={props.chainTextureStates}
              onSelectBuildingStage={props.onSelectBuildingStage}
              copy={copy}
            />
          ) : null}
        </section>

        <BuildingIndoorMapPanel
          building={props.building}
          activeIndoorMapDocument={props.activeIndoorMapDocument}
          activeIndoorMapPath={props.activeIndoorMapPath}
          activeIndoorMapMessage={props.activeIndoorMapMessage}
          activeExteriorMapPath={props.activeExteriorMapPath}
          showGrid={props.showGrid}
          onToggleGrid={props.onToggleGrid}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
          indoorVisibleLayerIds={indoorVisibleLayerIds}
          indoorVisibleObjectGroupIds={indoorVisibleObjectGroupIds}
          locale={props.locale}
          viewportLabels={props.viewportLabels}
          theme={props.theme}
          accentColor={props.accentColor}
          copy={copy}
        />
      </div>
    </div>
  )
}
