import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  syncLightMapProperty,
  type MapDocument,
  type MapLayer,
  type MapObject,
  type MapTileset,
  type MapTilesetPaletteSelection,
  type TileHoverInfo,
  type CellOverlayRule,
} from '@entities/map'
import { useLocalUndoShortcutOwner, type AssetDraftPort, type ProjectAssetRef } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { measureImageDimensions } from '@shared/lib/assets'
import { usePreferencesStore } from '@shared/lib/app-state'
import {
  addMapAssetLayer,
  applyMapAssetStamp,
  applyMapAssetStroke,
  mapAssetBucketPoints,
  relativeMapAssetReference,
  setMapAssetCellOverlay,
} from '../../model/mapAssetReducer'
import {
  buildMapHistoryTimeline,
  changedFieldKeys,
  mapsEqual,
  partialUpdateMergeKey,
  pushMapHistory,
  tilesetUpdateMergeKey,
  type MapEditorHistoryEntry,
  type MapHistoryEntry,
} from '../../model/mapHistoryStack'

export type AssetTool = 'inspect' | 'brush' | 'stamp' | 'fill' | 'erase' | 'rectangle' | 'eyedropper' | 'hand'

/**
 * Editing capabilities of the map document core. The asset editor enables every
 * capability; session modes (for example a patch-tiles workflow) can disable
 * subsets to restrict what a user can edit without changing document state.
 */
export type MapEditorCapabilities = {
  /** Layer add/duplicate/delete/reorder/lock and per-layer details editing. */
  layerManagement: boolean
  /** Object group rows, group details, and object add/delete/transform editing. */
  objectGroups: boolean
  /** Map-level property editing in the map inspector panel. */
  mapProperties: boolean
  /** Tileset add/replace and tileset/tile-definition property editing. */
  tilesetManagement: boolean
  /** Tile flip and rotate transforms in the zoom chip. */
  flipRotate: boolean
  /** Per-cell property editing through the canvas grid-rule overlay mode. */
  cellProperties: boolean
}

/** Default capability set: every editing surface is available. */
export const DEFAULT_MAP_EDITOR_CAPABILITIES: MapEditorCapabilities = {
  layerManagement: true,
  objectGroups: true,
  mapProperties: true,
  tilesetManagement: true,
  flipRotate: true,
  cellProperties: true,
}

export type MapEditorSaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; message: string }

export type MapDocumentEditorOptions = {
  /** Current map document; it lives in the draft patch editor state, so the parent passes it in. */
  document: MapDocument
  /** Editor-state envelope that stores the document; spread when persisting an update. */
  editorState: Record<string, unknown>
  /** Id of the patch whose editor state carries the document. */
  patchId: string
  /**
   * Draft port used to persist document updates back into the patch editor
   * state. Omit it together with `persistDocument` when the document stays in
   * local state until a session completes.
   */
  draftPort?: AssetDraftPort
  /** Project-relative asset path used for tileset references and save/convert decisions. */
  assetPath: string
  /** Reads a project asset's persisted bytes so tileset images can be previewed. */
  readProjectAsset: (relativePath: string) => Promise<{ asset: ProjectAssetRef; bytesBase64: string }>
  /** Normalized paths of project image assets; tileset image paths outside this set are never resolved. */
  imageAssetPaths: ReadonlySet<string>
  /** Capability overrides; every capability defaults to enabled. */
  capabilities?: Partial<MapEditorCapabilities>
  /**
   * Overrides the persistence sink. Session modes keep the document purely
   * local until completion and pass e.g. a `setState`; the default (asset mode)
   * writes through `draftPort.updatePatch` unchanged.
   */
  persistDocument?: (nextDocument: MapDocument) => void
}

export type MapDocumentEditor = {
  capabilities: MapEditorCapabilities
  mapDocument: MapDocument
  activeLayer: MapLayer | null
  activeLayerLocked: boolean
  renderDocument: MapDocument
  selectedTileset: MapTileset | null
  selectedObject: MapObject | null
  selectedTileDefinitionProperties: Record<string, unknown>
  activeLayerId: number
  tool: AssetTool
  selectedTile: { x: number; y: number } | null
  hoverInfo: TileHoverInfo | null
  /** Whether the cell-rule overlay mode paints the active layer's rules on the canvas. */
  overlayActive: boolean
  /** Selected paint rule in the overlay rule bar; `walkable` erases rules. */
  overlayRule: CellOverlayRule
  /** Cells painted during the in-flight drag, for live canvas preview; null when idle. */
  overlayPaintPreview: readonly { tileX: number; tileY: number }[] | null
  setOverlayActive: Dispatch<SetStateAction<boolean>>
  setOverlayRule: Dispatch<SetStateAction<CellOverlayRule>>
  /** Commits one overlay drag as a single history entry (label carries rule + layer). */
  commitCellOverlayStroke: (points: readonly { tileX: number; tileY: number }[]) => void
  /** Feeds the live paint preview while an overlay drag is in progress. */
  previewCellOverlayStroke: (points: readonly { tileX: number; tileY: number }[]) => void
  paletteSelection: MapTilesetPaletteSelection | null
  saveState: MapEditorSaveState
  pendingDeleteLayerId: number | null
  selectedObjectId: number | null
  activeObjectGroupId: number
  projectImageUrls: Record<string, string>
  paletteOpen: boolean
  undoStack: MapHistoryEntry[]
  redoStack: MapHistoryEntry[]
  /**
   * Undo/redo timeline for the history panel: past entries oldest→newest
   * (keys `u0..uN`), then the current document (key `current`), then future
   * redo entries in replay order (keys `r0..rM`).
   */
  historyEntries: MapEditorHistoryEntry[]
  /**
   * Restores the document at a history step (`u<i>` past entry, `current`, or
   * `r<i>` future entry) and splits both stacks at the jump point so undo/redo
   * continue from there. `current` is a no-op.
   */
  jumpToHistory: (key: string) => void
  lockedLayerIds: ReadonlySet<number>
  setActiveLayerId: Dispatch<SetStateAction<number>>
  setTool: Dispatch<SetStateAction<AssetTool>>
  setSelectedTile: Dispatch<SetStateAction<{ x: number; y: number } | null>>
  setHoverInfo: Dispatch<SetStateAction<TileHoverInfo | null>>
  setPaletteSelection: Dispatch<SetStateAction<MapTilesetPaletteSelection | null>>
  setSaveState: Dispatch<SetStateAction<MapEditorSaveState>>
  setPendingDeleteLayerId: Dispatch<SetStateAction<number | null>>
  setSelectedObjectId: Dispatch<SetStateAction<number | null>>
  setActiveObjectGroupId: Dispatch<SetStateAction<number>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setLockedLayerIds: Dispatch<SetStateAction<Set<number>>>
  updateDocument: (nextDocument: MapDocument, mergeKey?: string | null, label?: string) => void
  undo: () => void
  redo: () => void
  commitStroke: (points: readonly { tileX: number; tileY: number }[]) => void
  clickTile: (x: number, y: number) => void
  addTileset: (relativePath: string, replaceName?: string) => Promise<void>
  deleteSelectedObject: () => void
  updateSelectedObject: (updates: Partial<MapObject>) => void
  updateActiveLayer: (updates: Partial<MapLayer>) => void
  updateSelectedTileset: (updater: (tileset: MapTileset) => MapTileset) => void
  addTileDataObject: (point?: { x: number; y: number }) => void
  /**
   * Live tile position of the marker being dragged on the canvas, or null when
   * no drag is active. Transient: it never enters the undo history.
   */
  objectDragPreview: { objectId: number; tileX: number; tileY: number } | null
  /** Starts a canvas marker drag: selects the marker and reveals its details in the inspector. */
  beginObjectDrag: (objectId: number) => void
  /** Updates the drag preview while the pointer moves; renders without committing history. */
  previewObjectDrag: (objectId: number, tileX: number, tileY: number) => void
  /** Ends a drag and commits one history entry when the marker actually moved. */
  endObjectDrag: () => void
  addLayer: () => void
  duplicateActiveLayer: () => void
}

function nextTilesetFirstGid(document: MapDocument) {
  return document.tilesets.reduce((maximum, tileset) => Math.max(maximum, tileset.firstGid + tileset.tileCount), 1)
}

/**
 * Owns the map document editing core: document state, undo/redo stacks,
 * selection, tool state, and every stroke/layer/object/tileset mutation.
 * The document itself is persisted through the draft port's editor state, so
 * the hook derives it from `options.document` and spreads `options.editorState`
 * when persisting an update. Capability-gated actions no-op when the matching
 * capability is disabled, so session modes can restrict management surfaces.
 */
export function useMapDocumentEditor(options: MapDocumentEditorOptions): MapDocumentEditor {
  const {
    document,
    editorState,
    patchId,
    draftPort,
    assetPath,
    readProjectAsset,
    imageAssetPaths,
    capabilities: capabilitiesOverride,
    persistDocument,
  } = options
  const capabilities = { ...DEFAULT_MAP_EDITOR_CAPABILITIES, ...capabilitiesOverride }
  const copy = useMapAuthoringCopy().assetEditor
  const [activeLayerId, setActiveLayerId] = useState(document.layers[0]?.id ?? 0)
  const [lockedLayerIds, setLockedLayerIds] = useState<Set<number>>(() => new Set())
  const [tool, setTool] = useState<AssetTool>('inspect')
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null)
  const [hoverInfo, setHoverInfoState] = useState<TileHoverInfo | null>(null)
  // Hover fires per pointermove with a fresh info object; only the hovered tile
  // coordinates are displayed, so suppress state updates that keep the same tile
  // to avoid re-rendering the whole editor tree on every pixel of mouse travel.
  // The callback identity must stay stable: MapViewport's reset effect depends
  // on it, and a fresh identity would clear the hover right after every update
  // (visible as flickering coordinates that only appear while moving).
  const setHoverInfo: Dispatch<SetStateAction<TileHoverInfo | null>> = useCallback((next) => {
    setHoverInfoState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      if (prev === null && value === null) return prev
      if (prev !== null && value !== null && prev.tileX === value.tileX && prev.tileY === value.tileY) return prev
      return value
    })
  }, [])
  const [paletteSelection, setPaletteSelection] = useState<MapTilesetPaletteSelection | null>(null)
  const [saveState, setSaveState] = useState<MapEditorSaveState>({ status: 'idle', message: '' })
  const [pendingDeleteLayerId, setPendingDeleteLayerId] = useState<number | null>(null)
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null)
  const [activeObjectGroupId, setActiveObjectGroupId] = useState(document.objectGroups[0]?.id ?? 0)
  const [objectDragPreview, setObjectDragPreview] = useState<{ objectId: number; tileX: number; tileY: number } | null>(null)
  const [overlayActive, setOverlayActiveState] = useState(false)
  const [overlayRule, setOverlayRule] = useState<CellOverlayRule>('walkable')
  const [overlayPaintPreview, setOverlayPaintPreview] = useState<readonly { tileX: number; tileY: number }[] | null>(null)
  const [projectImageUrls, setProjectImageUrls] = useState<Record<string, string>>({})
  // Palette open state is a responsive user preference: persisted in the shared
  // preferences store, so the palette survives editor reopen and mode switches.
  const paletteOpen = usePreferencesStore((state) => state.mapEditorPalette.paletteOpen)
  const setPaletteOpen: Dispatch<SetStateAction<boolean>> = (next) => {
    usePreferencesStore.getState().setMapEditorPalette({
      paletteOpen: typeof next === 'function' ? next(usePreferencesStore.getState().mapEditorPalette.paletteOpen) : next,
    })
  }
  const [undoStack, setUndoStack] = useState<MapHistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<MapHistoryEntry[]>([])
  /** Label of the most recent edit that produced the current document. */
  const [currentEditLabel, setCurrentEditLabel] = useState(copy.historyInitial)

  // The editor owns its undo history (this hook's stacks) and persists document
  // writes through the draft port without recording them there. Announce the
  // ownership so the workbench draft shortcut stands down while the editor is
  // mounted; otherwise Ctrl+Z would pop both stacks at once.
  useLocalUndoShortcutOwner()

  useEffect(() => {
    let active = true
    const paths = document.tilesets
      .map((tileset) => tileset.imagePath)
      .filter((path): path is string => Boolean(path && imageAssetPaths.has(path.replaceAll('\\', '/').toLowerCase())))
      .filter((path) => !projectImageUrls[path])
    if (paths.length === 0) return
    void Promise.all(
      paths.map(async (path) => {
        const payload = await readProjectAsset(path)
        return [path, `data:${payload.asset.mediaType};base64,${payload.bytesBase64}`] as const
      }),
    )
      .then((entries) => {
        if (active) setProjectImageUrls((current) => ({ ...current, ...Object.fromEntries(entries) }))
      })
      .catch((error) => {
        if (active) setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      active = false
    }
  }, [document.tilesets, readProjectAsset])

  const mapDocument = document

  const activeLayer = document.layers.find((layer) => layer.id === activeLayerId) ?? document.layers[0] ?? null
  const activeLayerLocked = activeLayer ? lockedLayerIds.has(activeLayer.id) : true
  // Memoized for downstream effect dependency stability: layer thumbnails, the
  // world-lighting bake and viewport redraws key on this identity, so it must
  // only change when the document or resolved project images actually change.
  const renderDocument: MapDocument = useMemo(
    () => ({
      ...mapDocument,
      tilesets: mapDocument.tilesets.map((tileset) => ({
        ...tileset,
        imagePath: tileset.imagePath && projectImageUrls[tileset.imagePath] ? projectImageUrls[tileset.imagePath] : tileset.imagePath,
      })),
    }),
    [mapDocument, projectImageUrls],
  )
  const selectedTileset = paletteSelection
    ? (mapDocument.tilesets.find((tileset) => tileset.name === paletteSelection.tilesetName) ?? null)
    : null
  const selectedObject = mapDocument.objectGroups.flatMap((group) => group.objects).find((object) => object.id === selectedObjectId) ?? null
  const selectedObjectGroup =
    mapDocument.objectGroups.find((group) => group.objects.some((object) => object.id === selectedObjectId)) ??
    mapDocument.objectGroups.find((group) => group.id === activeObjectGroupId) ??
    mapDocument.objectGroups[0] ??
    null
  const selectedTileDefinitionProperties =
    selectedTileset && paletteSelection ? (selectedTileset.tileProperties[paletteSelection.startIndex] ?? {}) : {}

  /** Writes a document update through the configured sink (local session or draft port). */
  function persist(nextDocument: MapDocument) {
    if (persistDocument) {
      persistDocument(nextDocument)
      return
    }
    // The map document history lives in this hook, so the port write must not
    // record itself on the draft undo stack too (one edit, one stack).
    draftPort?.updatePatch(patchId, { editorState: { ...editorState, mapDocument: nextDocument } }, { record: false })
  }

  function updateDocument(nextDocument: MapDocument, mergeKey?: string | null, label?: string) {
    if (mapsEqual(mapDocument, nextDocument)) {
      // The write changes nothing, so it must not produce a history step.
      return
    }
    const editLabel = label ?? copy.historyEdit
    // A timeline entry's label names the edit that produced that entry's
    // document, so the snapshot being pushed keeps the outgoing state's label.
    setUndoStack((stack) =>
      pushMapHistory(stack, { document: mapDocument, label: currentEditLabel, mergeKey: mergeKey ?? null, at: Date.now() }),
    )
    setRedoStack([])
    setCurrentEditLabel(editLabel)
    persist(nextDocument)
    setSaveState({ status: 'idle', message: '' })
  }

  function undo() {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]!
    setUndoStack(undoStack.slice(0, -1))
    setRedoStack([...redoStack, { document: mapDocument, label: currentEditLabel, mergeKey: null, at: Date.now() }])
    setCurrentEditLabel(previous.label)
    persist(previous.document)
    setSaveState({ status: 'idle', message: '' })
  }

  function redo() {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]!
    setRedoStack(redoStack.slice(0, -1))
    setUndoStack([...undoStack, { document: mapDocument, label: currentEditLabel, mergeKey: null, at: Date.now() }])
    setCurrentEditLabel(next.label)
    persist(next.document)
    setSaveState({ status: 'idle', message: '' })
  }

  // Timeline of every retained step: undo entries (oldest→newest), the current
  // document, then future redo entries in replay order (the redo stack is
  // stored newest-first, so its tail is the step after the current one).
  const historyEntries: MapEditorHistoryEntry[] = buildMapHistoryTimeline(undoStack, currentEditLabel, redoStack)

  function jumpToHistory(key: string) {
    if (key === 'current') return
    // Rebuild the timeline, then cut it at the target step: everything before
    // stays in the undo stack, the target becomes the current document, and
    // everything after goes back to the redo stack (reversed so redo() pops
    // the step immediately after the jump point first).
    const future = [...redoStack].reverse()
    const timeline: MapHistoryEntry[] = [
      ...undoStack,
      { document: mapDocument, label: currentEditLabel, mergeKey: null, at: Date.now() },
      ...future,
    ]
    const pastIndex = key.startsWith('u') ? Number.parseInt(key.slice(1), 10) : NaN
    const futureIndex = key.startsWith('r') ? Number.parseInt(key.slice(1), 10) : NaN
    const index = Number.isFinite(pastIndex) ? pastIndex : Number.isFinite(futureIndex) ? undoStack.length + 1 + futureIndex : -1
    if (index < 0 || index >= timeline.length) return
    const target = timeline[index]!
    setUndoStack(timeline.slice(0, index).slice(-49))
    setRedoStack(timeline.slice(index + 1).reverse())
    setCurrentEditLabel(target.label)
    persist(target.document)
    setSaveState({ status: 'idle', message: '' })
  }

  function commitStroke(points: readonly { tileX: number; tileY: number }[]) {
    if (!activeLayer || activeLayerLocked) return
    const gid = tool === 'erase' ? 0 : selectedTileset && paletteSelection ? selectedTileset.firstGid + paletteSelection.startIndex : null
    if (gid == null) return
    updateDocument(
      applyMapAssetStroke(
        mapDocument,
        activeLayer.id,
        points.map((point) => ({ x: point.tileX, y: point.tileY })),
        gid,
      ),
      undefined,
      copy.historyToolAction(copy.toolLabels[tool], activeLayer.name),
    )
  }

  /** Toggles the overlay mode; turning it off also clears any in-flight paint preview. */
  const setOverlayActive: Dispatch<SetStateAction<boolean>> = (next) => {
    if (!capabilities.cellProperties) return
    setOverlayActiveState((current) => {
      const value = typeof next === 'function' ? next(current) : next
      if (!value) setOverlayPaintPreview(null)
      return value
    })
  }

  /** Feeds the live canvas preview while an overlay drag is in progress. */
  function previewCellOverlayStroke(points: readonly { tileX: number; tileY: number }[]) {
    if (!capabilities.cellProperties) return
    setOverlayPaintPreview(points.length > 0 ? points : null)
  }

  /**
   * Commits one overlay drag as a single history entry: paints the collected
   * cells on the active layer with the selected rule, then drops the preview.
   * Discrete strokes never merge (mergeKey null); a no-op paint (walkable over
   * already-clear cells) is swallowed by updateDocument's equality check. When
   * the stroke touched cells whose rule could not be erased because it comes
   * from the tileset definition, the save-state message surfaces that hint.
   */
  function commitCellOverlayStroke(points: readonly { tileX: number; tileY: number }[]) {
    setOverlayPaintPreview(null)
    if (!capabilities.cellProperties || !activeLayer || activeLayerLocked || points.length === 0) return
    const { document: painted, skippedTilesetDerived } = setMapAssetCellOverlay(
      mapDocument,
      activeLayer.id,
      points.map((point) => ({ x: point.tileX, y: point.tileY })),
      overlayRule,
    )
    updateDocument(painted, null, copy.historyPaintRule(copy.overlayRules[overlayRule], activeLayer.name))
    if (skippedTilesetDerived > 0) {
      setSaveState({ status: 'idle', message: copy.overlayTilesetEraseBlocked(skippedTilesetDerived) })
    }
  }

  function clickTile(x: number, y: number) {
    if (!activeLayer) return
    setSelectedTile({ x, y })
    if (tool === 'inspect') {
      // The inspector is a single always-on panel, so selecting a cell never
      // needs to switch or reveal a tab.
      return
    }
    if (tool === 'eyedropper') {
      const cellIndex = y * activeLayer.width + x
      const gid = activeLayer.gids[cellIndex] ?? 0
      const baseGid = gid & ~0xf0000000
      if (baseGid > 0) {
        const tileset = mapDocument.tilesets.find(
          (candidate) => baseGid >= candidate.firstGid && baseGid < candidate.firstGid + candidate.tileCount,
        )
        if (tileset) {
          setPaletteSelection({ tilesetName: tileset.name, startIndex: baseGid - tileset.firstGid, width: 1, height: 1 })
          setTool('brush')
        }
      }
      return
    }
    if (tool === 'hand') return
    if (activeLayerLocked) return
    if (tool === 'fill' && selectedTileset && paletteSelection) {
      updateDocument(
        applyMapAssetStroke(
          mapDocument,
          activeLayer.id,
          mapAssetBucketPoints(mapDocument, activeLayer.id, { x, y }),
          selectedTileset.firstGid + paletteSelection.startIndex,
        ),
        undefined,
        copy.historyToolAction(copy.toolLabels[tool], activeLayer.name),
      )
    } else if (tool === 'stamp' && selectedTileset && paletteSelection) {
      updateDocument(
        applyMapAssetStamp(
          mapDocument,
          activeLayer.id,
          { x, y },
          {
            ...paletteSelection,
            firstGid: selectedTileset.firstGid,
            columns: selectedTileset.columns,
            tileCount: selectedTileset.tileCount,
          },
        ),
        undefined,
        copy.historyToolAction(copy.toolLabels[tool], activeLayer.name),
      )
    }
  }

  async function addTileset(relativePath: string, replaceName?: string) {
    if (!capabilities.tilesetManagement) return
    setSaveState({ status: 'saving', message: copy.loadingTileset })
    try {
      const payload = await readProjectAsset(relativePath)
      const dataUrl = `data:${payload.asset.mediaType};base64,${payload.bytesBase64}`
      const dimensions = await measureImageDimensions(dataUrl)
      if (dimensions.width % mapDocument.tileWidth !== 0 || dimensions.height % mapDocument.tileHeight !== 0) {
        throw new Error(copy.invalidTilesetDimensions(dimensions.width, dimensions.height, mapDocument.tileWidth, mapDocument.tileHeight))
      }
      const columns = dimensions.width / mapDocument.tileWidth
      const tileCount = columns * (dimensions.height / mapDocument.tileHeight)
      const baseName =
        relativePath
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/u, '') || 'tileset'
      const usedNames = new Set(
        mapDocument.tilesets.filter((tileset) => tileset.name !== replaceName).map((tileset) => tileset.name.toLowerCase()),
      )
      let name = replaceName ?? baseName
      for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix += 1) name = `${baseName}_${suffix}`
      const existing = replaceName ? mapDocument.tilesets.find((tileset) => tileset.name === replaceName) : null
      const tileset = {
        firstGid: existing?.firstGid ?? nextTilesetFirstGid(mapDocument),
        name,
        tileWidth: mapDocument.tileWidth,
        tileHeight: mapDocument.tileHeight,
        tileCount,
        columns,
        source: null,
        margin: 0,
        spacing: 0,
        tileOffsetX: 0,
        tileOffsetY: 0,
        imageSource: relativeMapAssetReference(assetPath, relativePath),
        imagePath: relativePath,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        imageTrans: null,
        properties: existing?.properties ?? {},
        tileProperties: existing?.tileProperties ?? {},
        animations: existing?.animations ?? {},
      }
      updateDocument(
        {
          ...mapDocument,
          tilesets: replaceName
            ? mapDocument.tilesets.map((candidate) => (candidate.name === replaceName ? tileset : candidate))
            : [...mapDocument.tilesets, tileset],
        },
        undefined,
        replaceName ? copy.replaceTileset : copy.addTileset,
      )
      setProjectImageUrls((current) => ({ ...current, [relativePath]: dataUrl }))
      setPaletteSelection({ tilesetName: name, startIndex: 0, width: 1, height: 1 })
      setSaveState({ status: 'idle', message: '' })
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  function updateSelectedObject(updates: Partial<MapObject>) {
    if (!capabilities.objectGroups || !selectedObject) return
    updateDocument(
      syncLightMapProperty({
        ...mapDocument,
        objectGroups: mapDocument.objectGroups.map((group) => ({
          ...group,
          objects: group.objects.map((object) => (object.id === selectedObject.id ? { ...object, ...updates } : object)),
        })),
      }),
      partialUpdateMergeKey(
        `map-object:${selectedObject.id}`,
        updates as Record<string, unknown>,
        selectedObject.properties as Record<string, unknown>,
      ),
      copy.editMarker,
    )
  }

  function deleteSelectedObject() {
    if (!capabilities.objectGroups || !selectedObject) return
    updateDocument(
      syncLightMapProperty({
        ...mapDocument,
        objectGroups: mapDocument.objectGroups.map((group) => ({
          ...group,
          objects: group.objects.filter((object) => object.id !== selectedObject.id),
        })),
      }),
      undefined,
      copy.deleteObject,
    )
    setSelectedObjectId(null)
  }

  function updateActiveLayer(updates: Partial<MapLayer>) {
    if (!activeLayer) return
    const label =
      'name' in updates
        ? copy.renameLayer
        : 'visible' in updates
          ? updates.visible
            ? copy.showLayer
            : copy.hideLayer
          : 'cellAnimations' in updates
            ? copy.editAnimation
            : copy.editLayerProperties
    updateDocument(
      {
        ...mapDocument,
        layers: mapDocument.layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, ...updates } : layer)),
      },
      partialUpdateMergeKey(
        `map-layer:${activeLayer.id}`,
        updates as Record<string, unknown>,
        activeLayer.properties as Record<string, unknown>,
      ),
      label,
    )
  }

  function updateSelectedTileset(updater: (tileset: MapTileset) => MapTileset) {
    if (!capabilities.tilesetManagement || !selectedTileset) return
    const nextTileset = updater(selectedTileset)
    const changed = changedFieldKeys(selectedTileset as Record<string, unknown>, nextTileset as Record<string, unknown>)
    const label = changed.includes('animations')
      ? copy.editAnimation
      : changed.includes('tileProperties')
        ? copy.editTileDefinition
        : copy.editTileset
    updateDocument(
      {
        ...mapDocument,
        tilesets: mapDocument.tilesets.map((tileset) => (tileset.name === selectedTileset.name ? nextTileset : tileset)),
      },
      tilesetUpdateMergeKey(selectedTileset, nextTileset),
      label,
    )
  }

  function addTileDataObject(point = selectedTile) {
    if (!capabilities.objectGroups || !point) return
    const nextId = Math.max(
      mapDocument.nextObjectId ?? 1,
      ...mapDocument.objectGroups.flatMap((group) => group.objects.map((object) => object.id + 1)),
    )
    const object: MapObject = {
      id: nextId,
      name: 'TileData',
      type: '',
      x: point.x * mapDocument.tileWidth,
      y: point.y * mapDocument.tileHeight,
      width: mapDocument.tileWidth,
      height: mapDocument.tileHeight,
      rotation: 0,
      visible: true,
      shape: 'rectangle',
      properties: { MFMarker: 'light' },
    }
    const targetGroup = selectedObjectGroup ?? mapDocument.objectGroups[0] ?? null
    const groups = targetGroup
      ? mapDocument.objectGroups.map((group) => (group.id === targetGroup.id ? { ...group, objects: [...group.objects, object] } : group))
      : [
          {
            id: Math.max(mapDocument.nextLayerId ?? 1, ...mapDocument.layers.map((layer) => layer.id + 1)),
            name: 'TileData',
            kind: 'object' as const,
            visible: true,
            opacity: 1,
            drawOrder: 'topdown',
            properties: {},
            objects: [object],
          },
        ]
    updateDocument(syncLightMapProperty({ ...mapDocument, nextObjectId: nextId + 1, objectGroups: groups }), undefined, copy.addTileData)
    setActiveObjectGroupId(targetGroup?.id ?? groups[0]!.id)
    setSelectedObjectId(nextId)
  }

  function beginObjectDrag(objectId: number) {
    if (!capabilities.objectGroups) return
    const group = mapDocument.objectGroups.find((candidate) => candidate.objects.some((object) => object.id === objectId))
    if (!group) return
    setActiveObjectGroupId(group.id)
    setSelectedObjectId(objectId)
    setObjectDragPreview(null)
  }

  function previewObjectDrag(objectId: number, tileX: number, tileY: number) {
    if (!capabilities.objectGroups) return
    setObjectDragPreview((current) =>
      current?.objectId === objectId && current.tileX === tileX && current.tileY === tileY ? current : { objectId, tileX, tileY },
    )
  }

  function endObjectDrag() {
    const preview = objectDragPreview
    setObjectDragPreview(null)
    if (!preview || !capabilities.objectGroups) return
    const object = mapDocument.objectGroups.flatMap((group) => group.objects).find((candidate) => candidate.id === preview.objectId)
    if (!object) return
    const nextX = preview.tileX * mapDocument.tileWidth
    const nextY = preview.tileY * mapDocument.tileHeight
    if (object.x === nextX && object.y === nextY) return
    updateDocument(
      syncLightMapProperty({
        ...mapDocument,
        objectGroups: mapDocument.objectGroups.map((group) => ({
          ...group,
          objects: group.objects.map((candidate) => (candidate.id === preview.objectId ? { ...candidate, x: nextX, y: nextY } : candidate)),
        })),
      }),
      undefined,
      copy.moveMarker,
    )
  }

  function addLayer() {
    if (!capabilities.layerManagement) return
    const next = addMapAssetLayer(mapDocument, copy.newLayerName(mapDocument.layers.length + 1))
    updateDocument(next, undefined, copy.addLayer)
    setActiveLayerId(next.layers.at(-1)!.id)
  }

  function duplicateActiveLayer() {
    if (!capabilities.layerManagement || !activeLayer) return
    const nextId = Math.max(
      mapDocument.nextLayerId ?? 1,
      ...mapDocument.layers.map((layer) => layer.id + 1),
      ...mapDocument.objectGroups.map((group) => group.id + 1),
    )
    const duplicate = {
      ...activeLayer,
      id: nextId,
      name: `${activeLayer.name} 2`,
      gids: new Uint32Array(activeLayer.gids),
      properties: { ...activeLayer.properties },
      cellProperties: Object.fromEntries(Object.entries(activeLayer.cellProperties ?? {}).map(([key, value]) => [key, { ...value }])),
      cellAnimations: Object.fromEntries(
        Object.entries(activeLayer.cellAnimations ?? {}).map(([key, value]) => [key, value.map((frame) => ({ ...frame }))]),
      ),
    }
    updateDocument({ ...mapDocument, nextLayerId: nextId + 1, layers: [...mapDocument.layers, duplicate] }, undefined, copy.addLayer)
    setActiveLayerId(nextId)
  }

  return {
    capabilities,
    mapDocument,
    activeLayer,
    activeLayerLocked,
    renderDocument,
    selectedTileset,
    selectedObject,
    selectedTileDefinitionProperties,
    activeLayerId,
    tool,
    selectedTile,
    hoverInfo,
    overlayActive,
    overlayRule,
    overlayPaintPreview,
    setOverlayActive,
    setOverlayRule,
    commitCellOverlayStroke,
    previewCellOverlayStroke,
    paletteSelection,
    saveState,
    pendingDeleteLayerId,
    selectedObjectId,
    activeObjectGroupId,
    projectImageUrls,
    paletteOpen,
    undoStack,
    redoStack,
    historyEntries,
    jumpToHistory,
    lockedLayerIds,
    setActiveLayerId,
    setTool,
    setSelectedTile,
    setHoverInfo,
    setPaletteSelection,
    setSaveState,
    setPendingDeleteLayerId,
    setSelectedObjectId,
    setActiveObjectGroupId,
    setPaletteOpen,
    setLockedLayerIds,
    updateDocument,
    undo,
    redo,
    commitStroke,
    clickTile,
    addTileset,
    deleteSelectedObject,
    updateSelectedObject,
    updateActiveLayer,
    updateSelectedTileset,
    addTileDataObject,
    objectDragPreview,
    beginObjectDrag,
    previewObjectDrag,
    endObjectDrag,
    addLayer,
    duplicateActiveLayer,
  }
}
