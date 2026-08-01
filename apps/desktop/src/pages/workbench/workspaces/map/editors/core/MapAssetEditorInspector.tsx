import { FileOutput, FlipHorizontal2, FlipVertical2, PanelRightClose, Plus, RotateCw, Trash2 } from 'lucide-react'
import {
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  type MapDocument,
  type MapLayer,
  type MapObject,
  type MapObjectGroup,
  type MapPropertyValue,
  type MapTileset,
  type MapTilesetPaletteSelection,
  type TileHoverInfo,
} from '@entities/map'
import { type ResourceBrowserOption, ResourcePicker } from '@features/resource-browser'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { MapPropertiesEditor } from '../MapPatchInspectorPanels'
import {
  rotateMapAssetTileClockwise,
  setMapAssetCellProperties,
  toggleMapAssetTileFlag,
  type MapAssetLayerNameIssue,
  type MapAssetTbinIssue,
} from '../../model/mapAssetReducer'
import { defaultTsxSourceForTileset, isValidTsxSource } from '../../model/mapTilesetSource'
import type { InspectorTab, InspectorView, MapEditorCapabilities, MapEditorSaveState } from './useMapDocumentEditor'

export type MapAssetEditorInspectorProps = {
  document: MapDocument
  assetPath: string
  activeLayer: MapLayer | null
  selectedTile: { x: number; y: number } | null
  selectedCellProperties: Record<string, unknown>
  selectedTileset: MapTileset | null
  selectedTileDefinitionProperties: Record<string, unknown>
  selectedObject: MapObject | null
  selectedObjectGroup: MapObjectGroup | null
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
  hoverInfo: TileHoverInfo | null
  capabilities: MapEditorCapabilities
  inspectorTab: InspectorTab | null
  inspectorView: InspectorView
  onInspectorTabChange: (tab: InspectorTab | null) => void
  onInspectorViewChange: (view: InspectorView) => void
  onSetSelectedObjectId: (id: number | null) => void
  onSetActiveObjectGroupId: (id: number) => void
  onUpdateDocument: (nextDocument: MapDocument, mergeKey?: string) => void
  onUpdateActiveLayer: (updates: Partial<MapLayer>) => void
  onUpdateSelectedTileset: (updater: (tileset: MapTileset) => MapTileset) => void
  onUpdateSelectedObject: (updates: Partial<MapObject>) => void
  onUpdateSelectedObjectGroup: (updates: Partial<MapObjectGroup>) => void
  onAddObjectGroup: () => void
  onDeleteSelectedObjectGroup: () => void
  onDeleteSelectedObject: () => void
  onAddTileDataObject: (point?: { x: number; y: number }) => void
  onAddTileset: (relativePath: string, replaceName?: string) => Promise<void>
  onConvertToTmx: () => Promise<void>
}

/**
 * Inspector aside for the map editor: view/tab navigation plus the tile,
 * objects, map, tileset, history, and diagnostics panels. Every mutation is
 * routed through the `on*` callbacks; capability-gated panels are hidden when
 * their capability is disabled.
 */
export function MapAssetEditorInspector({
  document,
  assetPath,
  activeLayer,
  selectedTile,
  selectedCellProperties,
  selectedTileset,
  selectedTileDefinitionProperties,
  selectedObject,
  selectedObjectGroup,
  selectedObjectId,
  paletteSelection,
  tilesetOptions,
  isTmxAsset,
  tbinIssues,
  layerNameIssues,
  invalidTsxSourceTilesets,
  documentIssueCount,
  undoStackLength,
  redoStackLength,
  saveState,
  hoverInfo,
  capabilities,
  inspectorTab,
  inspectorView,
  onInspectorTabChange,
  onInspectorViewChange,
  onSetSelectedObjectId,
  onSetActiveObjectGroupId,
  onUpdateDocument,
  onUpdateActiveLayer,
  onUpdateSelectedTileset,
  onUpdateSelectedObject,
  onUpdateSelectedObjectGroup,
  onAddObjectGroup,
  onDeleteSelectedObjectGroup,
  onDeleteSelectedObject,
  onAddTileDataObject,
  onAddTileset,
  onConvertToTmx,
}: MapAssetEditorInspectorProps) {
  const copy = useMapAuthoringCopy().assetEditor
  const editorShellCopy = useMapAuthoringCopy().editorShell
  return (
    <aside className={cx('map-asset-inspector', inspectorView === 'properties' && !inspectorTab && 'is-collapsed')}>
      <nav className="map-asset-inspector-views">
        {(['properties', 'history', 'diagnostics'] as const).map((view) => (
          <button
            key={view}
            type="button"
            className={cx(inspectorView === view && 'is-active')}
            onClick={() => onInspectorViewChange(view)}
          >
            {copy.inspectorViews[view]}
            {view === 'diagnostics' && documentIssueCount > 0 ? ` (${documentIssueCount})` : ''}
          </button>
        ))}
      </nav>
      {inspectorView === 'properties' ? (
        <>
          <nav className="map-asset-inspector-tabs">
            {(['tile', 'objects', 'map', 'tileset'] as const)
              .filter((tab) => (tab === 'objects' ? capabilities.objectGroups : tab === 'tileset' ? capabilities.tilesetManagement : true))
              .map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={cx(inspectorTab === tab && 'is-active')}
                  onClick={() => onInspectorTabChange(tab)}
                >
                  {copy.inspectorTabs[tab]}
                </button>
              ))}
            {inspectorTab ? (
              <button
                type="button"
                className="icon-button"
                aria-label={editorShellCopy.closeInspector}
                title={editorShellCopy.closeInspector}
                onClick={() => onInspectorTabChange(null)}
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </nav>
          {inspectorTab ? (
            <div className="map-asset-inspector-content">
              {inspectorTab === 'tile' ? (
                selectedTile && activeLayer ? (
                  <>
                    <header>
                      <strong>{copy.selectedCell(selectedTile.x, selectedTile.y)}</strong>
                      <span>{activeLayer.name}</span>
                    </header>
                    {capabilities.flipRotate ? (
                      <div className="map-asset-transform-tools">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={copy.flipHorizontal}
                          title={copy.flipHorizontal}
                          onClick={() =>
                            onUpdateDocument(toggleMapAssetTileFlag(document, activeLayer.id, selectedTile, FLIPPED_HORIZONTALLY_FLAG))
                          }
                        >
                          <FlipHorizontal2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={copy.flipVertical}
                          title={copy.flipVertical}
                          onClick={() =>
                            onUpdateDocument(toggleMapAssetTileFlag(document, activeLayer.id, selectedTile, FLIPPED_VERTICALLY_FLAG))
                          }
                        >
                          <FlipVertical2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={copy.rotateClockwise}
                          title={copy.rotateClockwise}
                          onClick={() => onUpdateDocument(rotateMapAssetTileClockwise(document, activeLayer.id, selectedTile))}
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    <MapPropertiesEditor
                      properties={selectedCellProperties}
                      description={copy.cellPropertiesHint}
                      onChange={(properties) =>
                        onUpdateDocument(
                          setMapAssetCellProperties(document, activeLayer.id, selectedTile, properties as Record<string, MapPropertyValue>),
                        )
                      }
                    />
                  </>
                ) : (
                  <p>{copy.selectCell}</p>
                )
              ) : inspectorTab === 'objects' && capabilities.objectGroups ? (
                <>
                  <section className="map-asset-object-group-details">
                    <div className="map-asset-transform-tools">
                      <strong>{copy.objectGroups}</strong>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={copy.addObjectGroup}
                        title={copy.addObjectGroup}
                        onClick={onAddObjectGroup}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="icon-button is-danger"
                        aria-label={copy.deleteObjectGroup}
                        title={selectedObjectGroup?.objects.length ? copy.deleteNonEmptyObjectGroup : copy.deleteObjectGroup}
                        disabled={!selectedObjectGroup || selectedObjectGroup.objects.length > 0}
                        onClick={onDeleteSelectedObjectGroup}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {document.objectGroups.length > 0 ? (
                      <select
                        value={selectedObjectGroup?.id ?? ''}
                        onChange={(event) => {
                          onSetActiveObjectGroupId(Number(event.target.value))
                          onSetSelectedObjectId(null)
                        }}
                      >
                        {document.objectGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name || `#${group.id}`}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {selectedObjectGroup ? (
                      <>
                        <label>
                          <span>{copy.objectGroupName}</span>
                          <input
                            value={selectedObjectGroup.name}
                            onChange={(event) => onUpdateSelectedObjectGroup({ name: event.target.value })}
                          />
                        </label>
                        <label className="map-asset-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedObjectGroup.visible}
                            onChange={(event) => onUpdateSelectedObjectGroup({ visible: event.target.checked })}
                          />
                          <span>{copy.objectGroupVisible}</span>
                        </label>
                        <label>
                          <span>{copy.objectGroupOpacity}</span>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObjectGroup.opacity}
                            onChange={(event) =>
                              onUpdateSelectedObjectGroup({ opacity: Math.min(1, Math.max(0, Number(event.target.value))) })
                            }
                          />
                        </label>
                        <label>
                          <span>{copy.objectGroupDrawOrder}</span>
                          <select
                            value={selectedObjectGroup.drawOrder}
                            onChange={(event) => onUpdateSelectedObjectGroup({ drawOrder: event.target.value })}
                          >
                            <option value="topdown">topdown</option>
                            <option value="index">index</option>
                          </select>
                        </label>
                        <MapPropertiesEditor
                          properties={selectedObjectGroup.properties}
                          description={copy.objectGroupPropertiesHint}
                          onChange={(properties) =>
                            onUpdateSelectedObjectGroup({ properties: properties as Record<string, MapPropertyValue> })
                          }
                        />
                      </>
                    ) : null}
                  </section>
                  <button type="button" className="control-button" disabled={!selectedTile} onClick={() => onAddTileDataObject()}>
                    <Plus className="h-3.5 w-3.5" />
                    {copy.addTileData}
                  </button>
                  <div className="map-asset-object-list">
                    {document.objectGroups
                      .flatMap((group) => group.objects.map((object) => ({ group, object })))
                      .map(({ group, object }) => (
                        <button
                          key={object.id}
                          type="button"
                          className={cx(selectedObjectId === object.id && 'is-active')}
                          onClick={() => {
                            onSetActiveObjectGroupId(group.id)
                            onSetSelectedObjectId(object.id)
                          }}
                        >
                          {object.name || `#${object.id}`}
                        </button>
                      ))}
                  </div>
                  {selectedObject ? (
                    <section className="map-asset-object-details">
                      <strong>{copy.objectDetails}</strong>
                      <div className="map-asset-field-grid">
                        <label>
                          <span>{copy.objectName}</span>
                          <input value={selectedObject.name} onChange={(event) => onUpdateSelectedObject({ name: event.target.value })} />
                        </label>
                        <label>
                          <span>{copy.objectType}</span>
                          <input value={selectedObject.type} onChange={(event) => onUpdateSelectedObject({ type: event.target.value })} />
                        </label>
                        {(
                          [
                            ['x', copy.objectX],
                            ['y', copy.objectY],
                            ['width', copy.objectWidth],
                            ['height', copy.objectHeight],
                            ['rotation', copy.objectRotation],
                          ] as const
                        ).map(([field, label]) => (
                          <label key={field}>
                            <span>{label}</span>
                            <input
                              type="number"
                              value={selectedObject[field]}
                              onChange={(event) => onUpdateSelectedObject({ [field]: Number(event.target.value) })}
                            />
                          </label>
                        ))}
                        <label className="map-asset-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedObject.visible !== false}
                            onChange={(event) => onUpdateSelectedObject({ visible: event.target.checked })}
                          />
                          <span>{copy.objectVisible}</span>
                        </label>
                      </div>
                      <MapPropertiesEditor
                        properties={selectedObject.properties}
                        description={copy.objectPropertiesHint}
                        onChange={(properties) => onUpdateSelectedObject({ properties: properties as Record<string, MapPropertyValue> })}
                      />
                      <button type="button" className="control-button is-danger" onClick={onDeleteSelectedObject}>
                        <Trash2 className="h-3.5 w-3.5" />
                        {copy.deleteObject}
                      </button>
                    </section>
                  ) : (
                    <p>{copy.selectObject}</p>
                  )}
                </>
              ) : inspectorTab === 'map' ? (
                <>
                  {capabilities.layerManagement && activeLayer ? (
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
                  {capabilities.mapProperties ? (
                    <section className="map-asset-map-properties">
                      <strong>{copy.mapProperties}</strong>
                      <MapPropertiesEditor
                        categorized
                        properties={document.properties}
                        onChange={(properties) =>
                          onUpdateDocument({ ...document, properties: properties as Record<string, MapPropertyValue> })
                        }
                      />
                    </section>
                  ) : null}
                </>
              ) : capabilities.tilesetManagement ? (
                <>
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
                  {selectedTileset ? (
                    <section className="map-asset-tileset-details">
                      <strong>{selectedTileset.name}</strong>
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
              {hoverInfo ? <footer>{copy.hoveredCell(hoverInfo.tileX, hoverInfo.tileY)}</footer> : null}
            </div>
          ) : (
            <div className="map-asset-inspector-content">
              <p>{editorShellCopy.noSelection}</p>
            </div>
          )}
        </>
      ) : inspectorView === 'history' ? (
        <div className="map-asset-inspector-content">
          <div className="map-asset-history-info">
            <span>{copy.undoHistory(undoStackLength)}</span>
            <span>{copy.redoHistory(redoStackLength)}</span>
          </div>
          <p>{saveState.message || copy.noRecentChanges}</p>
        </div>
      ) : (
        <div className="map-asset-inspector-content">
          <header>
            <strong>{documentIssueCount > 0 ? copy.formatNeedsAttention : copy.formatReady}</strong>
            <span>{assetPath}</span>
          </header>
          {tbinIssues.map((issue) => (
            <p key={issue} className="is-warning">
              {copy.tbinIssues[issue]}
            </p>
          ))}
          {tbinIssues.length > 0 ? <p className="map-asset-convert-hint">{copy.tbinConvertHint}</p> : null}
          {tbinIssues.length > 0 ? (
            <button
              type="button"
              className="control-button control-button-primary map-asset-convert-action"
              onClick={() => void onConvertToTmx()}
            >
              <FileOutput className="h-3.5 w-3.5" />
              {copy.tbinConvertAction}
            </button>
          ) : null}
          {layerNameIssues.map((issue) => (
            <p key={issue.kind === 'empty' ? `empty:${issue.id}` : `duplicate:${issue.name.toLowerCase()}`}>
              {issue.kind === 'empty' ? copy.emptyLayerName(issue.id) : copy.duplicateLayerName(issue.name)}
            </p>
          ))}
          {invalidTsxSourceTilesets.length > 0 ? <p className="is-warning">{copy.tilesetExternalTsxInvalid}</p> : null}
          {documentIssueCount === 0 ? <p>{copy.formatReady}</p> : null}
        </div>
      )}
    </aside>
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
  onChange: (document: MapDocument) => void
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
    onChange({
      ...document,
      tilesets: document.tilesets.map((candidate) => (candidate.name === tilesetName ? { ...candidate, animations } : candidate)),
    })
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
