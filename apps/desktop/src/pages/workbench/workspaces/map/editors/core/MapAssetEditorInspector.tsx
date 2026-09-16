import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Crosshair, FileOutput, Info, Paintbrush, Pencil, Trash2 } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  asMapPropertyString,
  getMapObjects,
  isLightMarkerObject,
  listPlacedLightItemOptions,
  mapObjectDisplayName,
  MapTilesetPalette,
  resolveMapObjectItemReference,
  resolveMapObjectLightIsOn,
  resolvePlacedItemQualifiedId,
  resolvePlacedObjectDisplayName,
  subscribeMapObjects,
  extractAnimationGroups,
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

import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { MapPropertiesEditor } from '../MapPatchInspectorPanels'
import { propertyEditMergeKey } from '../../model/mapHistoryStack'
import { matchTileToCatalogObject, scanPlacedFurniture, placedFurnitureLabel } from '../../model/mapObjectPick'
import { CardSection, MapAssetMapCards } from './MapAssetMapCards'
import { MapAnimationDialog } from './MapAnimationDialog'
import { MapTilePropertiesDialog } from './MapTilePropertiesDialog'
import { AnimatedTilePreview } from './AnimatedTilePreview'
import type { WarpDialogMapOption } from './WarpDialog'
import type { MapAssetLayerNameIssue, MapAssetTbinIssue } from '../../model/mapAssetReducer'
import { defaultTsxSourceForTileset, isValidTsxSource } from '../../model/mapTilesetSource'
import type { MapEditorCapabilities, MapEditorSaveState } from './useMapDocumentEditor'

export type MapAssetEditorInspectorProps = {
  documentState: {
    document: MapDocument
    /** Render document whose tileset imagePath values are loadable data URLs (used by the cell mini-map). */
    renderDocument: MapDocument
    assetPath: string
    isTmxAsset: boolean
  }
  selectionState: {
    activeLayer: MapLayer | null
    selectedTile: { x: number; y: number } | null
    selectedTileset: MapTileset | null
    selectedTileDefinitionProperties: Record<string, unknown>
    selectedObject: MapObject | null
    selectedObjectId: number | null
    paletteSelection: MapTilesetPaletteSelection | null
  }
  diagnostics: {
    tbinIssues: readonly MapAssetTbinIssue[]
    layerNameIssues: readonly MapAssetLayerNameIssue[]
    invalidTsxSourceTilesets: readonly MapTileset[]
    documentIssueCount: number
  }
  historyState: {
    undoStackLength: number
    redoStackLength: number
    saveState: MapEditorSaveState
  }
  capabilities: MapEditorCapabilities
  paletteState?: {
    /** Palette tab: current tileset selection (brush/stamp source). */
    selectionForPicker?: MapTilesetPaletteSelection | null
    /** Palette tab: project image options for the sheet picker. */
    projectImageOptions?: readonly MapTilesheetPickerProjectOption[]
  }
  environment?: {
    /** Game root used to resolve dynamically referenced vanilla sheets; null disables game-sheet entries. */
    gameRootPath?: string | null
    /** Light-item index for the marker item picker; null until game data loads. */
    objectLightIndex?: ObjectLightItemIndex | null
    /** Target-map choices for the warp dialog (localized names from the map catalog). */
    mapOptions?: readonly WarpDialogMapOption[]
    /** Loads a target map document for the warp destination preview. */
    loadTargetDocument?: (target: string) => Promise<MapDocument>
    locale?: LocaleCode
    theme?: ThemeMode
    accentColor?: string
  }
  actions: {
    setSelectedObjectId: (id: number | null) => void
    setActiveObjectGroupId: (id: number) => void
    updateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
    updateActiveLayer: (updates: Partial<MapLayer>) => void
    updateSelectedTileset: (updater: (tileset: MapTileset) => MapTileset) => void
    updateSelectedObject: (updates: Partial<MapObject>) => void
    /** Deletes one object by id; a no-op when the id does not exist. */
    deleteObject: (objectId: number) => void
    addTileDataObject: (point?: { x: number; y: number }) => void
    /** Selects an object and centers the canvas viewport on it. Omitted in session modes without object locate. */
    locateObject?: (object: MapObject) => void
    /** Centers the canvas viewport on a tile coordinate. Omitted in session modes without tile locate. */
    locateTile?: (tileX: number, tileY: number) => void
    /** Attaches a vanilla game sheet as a dynamic reference; omitted in session modes. */
    attachGameSheet?: ((sheet: VanillaTilesheetEntry) => void) | null
    /** Selects a layer in the layers panel (diagnostics "locate" action). */
    locateLayer?: (layerId: number) => void
    /** Reports the hovered inspector entry's canvas highlight (cells/objects); null clears it. */
    highlightInspector?: (target: MapInspectorHighlight | null) => void
    convertToTmx?: () => Promise<void>
    /** Palette tab: callback when the user picks a tile selection on the sheet. */
    paletteSelectionChange?: (selection: MapTilesetPaletteSelection | null) => void
    /** Palette tab: opens the project tilesheet import dialog. */
    paletteImportTilesheet?: (() => void) | null
    /** Palette tab: removes a tileset by name; omitted in session modes without tileset management. */
    paletteRemoveTileset?: ((name: string) => void) | null
    /** Palette tab: replaces a tileset's image. */
    paletteReplaceTilesetImage?: ((relativePath: string, replaceName: string) => void) | null
    /** Palette tab: requests the Inspector to switch to the tilesets tab for this sheet. */
    paletteEditTilesetInInspector?: ((name: string) => void) | null
    /** Palette tab: notifies the host that a sheet is being hovered in the gallery; null clears the preview. */
    hoverTileset?: ((imageSrc: string | null) => void) | null
    /** Palette tab: notifies the host that the gallery selection mode is active. */
    galleryModeChange?: ((active: boolean) => void) | null
  }
}

/**
 * Inspector aside for the map editor: a single always-on scrolling panel. The
 * semantic map cards (warps/doors/day-night/music), the selected light-source
 * details, the light-source list and tileset management stack in one column,
 * with the raw-properties collapsible on the advanced tab and the diagnostics
 * section pinned to the bottom of the aside. Every mutation is routed through
 * the `on*` callbacks; capability-gated sections are hidden when their
 * capability is disabled. Cell passability, water and planting rules moved to
 * the canvas overlay paint mode, so the inspector no longer shows a per-cell
 * section.
 */
export function MapAssetEditorInspector({
  documentState,
  selectionState,
  diagnostics,
  historyState,
  capabilities,
  paletteState,
  environment,
  actions,
}: MapAssetEditorInspectorProps) {
  const { document, renderDocument, assetPath, isTmxAsset } = documentState
  const {
    activeLayer,
    selectedTile,
    selectedTileset,
    selectedTileDefinitionProperties,
    selectedObject,
    selectedObjectId,
    paletteSelection,
  } = selectionState
  void historyState
  const { tbinIssues, layerNameIssues, invalidTsxSourceTilesets, documentIssueCount } = diagnostics
  const {
    setSelectedObjectId: onSetSelectedObjectId,
    setActiveObjectGroupId: onSetActiveObjectGroupId,
    updateDocument: onUpdateDocument,
    updateActiveLayer: onUpdateActiveLayer,
    updateSelectedTileset: onUpdateSelectedTileset,
    updateSelectedObject: onUpdateSelectedObject,
    deleteObject: onDeleteObject,
    addTileDataObject: onAddTileDataObject,
    locateObject: onLocateObject,
    locateTile: onLocateTile,
    attachGameSheet: onAttachGameSheet,
    locateLayer: onLocateLayer,
    highlightInspector: onHighlightInspector,
    convertToTmx: onConvertToTmx,
    paletteSelectionChange: onPaletteSelectionChange,
    paletteImportTilesheet: onPaletteImportTilesheet,
    paletteRemoveTileset: onPaletteRemoveTileset,
    paletteReplaceTilesetImage: onPaletteReplaceTilesetImage,
    paletteEditTilesetInInspector: onPaletteEditTilesetInInspector,
    hoverTileset: onHoverTileset,
    galleryModeChange: onGalleryModeChange,
  } = actions
  const { selectionForPicker: paletteSelectionForPicker = null, projectImageOptions: paletteProjectImageOptions = [] } = paletteState ?? {}
  const { gameRootPath = null, objectLightIndex = null, mapOptions, loadTargetDocument, locale, theme, accentColor } = environment ?? {}
  const copy = useMapAuthoringCopy().assetEditor

  /** Inspector tab: auto-switches to 'content' when an object is selected,
   *  but never overrides a manual switch away from it. */
  const [inspectorTab, setInspectorTab] = useState<'palette' | 'content' | 'advanced'>('palette')
  const [animationDialogOpen, setAnimationDialogOpen] = useState(false)
  const [tilePropsDialogOpen, setTilePropsDialogOpen] = useState(false)
  const lastSelectedObjectIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (selectedObjectId != null && selectedObjectId !== lastSelectedObjectIdRef.current) {
      lastSelectedObjectIdRef.current = selectedObjectId
      setInspectorTab('content')
    }
  }, [selectedObjectId])

  const markerItemOptions = listPlacedLightItemOptions(objectLightIndex)
  const allObjectEntries = document.objectGroups.flatMap((group) => group.objects.map((object) => ({ group, object })))
  const markerEntries = allObjectEntries.filter(({ object }) => isLightMarkerObject(object))
  // Plain `TileData` objects are per-cell property carriers (warp/door actions
  // and Tiled's own per-tile conventions). The game pipeline dissolves them
  // into tile properties on load — they are implementation, not content — so
  // they never surface as object rows; the semantic cards own their editing.
  const plainObjectEntries = allObjectEntries.filter(({ object }) => !isLightMarkerObject(object) && object.name !== 'TileData')

  // Subscribe to the catalog registry so scanning re-runs when game furniture loads.
  const catalogObjects = useSyncExternalStore(subscribeMapObjects, getMapObjects)
  const placedFurniture = scanPlacedFurniture(document, catalogObjects)

  /** Content-tab counts: animations across tilesets, and the merged object section's total + visibility. */
  const animationGroupCount = document.tilesets.reduce((count, tileset) => count + extractAnimationGroups(tileset).length, 0)
  const objectTotalCount = markerEntries.length + plainObjectEntries.length + placedFurniture.length
  const objectSectionVisible =
    (capabilities.objectGroups && (markerEntries.length > 0 || plainObjectEntries.length > 0 || selectedTile != null)) ||
    placedFurniture.length > 0
  // Subgroup titles (lights/objects/furniture) only matter when several kinds
  // mix in one section; a lone kind would just echo the section title. Light
  // markers expand into the section's detail block when selected, so the
  // marker's own row leaves the flat list until the selection clears.
  const selectedIsMarker = selectedObject != null && isLightMarkerObject(selectedObject)
  const listMarkerEntries = markerEntries.filter(({ object }) => object.id !== selectedObjectId)
  const markerSubgroupVisible = Boolean(capabilities.objectGroups && (listMarkerEntries.length > 0 || selectedIsMarker))
  const objectSubgroupVisible = Boolean(capabilities.objectGroups && plainObjectEntries.length > 0)
  const furnitureSubgroupVisible = placedFurniture.length > 0
  const showObjectSubgroups = [markerSubgroupVisible, objectSubgroupVisible, furnitureSubgroupVisible].filter(Boolean).length > 1

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

  /** Plain-object row label: the matched catalog furniture's name when the object carries a gid, else the generic label. */
  function plainObjectLabel(object: MapObject) {
    const matched = object.gid ? matchTileToCatalogObject(object.gid, document.tilesets) : null
    return matched ? mapObjectDisplayName(matched, locale ?? 'en-US') : objectLabel(object)
  }

  /** Plain-object row subline: tile position and size, e.g. "6, 6 · 1×1". */
  function plainObjectMeta(object: MapObject) {
    return `${Math.round(object.x / document.tileWidth)}, ${Math.round(object.y / document.tileHeight)} · ${Math.round(
      object.width / document.tileWidth,
    )}\u00d7${Math.round(object.height / document.tileHeight)}`
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

  /** Expanded editor for the selected light marker, rendered inside its object section (never duplicated as a row). */
  const selectedObjectDetails = selectedObject ? (
    <section className="map-asset-object-details">
      <div className="map-asset-object-details-head">
        <strong className="map-concept-info-anchor">
          {objectLabel(selectedObject)}
          <Info className="map-concept-info-icon" aria-hidden="true" />
          <span className="map-concept-info-tooltip" role="tooltip">
            {copy.markerGameExportHint}
            <br />
            {copy.markerDragHint}
          </span>
        </strong>
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
            onClick={() => onDeleteObject(selectedObject.id)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
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
    </section>
  ) : null
  const inspectorTabs: Array<{
    id: typeof inspectorTab
    label: string
    visible: boolean
    hasBadge: boolean
  }> = [
    {
      id: 'palette',
      label: copy.paletteTab,
      visible: Boolean(onPaletteSelectionChange),
      hasBadge: paletteSelectionForPicker != null,
    },
    {
      id: 'content',
      label: copy.inspectorTabContent,
      visible: capabilities.mapProperties || capabilities.objectGroups || capabilities.cellProperties || capabilities.tilesetManagement,
      hasBadge: selectedObjectId != null,
    },
    {
      id: 'advanced',
      label: copy.inspectorTabAdvanced,
      visible: true,
      hasBadge: false,
    },
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
            data-guide={tab.id === 'content' ? 'map-inspector-map' : undefined}
            onClick={() => setInspectorTab(tab.id)}
          >
            {tab.label}
            {tab.hasBadge && effectiveTab !== tab.id ? <span className="map-asset-inspector-tab-badge" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <div className="map-asset-inspector-content">
        {effectiveTab === 'palette' && onPaletteSelectionChange ? (
          <div className="map-asset-palette-tab">
            <MapTilesetPalette
              document={renderDocument}
              locale={locale ?? 'en-US'}
              selection={paletteSelectionForPicker}
              onSelectionChange={onPaletteSelectionChange}
              gameRootPath={gameRootPath}
              onAttachGameSheet={onAttachGameSheet}
              projectImageOptions={paletteProjectImageOptions}
              onImportTilesheet={onPaletteImportTilesheet}
              onRemoveTileset={onPaletteRemoveTileset}
              onReplaceTilesetImage={onPaletteReplaceTilesetImage}
              onEditTilesetInInspector={onPaletteEditTilesetInInspector}
              onHoverTileset={onHoverTileset}
              onGalleryModeChange={onGalleryModeChange}
            />
            {capabilities.tilesetManagement && paletteSelection && selectedTileset ? (
              <div className="map-asset-palette-tile-editor">
                <button type="button" className="control-button" onClick={() => setTilePropsDialogOpen(true)}>
                  {copy.tileDefinitionProperties(paletteSelection.startIndex)}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {effectiveTab === 'content' ? (
          <div className="map-asset-content-tab">
            {capabilities.mapProperties && mapOptions && loadTargetDocument && locale && theme && accentColor ? (
              <MapAssetMapCards
                document={document}
                renderDocument={renderDocument}
                onUpdateDocument={onUpdateDocument}
                activeLayer={capabilities.layerManagement ? activeLayer : null}
                mapOptions={mapOptions}
                loadTargetDocument={loadTargetDocument}
                onHighlightInspector={onHighlightInspector}
                gameRootPath={gameRootPath}
                locale={locale}
                theme={theme}
                accentColor={accentColor}
              />
            ) : null}
            {capabilities.tilesetManagement ? (
              <CardSection
                title={copy.inspectorTabAnimations}
                countLabel={animationGroupCount > 0 ? String(animationGroupCount) : null}
                addAction={{
                  label: copy.animationManageAction,
                  onClick: () => setAnimationDialogOpen(true),
                  icon: <Pencil className="h-3.5 w-3.5" aria-hidden="true" />,
                }}
              >
                <AnimationGroupList
                  document={document}
                  renderDocument={renderDocument}
                  copy={copy}
                  locale={locale ?? 'en-US'}
                  gameRootPath={gameRootPath}
                  onUseTile={
                    onPaletteSelectionChange
                      ? (tilesetName, tileId, width, height) => {
                          onPaletteSelectionChange({
                            tilesetName,
                            startIndex: tileId,
                            width,
                            height,
                          })
                          setInspectorTab('palette')
                        }
                      : undefined
                  }
                />
              </CardSection>
            ) : null}
            {objectSectionVisible ? (
              <CardSection
                title={copy.objectsTitle}
                countLabel={objectTotalCount > 0 ? String(objectTotalCount) : null}
                addAction={
                  capabilities.objectGroups
                    ? {
                        label: selectedTile ? copy.addTileData : copy.addTileDataDisabledNoCell,
                        onClick: () => onAddTileDataObject(),
                        disabled: !selectedTile,
                      }
                    : undefined
                }
              >
                {markerSubgroupVisible ? (
                  <>
                    {showObjectSubgroups ? <div className="map-asset-subgroup">{copy.markersTitle}</div> : null}
                    {selectedIsMarker ? selectedObjectDetails : null}
                    <div className="map-asset-object-list">
                      {listMarkerEntries.map(({ group, object }) => (
                        <ContextMenu.Root key={object.id}>
                          <ContextMenu.Trigger asChild>
                            <div
                              className="map-asset-object-row"
                              onPointerEnter={() =>
                                onHighlightInspector?.({
                                  tileRects: [],
                                  objectIds: [object.id],
                                })
                              }
                              onPointerLeave={() => onHighlightInspector?.(null)}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  onSetActiveObjectGroupId(group.id)
                                  onSetSelectedObjectId(object.id)
                                }}
                              >
                                {markerLabel(object)}
                              </button>
                              <button
                                type="button"
                                className="icon-button is-danger"
                                aria-label={copy.deleteObject}
                                title={copy.deleteObject}
                                onClick={() => onDeleteObject(object.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
                              <ContextMenu.Item className="context-menu-item is-danger" onSelect={() => onDeleteObject(object.id)}>
                                {copy.deleteObject}
                              </ContextMenu.Item>
                            </ContextMenu.Content>
                          </ContextMenu.Portal>
                        </ContextMenu.Root>
                      ))}
                    </div>
                  </>
                ) : null}
                {objectSubgroupVisible ? (
                  <>
                    {showObjectSubgroups ? <div className="map-asset-subgroup">{copy.objectsTitle}</div> : null}
                    <div className="map-asset-object-list">
                      {plainObjectEntries.map(({ group, object }) => (
                        <ContextMenu.Root key={object.id}>
                          <ContextMenu.Trigger asChild>
                            <div
                              className="map-asset-object-row"
                              onPointerEnter={() =>
                                onHighlightInspector?.({
                                  tileRects: [],
                                  objectIds: [object.id],
                                })
                              }
                              onPointerLeave={() => onHighlightInspector?.(null)}
                            >
                              <button
                                type="button"
                                className="map-asset-object-row-label"
                                onClick={() => {
                                  onSetActiveObjectGroupId(group.id)
                                  onSetSelectedObjectId(object.id)
                                  onLocateObject?.(object)
                                }}
                              >
                                <span>{plainObjectLabel(object)}</span>
                                <span className="map-asset-object-row-pos">{plainObjectMeta(object)}</span>
                              </button>
                              <button
                                type="button"
                                className="icon-button is-danger"
                                aria-label={copy.deleteObject}
                                title={copy.deleteObject}
                                onClick={() => onDeleteObject(object.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
                              <ContextMenu.Item className="context-menu-item is-danger" onSelect={() => onDeleteObject(object.id)}>
                                {copy.deleteObject}
                              </ContextMenu.Item>
                            </ContextMenu.Content>
                          </ContextMenu.Portal>
                        </ContextMenu.Root>
                      ))}
                    </div>
                  </>
                ) : null}
                {furnitureSubgroupVisible ? (
                  <>
                    {showObjectSubgroups ? <div className="map-asset-subgroup">{copy.furnitureTitle}</div> : null}
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
              </CardSection>
            ) : null}
          </div>
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
                  onChange={(properties) =>
                    onUpdateActiveLayer({
                      properties: properties as Record<string, MapPropertyValue>,
                    })
                  }
                />
              </section>
            ) : null}
            {capabilities.tilesetManagement && selectedTileset ? (
              <section className="map-asset-tileset-details">
                <strong>{selectedTileset.name}</strong>
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
                        onChange={(event) =>
                          onUpdateSelectedTileset((tileset) => ({
                            ...tileset,
                            source: event.target.value,
                          }))
                        }
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
              </section>
            ) : null}
            <details className="map-asset-raw-toggle">
              <summary>{copy.mapCards.rawPropertiesToggle}</summary>
              <MapPropertiesEditor
                categorized
                properties={document.properties}
                onChange={(properties) =>
                  onUpdateDocument(
                    {
                      ...document,
                      properties: properties as Record<string, MapPropertyValue>,
                    },
                    propertyEditMergeKey('map-property', document.properties, properties as Record<string, unknown>),
                    copy.editMapProperties,
                  )
                }
              />
            </details>
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
      {capabilities.tilesetManagement && paletteSelection && selectedTileset ? (
        <MapTilePropertiesDialog
          open={tilePropsDialogOpen}
          onClose={() => setTilePropsDialogOpen(false)}
          tileId={paletteSelection.startIndex}
          tilesetName={selectedTileset.name}
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
      ) : null}
      <MapAnimationDialog
        open={animationDialogOpen}
        onClose={() => setAnimationDialogOpen(false)}
        document={document}
        renderDocument={renderDocument}
        locale={locale ?? 'en-US'}
        gameRootPath={gameRootPath}
        onUpdateTileset={(name, updater) => {
          const target = document.tilesets.find((tileset) => tileset.name === name)
          if (!target) return
          const next = updater(target)
          onUpdateDocument(
            {
              ...document,
              tilesets: document.tilesets.map((tileset) => (tileset.name === name ? next : tileset)),
            },
            `map-tileset:${name}:animation`,
            copy.editAnimation,
          )
        }}
      />
    </aside>
  )
}

/** Lists all animation groups across all tilesets with live animated previews. */
function AnimationGroupList({
  document,
  renderDocument,
  copy,
  locale,
  gameRootPath,
  onUseTile,
}: {
  document: MapDocument
  renderDocument: MapDocument
  copy: ReturnType<typeof useMapAuthoringCopy>['assetEditor']
  locale: LocaleCode
  gameRootPath: string | null
  onUseTile?: (tilesetName: string, tileId: number, width: number, height: number) => void
}) {
  const tilesetGroups = document.tilesets
    .map((tileset) => ({
      tileset,
      groups: extractAnimationGroups(tileset),
    }))
    .filter((entry) => entry.groups.length > 0)

  if (tilesetGroups.length === 0) {
    return <p className="map-asset-animation-tab-hint">{copy.animationListEmpty}</p>
  }

  return (
    <div className="map-asset-animation-list">
      {tilesetGroups.map(({ tileset, groups }) => (
        <div key={tileset.name} className="map-asset-animation-list-group">
          <div className="map-asset-subgroup">
            {tileset.name} · {copy.animationFrameCount(groups.length)}
          </div>
          <div className="map-asset-animation-list-items">
            {groups.map((group, index) => (
              <div key={index} className="map-asset-animation-list-item">
                <AnimatedTilePreview
                  document={renderDocument}
                  tileset={tileset}
                  group={group}
                  locale={locale}
                  gameRootPath={gameRootPath}
                  scale={2}
                />
                <div className="map-asset-animation-list-item-body">
                  <span className="map-asset-animation-list-item-id">#{group.ownerTileId}</span>
                  <span className="map-asset-animation-list-item-meta">
                    {group.width}x{group.height} · {group.frameCount}f · {group.duration}ms
                  </span>
                </div>
                {onUseTile ? (
                  <button
                    type="button"
                    className="icon-button map-asset-animation-list-item-use"
                    onClick={() => onUseTile(tileset.name, group.ownerTileId, group.width, group.height)}
                    aria-label={copy.animationDialogUseTile}
                    title={copy.animationDialogUseTile}
                  >
                    <Paintbrush className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
