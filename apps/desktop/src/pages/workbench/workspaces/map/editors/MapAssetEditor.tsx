import { useEffect, useRef, useState } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  ArrowLeft,
  BadgeCheck,
  Eraser,
  FileOutput,
  MousePointer2,
  Paintbrush,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  Undo2,
  Redo2,
} from 'lucide-react'
import { MapTilesetPalette, MapViewport, type MapDocument, type MapTileRect } from '@entities/map'
import { type AssetDraftPort, type DraftPatch, type EditorComponent, type EditorResources } from '@features/cp-maker'
import { buildCpMakerMapAsset } from '@features/cp-maker/api'
import { type ResourceBrowserOption } from '@features/resource-browser'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import {
  applyMapAssetStroke,
  collectMapAssetLayerNameIssues,
  collectMapAssetTbinIssues,
  deleteMapAssetLayer,
  reorderMapAssetLayer,
} from '../model/mapAssetReducer'
import { collectPatchesReferencingAsset, tmxConversionPath } from '../model/mapAssetConversion'
import { rectangleTilePoints } from '../model/mapPatchReducer'
import { isValidTsxSource } from '../model/mapTilesetSource'
import { MapAssetEditorInspector } from './core/MapAssetEditorInspector'
import { MapAssetEditorLayersPanel } from './core/MapAssetEditorLayersPanel'
import { MapAssetEditorToolbar } from './core/MapAssetEditorToolbar'
import { useMapDocumentEditor, type AssetTool } from './core/useMapDocumentEditor'

function embeddedDocument(editorState: unknown): MapDocument | null {
  if (!editorState || typeof editorState !== 'object' || Array.isArray(editorState)) return null
  const document = (editorState as Record<string, unknown>)['mapDocument']
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null
  const candidate = document as Partial<MapDocument>
  return typeof candidate.width === 'number' && Array.isArray(candidate.layers) ? (document as MapDocument) : null
}

function hostMapDocument(document: MapDocument) {
  return {
    ...document,
    layers: document.layers.map((layer) => ({ ...layer, gids: Array.from(layer.gids) })),
  }
}

function initialAssetPath(document: MapDocument, fromFile: string | undefined) {
  const source = fromFile?.trim() || document.relativePath.trim() || `assets/maps/${document.name}.tmx`
  return /\.(?:tmx|tbin|xnb)$/iu.test(source) ? source : source.replace(/\.[^./\\]+$/u, '') + '.tmx'
}

/** Standalone TMX/TBin authoring page backed by a project-library map asset. */
export const MapAssetEditor: EditorComponent = ({ patch, draftPort, resources }) => {
  const project = useWorkbenchProject()
  const authoringCopy = useMapAuthoringCopy()
  const copy = authoringCopy.assetEditor
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const document = embeddedDocument(editorState)
  if (!document) {
    return <div className="map-asset-editor-state is-error">{copy.invalidDocument}</div>
  }
  return (
    <MapAssetEditorContent
      patch={patch}
      draftPort={draftPort}
      resources={resources}
      document={document}
      editorState={editorState}
      project={project}
    />
  )
}

function MapAssetEditorContent({
  patch,
  draftPort,
  resources,
  document,
  editorState,
  project,
}: {
  patch: DraftPatch
  draftPort: AssetDraftPort
  resources: EditorResources
  document: MapDocument
  editorState: Record<string, unknown>
  project: ReturnType<typeof useWorkbenchProject>
}) {
  const authoringCopy = useMapAuthoringCopy()
  const copy = authoringCopy.assetEditor
  const assetPath = initialAssetPath(document, patch.fromFile)
  const imageAssets = project.projectAssets.filter((asset) => asset.mediaType.startsWith('image/'))
  const imageAssetPaths = new Set(imageAssets.map((asset) => asset.relativePath.replaceAll('\\', '/').toLowerCase()))
  const editor = useMapDocumentEditor({
    document,
    editorState,
    patchId: patch.id,
    draftPort,
    assetPath,
    readProjectAsset: project.readProjectAsset,
    imageAssetPaths,
  })

  const toolRef = useRef(editor.tool)
  toolRef.current = editor.tool
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const saveRef = useRef<() => void>(() => {})

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = globalThis.document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveRef.current()
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

  const mapDocument = document
  const isTmxAsset = !assetPath.trim().toLowerCase().endsWith('.tbin')
  const tbinIssues = assetPath.trim().toLowerCase().endsWith('.tbin') ? collectMapAssetTbinIssues(mapDocument) : []
  const isXnbAsset = assetPath.trim().toLowerCase().endsWith('.xnb')
  const invalidTsxSourceTilesets = mapDocument.tilesets.filter((tileset) => tileset.source != null && !isValidTsxSource(tileset.source))
  const layerNameIssues = collectMapAssetLayerNameIssues(mapDocument)
  const documentIssueCount = tbinIssues.length + layerNameIssues.length + invalidTsxSourceTilesets.length
  const tilesetOptions: ResourceBrowserOption[] = imageAssets.map((asset) => ({
    id: `map-tileset:${asset.relativePath}`,
    kind: 'texture',
    value: asset.relativePath,
    label: asset.relativePath.split('/').pop() ?? asset.relativePath,
    subtitle: asset.relativePath,
    category: copy.projectImages,
    sourceKind: 'project',
  }))
  const activeLayer = editor.activeLayer
  const selectedTileset = editor.selectedTileset
  const paletteSelection = editor.paletteSelection

  async function saveMap() {
    if (isXnbAsset || tbinIssues.length > 0 || layerNameIssues.length > 0 || invalidTsxSourceTilesets.length > 0) return
    editor.setSaveState({ status: 'saving', message: copy.saving })
    try {
      const normalizedDocument = {
        ...mapDocument,
        relativePath: assetPath,
        format: assetPath.toLowerCase().endsWith('.tbin') ? ('tbin' as const) : ('tmx' as const),
      }
      const result = await buildCpMakerMapAsset({ relativePath: assetPath, mapDocument: hostMapDocument(normalizedDocument) })
      const asset = result.asset
      await project.writeProjectAssets([...result.companionAssets, asset], 'edited')
      draftPort.updatePatch(patch.id, {
        fromFile: asset.relativePath,
        editorState: { ...editorState, mapDocument: normalizedDocument },
      })
      editor.setSaveState({ status: 'saved', message: copy.saved(asset.relativePath) })
    } catch (error) {
      editor.setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Saves the current document as a fresh TMX asset, repoints every patch whose
   * FromFile references the old path (including this one), then deletes the old
   * asset. A write that succeeds while a later reference sync or delete fails is
   * reported as an error without further cleanup; the new TMX stays in place.
   */
  async function convertToTmx() {
    const newPath = tmxConversionPath(assetPath)
    if (newPath === assetPath) return
    editor.setSaveState({ status: 'saving', message: copy.saving })
    try {
      const normalizedDocument = {
        ...mapDocument,
        relativePath: newPath,
        format: 'tmx' as const,
      }
      const result = await buildCpMakerMapAsset({ relativePath: newPath, mapDocument: hostMapDocument(normalizedDocument) })
      const asset = result.asset
      await project.writeProjectAssets([...result.companionAssets, asset], 'edited')
      for (const patchId of collectPatchesReferencingAsset(draftPort.draft.patches, assetPath)) {
        draftPort.updatePatch(patchId, { fromFile: newPath })
      }
      await project.deleteProjectAsset(assetPath)
      draftPort.updatePatch(patch.id, {
        fromFile: newPath,
        editorState: { ...editorState, mapDocument: normalizedDocument },
      })
      editor.setSaveState({ status: 'saved', message: copy.tbinConverted(newPath) })
    } catch (error) {
      editor.setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  undoRef.current = editor.undo
  redoRef.current = editor.redo
  saveRef.current = () => void saveMap()

  return (
    <div className="map-asset-editor">
      <header className="map-asset-editor-header">
        <button
          type="button"
          className="icon-button"
          aria-label={copy.returnToLibrary}
          title={copy.returnToLibrary}
          onClick={resources.onReturnToLibrary}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="map-asset-editor-title">
          <strong>{document.name}</strong>
          <span title={assetPath}>{assetPath}</span>
        </div>
        <span
          className={cx('map-asset-save-status', (editor.saveState.status === 'error' || documentIssueCount > 0) && 'is-error')}
          aria-live="polite"
        >
          {editor.saveState.message}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={copy.undo}
          title={copy.undoTitle}
          disabled={editor.undoStack.length === 0}
          onClick={editor.undo}
        >
          <Undo2 className={cx('h-4 w-4', editor.undoStack.length === 0 && 'opacity-35')} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={copy.redo}
          title={copy.redoTitle}
          disabled={editor.redoStack.length === 0}
          onClick={editor.redo}
        >
          <Redo2 className={cx('h-4 w-4', editor.redoStack.length === 0 && 'opacity-35')} />
        </button>
        {!isXnbAsset ? (
          <button
            type="button"
            className="control-button control-button-primary"
            disabled={
              editor.saveState.status === 'saving' ||
              !assetPath.trim() ||
              tbinIssues.length > 0 ||
              layerNameIssues.length > 0 ||
              invalidTsxSourceTilesets.length > 0
            }
            onClick={() => void saveMap()}
          >
            <Save className="h-3.5 w-3.5" />
            {copy.save}
          </button>
        ) : null}
        <button
          type="button"
          className={cx('control-button', documentIssueCount > 0 && 'is-danger')}
          onClick={() => {
            editor.setInspectorView('diagnostics')
            editor.setInspectorTab(null)
          }}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          {copy.formatCheck}
        </button>
      </header>

      {isXnbAsset ? (
        <div className="map-asset-xnb-banner" role="alert">
          <span>{copy.xnbReadOnlyBanner}</span>
          <button type="button" className="control-button control-button-primary" onClick={() => void convertToTmx()}>
            <FileOutput className="h-3.5 w-3.5" />
            {copy.tbinConvertAction}
          </button>
        </div>
      ) : null}

      {tbinIssues.length > 0 ? (
        <div className="map-asset-tbin-diagnostics" role="alert">
          <strong>{copy.tbinSaveBlocked}</strong>
          <ul>
            {tbinIssues.map((issue) => (
              <li key={issue}>{copy.tbinIssues[issue]}</li>
            ))}
          </ul>
          <span className="map-asset-convert-hint">{copy.tbinConvertHint}</span>
          <button
            type="button"
            className="control-button control-button-primary map-asset-convert-action"
            onClick={() => void convertToTmx()}
          >
            <FileOutput className="h-3.5 w-3.5" />
            {copy.tbinConvertAction}
          </button>
        </div>
      ) : null}
      {layerNameIssues.length > 0 ? (
        <div className="map-asset-tbin-diagnostics" role="alert">
          <strong>{copy.layerNameValidationTitle}</strong>
          <ul>
            {layerNameIssues.map((issue) => (
              <li key={issue.kind === 'empty' ? `empty:${issue.id}` : `duplicate:${issue.name.toLowerCase()}`}>
                {issue.kind === 'empty' ? copy.emptyLayerName(issue.id) : copy.duplicateLayerName(issue.name)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={cx('map-asset-editor-body', editor.inspectorView === 'properties' && !editor.inspectorTab && 'has-collapsed-inspector')}
      >
        <MapAssetEditorLayersPanel
          document={document}
          assetPath={assetPath}
          activeLayer={editor.activeLayer}
          lockedLayerIds={editor.lockedLayerIds}
          selectedObjectGroup={editor.selectedObjectGroup}
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
            editor.setInspectorView('properties')
            editor.setInspectorTab('map')
          }}
          onActivateObjectGroup={(groupId) => {
            editor.setActiveObjectGroupId(groupId)
            editor.setSelectedObjectId(null)
            editor.setInspectorView('properties')
            editor.setInspectorTab('objects')
          }}
          onAddLayer={editor.addLayer}
          onDuplicateLayer={editor.duplicateActiveLayer}
          onRequestDeleteLayer={() => activeLayer && editor.setPendingDeleteLayerId(activeLayer.id)}
          onMoveLayer={(layerId, offset) => editor.updateDocument(reorderMapAssetLayer(document, layerId, offset))}
          onOpenMapInspector={() => {
            editor.setInspectorView('properties')
            editor.setInspectorTab('map')
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
              contextMenuEnabled
              contextMenuExtraItems={(contextTile) => (
                <>
                  <ContextMenu.Separator className="context-menu-separator" />
                  <ContextMenu.Item
                    className="context-menu-item"
                    disabled={!contextTile}
                    onSelect={() => {
                      if (!contextTile) return
                      editor.setSelectedTile({ x: contextTile.tileX, y: contextTile.tileY })
                      const layer = document.layers.find((candidate) => candidate.name === contextTile.layerName)
                      if (layer) editor.setActiveLayerId(layer.id)
                      editor.setTool('inspect')
                      editor.setInspectorView('properties')
                      editor.setInspectorTab('tile')
                    }}
                  >
                    <MousePointer2 className="mr-2 h-3.5 w-3.5" />
                    {copy.toolLabels.inspect}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    disabled={!contextTile?.tilesetName || contextTile.tileId == null}
                    onSelect={() => {
                      if (!contextTile?.tilesetName || contextTile.tileId == null) return
                      editor.setPaletteSelection({
                        tilesetName: contextTile.tilesetName,
                        startIndex: contextTile.tileId,
                        width: 1,
                        height: 1,
                      })
                      editor.setTool('brush')
                    }}
                  >
                    <Paintbrush className="mr-2 h-3.5 w-3.5" />
                    {copy.toolLabels.brush}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    disabled={!contextTile || editor.activeLayerLocked}
                    onSelect={() => {
                      if (!contextTile || !editor.activeLayer) return
                      editor.updateDocument(
                        applyMapAssetStroke(document, editor.activeLayer.id, [{ x: contextTile.tileX, y: contextTile.tileY }], 0),
                        `map-asset-context-erase:${patch.id}:${editor.activeLayer.id}`,
                      )
                    }}
                  >
                    <Eraser className="mr-2 h-3.5 w-3.5" />
                    {copy.toolLabels.erase}
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="context-menu-item"
                    disabled={!contextTile}
                    onSelect={() => {
                      if (!contextTile) return
                      const point = { x: contextTile.tileX, y: contextTile.tileY }
                      editor.setSelectedTile(point)
                      editor.addTileDataObject(point)
                      editor.setInspectorTab('objects')
                    }}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    {copy.addTileData}
                  </ContextMenu.Item>
                </>
              )}
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
                        `map-asset-rectangle:${patch.id}:${activeLayer.id}`,
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
            {editor.paletteOpen ? authoringCopy.editorShell.hidePalette : authoringCopy.editorShell.showPalette}
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
          selectedObject={editor.selectedObject}
          selectedObjectGroup={editor.selectedObjectGroup}
          selectedObjectId={editor.selectedObjectId}
          paletteSelection={editor.paletteSelection}
          tilesetOptions={tilesetOptions}
          isTmxAsset={isTmxAsset}
          tbinIssues={tbinIssues}
          layerNameIssues={layerNameIssues}
          invalidTsxSourceTilesets={invalidTsxSourceTilesets}
          documentIssueCount={documentIssueCount}
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
          onConvertToTmx={convertToTmx}
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

      <Dialog
        open={editor.pendingDeleteLayerId != null}
        onClose={() => editor.setPendingDeleteLayerId(null)}
        size="sm"
        labelledBy="delete-map-layer-title"
      >
        <DialogHeader
          id="delete-map-layer-title"
          title={copy.deleteLayerTitle}
          onClose={() => editor.setPendingDeleteLayerId(null)}
          closeLabel={copy.cancel}
        />
        <DialogBody>
          <p>{copy.deleteLayerDescription}</p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => editor.setPendingDeleteLayerId(null)}>{copy.cancel}</DialogAction>
          <DialogAction
            tone="danger"
            onClick={() => {
              if (editor.pendingDeleteLayerId == null) return
              const next = deleteMapAssetLayer(document, editor.pendingDeleteLayerId)
              editor.updateDocument(next)
              editor.setActiveLayerId(next.layers[0]?.id ?? 0)
              editor.setPendingDeleteLayerId(null)
            }}
          >
            {copy.deleteLayer}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

export type MapAssetEditorSessionProps = {
  relativePath: string
  document: MapDocument
  draftPort: AssetDraftPort
  resources: EditorResources
}

/**
 * Hosts a real map-file editing session without inserting an editor-only patch
 * into the Content Patcher draft. The adapter only keeps the open document in
 * page state; `MapAssetEditor` persists TMX/TBIN through the project asset API.
 */
export function MapAssetEditorSession({ relativePath, document, draftPort, resources }: MapAssetEditorSessionProps) {
  const [sessionPatch, setSessionPatch] = useState<DraftPatch>(() => ({
    id: `map-asset-session:${relativePath}`,
    workspace: 'map',
    target: '',
    action: 'Load',
    logName: document.name,
    enabled: true,
    fromFile: relativePath,
    editorState: { mapDocument: document },
  }))
  const sessionPort: AssetDraftPort = {
    ...draftPort,
    updatePatch: (_patchId, changes) => setSessionPatch((current) => ({ ...current, ...changes })),
  }

  return <MapAssetEditor patch={sessionPatch} schema={null} draftPort={sessionPort} resources={resources} />
}
