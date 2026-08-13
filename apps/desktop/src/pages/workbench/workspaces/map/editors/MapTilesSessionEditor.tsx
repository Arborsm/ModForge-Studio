import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Redo2, Undo2 } from 'lucide-react'
import { MapTilesetPalette, MapViewport, type MapDocument, type MapTileRect } from '@entities/map'
import { deriveCellOverlayView, type CellOverlayCell } from '@entities/map'
import type { EditorResources } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { applyMapAssetStroke } from '../model/mapAssetReducer'
import { rectangleTilePoints, type MapTileEditDraft } from '../model/mapPatchReducer'
import { applyMapTilesToDocument, diffMapDocumentToMapTiles } from '../model/mapTilesSession'
import { MapAssetEditorInspector } from './core/MapAssetEditorInspector'
import { MapAssetEditorLayersPanel } from './core/MapAssetEditorLayersPanel'
import { MapAssetCellOverlayRules } from './core/MapAssetCellOverlayRules'
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
  cellProperties: true,
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
  const overlayActiveRef = useRef(editor.overlayActive)
  overlayActiveRef.current = editor.overlayActive

  const activeLayer = editor.activeLayer
  const selectedTileset = editor.selectedTileset
  const paletteSelection = editor.paletteSelection

  /** Overlay view model for the session's active layer (rules + drag preview). */
  const overlayCells = useMemo(() => {
    if (!editor.overlayActive) return null
    const layer = editor.renderDocument.layers.find((candidate) => candidate.id === editor.activeLayerId)
    if (!layer) return null
    const cells: Record<number, CellOverlayCell> = deriveCellOverlayView(editor.renderDocument, layer)
    const preview = editor.overlayPaintPreview
    if (preview) {
      for (const point of preview) {
        const index = point.tileY * layer.width + point.tileX
        if (index < 0 || index >= layer.width * layer.height) continue
        if (editor.overlayRule === 'walkable') delete cells[index]
        else cells[index] = { rule: editor.overlayRule, tilesetDerived: false }
      }
    }
    return { layerId: layer.id, width: layer.width, height: layer.height, cells }
  }, [editor.activeLayerId, editor.overlayActive, editor.overlayPaintPreview, editor.overlayRule, editor.renderDocument])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = globalThis.document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        redoRef.current()
        return
      }
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
      const key = event.key.toLowerCase()
      if (key === 'g') {
        editor.setOverlayActive((open) => !open)
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
      if (overlayActiveRef.current || !shortcuts[key]) return
      editor.setTool(shortcuts[key])
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

      <div className="map-asset-editor-body">
        <MapAssetEditorLayersPanel
          document={document}
          renderDocument={editor.renderDocument}
          locale={resources.locale}
          activeLayer={editor.activeLayer}
          lockedLayerIds={editor.lockedLayerIds}
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
          onAddLayer={() => {}}
          onDuplicateLayer={() => {}}
          onRequestDeleteLayer={() => {}}
          onMoveLayer={() => {}}
        />

        <main className="map-asset-canvas">
          <div className="map-asset-viewport">
            <MapAssetEditorToolbar
              tool={editor.tool}
              paletteSelection={editor.paletteSelection}
              onToolChange={editor.setTool}
              paletteOpen={editor.paletteOpen}
              onTogglePalette={() => editor.setPaletteOpen((open) => !open)}
              overlayActive={editor.overlayActive}
              onToggleOverlay={() => editor.setOverlayActive((open) => !open)}
            />
            <MapViewport
              locale={resources.locale}
              mapDocument={editor.renderDocument}
              visibleLayerIds={document.layers.filter((layer) => layer.visible).map((layer) => layer.id)}
              visibleObjectGroupIds={document.objectGroups.filter((group) => group.visible).map((group) => group.id)}
              hideRuleTileDataObjects
              includeHiddenLayers={document.layers.every((layer) => !layer.visible)}
              theme={resources.theme}
              accentColor={resources.accentColor}
              showGrid
              showStatsChips={false}
              contextMenuEnabled={false}
              onHoverChange={editor.setHoverInfo}
              onTileStroke={
                editor.overlayActive && !editor.activeLayerLocked
                  ? editor.commitCellOverlayStroke
                  : editor.tool === 'brush' || editor.tool === 'erase'
                    ? editor.commitStroke
                    : undefined
              }
              onTileStrokeLive={editor.overlayActive && !editor.activeLayerLocked ? editor.previewCellOverlayStroke : undefined}
              onTileClick={
                !editor.overlayActive && ['inspect', 'fill', 'stamp', 'eyedropper', 'hand'].includes(editor.tool)
                  ? editor.clickTile
                  : undefined
              }
              selectedTileRect={!editor.overlayActive && editor.selectedTile ? { ...editor.selectedTile, width: 1, height: 1 } : null}
              onTileRectSelect={
                !editor.overlayActive &&
                editor.tool === 'rectangle' &&
                activeLayer &&
                !editor.activeLayerLocked &&
                selectedTileset &&
                paletteSelection
                  ? (rect: MapTileRect) =>
                      editor.updateDocument(
                        applyMapAssetStroke(
                          document,
                          activeLayer.id,
                          rectangleTilePoints(rect.x, rect.y, rect.width, rect.height),
                          selectedTileset.firstGid + paletteSelection.startIndex,
                        ),
                        undefined,
                        assetEditorCopy.historyToolAction(assetEditorCopy.toolLabels.rectangle, activeLayer.name),
                      )
                  : undefined
              }
              cellOverlay={overlayCells}
            />
            {editor.overlayActive ? (
              <MapAssetCellOverlayRules activeRule={editor.overlayRule} onRuleChange={editor.setOverlayRule} />
            ) : null}
            {editor.paletteOpen ? (
              <MapTilesetPalette
                document={editor.renderDocument}
                locale={resources.locale}
                selection={editor.paletteSelection}
                onSelectionChange={(selection) => {
                  editor.setPaletteSelection(selection)
                  editor.setTool(selection.width === 1 && selection.height === 1 ? 'brush' : 'stamp')
                }}
                onClose={() => editor.setPaletteOpen(false)}
              />
            ) : null}
            {editor.paletteOpen ? <p className="map-tiles-session-tileset-hint">{sessionCopy.tilesetSourceHint}</p> : null}
          </div>
        </main>

        <MapAssetEditorInspector
          document={document}
          renderDocument={editor.renderDocument}
          assetPath={assetPath}
          activeLayer={editor.activeLayer}
          selectedTile={editor.selectedTile}
          selectedTileset={editor.selectedTileset}
          selectedTileDefinitionProperties={editor.selectedTileDefinitionProperties}
          selectedObject={null}
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
          capabilities={editor.capabilities}
          onSetSelectedObjectId={editor.setSelectedObjectId}
          onSetActiveObjectGroupId={editor.setActiveObjectGroupId}
          onUpdateDocument={editor.updateDocument}
          onUpdateActiveLayer={editor.updateActiveLayer}
          onUpdateSelectedTileset={editor.updateSelectedTileset}
          onUpdateSelectedObject={editor.updateSelectedObject}
          onDeleteSelectedObject={editor.deleteSelectedObject}
          onAddTileDataObject={editor.addTileDataObject}
          // Object editing is disabled in the patch-tiles session (capabilities.objectGroups = false).
          onLocateObject={() => {}}
          // Map cards are not rendered in the session (no mapOptions), so hover highlighting is a no-op.
          onHighlightInspector={() => {}}
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
