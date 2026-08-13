import { Crosshair, FileOutput, Gamepad2, Plus, Trash2 } from 'lucide-react'
import {
  asMapPropertyString,
  findTilesetForGid,
  hasMixedFrameDurations,
  isLightMarkerObject,
  listPlacedLightItemOptions,
  resolveMapObjectItemReference,
  resolveMapObjectLightIsOn,
  resolvePlacedItemQualifiedId,
  resolvePlacedObjectDisplayName,
  stripTileGidFlags,
  type MapDocument,
  type MapInspectorHighlight,
  type MapLayer,
  type MapObject,
  type MapPropertyValue,
  type MapTileset,
  type MapTilesetPaletteSelection,
  type ObjectLightItemIndex,
} from '@entities/map'
import { type ResourceBrowserOption, ResourcePicker } from '@features/resource-browser'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { MapPropertiesEditor } from '../MapPatchInspectorPanels'
import { propertyEditMergeKey } from '../../model/mapHistoryStack'
import { MapAssetMapCards } from './MapAssetMapCards'
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
  /** Selects an object and centers the canvas viewport on it. */
  onLocateObject: (object: MapObject) => void
  onAddTileset: (relativePath: string, replaceName?: string) => Promise<void>
  /** Opens the vanilla game tilesheet picker; omitted in session modes. */
  onAddGameTileset?: (() => void) | null
  /** Light-item index for the marker item picker; null until game data loads. */
  objectLightIndex?: ObjectLightItemIndex | null
  /** Whether the game tilesheet entry is usable (a game directory is connected). */
  gameTilesetAvailable?: boolean
  /** Disabled-state title for the game tilesheet entry. */
  gameTilesetUnavailableTitle?: string | null
  /** Target-map choices for the warp dialog (localized names from the map catalog). */
  mapOptions?: readonly WarpDialogMapOption[]
  /** Loads a target map document for the warp destination preview. */
  loadTargetDocument?: (target: string) => Promise<MapDocument>
  /** Selects a layer in the layers panel (diagnostics "locate" action). */
  onLocateLayer?: (layerId: number) => void
  /** Reports the hovered inspector entry's canvas highlight (cells/objects); null clears it. */
  onHighlightInspector: (target: MapInspectorHighlight | null) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  onConvertToTmx: () => Promise<void>
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
  onAddTileset,
  onAddGameTileset,
  objectLightIndex = null,
  gameTilesetAvailable = false,
  gameTilesetUnavailableTitle,
  mapOptions,
  loadTargetDocument,
  onLocateLayer,
  onHighlightInspector,
  locale,
  theme,
  accentColor,
  onConvertToTmx,
}: MapAssetEditorInspectorProps) {
  const copy = useMapAuthoringCopy().assetEditor

  const markerItemOptions = listPlacedLightItemOptions(objectLightIndex)
  const markerEntries = document.objectGroups
    .flatMap((group) => group.objects.map((object) => ({ group, object })))
    .filter(({ object }) => isLightMarkerObject(object))

  /** Beginner-facing marker label: localized item name, custom name, or a numbered fallback. */
  function markerLabel(object: MapObject) {
    return (
      resolvePlacedObjectDisplayName(object, objectLightIndex) ??
      (object.name && object.name !== 'TileData' ? object.name : copy.plainMarker(object.id))
    )
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
  return (
    <aside className="map-asset-inspector">
      <div className="map-asset-inspector-content">
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
            locale={locale}
            theme={theme}
            accentColor={accentColor}
          />
        ) : null}
        {selectedObject ? (
          <section className="map-asset-object-details">
            <div className="map-asset-object-details-head">
              <strong>{markerLabel(selectedObject)}</strong>
              <div className="map-asset-detail-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={copy.mapCards.locateObject}
                  title={copy.mapCards.locateObject}
                  onClick={() => onLocateObject(selectedObject)}
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
          </section>
        ) : (
          <p>{copy.selectCell}</p>
        )}
        {capabilities.cellProperties && activeLayer && selectedTile && !selectedObject ? (
          <MapAssetCellAnimationsEditor
            document={document}
            activeLayer={activeLayer}
            selectedTile={selectedTile}
            onUpdateActiveLayer={onUpdateActiveLayer}
          />
        ) : null}
        {capabilities.objectGroups ? (
          <>
            <header>
              <strong>{copy.markersTitle}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label={copy.addTileData}
                title={copy.addTileData}
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
                  onPointerEnter={() => onHighlightInspector({ tileRects: [], objectIds: [object.id] })}
                  onPointerLeave={() => onHighlightInspector(null)}
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
                      onLocateObject(object)
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
        {capabilities.tilesetManagement ? (
          <>
            <header>
              <strong>{copy.tilesetsTitle}</strong>
            </header>
            <ResourcePicker
              value=""
              label={copy.addTileset}
              placeholder={copy.chooseImage}
              options={tilesetOptions}
              selectionMode="confirm"
              triggerClassName="control-button"
              triggerContent={
                <>
                  <Plus className="h-3.5 w-3.5" />
                  {copy.addTileset}
                </>
              }
              onSelect={(value) => void onAddTileset(value)}
            />
            {onAddGameTileset ? (
              <button
                type="button"
                className="control-button"
                disabled={!gameTilesetAvailable}
                title={gameTilesetAvailable ? undefined : (gameTilesetUnavailableTitle ?? undefined)}
                onClick={onAddGameTileset}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                {copy.addGameTileset}
              </button>
            ) : null}
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
                  <AnimationEditor
                    document={document}
                    tilesetName={selectedTileset.name}
                    tileId={paletteSelection.startIndex}
                    onChange={onUpdateDocument}
                  />
                ) : null}
              </section>
            ) : (
              <p>{copy.selectTileset}</p>
            )}
          </>
        ) : null}
        <details className="map-asset-raw-toggle">
          <summary>{copy.mapCards.rawPropertiesToggle}</summary>
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
      </div>
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
                onClick={() => void onConvertToTmx()}
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
            {invalidTsxSourceTilesets.length > 0 ? <p className="map-asset-diagnostics-row">{copy.tilesetExternalTsxInvalid}</p> : null}
          </>
        )}
        {documentIssueCount > 0 ? <footer>{copy.diagnosticsSaveBlockedNote}</footer> : null}
      </section>
    </aside>
  )
}

/**
 * Per-cell animation editor for the cell selected in the inspector. TMX has no
 * per-cell animation carrier, so edits stay in the document's `cellAnimations`
 * data layer (tbin round-trips it, and the TMX writer hoists it into the base
 * tile's definition on save — which also animates the tile's static instances).
 * The canvas renders statically, matching Tiled's default map view.
 */
function MapAssetCellAnimationsEditor({
  document,
  activeLayer,
  selectedTile,
  onUpdateActiveLayer,
}: {
  document: MapDocument
  activeLayer: MapLayer
  selectedTile: { x: number; y: number }
  onUpdateActiveLayer: (updates: Partial<MapLayer>) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  const cellIndex = selectedTile.y * activeLayer.width + selectedTile.x
  const baseGid = stripTileGidFlags(activeLayer.gids[cellIndex] ?? 0)
  const candidateTileset = baseGid > 0 ? findTilesetForGid(document.tilesets, baseGid) : null
  const owningTileset = candidateTileset && baseGid < candidateTileset.firstGid + candidateTileset.tileCount ? candidateTileset : null
  const hasEntry = activeLayer.cellAnimations?.[cellIndex] !== undefined
  const frames = activeLayer.cellAnimations?.[cellIndex] ?? []
  // Cells with no animation and no resolvable tileset cannot animate: hide the section.
  if (frames.length === 0 && !owningTileset) return null
  const defaultTileId = owningTileset ? baseGid - owningTileset.firstGid : 0
  const hasMixed = hasMixedFrameDurations(frames)
  const hasInvalidTileId = frames.some((frame) => frame.tileId < 0 || frame.tileId >= (owningTileset?.tileCount ?? 0))

  function updateFrames(nextFrames: Array<{ tileId: number; duration: number }>) {
    const cellAnimations = { ...activeLayer.cellAnimations }
    if (nextFrames.length) cellAnimations[cellIndex] = nextFrames
    else delete cellAnimations[cellIndex]
    onUpdateActiveLayer({ cellAnimations })
  }

  return (
    <section className="map-asset-animation">
      <header>
        <strong>{copy.cellAnimationTitle}</strong>
        {hasEntry ? (
          <button
            type="button"
            className="icon-button is-danger"
            aria-label={copy.cellAnimationDelete}
            title={copy.cellAnimationDelete}
            onClick={() => updateFrames([])}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </header>
      {frames.length > 0 ? (
        <>
          {hasMixed ? <p className="is-warning">{copy.cellAnimationMixedDurationHint}</p> : null}
          {frames.map((frame, index) => (
            <div key={index}>
              <label>
                <span>{copy.cellAnimationFrame}</span>
                <input
                  type="number"
                  min={0}
                  max={owningTileset ? owningTileset.tileCount - 1 : undefined}
                  value={frame.tileId}
                  onChange={(event) => {
                    const next = frames.map((entry) => ({ ...entry }))
                    next[index] = { ...frame, tileId: Number(event.target.value) }
                    updateFrames(next)
                  }}
                />
              </label>
              <label>
                <span>{copy.cellAnimationDuration}</span>
                <input
                  type="number"
                  min={1}
                  value={frame.duration}
                  onChange={(event) => {
                    const next = frames.map((entry) => ({ ...entry }))
                    next[index] = { ...frame, duration: Math.max(1, Number(event.target.value)) }
                    updateFrames(next)
                  }}
                />
              </label>
              <button
                type="button"
                className="icon-button is-danger"
                aria-label={copy.removeFrame}
                title={copy.removeFrame}
                onClick={() => updateFrames(frames.filter((_, frameIndex) => frameIndex !== index))}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {hasInvalidTileId ? <p className="is-warning">{copy.cellAnimationInvalidTile}</p> : null}
          <button
            type="button"
            className="control-button"
            onClick={() => updateFrames([...frames, { tileId: defaultTileId, duration: 100 }])}
          >
            <Plus className="h-3.5 w-3.5" />
            {copy.cellAnimationAddFrame}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="control-button"
          disabled={!owningTileset}
          onClick={() => updateFrames([{ tileId: defaultTileId, duration: 100 }])}
        >
          {copy.cellAnimationAdd}
        </button>
      )}
    </section>
  )
}

function AnimationEditor({
  document,
  tilesetName,
  tileId,
  onChange,
}: {
  document: MapDocument
  tilesetName: string
  tileId: number
  onChange: (document: MapDocument, mergeKey?: string | null, label?: string) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  const tileset = document.tilesets.find((candidate) => candidate.name === tilesetName)
  if (!tileset) return null
  const activeTileset = tileset
  const frames = activeTileset.animations[tileId] ?? []
  const hasMixedDurations = new Set(frames.map((frame) => frame.duration)).size > 1
  function updateFrames(nextFrames: Array<{ tileId: number; duration: number }>) {
    const animations = { ...activeTileset.animations }
    if (nextFrames.length) animations[tileId] = nextFrames
    else delete animations[tileId]
    onChange(
      {
        ...document,
        tilesets: document.tilesets.map((candidate) => (candidate.name === tilesetName ? { ...candidate, animations } : candidate)),
      },
      `map-tileset:${tilesetName}:animation:${tileId}`,
      copy.editAnimation,
    )
  }
  return (
    <div className="map-asset-animation">
      <header>
        <strong>{copy.animation}</strong>
        <span>{copy.animationTile(tileId)}</span>
      </header>
      {hasMixedDurations ? <p className="is-warning">{copy.animationDurationWarning}</p> : null}
      {frames.map((frame, index) => (
        <div key={index}>
          <label>
            <span>{copy.frameTile}</span>
            <input
              type="number"
              min={0}
              max={activeTileset.tileCount - 1}
              value={frame.tileId}
              onChange={(event) => {
                const next = frames.map((entry) => ({ ...entry }))
                next[index] = { ...frame, tileId: Number(event.target.value) }
                updateFrames(next)
              }}
            />
          </label>
          <label>
            <span>{copy.frameDuration}</span>
            <input
              type="number"
              min={1}
              value={frame.duration}
              onChange={(event) => {
                const next = frames.map((entry) => ({ ...entry }))
                next[index] = { ...frame, duration: Math.max(1, Number(event.target.value)) }
                updateFrames(next)
              }}
            />
          </label>
          <button
            type="button"
            className="icon-button is-danger"
            aria-label={copy.removeFrame}
            title={copy.removeFrame}
            onClick={() => updateFrames(frames.filter((_, frameIndex) => frameIndex !== index))}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button type="button" className="control-button" onClick={() => updateFrames([...frames, { tileId, duration: 100 }])}>
        <Plus className="h-3.5 w-3.5" />
        {copy.addFrame}
      </button>
    </div>
  )
}
