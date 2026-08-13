import { useRef, useState, type ReactNode } from 'react'
import { Grid2x2 } from 'lucide-react'
import { getResolvedSourceRect, type BuildingTextureAssetState, type BuildingWorkspaceEntry } from '@entities/building'
import type { LocaleCode, ViewportLabels, ThemeMode } from '@locales/api'
import type { MapDocument, ViewportWorldPoint } from '@entities/map'
import type { MapViewportHandle } from '@entities/map'
import { useBuildingsCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { formatRect } from '@shared/infra/game-formats/geometryFormatting'
import { buildBuildingCanvasBackdropStyle, getVisibleLayerIds, getVisibleObjectGroupIds } from './buildingViewHelpers'
import { BuildingPrimaryPreview } from './BuildingPrimaryPreview'
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

type PreviewMode = 'dual' | 'solo'

/**
 * Center column: toolbar + body/interior canvases, then upgrade chain / materials footer.
 */
export default function BuildingWorkspace(props: BuildingWorkspaceProps) {
  const copy = useBuildingsCopy()
  const [showGrid, setShowGrid] = useState(true)

  if (!props.building) {
    return (
      <div className="building-workspace-pane h-full">
        <div className="text-text-secondary flex h-full min-h-0 items-center justify-center px-6 text-sm">{copy.inspectorEmpty}</div>
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
  const mapViewportRef = useRef<MapViewportHandle | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('dual')

  const indoorVisibleLayerIds = getVisibleLayerIds(props.activeIndoorMapDocument)
  const indoorVisibleObjectGroupIds = getVisibleObjectGroupIds(props.activeIndoorMapDocument)
  const exteriorVisibleLayerIds = getVisibleLayerIds(props.activeExteriorMapDocument)
  const exteriorVisibleObjectGroupIds = getVisibleObjectGroupIds(props.activeExteriorMapDocument)

  const isConstructible = props.building.sourceKind === 'constructible'
  const hasIndoorMap = props.activeIndoorMapDocument != null
  const hasSkins = isConstructible && props.building.skins.length > 0
  const hasUpgradeChain = isConstructible && props.upgradeChain.length > 1
  const effectivePreviewMode: PreviewMode = hasIndoorMap ? previewMode : 'solo'

  const materials = <BuildingMaterialsPanel building={props.building} springObjectsState={props.springObjectsState} copy={copy} />
  const skins = hasSkins ? <BuildingSkinsPanel building={props.building} copy={copy} /> : null
  const chain = hasUpgradeChain ? (
    <BuildingUpgradeChain
      upgradeChain={props.upgradeChain}
      activeBuildingKey={props.building.key}
      chainTextureStates={props.chainTextureStates}
      onSelectBuildingStage={props.onSelectBuildingStage}
      copy={copy}
    />
  ) : null

  const sidePanel = materials || skins
  const footerHasContent = Boolean(chain || sidePanel)
  const footerSplit = Boolean(chain && sidePanel)

  const sourceRect = getResolvedSourceRect(props.building, props.activeTextureState)
  const pathMeta = [
    props.building.texturePathLabel || props.building.internalName,
    props.building.size ? `${props.building.size.X}×${props.building.size.Y}` : null,
    sourceRect ? `src ${formatRect(sourceRect, copy.noneLabel)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const bodyPreview = (
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
      fitSize={effectivePreviewMode === 'dual' ? 360 : 520}
      fillContainer
    />
  )

  const canvasBackdropStyle = buildBuildingCanvasBackdropStyle(props.theme, props.accentColor)

  let preview: ReactNode
  if (hasIndoorMap && props.activeIndoorMapDocument) {
    preview = (
      <div
        className="building-workspace-preview building-workspace-preview-dual"
        data-mode={effectivePreviewMode}
        style={canvasBackdropStyle}
      >
        <div className="building-workspace-square">
          <span className="building-workspace-square-title">{isConstructible ? copy.bodyTitle : copy.exteriorTitle}</span>
          {bodyPreview}
        </div>
        <BuildingIndoorMapPanel
          ref={mapViewportRef}
          building={props.building}
          activeIndoorMapDocument={props.activeIndoorMapDocument}
          showGrid={props.showGrid}
          indoorVisibleLayerIds={indoorVisibleLayerIds}
          indoorVisibleObjectGroupIds={indoorVisibleObjectGroupIds}
          locale={props.locale}
          theme={props.theme}
          accentColor={props.accentColor}
          copy={copy}
          onZoomChange={setZoomLevel}
        />
      </div>
    )
  } else {
    preview = (
      <div className="building-workspace-preview building-workspace-preview-solo" style={canvasBackdropStyle}>
        <div className="building-workspace-body building-workspace-body-fill">{bodyPreview}</div>
      </div>
    )
  }

  const zoomControlsEnabled = hasIndoorMap && effectivePreviewMode === 'dual'

  return (
    <div className="building-workspace-pane h-full">
      <div className="building-workspace-board">
        <div className="building-workspace-toolbar" role="toolbar" aria-label={copy.workspaceTitle}>
          <div className="building-workspace-tb-group">
            <button
              type="button"
              className="building-workspace-tb-btn"
              disabled={!zoomControlsEnabled}
              aria-label={props.viewportLabels.zoomOut}
              onClick={() => mapViewportRef.current?.zoomOut()}
            >
              −
            </button>
            <span className="building-workspace-tb-zoom">{props.viewportLabels.zoomLabel(zoomLevel)}</span>
            <button
              type="button"
              className="building-workspace-tb-btn"
              disabled={!zoomControlsEnabled}
              aria-label={props.viewportLabels.zoomIn}
              onClick={() => mapViewportRef.current?.zoomIn()}
            >
              +
            </button>
            <button
              type="button"
              className="building-workspace-tb-btn"
              disabled={!zoomControlsEnabled}
              aria-label={props.viewportLabels.fit}
              onClick={() => mapViewportRef.current?.fitToScreen()}
            >
              {copy.toolbarZoomFit}
            </button>
          </div>

          <div className="building-workspace-tb-group">
            <button type="button" className="building-workspace-tb-btn" aria-pressed={props.showGrid} onClick={props.onToggleGrid}>
              <Grid2x2 className="h-3.5 w-3.5" />
              {copy.toolbarGrid}
            </button>
          </div>

          {hasIndoorMap ? (
            <div className="building-workspace-tb-group" aria-label={copy.workspaceTitle}>
              <button
                type="button"
                className="building-workspace-tb-btn"
                aria-pressed={previewMode === 'dual'}
                onClick={() => setPreviewMode('dual')}
              >
                {copy.toolbarPreviewDual}
              </button>
              <button
                type="button"
                className="building-workspace-tb-btn"
                aria-pressed={previewMode === 'solo'}
                onClick={() => setPreviewMode('solo')}
              >
                {copy.toolbarPreviewBody}
              </button>
            </div>
          ) : null}

          <div className="building-workspace-tb-grow" />
          {pathMeta ? <span className="building-workspace-tb-path">{pathMeta}</span> : null}
        </div>

        {preview}

        {footerHasContent ? (
          <div className={cx('building-workspace-footer', !footerSplit && 'building-workspace-footer-solo')}>
            {chain ? <div className="building-workspace-footer-section">{chain}</div> : null}
            {sidePanel ? (
              <div className="building-workspace-footer-section">
                {materials}
                {skins ? <div className={materials ? 'mt-3' : undefined}>{skins}</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
