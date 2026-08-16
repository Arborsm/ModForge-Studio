import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ArrowLeft, BadgeCheck, Eraser, FileOutput, MousePointer2, Paintbrush, Plus, Save } from 'lucide-react'
import {
  MapTilesetPalette,
  MapViewport,
  type MapDocument,
  type MapInspectorHighlight,
  type MapTileRect,
  type MapViewportHandle,
} from '@entities/map'
import {
  deriveMapDocumentLighting,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  getLightingPreviewTimeOfDay,
  OUTDOORS_PROPERTY_KEY,
  asMapPropertyString,
  type GameSeason,
  type MapLightingPreviewMode,
  type MapPropertyValue,
} from '@entities/map'
import { deriveCellOverlayView, type CellOverlayCell } from '@entities/map'
import { planCellAnimationHoist } from '@entities/map'
import { loadImageDataUrl, type GameImageAssetSummary } from '@entities/game/api'
import { type AssetDraftPort, type DraftPatch, type EditorComponent, type EditorResources } from '@features/cp-maker'
import { buildCpMakerMapAsset } from '@features/cp-maker/api'
import { type ResourceBrowserOption } from '@features/resource-browser'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { measureImageDimensions } from '@shared/lib/assets'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { availableAssetPath } from '../../asset-library/model/importGameMap'
import { dataUrlToProjectAsset } from '../../asset-library/model/importGameAsset'
import {
  applyMapAssetStroke,
  collectMapAssetLayerNameIssues,
  collectMapAssetTbinIssues,
  deleteMapAssetLayer,
  reorderMapAssetLayer,
  rotateMapAssetTileClockwise,
  toggleMapAssetTileFlag,
} from '../model/mapAssetReducer'
import { collectPatchesReferencingAsset, tmxConversionPath } from '../model/mapAssetConversion'
import { rectangleTilePoints } from '../model/mapPatchReducer'
import { isValidTsxSource } from '../model/mapTilesetSource'
import { loadGameMapDocument } from '../model/gameMapLoad'
import { mapCatalogCategory } from '../state/mapAuthoringCatalog'
import { useMapAuthoringCatalog } from '../state/useMapAuthoringCatalog'
import { GameTilesheetPickerDialog } from './core/GameTilesheetPickerDialog'
import { MapAssetEditorHistoryPanel } from './core/MapAssetEditorHistoryPanel'
import { MapAssetEditorInspector } from './core/MapAssetEditorInspector'
import { MapAssetEditorLayersPanel } from './core/MapAssetEditorLayersPanel'
import { MapAssetCellOverlayRules } from './core/MapAssetCellOverlayRules'
import { MapAssetEditorToolbar } from './core/MapAssetEditorToolbar'
import { MapAssetTopBarChips } from './core/MapAssetTopBarChips'
import { MapCanvasZoomChip } from './core/MapCanvasZoomChip'
import { useMapDocumentEditor, type AssetTool } from './core/useMapDocumentEditor'
import type { WarpDialogMapOption } from './core/WarpDialog'
import { MapLightingPreviewControls } from '../ui/MapLightingPreviewControls'
import { useObjectLightItemIndex } from '../state/useObjectLightItemIndex'

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

  const viewportRef = useRef<MapViewportHandle | null>(null)
  const [zoomState, setZoomState] = useState<{ zoom: number; mode: 'fit' | 'manual' }>({ zoom: 1, mode: 'fit' })
  const diagnosticsFlashTimeoutRef = useRef<number | null>(null)
  const leftColumnRef = useRef<HTMLDivElement | null>(null)
  /** Layers/history split as the layers panel height percentage of the left column. */
  const [leftSplitPercent, setLeftSplitPercent] = useState(57)
  const [isSplitDragging, setIsSplitDragging] = useState(false)
  /** Canvas highlight driven by inspector entry hover; null clears it. */
  const [inspectorHighlight, setInspectorHighlight] = useState<MapInspectorHighlight | null>(null)

  useEffect(
    () => () => {
      if (diagnosticsFlashTimeoutRef.current != null) window.clearTimeout(diagnosticsFlashTimeoutRef.current)
    },
    [],
  )

  const toolRef = useRef(editor.tool)
  toolRef.current = editor.tool
  const overlayActiveRef = useRef(editor.overlayActive)
  overlayActiveRef.current = editor.overlayActive
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
      // While the overlay owns the canvas, tool shortcuts are inert; the paint
      // rules replace them until the overlay is turned off again.
      if (overlayActiveRef.current || !shortcuts[key]) return
      editor.setTool(shortcuts[key])
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
  const [gameTilesetPickerOpen, setGameTilesetPickerOpen] = useState(false)
  const [addingGameTileset, setAddingGameTileset] = useState<string | null>(null)
  const [lightingMode, setLightingMode] = useState<MapLightingPreviewMode>('day')
  const [lightingSeason, setLightingSeason] = useState<GameSeason>('spring')
  const objectLightIndex = useObjectLightItemIndex(resources.directoryInfo, resources.locale)
  /** Whether the map is an outdoor location; the `Outdoors` property is the master lighting switch. */
  const isOutdoor = asMapPropertyString(mapDocument.properties[OUTDOORS_PROPERTY_KEY]).trim() !== ''
  const mapCatalog = useMapAuthoringCatalog(resources.gameRootPath, resources.directoryInfo, resources.locale)
  /** Localized warp target choices: game maps first, then project map assets. */
  const warpMapOptions = useMemo<readonly WarpDialogMapOption[]>(
    () => [
      ...mapCatalog.assets.map((asset) => ({
        value: asset.name,
        label: asset.name,
        description: authoringCopy.categories[mapCatalogCategory(asset.name)],
      })),
      ...project.projectAssets
        .filter((asset) => /\.(?:tmx|tbin)$/iu.test(asset.relativePath))
        .map((asset) => {
          const name =
            asset.relativePath
              .split('/')
              .pop()
              ?.replace(/\.(?:tmx|tbin)$/iu, '') ?? asset.relativePath
          return {
            value: name,
            label: name,
            description: asset.relativePath,
          }
        }),
    ],
    [authoringCopy.categories, mapCatalog.assets, project.projectAssets],
  )
  const loadWarpTargetDocument = useMemo(
    () => (target: string) => {
      if (!resources.gameRootPath) return Promise.reject(new Error(authoringCopy.assetEditor.noGameRootForWarp))
      return loadGameMapDocument(resources.gameRootPath, target, resources.locale)
    },
    [authoringCopy.assetEditor.noGameRootForWarp, resources.gameRootPath, resources.locale],
  )
  /** Writes map-level properties through the editor's history (mergeKey + label supplied by callers). */
  const updateMapProperties = (nextProperties: Record<string, MapPropertyValue>, mergeKey?: string | null, label?: string) =>
    editor.updateDocument({ ...document, properties: nextProperties }, mergeKey ?? null, label)
  /** Toggles the `Outdoors` property (presence = outdoor) as the lighting master switch. */
  const toggleOutdoor = () => {
    const next = { ...document.properties }
    if (isOutdoor) delete next[OUTDOORS_PROPERTY_KEY]
    else next[OUTDOORS_PROPERTY_KEY] = 'T'
    updateMapProperties(next, `map-property:${OUTDOORS_PROPERTY_KEY}`, authoringCopy.assetEditor.editOutdoors)
  }
  const worldLighting = useMemo(
    () =>
      deriveMapDocumentLighting(editor.renderDocument, getLightingPreviewTimeOfDay(lightingMode, lightingSeason), lightingSeason, {
        objectLightIndex,
      }),
    [editor.renderDocument, lightingMode, lightingSeason, objectLightIndex],
  )
  /** Render document with the dragged marker's live position swapped in; never persisted. */
  const objectDragPreview = editor.objectDragPreview
  const viewportDocument = objectDragPreview
    ? {
        ...editor.renderDocument,
        objectGroups: editor.renderDocument.objectGroups.map((group) => ({
          ...group,
          objects: group.objects.map((object) =>
            object.id === objectDragPreview.objectId
              ? { ...object, x: objectDragPreview.tileX * mapDocument.tileWidth, y: objectDragPreview.tileY * mapDocument.tileHeight }
              : object,
          ),
        })),
      }
    : editor.renderDocument

  /**
   * Overlay view model for the active layer's cell rules: the derived rules
   * plus the in-flight drag preview merged on top (walkable removes cells).
   * Null while the overlay mode is off, so MapViewport draws nothing extra.
   */
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

  /**
   * Copies a vanilla game tilesheet into the project under
   * `assets/maps/tilesheets/` (deduplicating names), then attaches it to the
   * map through the standard addTileset path. Dimensions are validated before
   * the copy so a rejected tilesheet never leaves an orphan project asset.
   */
  async function addGameTilesheet(asset: GameImageAssetSummary) {
    setAddingGameTileset(asset.relativePath)
    try {
      const dataUrl = await loadImageDataUrl(asset.absolutePath, resources.locale)
      const dimensions = await measureImageDimensions(dataUrl)
      if (dimensions.width % mapDocument.tileWidth !== 0 || dimensions.height % mapDocument.tileHeight !== 0) {
        throw new Error(copy.invalidTilesetDimensions(dimensions.width, dimensions.height, mapDocument.tileWidth, mapDocument.tileHeight))
      }
      const safeName = (asset.name.split('/').at(-1) ?? 'tilesheet').replace(/[^A-Za-z0-9._-]+/gu, '_') || 'tilesheet'
      const usedPaths = new Set(project.projectAssets.map((entry) => entry.relativePath.replaceAll('\\', '/').toLowerCase()))
      const imagePath = availableAssetPath(`assets/maps/tilesheets/${safeName}.png`, usedPaths)
      await project.writeProjectAssets([dataUrlToProjectAsset(dataUrl, imagePath, copy.loadingTileset)], 'generated')
      await editor.addTileset(imagePath)
      setGameTilesetPickerOpen(false)
    } catch (error) {
      editor.setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setAddingGameTileset(null)
    }
  }

  /**
   * Save message suffix counting per-cell animations the TMX write will hoist
   * into tileset definitions or drop over a definition conflict. TBin saves
   * keep the `cellAnimations` backing store, so only TMX output warns.
   */
  function cellAnimationHoistMessage(format: 'tmx' | 'tbin') {
    if (format !== 'tmx') return null
    const plan = planCellAnimationHoist(mapDocument)
    if (plan.hoisted === 0 && plan.dropped === 0) return null
    return copy.cellAnimationHoistWarning(plan.hoisted, plan.dropped)
  }

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
      draftPort.updatePatch(
        patch.id,
        {
          fromFile: asset.relativePath,
          editorState: { ...editorState, mapDocument: normalizedDocument },
        },
        { record: false },
      )
      const savedMessage = copy.saved(asset.relativePath)
      const hoistMessage = cellAnimationHoistMessage(normalizedDocument.format)
      editor.setSaveState({ status: 'saved', message: hoistMessage ? `${savedMessage} ${hoistMessage}` : savedMessage })
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
        draftPort.updatePatch(patchId, { fromFile: newPath }, { record: false })
      }
      await project.deleteProjectAsset(assetPath)
      draftPort.updatePatch(
        patch.id,
        {
          fromFile: newPath,
          editorState: { ...editorState, mapDocument: normalizedDocument },
        },
        { record: false },
      )
      const savedMessage = copy.tbinConverted(newPath)
      const hoistMessage = cellAnimationHoistMessage('tmx')
      editor.setSaveState({ status: 'saved', message: hoistMessage ? `${savedMessage} ${hoistMessage}` : savedMessage })
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
        {editor.capabilities.mapProperties ? (
          <MapAssetTopBarChips
            properties={document.properties}
            onChange={updateMapProperties}
            isOutdoor={isOutdoor}
            onToggleOutdoor={toggleOutdoor}
          />
        ) : null}
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
            const diagnostics = globalThis.document.getElementById('map-asset-diagnostics')
            diagnostics?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            if (diagnostics) {
              diagnostics.classList.add('is-flash')
              if (diagnosticsFlashTimeoutRef.current != null) window.clearTimeout(diagnosticsFlashTimeoutRef.current)
              diagnosticsFlashTimeoutRef.current = window.setTimeout(() => diagnostics.classList.remove('is-flash'), 1000)
            }
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

      <div className="map-asset-editor-body">
        <div className="map-asset-leftcol" ref={leftColumnRef} style={{ '--map-leftcol-split': `${leftSplitPercent}%` } as CSSProperties}>
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
            onAddLayer={editor.addLayer}
            onDuplicateLayer={editor.duplicateActiveLayer}
            onRequestDeleteLayer={() => activeLayer && editor.setPendingDeleteLayerId(activeLayer.id)}
            onMoveLayer={(layerId, offset) =>
              editor.updateDocument(
                reorderMapAssetLayer(document, layerId, offset),
                undefined,
                offset > 0 ? copy.moveLayerUp : copy.moveLayerDown,
              )
            }
          />
          <div
            className={cx('map-asset-leftcol-divider', isSplitDragging && 'is-active')}
            role="separator"
            aria-orientation="horizontal"
            aria-label={copy.historySplitResize}
            onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
              if (event.button !== 0 || !leftColumnRef.current) return
              event.currentTarget.setPointerCapture(event.pointerId)
              setIsSplitDragging(true)
            }}
            onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
              const column = leftColumnRef.current
              if (!column || !event.currentTarget.hasPointerCapture(event.pointerId)) return
              const bounds = column.getBoundingClientRect()
              if (bounds.height <= 0) return
              const ratio = ((event.clientY - bounds.top) / bounds.height) * 100
              setLeftSplitPercent(Math.min(80, Math.max(20, Math.round(ratio))))
            }}
            onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
              setIsSplitDragging(false)
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            onPointerCancel={() => setIsSplitDragging(false)}
          />
          <MapAssetEditorHistoryPanel
            entries={editor.historyEntries}
            canUndo={editor.undoStack.length > 0}
            canRedo={editor.redoStack.length > 0}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onJumpTo={editor.jumpToHistory}
          />
        </div>

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
              ref={viewportRef}
              locale={resources.locale}
              onZoomChange={(zoom, mode) =>
                setZoomState((current) => (current.zoom === zoom && current.mode === mode ? current : { zoom, mode }))
              }
              mapDocument={viewportDocument}
              visibleLayerIds={document.layers.filter((layer) => layer.visible).map((layer) => layer.id)}
              visibleObjectGroupIds={document.objectGroups.filter((group) => group.visible).map((group) => group.id)}
              hideRuleTileDataObjects
              objectDrag={
                !editor.overlayActive && editor.tool === 'inspect' && editor.capabilities.objectGroups
                  ? { onStart: editor.beginObjectDrag, onPreview: editor.previewObjectDrag, onEnd: editor.endObjectDrag }
                  : undefined
              }
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
                        undefined,
                        copy.historyToolAction(copy.toolLabels.erase, editor.activeLayer.name),
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
                    }}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    {copy.addTileData}
                  </ContextMenu.Item>
                </>
              )}
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
              inspectorHighlight={inspectorHighlight}
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
                        copy.historyToolAction(copy.toolLabels.rectangle, activeLayer.name),
                      )
                  : undefined
              }
              cellOverlay={overlayCells}
              worldLighting={worldLighting}
              gameRootPath={resources.gameRootPath}
            />
            {editor.overlayActive ? (
              <MapAssetCellOverlayRules activeRule={editor.overlayRule} onRuleChange={editor.setOverlayRule} />
            ) : null}
            <MapLightingPreviewControls
              mode={lightingMode}
              season={lightingSeason}
              outdoors={isOutdoor}
              onModeChange={setLightingMode}
              onSeasonChange={setLightingSeason}
            />
            <MapCanvasZoomChip
              zoom={zoomState.zoom}
              mode={zoomState.mode}
              onZoomIn={() => viewportRef.current?.zoomIn()}
              onZoomOut={() => viewportRef.current?.zoomOut()}
              onFit={() => viewportRef.current?.fitToScreen()}
              transformsEnabled={editor.capabilities.flipRotate}
              canTransform={Boolean(editor.activeLayer && editor.selectedTile)}
              onFlipHorizontal={() => {
                if (!editor.activeLayer || !editor.selectedTile) return
                editor.updateDocument(
                  toggleMapAssetTileFlag(document, editor.activeLayer.id, editor.selectedTile, FLIPPED_HORIZONTALLY_FLAG),
                  undefined,
                  copy.flipHorizontal,
                )
              }}
              onFlipVertical={() => {
                if (!editor.activeLayer || !editor.selectedTile) return
                editor.updateDocument(
                  toggleMapAssetTileFlag(document, editor.activeLayer.id, editor.selectedTile, FLIPPED_VERTICALLY_FLAG),
                  undefined,
                  copy.flipVertical,
                )
              }}
              onRotateClockwise={() => {
                if (!editor.activeLayer || !editor.selectedTile) return
                editor.updateDocument(
                  rotateMapAssetTileClockwise(document, editor.activeLayer.id, editor.selectedTile),
                  undefined,
                  copy.rotateClockwise,
                )
              }}
            />
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
                resizeLabel={copy.paletteResize}
              />
            ) : null}
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
          selectedObject={editor.selectedObject}
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
          capabilities={editor.capabilities}
          onSetSelectedObjectId={editor.setSelectedObjectId}
          onSetActiveObjectGroupId={editor.setActiveObjectGroupId}
          onUpdateDocument={editor.updateDocument}
          onUpdateActiveLayer={editor.updateActiveLayer}
          onUpdateSelectedTileset={editor.updateSelectedTileset}
          onUpdateSelectedObject={editor.updateSelectedObject}
          onDeleteSelectedObject={editor.deleteSelectedObject}
          onAddTileDataObject={editor.addTileDataObject}
          onLocateObject={(object) => {
            editor.setSelectedObjectId(object.id)
            viewportRef.current?.centerOnWorldPoint(object.x + object.width / 2, object.y + object.height / 2)
          }}
          onAddTileset={editor.addTileset}
          onAddGameTileset={() => setGameTilesetPickerOpen(true)}
          objectLightIndex={objectLightIndex}
          gameTilesetAvailable={Boolean(resources.gameRootPath)}
          gameTilesetUnavailableTitle={copy.gameTilesetNoGameRoot}
          mapOptions={warpMapOptions}
          loadTargetDocument={loadWarpTargetDocument}
          onLocateLayer={(layerId) => editor.setActiveLayerId(layerId)}
          onHighlightInspector={setInspectorHighlight}
          locale={resources.locale}
          theme={resources.theme}
          accentColor={resources.accentColor}
          onConvertToTmx={convertToTmx}
        />
      </div>

      <footer className="map-asset-statusbar">
        <span>{copy.statusDimensions(document.width, document.height, document.tileWidth)}</span>
        <span>{editor.activeLayer?.name ?? '-'}</span>
        <span />
        <span>
          {editor.paletteSelection
            ? copy.statusBrush(editor.paletteSelection.tilesetName, editor.paletteSelection.width, editor.paletteSelection.height)
            : '-'}
        </span>
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
              editor.updateDocument(next, undefined, copy.deleteLayer)
              editor.setActiveLayerId(next.layers[0]?.id ?? 0)
              editor.setPendingDeleteLayerId(null)
            }}
          >
            {copy.deleteLayer}
          </DialogAction>
        </DialogFooter>
      </Dialog>

      <GameTilesheetPickerDialog
        open={gameTilesetPickerOpen}
        gameRootPath={resources.gameRootPath}
        locale={resources.locale}
        busyAssetPath={addingGameTileset}
        onClose={() => setGameTilesetPickerOpen(false)}
        onPick={(asset) => void addGameTilesheet(asset)}
      />
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
