import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  type MapDocument,
  type MapLayer,
  type MapObject,
  type MapObjectGroup,
  type MapTileset,
  type MapTilesetPaletteSelection,
  type TileHoverInfo,
} from '@entities/map'
import { nextDraftEditMergeKey, tagNextDraftEdit, type AssetDraftPort, type ProjectAssetRef } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { measureImageDimensions } from '@shared/lib/assets'
import {
  addMapAssetLayer,
  applyMapAssetStamp,
  applyMapAssetStroke,
  mapAssetBucketPoints,
  relativeMapAssetReference,
} from '../../model/mapAssetReducer'

export type AssetTool = 'inspect' | 'brush' | 'stamp' | 'fill' | 'erase' | 'rectangle' | 'eyedropper' | 'hand'
export type InspectorTab = 'tile' | 'objects' | 'map' | 'tileset'
export type InspectorView = 'properties' | 'history' | 'diagnostics'

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
  /** Map-level property editing in the map inspector tab. */
  mapProperties: boolean
  /** Tileset add/replace and tileset/tile-definition property editing. */
  tilesetManagement: boolean
  /** Tile flip and rotate transforms in the tile inspector tab. */
  flipRotate: boolean
}

/** Default capability set: every editing surface is available. */
export const DEFAULT_MAP_EDITOR_CAPABILITIES: MapEditorCapabilities = {
  layerManagement: true,
  objectGroups: true,
  mapProperties: true,
  tilesetManagement: true,
  flipRotate: true,
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
  selectedCellIndex: number | null
  selectedCellProperties: Record<string, unknown>
  renderDocument: MapDocument
  selectedTileset: MapTileset | null
  selectedObject: MapObject | null
  selectedObjectGroup: MapObjectGroup | null
  selectedTileDefinitionProperties: Record<string, unknown>
  activeLayerId: number
  tool: AssetTool
  inspectorTab: InspectorTab | null
  inspectorView: InspectorView
  selectedTile: { x: number; y: number } | null
  hoverInfo: TileHoverInfo | null
  paletteSelection: MapTilesetPaletteSelection | null
  saveState: MapEditorSaveState
  pendingDeleteLayerId: number | null
  selectedObjectId: number | null
  activeObjectGroupId: number
  projectImageUrls: Record<string, string>
  paletteOpen: boolean
  undoStack: MapDocument[]
  redoStack: MapDocument[]
  lockedLayerIds: ReadonlySet<number>
  setActiveLayerId: Dispatch<SetStateAction<number>>
  setTool: Dispatch<SetStateAction<AssetTool>>
  setInspectorTab: Dispatch<SetStateAction<InspectorTab | null>>
  setInspectorView: Dispatch<SetStateAction<InspectorView>>
  setSelectedTile: Dispatch<SetStateAction<{ x: number; y: number } | null>>
  setHoverInfo: Dispatch<SetStateAction<TileHoverInfo | null>>
  setPaletteSelection: Dispatch<SetStateAction<MapTilesetPaletteSelection | null>>
  setSaveState: Dispatch<SetStateAction<MapEditorSaveState>>
  setPendingDeleteLayerId: Dispatch<SetStateAction<number | null>>
  setSelectedObjectId: Dispatch<SetStateAction<number | null>>
  setActiveObjectGroupId: Dispatch<SetStateAction<number>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setLockedLayerIds: Dispatch<SetStateAction<Set<number>>>
  updateDocument: (nextDocument: MapDocument, mergeKey?: string) => void
  undo: () => void
  redo: () => void
  commitStroke: (points: readonly { tileX: number; tileY: number }[]) => void
  clickTile: (x: number, y: number) => void
  addTileset: (relativePath: string, replaceName?: string) => Promise<void>
  addObjectGroup: () => void
  deleteSelectedObjectGroup: () => void
  deleteSelectedObject: () => void
  updateSelectedObject: (updates: Partial<MapObject>) => void
  updateSelectedObjectGroup: (updates: Partial<MapObjectGroup>) => void
  updateActiveLayer: (updates: Partial<MapLayer>) => void
  updateSelectedTileset: (updater: (tileset: MapTileset) => MapTileset) => void
  addTileDataObject: (point?: { x: number; y: number }) => void
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab | null>('map')
  const [inspectorView, setInspectorView] = useState<InspectorView>('properties')
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null)
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [paletteSelection, setPaletteSelection] = useState<MapTilesetPaletteSelection | null>(null)
  const [saveState, setSaveState] = useState<MapEditorSaveState>({ status: 'idle', message: '' })
  const [pendingDeleteLayerId, setPendingDeleteLayerId] = useState<number | null>(null)
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null)
  const [activeObjectGroupId, setActiveObjectGroupId] = useState(document.objectGroups[0]?.id ?? 0)
  const [projectImageUrls, setProjectImageUrls] = useState<Record<string, string>>({})
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [undoStack, setUndoStack] = useState<MapDocument[]>([])
  const [redoStack, setRedoStack] = useState<MapDocument[]>([])

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
  const selectedCellIndex = selectedTile && activeLayer ? selectedTile.y * activeLayer.width + selectedTile.x : null
  const selectedCellProperties = selectedCellIndex == null ? {} : (activeLayer?.cellProperties?.[selectedCellIndex] ?? {})
  const renderDocument: MapDocument = {
    ...mapDocument,
    tilesets: mapDocument.tilesets.map((tileset) => ({
      ...tileset,
      imagePath: tileset.imagePath && projectImageUrls[tileset.imagePath] ? projectImageUrls[tileset.imagePath] : tileset.imagePath,
    })),
  }
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
    draftPort?.updatePatch(patchId, { editorState: { ...editorState, mapDocument: nextDocument } })
  }

  function updateDocument(nextDocument: MapDocument, mergeKey?: string) {
    if (mergeKey) tagNextDraftEdit(nextDraftEditMergeKey(mergeKey))
    setUndoStack((stack) => [...stack.slice(-49), mapDocument])
    setRedoStack([])
    persist(nextDocument)
    setSaveState({ status: 'idle', message: '' })
  }

  function undo() {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack
      const previous = stack[stack.length - 1]!
      setRedoStack((redo) => [...redo, mapDocument])
      persist(previous)
      setSaveState({ status: 'idle', message: '' })
      return stack.slice(0, -1)
    })
  }

  function redo() {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack
      const next = stack[stack.length - 1]!
      setUndoStack((undo) => [...undo, mapDocument])
      persist(next)
      setSaveState({ status: 'idle', message: '' })
      return stack.slice(0, -1)
    })
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
      `map-asset-stroke:${patchId}:${activeLayer.id}`,
    )
  }

  function clickTile(x: number, y: number) {
    if (!activeLayer) return
    setSelectedTile({ x, y })
    if (tool === 'inspect') {
      setInspectorView('properties')
      setInspectorTab('tile')
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
        `map-asset-fill:${patchId}:${activeLayer.id}`,
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
        `map-asset-stamp:${patchId}:${activeLayer.id}`,
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
      updateDocument({
        ...mapDocument,
        tilesets: replaceName
          ? mapDocument.tilesets.map((candidate) => (candidate.name === replaceName ? tileset : candidate))
          : [...mapDocument.tilesets, tileset],
      })
      setProjectImageUrls((current) => ({ ...current, [relativePath]: dataUrl }))
      setPaletteSelection({ tilesetName: name, startIndex: 0, width: 1, height: 1 })
      setSaveState({ status: 'idle', message: '' })
    } catch (error) {
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  function updateSelectedObject(updates: Partial<MapObject>) {
    if (!capabilities.objectGroups || !selectedObject) return
    updateDocument({
      ...mapDocument,
      objectGroups: mapDocument.objectGroups.map((group) => ({
        ...group,
        objects: group.objects.map((object) => (object.id === selectedObject.id ? { ...object, ...updates } : object)),
      })),
    })
  }

  function updateSelectedObjectGroup(updates: Partial<MapObjectGroup>) {
    if (!capabilities.objectGroups || !selectedObjectGroup) return
    updateDocument({
      ...mapDocument,
      objectGroups: mapDocument.objectGroups.map((group) => (group.id === selectedObjectGroup.id ? { ...group, ...updates } : group)),
    })
  }

  function addObjectGroup() {
    if (!capabilities.objectGroups) return
    const nextId = Math.max(
      mapDocument.nextLayerId ?? 1,
      ...mapDocument.layers.map((layer) => layer.id + 1),
      ...mapDocument.objectGroups.map((group) => group.id + 1),
    )
    updateDocument({
      ...mapDocument,
      nextLayerId: nextId + 1,
      objectGroups: [
        ...mapDocument.objectGroups,
        {
          id: nextId,
          name: copy.newObjectGroupName(mapDocument.objectGroups.length + 1),
          kind: 'object',
          visible: true,
          opacity: 1,
          drawOrder: 'topdown',
          properties: {},
          objects: [],
        },
      ],
    })
    setActiveObjectGroupId(nextId)
    setSelectedObjectId(null)
  }

  function deleteSelectedObjectGroup() {
    if (!capabilities.objectGroups || !selectedObjectGroup || selectedObjectGroup.objects.length > 0) return
    updateDocument({
      ...mapDocument,
      objectGroups: mapDocument.objectGroups.filter((group) => group.id !== selectedObjectGroup.id),
    })
    setActiveObjectGroupId(mapDocument.objectGroups.find((group) => group.id !== selectedObjectGroup.id)?.id ?? 0)
  }

  function deleteSelectedObject() {
    if (!capabilities.objectGroups || !selectedObject) return
    updateDocument({
      ...mapDocument,
      objectGroups: mapDocument.objectGroups.map((group) => ({
        ...group,
        objects: group.objects.filter((object) => object.id !== selectedObject.id),
      })),
    })
    setSelectedObjectId(null)
  }

  function updateActiveLayer(updates: Partial<MapLayer>) {
    if (!activeLayer) return
    updateDocument({
      ...mapDocument,
      layers: mapDocument.layers.map((layer) => (layer.id === activeLayer.id ? { ...layer, ...updates } : layer)),
    })
  }

  function updateSelectedTileset(updater: (tileset: MapTileset) => MapTileset) {
    if (!capabilities.tilesetManagement || !selectedTileset) return
    updateDocument({
      ...mapDocument,
      tilesets: mapDocument.tilesets.map((tileset) => (tileset.name === selectedTileset.name ? updater(tileset) : tileset)),
    })
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
      properties: {},
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
    updateDocument({ ...mapDocument, nextObjectId: nextId + 1, objectGroups: groups })
    setActiveObjectGroupId(targetGroup?.id ?? groups[0]!.id)
    setSelectedObjectId(nextId)
    setInspectorTab('objects')
    setInspectorView('properties')
  }

  function addLayer() {
    if (!capabilities.layerManagement) return
    const next = addMapAssetLayer(mapDocument, copy.newLayerName(mapDocument.layers.length + 1))
    updateDocument(next)
    setActiveLayerId(next.layers.at(-1)!.id)
    setInspectorTab('map')
    setInspectorView('properties')
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
    updateDocument({ ...mapDocument, nextLayerId: nextId + 1, layers: [...mapDocument.layers, duplicate] })
    setActiveLayerId(nextId)
    setInspectorTab('map')
    setInspectorView('properties')
  }

  return {
    capabilities,
    mapDocument,
    activeLayer,
    activeLayerLocked,
    selectedCellIndex,
    selectedCellProperties,
    renderDocument,
    selectedTileset,
    selectedObject,
    selectedObjectGroup,
    selectedTileDefinitionProperties,
    activeLayerId,
    tool,
    inspectorTab,
    inspectorView,
    selectedTile,
    hoverInfo,
    paletteSelection,
    saveState,
    pendingDeleteLayerId,
    selectedObjectId,
    activeObjectGroupId,
    projectImageUrls,
    paletteOpen,
    undoStack,
    redoStack,
    lockedLayerIds,
    setActiveLayerId,
    setTool,
    setInspectorTab,
    setInspectorView,
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
    addObjectGroup,
    deleteSelectedObjectGroup,
    deleteSelectedObject,
    updateSelectedObject,
    updateSelectedObjectGroup,
    updateActiveLayer,
    updateSelectedTileset,
    addTileDataObject,
    addLayer,
    duplicateActiveLayer,
  }
}
