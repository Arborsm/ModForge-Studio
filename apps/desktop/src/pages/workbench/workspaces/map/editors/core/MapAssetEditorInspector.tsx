import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Crosshair, FileOutput, Plus, Trash2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  asMapPropertyString,
  findTilesetForGid,
  getMapObjects,
  isLightMarkerObject,
  listPlacedLightItemOptions,
  mapObjectDisplayName,
  MapTilesheetPicker,
  MapTilesetPalette,
  resolveMapObjectItemReference,
  resolveMapObjectLightIsOn,
  resolvePlacedItemQualifiedId,
  resolvePlacedObjectDisplayName,
  stripTileGidFlags,
  subscribeMapObjects,
  type MapDocument,
  type MapInspectorHighlight,
  type MapLayer,
  type MapObject,
  type MapPropertyValue,
  type MapTileset,
  type MapTilesetPaletteSelection,
  type MapTilesheetPickerProjectOption,
  type ObjectLightItemIndex,
  type VanillaTilesheetEntry,
} from '@entities/map'
import { type ResourceBrowserOption, ResourcePicker } from '@features/resource-browser'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { MapPropertiesEditor } from '../MapPatchInspectorPanels'
import { propertyEditMergeKey } from '../../model/mapHistoryStack'
import { matchTileToCatalogObject, scanPlacedFurniture, placedFurnitureLabel } from '../../model/mapObjectPick'
import { MapAssetMapCards } from './MapAssetMapCards'
import { AnimationFrameEditor } from './AnimationFrameEditor'
import type { WarpDialogMapOption } from './WarpDialog'
import type { MapAssetLayerNameIssue, MapAssetTbinIssue } from '../../model/mapAssetReducer'
import { defaultTsxSourceForTileset, isValidTsxSource } from '../../model/mapTilesetSource'
import type { MapEditorCapabilities, MapEditorSaveState } from './useMapDocumentEditor'

export type MapAssetEditorInspectorProps = {
  document: MapDocument
  /** Render document whose tileset imagePath values are loadable data URLs (used by the cell mini-map). */
  renderDocument: MapDocument
  assetPath: string
  activeLayer: MapLayer | null
  selectedTile: { x: number; y: number } | null
  selectedTileset: MapTileset | null
  selectedTileDefinitionProperties: Record<string, unknown>
  selectedObject: MapObject | null
  selectedObjectId: number | null
  paletteSelection: MapTilesetPaletteSelection | null
  tilesetOptions: ResourceBrowserOption[]
  isTmxAsset: boolean
  tbinIssues: readonly MapAssetTbinIssue[]
  layerNameIssues: readonly MapAssetLayerNameIssue[]
  invalidTsxSourceTilesets: readonly MapTileset[]
  documentIssueCount: number
  undoStackLength: number
  redoStackLength: number
  saveState: MapEditorSaveState
  capabilities: MapEditorCapabilities
  onSetSelectedObjectId: (id: number | null) => void
  onSetActiveObjectGroupId: (id: number) => void
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  onUpdateActiveLayer: (updates: Partial<MapLayer>) => void
  onUpdateSelectedTileset: (updater: (tileset: MapTileset) => MapTileset) => void
  onUpdateSelectedObject: (updates: Partial<MapObject>) => void
  onDeleteSelectedObject: () => void
  onAddTileDataObject: (point?: { x: number; y: number }) => void
  /** Selects an object and centers the canvas viewport on it. Omitted in session modes without object locate. */
  onLocateObject?: (object: MapObject) => void
  /** Centers the canvas viewport on a tile coordinate. Omitted in session modes without tile locate. */
  onLocateTile?: (tileX: number, tileY: number) => void
  onAddTileset: (relativePath: string, replaceName?: string) => Promise<void>
  /** Attaches a vanilla game sheet as a dynamic reference; omitted in session modes. */
  onAttachGameSheet?: ((sheet: VanillaTilesheetEntry) => void) | null
  /** Game root used to resolve dynamically referenced vanilla sheets; null disables game-sheet entries. */
  gameRootPath?: string | null
  /** Light-item index for the marker item picker; null until game data loads. */
  objectLightIndex?: ObjectLightItemIndex | null
  /** Target-map choices for the warp dialog (localized names from the map catalog). */
  mapOptions?: readonly WarpDialogMapOption[]
  /** Loads a target map document for the warp destination preview. */
  loadTargetDocument?: (target: string) => Promise<MapDocument>
  /** Selects a layer in the layers panel (diagnostics "locate" action). */
  onLocateLayer?: (layerId: number) => void
  /** Reports the hovered inspector entry's canvas highlight (cells/objects); null clears it. */
  onHighlightInspector?: (target: MapInspectorHighlight | null) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  onConvertToTmx?: () => Promise<void>
  /** Palette tab: current tileset selection (brush/stamp source). */
  paletteSelectionForPicker?: MapTilesetPaletteSelection | null
  /** Palette tab: callback when the user picks a tile selection on the sheet. */
  onPaletteSelectionChange?: (selection: MapTilesetPaletteSelection | null) => void
  /** Palette tab: project image options for the sheet picker. */
  paletteProjectImageOptions?: readonly MapTilesheetPickerProjectOption[]
  /** Palette tab: attaches a project image as a new tileset. */
  onPaletteAddProjectImage?: ((relativePath: string) => void) | null
  /** Palette tab: removes a tileset by name; omitted in session modes without tileset management. */
  onPaletteRemoveTileset?: ((name: string) => void) | null
  /** Palette tab: replaces a tileset's image. */
  onPaletteReplaceTilesetImage?: ((relativePath: string, replaceName: string) => void) | null
  /** Palette tab: requests the Inspector to switch to the tilesets tab for this sheet. */
  onPaletteEditTilesetInInspector?: ((name: string) => void) | null
  /** Palette tab: notifies the host that a sheet is being hovered in the gallery; null clears the preview. */
  onHoverTileset?: ((imageSrc: string | null) => void) | null
  /** Palette tab: notifies the host that the gallery selection mode is active. */
  onGalleryModeChange?: ((active: boolean) => void) | null
}

/**
 * Inspector aside for the map editor: a single always-on scrolling panel. The
 * semantic map cards (warps/doors/day-night/music), the selected light-source
 * details, the light-source list and tileset management stack in one column,
 * with the raw-properties collapsible as the last item and the diagnostics
 * section pinned to the bottom of the aside. Every mutation is routed through
 * the `on*` callbacks; capability-gated sections are hidden when their
 * capability is disabled. Cell passability, water and planting rules moved to
 * the canvas overlay paint mode, so the inspector no longer shows a per-cell
 * section.
 */
export function MapAssetEditorInspector({
  document,
  renderDocument,
  assetPath,
  activeLayer,
  selectedTile,
  selectedTileset,
  selectedTileDefinitionProperties,
  selectedObject,
  selectedObjectId,
  paletteSelection,
  tilesetOptions,
  isTmxAsset,
  tbinIssues,
  layerNameIssues,
  invalidTsxSourceTilesets,
  documentIssueCount,
  capabilities,
  onSetSelectedObjectId,
  onSetActiveObjectGroupId,
  onUpdateDocument,
  onUpdateActiveLayer,
  onUpdateSelectedTileset,
  onUpdateSelectedObject,
  onDeleteSelectedObject,
  onAddTileDataObject,
  onLocateObject,
  onLocateTile,
  onAddTileset,
  onAttachGameSheet,
  gameRootPath = null,
  objectLightIndex = null,
  mapOptions,
  loadTargetDocument,
  onLocateLayer,
  onHighlightInspector,
  locale,
  theme,
  accentColor,
  onConvertToTmx,
  paletteSelectionForPicker = null,
  onPaletteSelectionChange,
  paletteProjectImageOptions = [],
  onPaletteAddProjectImage = null,
  onPaletteRemoveTileset = null,
  onPaletteReplaceTilesetImage = null,
  onPaletteEditTilesetInInspector = null,
  onHoverTileset = null,
  onGalleryModeChange = null,
}: MapAssetEditorInspectorProps) {
  const copy = useMapAuthoringCopy().assetEditor

  /** Inspector tab: auto-switches to 'objects' when an object is selected and
   *  to 'tilesets' when a tileset is selected, but never overrides a manual
   *  switch away from those tabs. */
  const [inspectorTab, setInspectorTab] = useState<'palette' | 'map' | 'objects' | 'tilesets' | 'advanced'>('palette')
  const lastSelectedObjectIdRef = useRef<number | null>(null)
  const lastSelectedTilesetRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedObjectId != null && selectedObjectId !== lastSelectedObjectIdRef.current) {
      lastSelectedObjectIdRef.current = selectedObjectId
      setInspectorTab('objects')
    }
  }, [selectedObjectId])
  useEffect(() => {
    const tilesetName = selectedTileset?.name ?? null
    if (tilesetName != null && tilesetName !== lastSelectedTilesetRef.current) {
      lastSelectedTilesetRef.current = tilesetName
      setInspectorTab('tilesets')
    }
  }, [selectedTileset?.name])

  const markerItemOptions = listPlacedLightItemOptions(objectLightIndex)
  const allObjectEntries = document.objectGroups.flatMap((group) => group.objects.map((object) => ({ group, object })))
  const markerEntries = allObjectEntries.filter(({ object }) => isLightMarkerObject(object))
  const nonMarkerEntries = allObjectEntries.filter(({ object }) => !isLightMarkerObject(object))

  // Subscribe to the catalog registry so scanning re-runs when game furniture loads.
  const catalogObjects = useSyncExternalStore(subscribeMapObjects, getMapObjects)
  const placedFurniture = useMemo(() => scanPlacedFurniture(document, catalogObjects), [document, catalogObjects])

  /** Beginner-facing marker label: localized item name, custom name, or a numbered fallback. */
  function markerLabel(object: MapObject) {
    return (
      resolvePlacedObjectDisplayName(object, objectLightIndex) ??
      (object.name && object.name !== 'TileData' ? object.name : copy.plainMarker(object.id))
    )
  }

  /** Label for any object type: name/type or generic fallback. */
  function objectLabel(object: MapObject) {
    if (isLightMarkerObject(object)) return markerLabel(object)
    if (object.name && object.name !== 'TileData') return object.name
    if (object.type) return object.type
    return copy.genericObject(object.id)
  }
  const selectedObjectReference = selectedObject ? resolveMapObjectItemReference(selectedObject) : null
  const selectedObjectQualifiedId =
    selectedObjectReference && objectLightIndex ? resolvePlacedItemQualifiedId(selectedObjectReference, objectLightIndex) : null
  const selectedObjectLit = selectedObject ? resolveMapObjectLightIsOn(selectedObject) : true

  /** Writes the picked light item onto the marker; picking none resets it to a plain marker. */
  function applyMarkerItem(qualifiedId: string) {
    if (!selectedObject || qualifiedId === (selectedObjectQualifiedId ?? '')) return
    const properties = { ...selectedObject.properties }
    if (qualifiedId) {
      properties.QualifiedItemId = qualifiedId
      onUpdateSelectedObject({ properties })
      return
    }
    delete properties.QualifiedItemId
    delete properties.ItemId
    onUpdateSelectedObject({ name: 'TileData', type: '', properties })
  }

  /** Toggles the marker's lit state; lit is the default, so unlit writes IsOn false. */
  function applyMarkerLit(lit: boolean) {
    if (!selectedObject) return
    const properties = { ...selectedObject.properties }
    if (lit) {
      delete properties.IsOn
    } else {
      properties.IsOn = 'false'
    }
    onUpdateSelectedObject({ properties })
  }

  /** Writes the marker's in-game light shape; picking the default clears the override. */
  function applyMarkerGameShape(textureIndex: string) {
    if (!selectedObject) return
    const properties = { ...selectedObject.properties }
    if (textureIndex) {
      properties.MFLightTexture = textureIndex
    } else {
      delete properties.MFLightTexture
    }
    onUpdateSelectedObject({ properties })
  }
  const inspectorTabs: Array<{ id: typeof inspectorTab; label: string; visible: boolean; hasBadge: boolean }> = [
    { id: 'palette', label: copy.paletteTab, visible: Boolean(onPaletteSelectionChange), hasBadge: paletteSelectionForPicker != null },
    { id: 'map', label: copy.inspectorTabMap, visible: capabilities.mapProperties, hasBadge: false },
    {
      id: 'objects',
      label: copy.inspectorTabObjects,
      visible: capabilities.objectGroups || capabilities.cellProperties,
      hasBadge: selectedObjectId != null,
    },
    { id: 'tilesets', label: copy.inspectorTabTilesets, visible: capabilities.tilesetManagement, hasBadge: selectedTileset != null },
    { id: 'advanced', label: copy.inspectorTabAdvanced, visible: true, hasBadge: false },
  ]
  const visibleTabs = inspectorTabs.filter((tab) => tab.visible)
  const activeTabVisible = visibleTabs.some((tab) => tab.id === inspectorTab)
  const effectiveTab = activeTabVisible ? inspectorTab : (visibleTabs[0]?.id ?? 'palette')
  return (
    <aside className="map-asset-inspector h-full">
      <div className="map-asset-inspector-tabs" role="tablist">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={effectiveTab === tab.id}
            className={cx('map-asset-inspector-tab', effectiveTab === tab.id && 'is-active')}
            data-guide={tab.id === 'map' ? 'map-inspector-map' : undefined}
            onClick={() => setInspectorTab(tab.id)}
          >
            {tab.label}
            {tab.hasBadge && effectiveTab !== tab.id ? <span className="map-asset-inspector-tab-badge" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <div className="map-asset-inspector-content">
        {effectiveTab === 'palette' && onPaletteSelectionChange ? (
          <MapTilesetPalette
            document={renderDocument}
            locale={locale ?? 'en-US'}
            selection={paletteSelectionForPicker}
            onSelectionChange={onPaletteSelectionChange}
            gameRootPath={gameRootPath}
            onAttachGameSheet={onAttachGameSheet}
            projectImageOptions={paletteProjectImageOptions}
            onAddProjectImage={onPaletteAddProjectImage}
            onRemoveTileset={onPaletteRemoveTileset}
            onReplaceTilesetImage={onPaletteReplaceTilesetImage}
            onEditTilesetInInspector={onPaletteEditTilesetInInspector}
            onHoverTileset={onHoverTileset}
            onGalleryModeChange={onGalleryModeChange}
          />
        ) : effectiveTab === 'map' ? (
          <>
            {capabilities.mapProperties && mapOptions && loadTargetDocument && locale && theme && accentColor ? (
              <MapAssetMapCards
                document={document}
                renderDocument={renderDocument}
                onUpdateDocument={onUpdateDocument}
                activeLayer={capabilities.layerManagement ? activeLayer : null}
                selectedTile={selectedTile}
                paletteSelection={paletteSelection}
                mapOptions={mapOptions}
                loadTargetDocument={loadTargetDocument}
                onHighlightInspector={onHighlightInspector}
                gameRootPath={gameRootPath}
                locale={locale}
                theme={theme}
                accentColor={accentColor}
              />
            ) : null}
            <details className="map-asset-raw-toggle">
              <summary>{copy.mapCards.rawPropertiesToggle}</summary>
              <MapPropertiesEditor
                categorized
                properties={document.properties}
                onChange={(properties) =>
                  onUpdateDocument(
                    { ...document, properties: properties as Record<string, MapPropertyValue> },
                    propertyEditMergeKey('map-property', document.properties, properties as Record<string, unknown>),
                    copy.editMapProperties,
                  )
                }
              />
            </details>
          </>
        ) : null}
        {effectiveTab === 'objects' ? (
          <>
            {selectedObject ? (
              <section className="map-asset-object-details">
                <div className="map-asset-object-details-head">
                  <strong>{objectLabel(selectedObject)}</strong>
                  <div className="map-asset-detail-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={copy.mapCards.locateObject}
                      title={copy.mapCards.locateObject}
                      onClick={() => onLocateObject?.(selectedObject)}
                    >
                      <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button is-danger"
                      aria-label={copy.deleteObject}
                      title={copy.deleteObject}
                      onClick={onDeleteSelectedObject}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {isLightMarkerObject(selectedObject) ? (
                  <>
                    <label>
                      <span>{copy.markerItem}</span>
                      <CompactSelect
                        value={selectedObjectQualifiedId ?? ''}
                        options={[
                          { value: '', label: copy.markerItemNone },
                          ...markerItemOptions.map((option) => ({
                            value: option.qualifiedItemId,
                            label: option.label,
                            description: option.description,
                          })),
                        ]}
                        onChange={applyMarkerItem}
                        ariaLabel={copy.markerItem}
                        placement="bottom-start"
                      />
                    </label>
                    {selectedObjectQualifiedId ? (
                      <label className="map-asset-checkbox">
                        <input type="checkbox" checked={selectedObjectLit} onChange={(event) => applyMarkerLit(event.target.checked)} />
                        <span>{copy.markerLit}</span>
                      </label>
                    ) : null}
                    <label>
                      <span>{copy.markerGameShape}</span>
                      <CompactSelect
                        value={asMapPropertyString(selectedObject.properties.MFLightTexture)}
                        options={[
                          { value: '', label: copy.markerGameShapeDefault },
                          ...[1, 2, 4, 5, 6, 7, 8, 9, 10].map((textureIndex) => ({
                            value: String(textureIndex),
                            label: copy.markerGameShapeOption(textureIndex),
                            description: `#${textureIndex}`,
                          })),
                        ]}
                        onChange={applyMarkerGameShape}
                        ariaLabel={copy.markerGameShape}
                        placement="bottom-start"
                      />
                    </label>
                    <p>{copy.markerGameExportHint}</p>
                    <p>{copy.markerDragHint}</p>
                  </>
                ) : (
                  <ObjectCatalogMatch object={selectedObject} tilesets={document.tilesets} locale={locale ?? 'en-US'} copy={copy} />
                )}
              </section>
            ) : (
              <p>{copy.selectCell}</p>
            )}
            {capabilities.cellProperties && activeLayer && selectedTile && !selectedObject
              ? (() => {
                  const cellIndex = selectedTile.y * activeLayer.width + selectedTile.x
                  const baseGid = stripTileGidFlags(activeLayer.gids[cellIndex] ?? 0)
                  const candidateTileset = baseGid > 0 ? findTilesetForGid(document.tilesets, baseGid) : null
                  const owningTileset =
                    candidateTileset && baseGid < candidateTileset.firstGid + candidateTileset.tileCount ? candidateTileset : null
                  const frames = activeLayer.cellAnimations?.[cellIndex] ?? []
                  if (frames.length === 0 && !owningTileset) return null
                  // When the cell has no tile but does have animation frames, we need
                  // a tileset for the frame thumbnails. Fall back to the first tileset;
                  // when there are no tilesets at all, the editor cannot render.
                  const fallbackTileset = owningTileset ?? document.tilesets[0]
                  if (!fallbackTileset) return null
                  return (
                    <AnimationFrameEditor
                      renderDocument={renderDocument}
                      tileset={fallbackTileset}
                      tileId={owningTileset ? baseGid - owningTileset.firstGid : 0}
                      frames={frames}
                      locale={locale ?? 'en-US'}
                      gameRootPath={gameRootPath}
                      onChange={(nextFrames) => {
                        const cellAnimations = { ...activeLayer.cellAnimations }
                        if (nextFrames.length) cellAnimations[cellIndex] = nextFrames
                        else delete cellAnimations[cellIndex]
                        onUpdateActiveLayer({ cellAnimations })
                      }}
                    />
                  )
                })()
              : null}
            {capabilities.objectGroups ? (
              <>
                <header>
                  <strong>{copy.markersTitle}</strong>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={copy.addTileData}
                    title={selectedTile ? copy.addTileData : copy.addTileDataDisabledNoCell}
                    disabled={!selectedTile}
                    onClick={() => onAddTileDataObject()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </header>
                {!selectedTile ? <p>{copy.addTileDataHint}</p> : null}
                <div className="map-asset-object-list">
                  {markerEntries.map(({ group, object }) => (
                    <div
                      key={object.id}
                      className="map-asset-object-row"
                      onPointerEnter={() => onHighlightInspector?.({ tileRects: [], objectIds: [object.id] })}
                      onPointerLeave={() => onHighlightInspector?.(null)}
                    >
                      <button
                        type="button"
                        className={cx(selectedObjectId === object.id && 'is-active')}
                        onClick={() => {
                          onSetActiveObjectGroupId(group.id)
                          onSetSelectedObjectId(object.id)
                        }}
                      >
                        {markerLabel(object)}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={copy.mapCards.locateObject}
                        title={copy.mapCards.locateObject}
                        onClick={() => {
                          onSetActiveObjectGroupId(group.id)
                          onSetSelectedObjectId(object.id)
                          onLocateObject?.(object)
                        }}
                      >
                        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                {!selectedObject && markerEntries.length > 0 ? <p>{copy.selectObject}</p> : null}
              </>
            ) : null}
            {capabilities.objectGroups && nonMarkerEntries.length > 0 ? (
              <>
                <header>
                  <strong>{copy.objectsTitle}</strong>
                </header>
                <div className="map-asset-object-list">
                  {nonMarkerEntries.map(({ group, object }) => (
                    <ContextMenu.Root key={object.id}>
                      <ContextMenu.Trigger asChild>
                        <div
                          className="map-asset-object-row"
                          onPointerEnter={() => onHighlightInspector?.({ tileRects: [], objectIds: [object.id] })}
                          onPointerLeave={() => onHighlightInspector?.(null)}
                        >
                          <button
                            type="button"
                            className={cx(selectedObjectId === object.id && 'is-active')}
                            onClick={() => {
                              onSetActiveObjectGroupId(group.id)
                              onSetSelectedObjectId(object.id)
                            }}
                          >
                            {objectLabel(object)}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={copy.mapCards.locateObject}
                            title={copy.mapCards.locateObject}
                            onClick={() => {
                              onSetActiveObjectGroupId(group.id)
                              onSetSelectedObjectId(object.id)
                              onLocateObject?.(object)
                            }}
                          >
                            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
                          <ContextMenu.Item
                            className="context-menu-item"
                            onSelect={() => {
                              onSetActiveObjectGroupId(group.id)
                              onSetSelectedObjectId(object.id)
                              onLocateObject?.(object)
                            }}
                          >
                            {copy.mapCards.locateObject}
                          </ContextMenu.Item>
                          <ContextMenu.Separator className="context-menu-separator" />
                          <ContextMenu.Item
                            className="context-menu-item is-danger"
                            onSelect={() => {
                              onSetActiveObjectGroupId(group.id)
                              onSetSelectedObjectId(object.id)
                              onDeleteSelectedObject()
                            }}
                          >
                            {copy.deleteObject}
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                  ))}
                </div>
              </>
            ) : null}
            {placedFurniture.length > 0 ? (
              <>
                <header>
                  <strong>{copy.furnitureTitle}</strong>
                </header>
                <div className="map-asset-object-list">
                  {placedFurniture.map((entry) => (
                    <ContextMenu.Root key={`${entry.catalogObject.id}\0${entry.tileX}\0${entry.tileY}\0${entry.layerName}`}>
                      <ContextMenu.Trigger asChild>
                        <div
                          className="map-asset-object-row"
                          onPointerEnter={() =>
                            onHighlightInspector?.({
                              tileRects: [
                                {
                                  x: entry.tileX,
                                  y: entry.tileY,
                                  width: entry.catalogObject.rect.width,
                                  height: entry.catalogObject.rect.height,
                                },
                              ],
                              objectIds: [],
                            })
                          }
                          onPointerLeave={() => onHighlightInspector?.(null)}
                        >
                          <button
                            type="button"
                            className="map-asset-furniture-row-label"
                            onClick={() => onLocateTile?.(entry.tileX, entry.tileY)}
                          >
                            <span>{placedFurnitureLabel(entry, locale ?? 'en-US')}</span>
                            <span className="map-asset-furniture-row-pos">
                              {copy.furniturePosition(entry.tileX, entry.tileY, entry.layerName)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={copy.mapCards.locateObject}
                            title={copy.mapCards.locateObject}
                            onClick={() => onLocateTile?.(entry.tileX, entry.tileY)}
                          >
                            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
                          <ContextMenu.Item className="context-menu-item" onSelect={() => onLocateTile?.(entry.tileX, entry.tileY)}>
                            {copy.mapCards.locateObject}
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
        {effectiveTab === 'tilesets' && capabilities.tilesetManagement ? (
          <>
            <header>
              <strong>{copy.tilesetsTitle}</strong>
            </header>
            <MapTilesheetPicker
              attachedTilesets={document.tilesets}
              projectImageOptions={tilesetOptions.map((option) => ({ value: option.value, label: option.label }))}
              gameSheetsEnabled={gameRootPath !== null}
              onPickGameSheet={onAttachGameSheet ?? undefined}
              onPickProjectImage={(relativePath) => void onAddTileset(relativePath)}
              triggerLabel={
                <>
                  <Plus className="h-3.5 w-3.5" />
                  {copy.addTileset}
                </>
              }
              triggerTitle={copy.addTileset}
              triggerClassName="control-button"
            />
            {selectedTileset ? (
              <section className="map-asset-tileset-details">
                <strong>{selectedTileset.name}</strong>
                <ResourcePicker
                  value=""
                  label={copy.replaceTileset}
                  placeholder={copy.chooseImage}
                  options={tilesetOptions}
                  selectionMode="confirm"
                  triggerClassName="control-button"
                  triggerContent={copy.replaceTileset}
                  onSelect={(value) => void onAddTileset(value, selectedTileset.name)}
                />
                <details className="map-asset-raw-toggle">
                  <summary>{copy.mapCards.advancedTilesetToggle}</summary>
                  {isTmxAsset ? (
                    <label className="map-asset-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedTileset.source != null}
                        onChange={(event) =>
                          onUpdateSelectedTileset((tileset) => ({
                            ...tileset,
                            source: event.target.checked ? defaultTsxSourceForTileset(assetPath, selectedTileset.name) : null,
                          }))
                        }
                      />
                      <span>{copy.tilesetExternalTsx}</span>
                    </label>
                  ) : null}
                  {isTmxAsset && selectedTileset.source != null ? (
                    <>
                      <input
                        value={selectedTileset.source}
                        spellCheck={false}
                        onChange={(event) => onUpdateSelectedTileset((tileset) => ({ ...tileset, source: event.target.value }))}
                      />
                      {isValidTsxSource(selectedTileset.source) ? (
                        <p className="map-asset-tileset-source-hint">{copy.tilesetExternalTsxHint(selectedTileset.source)}</p>
                      ) : (
                        <p className="map-asset-tileset-source-invalid">{copy.tilesetExternalTsxInvalid}</p>
                      )}
                    </>
                  ) : null}
                  <strong>{copy.tilesetProperties}</strong>
                  <MapPropertiesEditor
                    properties={selectedTileset.properties}
                    onChange={(properties) =>
                      onUpdateSelectedTileset((tileset) => ({
                        ...tileset,
                        properties: properties as Record<string, MapPropertyValue>,
                      }))
                    }
                  />
                </details>
                {paletteSelection ? (
                  <>
                    <strong>{copy.tileDefinitionProperties(paletteSelection.startIndex)}</strong>
                    <MapPropertiesEditor
                      properties={selectedTileDefinitionProperties}
                      description={copy.tileDefinitionPropertiesHint}
                      onChange={(properties) =>
                        onUpdateSelectedTileset((tileset) => {
                          const tileProperties = { ...tileset.tileProperties }
                          if (Object.keys(properties).length === 0) delete tileProperties[paletteSelection.startIndex]
                          else tileProperties[paletteSelection.startIndex] = properties as Record<string, MapPropertyValue>
                          return { ...tileset, tileProperties }
                        })
                      }
                    />
                  </>
                ) : null}
                {paletteSelection ? (
                  <AnimationFrameEditor
                    renderDocument={renderDocument}
                    tileset={selectedTileset}
                    tileId={paletteSelection.startIndex}
                    frames={selectedTileset.animations[paletteSelection.startIndex] ?? []}
                    locale={locale ?? 'en-US'}
                    gameRootPath={gameRootPath}
                    onChange={(nextFrames) => {
                      const animations = { ...selectedTileset.animations }
                      if (nextFrames.length) animations[paletteSelection.startIndex] = nextFrames
                      else delete animations[paletteSelection.startIndex]
                      onUpdateDocument(
                        {
                          ...document,
                          tilesets: document.tilesets.map((candidate) =>
                            candidate.name === selectedTileset.name ? { ...candidate, animations } : candidate,
                          ),
                        },
                        `map-tileset:${selectedTileset.name}:animation:${paletteSelection.startIndex}`,
                        copy.editAnimation,
                      )
                    }}
                  />
                ) : null}
              </section>
            ) : (
              <p>{copy.selectTileset}</p>
            )}
          </>
        ) : null}
        {effectiveTab === 'advanced' ? (
          <>
            {activeLayer ? (
              <section className="map-asset-layer-details">
                <strong>{copy.layerDetails}</strong>
                <label>
                  <span>{copy.layerName}</span>
                  <input value={activeLayer.name} onChange={(event) => onUpdateActiveLayer({ name: event.target.value })} />
                </label>
                <MapPropertiesEditor
                  properties={activeLayer.properties}
                  description={copy.layerPropertiesHint}
                  onChange={(properties) => onUpdateActiveLayer({ properties: properties as Record<string, MapPropertyValue> })}
                />
              </section>
            ) : null}
            <section id="map-asset-diagnostics" className="map-asset-diagnostics">
              <header>
                <span className="lbl">{copy.diagnosticsTitle}</span>
                {documentIssueCount > 0 ? (
                  <span className="map-asset-diagnostics-badge is-error">{copy.diagnosticsErrors(documentIssueCount)}</span>
                ) : null}
              </header>
              {documentIssueCount === 0 ? (
                <p className="map-asset-diagnostics-clear">{copy.diagnosticsAllClear}</p>
              ) : (
                <>
                  {tbinIssues.map((issue) => (
                    <p key={issue} className="map-asset-diagnostics-row">
                      {copy.tbinIssues[issue]}
                    </p>
                  ))}
                  {tbinIssues.length > 0 ? <p className="map-asset-diagnostics-convert-hint">{copy.tbinConvertHint}</p> : null}
                  {tbinIssues.length > 0 ? (
                    <button
                      type="button"
                      className="control-button control-button-primary map-asset-diagnostics-convert-action"
                      onClick={() => void onConvertToTmx?.()}
                    >
                      <FileOutput className="h-3.5 w-3.5" />
                      {copy.tbinConvertAction}
                    </button>
                  ) : null}
                  {layerNameIssues.map((issue) => {
                    const locateLayerId =
                      issue.kind === 'empty' ? issue.id : (document.layers.find((layer) => layer.name === issue.name)?.id ?? null)
                    return (
                      <p
                        key={issue.kind === 'empty' ? `empty:${issue.id}` : `duplicate:${issue.name.toLowerCase()}`}
                        className="map-asset-diagnostics-row"
                      >
                        <span>{issue.kind === 'empty' ? copy.emptyLayerName(issue.id) : copy.duplicateLayerName(issue.name)}</span>
                        {locateLayerId != null && onLocateLayer ? (
                          <button
                            type="button"
                            className="map-asset-diagnostics-locate"
                            aria-label={copy.mapCards.diagnosticsLocate}
                            title={copy.mapCards.diagnosticsLocate}
                            onClick={() => onLocateLayer(locateLayerId)}
                          >
                            {copy.mapCards.diagnosticsLocate} ›
                          </button>
                        ) : null}
                      </p>
                    )
                  })}
                  {invalidTsxSourceTilesets.length > 0 ? (
                    <p className="map-asset-diagnostics-row">{copy.tilesetExternalTsxInvalid}</p>
                  ) : null}
                </>
              )}
              {documentIssueCount > 0 ? <footer>{copy.diagnosticsSaveBlockedNote}</footer> : null}
            </section>
          </>
        ) : null}
      </div>
    </aside>
  )
}

/**
 * Shows matched catalog object info for a non-light-marker object. If the
 * object has a gid, resolves it to a catalog entry and displays the furniture
 * name plus frame info (rotations, alternate state). For objects without a
 * gid match, shows basic position/size.
 */
function ObjectCatalogMatch({
  object,
  tilesets,
  locale,
  copy,
}: {
  object: MapObject
  tilesets: readonly MapTileset[]
  locale: string
  copy: ReturnType<typeof useMapAuthoringCopy>['assetEditor']
}) {
  const matched = object.gid ? matchTileToCatalogObject(object.gid, tilesets) : null
  if (!matched) {
    return (
      <p className="map-asset-object-details-meta">
        {`${Math.round(object.x / 16)}, ${Math.round(object.y / 16)} · ${Math.round(object.width / 16)}\u00d7${Math.round(object.height / 16)}`}
      </p>
    )
  }
  const name = mapObjectDisplayName(matched, locale)
  return (
    <>
      <p className="map-asset-object-details-meta">{copy.matchedFurniture(name)}</p>
      {matched.frameInfo ? (
        <p className="map-asset-object-details-meta">
          {copy.objectFrameInfo(matched.frameInfo.rotations, matched.frameInfo.hasAlternateState)}
        </p>
      ) : null}
    </>
  )
}
