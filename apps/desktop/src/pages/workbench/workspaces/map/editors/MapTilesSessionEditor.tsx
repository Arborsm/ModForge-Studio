import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, PanelRightClose, PanelRightOpen, Redo2, Undo2 } from 'lucide-react'
import { MapTilesetPalette, MapViewport, type MapDocument, type MapTileRect } from '@entities/map'
import type { EditorResources } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { applyMapAssetStroke } from '../model/mapAssetReducer'
import { rectangleTilePoints, type MapTileEditDraft } from '../model/mapPatchReducer'
import { applyMapTilesToDocument, diffMapDocumentToMapTiles } from '../model/mapTilesSession'
import { MapAssetEditorInspector } from './core/MapAssetEditorInspector'
import { MapAssetEditorLayersPanel } from './core/MapAssetEditorLayersPanel'
import { MapAssetEditorToolbar } from './core/MapAssetEditorToolbar'
import { useMapDocumentEditor, type AssetTool } from './core/useMapDocumentEditor'

/**
 * Patch-tiles session capabilities: only tile painting and cell-property
 * editing stay enabled. Layer/object/map/tileset management and flip-rotate
 * transforms are out of scope for a MapTiles change card.
 */
const SESSION_CAPABILITIES = {
  layerManagement: false,
  objectGroups: false,
  mapProperties: false,
  tilesetManagement: false,
  flipRotate: false,
} as const

export type MapTilesSessionEditorProps = {
  /** Content Patcher map target being edited, for example "Maps/Town". */
  target: string
  /** The target map loaded from the game directory; the diff baseline on completion. */
  baseDocument: MapDocument
  /** MapTiles already staged on the tiles change card, seeded into the working document. */
  initialEdits: readonly MapTileEditDraft[]
  /** Called with the compact delta when the author finishes the session. */
  onComplete: (edits: MapTileEditDraft[]) => void
  /** Called when the author discards the session without touching the patch. */
  onCancel: () => void
  /** Host environment (locale, theme, accent) the editor renders against. */
  resources: EditorResources
}

/**
 * Patch-tiles session: edits a game map's tiles inside the full map editor core
 * on top of a purely local working copy, then converts the delta back to
 * MapTiles edits on completion. Nothing touches the draft until "Finish", so a
 * cancelled session leaves the patch byte-for-byte unchanged.
 */
export function MapTilesSessionEditor({ target, baseDocument, initialEdits, onComplete, onCancel, resources }: MapTilesSessionEditorProps) {
  const project = useWorkbenchProject()
  const copy = useMapAuthoringCopy()
  const sessionCopy = copy.tilesSession
  const assetEditorCopy = copy.assetEditor
  const editorShellCopy = copy.editorShell
  const [document, setDocument] = useState<MapDocument>(() => applyMapTilesToDocument(baseDocument, initialEdits).document)
  const imageAssets = project.projectAssets.filter((asset) => asset.mediaType.startsWith('image/'))
  const imageAssetPaths = new Set(imageAssets.map((asset) => asset.relativePath.replaceAll('\\', '/').toLowerCase()))
  const mapName = target.replace(/^Maps\//iu, '').trim()
  const assetPath = `Maps/${mapName}.tmx`

  const editor = useMapDocumentEditor({
    document,
    editorState: {},
    patchId: 'map-tiles-session',
    assetPath,
    readProjectAsset: project.readProjectAsset,
    imageAssetPaths,
    capabilities: SESSION_CAPABILITIES,
    persistDocument: (next) => setDocument(next),
  })

  const changedCellCount = useMemo(() => diffMapDocumentToMapTiles(baseDocument, document).length, [baseDocument, document])

  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  undoRef.current = editor.undo
  redoRef.current = editor.redo

  const activeLayer = editor.activeLayer
  const selectedTileset = editor.selectedTileset
  const paletteSelection = editor.paletteSelection

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = globalThis.document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undoRef.current()
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redoRef.current()
        return
      }
      const shortcuts: Record<string, AssetTool> = {
        b: 'brush',
        e: 'erase',
        f: 'fill',
        r: 'rectangle',
        d: 'eyedropper',
        h: 'hand',
        i: 'inspect',
      }
      const key = event.key.toLowerCase()
      if (shortcuts[key]) {
        editor.setTool(shortcuts[key])
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="map-asset-editor">
      <header className="map-asset-editor-header">
        <div className="map-asset-editor-title">
          <strong>{document.name || mapName}</strong>
          <span>{target}</span>
        </div>
        <span className="map-tiles-session-changed" aria-live="polite">
          {sessionCopy.changedCells(changedCellCount)}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={assetEditorCopy.undo}
          title={assetEditorCopy.undoTitle}
          disabled={editor.undoStack.length === 0}
          onClick={editor.undo}
        >
          <Undo2 className={cx('h-4 w-4', editor.undoStack.length === 0 && 'opacity-35')} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={assetEditorCopy.redo}
          title={assetEditorCopy.redoTitle}
          disabled={editor.redoStack.length === 0}
          onClick={editor.redo}
        >
          <Redo2 className={cx('h-4 w-4', editor.redoStack.length === 0 && 'opacity-35')} />
        </button>
        <button type="button" className="control-button" onClick={onCancel}>
          {sessionCopy.discard}
        </button>
        <button
          type="button"
          className="control-button control-button-primary"
          onClick={() => onComplete(diffMapDocumentToMapTiles(baseDocument, document))}
        >
          <Check className="h-3.5 w-3.5" />
          {sessionCopy.complete}
        </button>
      </header>

      <div
        className={cx('map-asset-editor-body', editor.inspectorView === 'properties' && !editor.inspectorTab && 'has-collapsed-inspector')}
      >
        <MapAssetEditorLayersPanel
          document={document}
          assetPath={assetPath}
          activeLayer={editor.activeLayer}
          lockedLayerIds={editor.lockedLayerIds}
          selectedObjectGroup={null}
          inspectorTab={editor.inspectorTab}
          capabilities={editor.capabilities}
          onUpdateDocument={editor.updateDocument}
          onToggleLayerLocked={(layerId) =>
            editor.setLockedLayerIds((current) => {
              const next = new Set(current)
              if (next.has(layerId)) next.delete(layerId)
              else next.add(layerId)
              return next
            })
          }
          onActivateLayer={(layerId) => {
            editor.setActiveLayerId(layerId)
          }}
          onActivateObjectGroup={() => {}}
          onAddLayer={() => {}}
          onDuplicateLayer={() => {}}
          onRequestDeleteLayer={() => {}}
          onMoveLayer={() => {}}
          onOpenMapInspector={() => {
            editor.setInspectorView('properties')
            editor.setInspectorTab(editor.selectedTile ? 'tile' : null)
          }}
        />

        <main className="map-asset-canvas">
          <MapAssetEditorToolbar tool={editor.tool} paletteSelection={editor.paletteSelection} onToolChange={editor.setTool} />
          <div className="map-asset-viewport">
            <MapViewport
              locale={resources.locale}
              mapDocument={editor.renderDocument}
              visibleLayerIds={document.layers.filter((layer) => layer.visible).map((layer) => layer.id)}
              visibleObjectGroupIds={document.objectGroups.filter((group) => group.visible).map((group) => group.id)}
              includeHiddenLayers={document.layers.every((layer) => !layer.visible)}
              theme={resources.theme}
              accentColor={resources.accentColor}
              showGrid
              showStatsChips={false}
              contextMenuEnabled={false}
              onHoverChange={editor.setHoverInfo}
              onTileStroke={editor.tool === 'brush' || editor.tool === 'erase' ? editor.commitStroke : undefined}
              onTileClick={['inspect', 'fill', 'stamp', 'eyedropper', 'hand'].includes(editor.tool) ? editor.clickTile : undefined}
              selectedTileRect={editor.selectedTile ? { ...editor.selectedTile, width: 1, height: 1 } : null}
              onTileRectSelect={
                editor.tool === 'rectangle' && activeLayer && !editor.activeLayerLocked && selectedTileset && paletteSelection
                  ? (rect: MapTileRect) =>
                      editor.updateDocument(
                        applyMapAssetStroke(
                          document,
                          activeLayer.id,
                          rectangleTilePoints(rect.x, rect.y, rect.width, rect.height),
                          selectedTileset.firstGid + paletteSelection.startIndex,
                        ),
                        `map-tiles-session-rectangle:${activeLayer.id}`,
                      )
                  : undefined
              }
            />
          </div>
          {editor.paletteOpen ? (
            <MapTilesetPalette
              document={editor.renderDocument}
              locale={resources.locale}
              selection={editor.paletteSelection}
              onSelectionChange={(selection) => {
                editor.setPaletteSelection(selection)
                editor.setTool(selection.width === 1 && selection.height === 1 ? 'brush' : 'stamp')
              }}
            />
          ) : null}
          <button type="button" className="map-editor-palette-toggle" onClick={() => editor.setPaletteOpen((open) => !open)}>
            {editor.paletteOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            {editor.paletteOpen ? editorShellCopy.hidePalette : editorShellCopy.showPalette}
          </button>
        </main>

        <MapAssetEditorInspector
          document={document}
          assetPath={assetPath}
          activeLayer={editor.activeLayer}
          selectedTile={editor.selectedTile}
          selectedCellProperties={editor.selectedCellProperties}
          selectedTileset={editor.selectedTileset}
          selectedTileDefinitionProperties={editor.selectedTileDefinitionProperties}
          selectedObject={null}
          selectedObjectGroup={null}
          selectedObjectId={null}
          paletteSelection={editor.paletteSelection}
          tilesetOptions={[]}
          isTmxAsset
          tbinIssues={[]}
          layerNameIssues={[]}
          invalidTsxSourceTilesets={[]}
          documentIssueCount={0}
          undoStackLength={editor.undoStack.length}
          redoStackLength={editor.redoStack.length}
          saveState={editor.saveState}
          hoverInfo={editor.hoverInfo}
          capabilities={editor.capabilities}
          inspectorTab={editor.inspectorTab}
          inspectorView={editor.inspectorView}
          onInspectorTabChange={editor.setInspectorTab}
          onInspectorViewChange={editor.setInspectorView}
          onSetSelectedObjectId={editor.setSelectedObjectId}
          onSetActiveObjectGroupId={editor.setActiveObjectGroupId}
          onUpdateDocument={editor.updateDocument}
          onUpdateActiveLayer={editor.updateActiveLayer}
          onUpdateSelectedTileset={editor.updateSelectedTileset}
          onUpdateSelectedObject={editor.updateSelectedObject}
          onUpdateSelectedObjectGroup={editor.updateSelectedObjectGroup}
          onAddObjectGroup={editor.addObjectGroup}
          onDeleteSelectedObjectGroup={editor.deleteSelectedObjectGroup}
          onDeleteSelectedObject={editor.deleteSelectedObject}
          onAddTileDataObject={editor.addTileDataObject}
          onAddTileset={editor.addTileset}
          onConvertToTmx={async () => {}}
        />
      </div>

      <footer className="map-asset-statusbar">
        <span>
          {document.width} × {document.height}
        </span>
        <span>
          {document.tileWidth} × {document.tileHeight}
        </span>
        <span>{editor.activeLayer?.name ?? '-'}</span>
        <span />
        <span>{editor.hoverInfo ? `${editor.hoverInfo.tileX}, ${editor.hoverInfo.tileY}` : '-'}</span>
      </footer>
    </div>
  )
}
