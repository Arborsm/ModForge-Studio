import {
  Activity,
  Box,
  Layers,
  MousePointerSquareDashed,
  Settings2,
} from 'lucide-react'
import { useMemo } from 'react'
import type { FocusedMapObjectTarget, TileHoverInfo } from './MapViewport'
import type { EditorCopy, ModuleBlueprint, WorkspaceTone } from '../lib/editor-shell'
import type { GameDirectoryInfo } from '../lib/desktop'
import type { MapDocument, MapPropertyValue } from '../lib/maps/types'
import { useEditorCopy } from '../lib/app/localeContext'
import { GroupedObjectGroupList } from './panels/right/ObjectGroupList'
import { GroupedVisibilityList } from './panels/right/VisibilityList'
import {
  getObjectInteractionTag,
  getObjectPropertyKeys,
  getVisibilityGroupLabel,
  rankObjectForPreview,
  type ObjectGroupListItem,
  type VisibilityListItem,
} from './panels/right/shared'
import { AccordionSection } from './ui/AccordionSection'

type RightDockProps = {
  mapDocument: MapDocument | null
  hoverInfo: TileHoverInfo | null
  visibleLayerIds: number[]
  visibleObjectGroupIds: number[]
  onToggleLayer: (id: number) => void
  onToggleObjectGroup: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
  directoryInfo: GameDirectoryInfo | null
  workspaceStatus: {
    tone: WorkspaceTone
    message: string
  }
  moduleBlueprint?: ModuleBlueprint
}

function formatPropertyValue(value: MapPropertyValue, copy: EditorCopy) {
  if (typeof value === 'boolean') {
    return value ? copy.common.yes : copy.common.no
  }

  return String(value)
}

export default function RightDock({
  mapDocument,
  hoverInfo,
  visibleLayerIds,
  visibleObjectGroupIds,
  onToggleLayer,
  onToggleObjectGroup,
  onShowAllLayers,
  onHideAllLayers,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  onFocusObject,
  directoryInfo,
  workspaceStatus,
  moduleBlueprint,
}: RightDockProps) {
  const copy = useEditorCopy()
  const layerItems = useMemo<VisibilityListItem[]>(() => {
    if (!mapDocument) {
      return []
    }

    return mapDocument.layers.map((layer) => {
      const visible = visibleLayerIds.includes(layer.id)
      return {
        id: layer.id,
        name: layer.name,
        meta: `${layer.nonEmptyTiles} ${copy.rightDock.layerTiles}`,
        visible,
        active: visible,
        groupLabel: getVisibilityGroupLabel(layer.name, mapDocument.name),
        setVisible: (nextVisible) => {
          if (nextVisible !== visible) {
            onToggleLayer(layer.id)
          }
        },
      }
    })
  }, [copy.rightDock.layerTiles, mapDocument, onToggleLayer, visibleLayerIds])

  const objectGroupItems = useMemo<ObjectGroupListItem[]>(() => {
    if (!mapDocument) {
      return []
    }

    return mapDocument.objectGroups.map((group) => {
      const visible = visibleObjectGroupIds.includes(group.id)
      const pointCount = group.objects.filter((object) => object.width === 0 && object.height === 0).length
      const interactionCount = group.objects.filter((object) => Boolean(getObjectInteractionTag(object))).length
      return {
        id: group.id,
        name: group.name,
        visible,
        objectCount: group.objects.length,
        pointCount,
        interactionCount,
        propertyKeys: getObjectPropertyKeys(group),
        previewObjects: [...group.objects]
          .sort((left, right) => rankObjectForPreview(right) - rankObjectForPreview(left) || left.id - right.id)
          .slice(0, 4),
        group,
        groupLabel: getVisibilityGroupLabel(group.name, mapDocument.name),
        setVisible: (nextVisible) => {
          if (nextVisible !== visible) {
            onToggleObjectGroup(group.id)
          }
        },
      }
    })
  }, [mapDocument, onToggleObjectGroup, visibleObjectGroupIds])

  if (moduleBlueprint) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-panel)]">
        <div className="panel-header">
          <div>
            <p className="panel-title">{copy.center.moduleInspector}</p>
            <p className="panel-subtitle">{moduleBlueprint.inspectorTitle}</p>
          </div>
          <span className="dock-chip">{moduleBlueprint.state}</span>
        </div>
        <div className="panel-body space-y-4 p-3">
          <div className="panel-section-muted panel-section p-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{moduleBlueprint.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{moduleBlueprint.summary}</p>
          </div>
          <div className="space-y-2">
            {moduleBlueprint.bullets.map((bullet) => (
              <div
                key={bullet}
                className="panel-section-muted panel-section px-3 py-3 text-xs text-[var(--text-secondary)]"
              >
                {bullet}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            {moduleBlueprint.lanes.map((lane) => (
              <div key={lane} className="dock-chip justify-center rounded-lg py-2 text-center">
                {lane}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-panel)]">
      <div className="panel-header">
        <div>
          <p className="panel-title">{copy.rightDock.title}</p>
          <p className="panel-subtitle">{copy.rightDock.subtitle}</p>
        </div>
      </div>

      <div className="panel-body">
        <AccordionSection title={copy.rightDock.inspector} icon={<Settings2 className="h-4 w-4" />}>
          <div className="space-y-4 p-3">
            {mapDocument ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.dimensions}</span>
                    <strong className="metric-value">
                      {mapDocument.width} x {mapDocument.height}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.tileSize}</span>
                    <strong className="metric-value">
                      {mapDocument.tileWidth} x {mapDocument.tileHeight}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.tilesets}</span>
                    <strong className="metric-value">{mapDocument.tilesets.length}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.objectGroups}</span>
                    <strong className="metric-value">{mapDocument.objectGroups.length}</strong>
                  </div>
                </div>

                <div className="panel-section-muted panel-section px-3">
                  <div className="kv-row">
                    <span>{copy.common.path}</span>
                    <span>{mapDocument.relativePath}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.orientation}</span>
                    <span>{mapDocument.orientation}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.renderOrder}</span>
                    <span>{mapDocument.renderOrder}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.format}</span>
                    <span>{mapDocument.format.toUpperCase()}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="panel-empty-state">
                {copy.center.noSceneLoaded}
              </div>
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          title={copy.rightDock.layers}
          icon={<Layers className="h-4 w-4" />}
          action={
            <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
              <button type="button" onClick={onShowAllLayers}>
                {copy.controls.showAll}
              </button>
              <button type="button" onClick={onHideAllLayers}>
                {copy.controls.hideAll}
              </button>
            </div>
          }
        >
          {mapDocument ? (
            <GroupedVisibilityList
              items={layerItems}
              filterPlaceholder={copy.leftDock.filterPlaceholder}
              emptyMessage={copy.center.noSceneLoaded}
              variant="dock"
            />
          ) : (
            <div className="panel-empty-state">{copy.center.noSceneLoaded}</div>
          )}
        </AccordionSection>

        <AccordionSection
          title={copy.rightDock.objectGroups}
          icon={<Box className="h-4 w-4" />}
          action={
            <div className="flex gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
              <button type="button" onClick={onShowAllObjectGroups}>
                {copy.controls.showAll}
              </button>
              <button type="button" onClick={onHideAllObjectGroups}>
                {copy.controls.hideAll}
              </button>
            </div>
          }
        >
          {mapDocument ? (
            mapDocument.objectGroups.length ? (
              <GroupedObjectGroupList
                items={objectGroupItems}
                filterPlaceholder={copy.leftDock.filterPlaceholder}
                emptyMessage={copy.rightDock.noObjectGroups}
                focusedObjectTarget={focusedObjectTarget}
                onFocusObject={onFocusObject}
                variant="dock"
              />
            ) : (
              <div className="panel-empty-state">{copy.rightDock.noObjectGroups}</div>
            )
          ) : (
            <div className="panel-empty-state">{copy.center.noSceneLoaded}</div>
          )}
        </AccordionSection>

        <AccordionSection title={copy.rightDock.hoverProbe} icon={<MousePointerSquareDashed className="h-4 w-4" />}>
          <div className="space-y-4 p-3">
            {hoverInfo ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.tile}</span>
                    <strong className="metric-value">
                      {hoverInfo.tileX}, {hoverInfo.tileY}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.pixel}</span>
                    <strong className="metric-value">
                      {hoverInfo.pixelX}, {hoverInfo.pixelY}
                    </strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.gid}</span>
                    <strong className="metric-value">{hoverInfo.gid ?? copy.common.none}</strong>
                  </div>
                </div>

                <div className="panel-section-muted panel-section px-3">
                  <div className="kv-row">
                    <span>{copy.common.layer}</span>
                    <span>{hoverInfo.layerName ?? copy.common.none}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.tileId}</span>
                    <span>{hoverInfo.tileId ?? copy.common.none}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.common.tilesets}</span>
                    <span>{hoverInfo.tilesetName ?? copy.common.none}</span>
                  </div>
                </div>

                <div className="panel-section-muted panel-section p-3">
                  <p className="panel-section-title tracking-[0.16em]">
                    {copy.common.tileProperties}
                  </p>
                  <div className="mt-2 space-y-2">
                    {hoverInfo.tileProperties && Object.keys(hoverInfo.tileProperties).length ? (
                      Object.entries(hoverInfo.tileProperties).map(([key, value]) => (
                        <div key={key} className="kv-row py-1.5">
                          <span>{key}</span>
                          <span>{formatPropertyValue(value, copy)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-secondary)]">{copy.rightDock.noTileProperties}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {hoverInfo.objectHits.length ? (
                    hoverInfo.objectHits.map((object) => (
                      <div
                        key={`${object.groupName}:${object.id}`}
                        className="panel-section-muted panel-section p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              {object.name || copy.common.objectLabel(object.id)}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">{object.groupName}</p>
                          </div>
                          <span className="dock-chip">{object.type || copy.common.none}</span>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                          <p>
                            {copy.common.bounds}: {object.x}, {object.y} / {object.width} x {object.height}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="panel-empty-state py-4">
                      {copy.rightDock.noHoveredObjects}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="panel-empty-state">
                {copy.viewportLabels.loadPrompt}
              </div>
            )}
          </div>
        </AccordionSection>

        <AccordionSection title={copy.rightDock.diagnostics} icon={<Activity className="h-4 w-4" />}>
          <div className="space-y-4 p-3">
            {directoryInfo ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.visibleLayers}</span>
                    <strong className="metric-value">{visibleLayerIds.length}</strong>
                  </div>
                  <div className="metric-card">
                    <span className="metric-label">{copy.common.visibleObjects}</span>
                    <strong className="metric-value">{visibleObjectGroupIds.length}</strong>
                  </div>
                </div>

                <div className="panel-section-muted panel-section px-3">
                  <div className="kv-row">
                    <span>{copy.common.executable}</span>
                    <span>{directoryInfo.executablePath}</span>
                  </div>
                  <div className="kv-row">
                    <span>{copy.leftDock.preferredMaps}</span>
                    <span>{directoryInfo.mapsPath ?? copy.common.none}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="panel-empty-state">
                {copy.rightDock.diagnosticsPrompt}
              </div>
            )}

            <div className="panel-section-muted panel-section p-3">
              <p className="panel-section-title tracking-[0.16em]">
                {copy.rightDock.workspaceStatus}
              </p>
              <span className={`mt-2 inline-flex status-pill status-pill-${workspaceStatus.tone}`}>
                {copy.statusTone[workspaceStatus.tone]}
              </span>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {workspaceStatus.message || copy.statusTone.idle}
              </p>
            </div>
          </div>
        </AccordionSection>
      </div>
    </div>
  )
}
