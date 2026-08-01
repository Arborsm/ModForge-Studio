import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileInput,
  FilePlus2,
  FileText,
  Link2,
  Loader2,
  Map as MapIcon,
  MousePointer2,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react'
import { WhenConditionEditor, type EditorComponent } from '@features/cp-maker'
import { parseWhenConditions, serializeWhenConditions } from '@entities/content-patcher'
import { ResourcePicker, toMapResourceBrowserOptions, type ResourceBrowserOption } from '@features/resource-browser'
import type { MapDocument, MapTileRect } from '@entities/map'
import { MapViewport } from '@entities/map'
import { useEditorCopy, useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { useAssetLibraryFocusStore } from '@shared/lib/app-state/assetLibraryFocusStore'
import { mapCatalogCategory } from '../state/mapAuthoringCatalog'
import { useMapAuthoringCatalog } from '../state/useMapAuthoringCatalog'
import { applyMapAreaPreview, applyMapTilePreview, splitMapTargets } from '../model/mapPatchReducer'
import { prepareProjectMapCopy } from '../../asset-library/model/importGameMap'
import { loadGameMapDocument } from '../model/gameMapLoad'
import { canEditPatchTiles } from '../model/mapTilesSession'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { MapPropertiesEditor, MapWarpsEditor, TextOperationsEditor, type MapWarpValue } from './MapPatchInspectorPanels'

type PatchOperation = 'file' | 'tiles' | 'properties' | 'warps' | 'text'
type PreviewMode = 'before' | 'result' | 'diff'
type MapLoadState = { key: string; status: 'idle' | 'loading' | 'ready' | 'error'; document: MapDocument | null; error: string | null }
type Area = { x: number | string; y: number | string; width: number | string; height: number | string }
type WarpPick = { kind: 'player' | 'npc'; index: number } | null

/** One CP MapTiles edit entry carried by a tiles change card. */
type MapTileEdit = {
  layer: string
  x: number
  y: number
  setTilesheet?: string
  setIndex?: number | string
  remove?: boolean
  setProperties?: Record<string, string>
}

/** Distinct layer names touched by the card's tile edits, in first-use order. */
function mapTileEditLayers(edits: readonly MapTileEdit[] | undefined): string[] {
  const layers: string[] = []
  for (const edit of edits ?? []) {
    if (edit.layer && !layers.includes(edit.layer)) layers.push(edit.layer)
  }
  return layers
}

type ChangeEntry = {
  id: string
  type: PatchOperation
  fromArea?: Area
  toArea?: Area
  patchMode?: string
  mapTiles?: MapTileEdit[]
  properties?: Record<string, unknown>
  warps?: MapWarpValue[]
  npcWarps?: MapWarpValue[]
  textOperations?: Array<Record<string, unknown>>
}

let changeIdCounter = 0
function newChangeId() {
  changeIdCounter += 1
  return `change-${Date.now()}-${changeIdCounter}`
}

function migrateToChanges(editorState: Record<string, unknown>): ChangeEntry[] {
  const existing = editorState['changes']
  if (Array.isArray(existing) && existing.length > 0) return existing as ChangeEntry[]
  const entries: ChangeEntry[] = []
  const fromArea = editorState['fromArea'] as Area | undefined
  const toArea = editorState['toArea'] as Area | undefined
  const patchMode = (editorState['patchMode'] as string | undefined) ?? 'ReplaceByLayer'
  const mapTiles = editorState['mapTiles'] as MapTileEdit[] | undefined
  const properties = editorState['properties'] as Record<string, string> | undefined
  const warps = editorState['warps'] as MapWarpValue[] | undefined
  const npcWarps = editorState['npcWarps'] as MapWarpValue[] | undefined
  const textOperations = editorState['textOperations'] as Array<Record<string, unknown>> | undefined
  if (fromArea || toArea) entries.push({ id: newChangeId(), type: 'file', fromArea, toArea, patchMode })
  if (mapTiles && mapTiles.length > 0) entries.push({ id: newChangeId(), type: 'tiles', mapTiles })
  if (properties && Object.keys(properties).length > 0) entries.push({ id: newChangeId(), type: 'properties', properties })
  if ((warps && warps.length > 0) || (npcWarps && npcWarps.length > 0))
    entries.push({ id: newChangeId(), type: 'warps', warps: warps ?? [], npcWarps: npcWarps ?? [] })
  if (textOperations && textOperations.length > 0) entries.push({ id: newChangeId(), type: 'text', textOperations })
  return entries
}

function createEmptyChange(type: PatchOperation): ChangeEntry {
  const base = { id: newChangeId(), type }
  switch (type) {
    case 'file':
      return { ...base, fromArea: undefined, toArea: undefined, patchMode: 'ReplaceByLayer' }
    case 'tiles':
      return { ...base, mapTiles: [] }
    case 'properties':
      return { ...base, properties: {} }
    case 'warps':
      return { ...base, warps: [], npcWarps: [] }
    case 'text':
      return { ...base, textOperations: [] }
  }
}

function changeSummary(
  entry: ChangeEntry,
  fromFile: string | undefined,
  copy: ReturnType<typeof useEditorCopy>['studioDesk']['mapPatchEditor'],
): string {
  switch (entry.type) {
    case 'file':
      return fromFile
        ? `${copy.modeLabels[(entry.patchMode ?? 'ReplaceByLayer') as keyof typeof copy.modeLabels]} · ${areaSummary(entry.fromArea ?? null)} → ${areaSummary(entry.toArea ?? null)}`
        : copy.changeCardTypeDescriptions.file
    case 'tiles':
      return (entry.mapTiles?.length ?? 0) > 0 ? copy.mapTileEdits(entry.mapTiles!.length) : copy.changeCardTypeDescriptions.tiles
    case 'properties':
      const propCount = entry.properties ? Object.keys(entry.properties).length : 0
      return propCount > 0 ? String(propCount) : copy.changeCardTypeDescriptions.properties
    case 'warps': {
      const warpCount = (entry.warps?.length ?? 0) + (entry.npcWarps?.length ?? 0)
      return warpCount > 0 ? String(warpCount) : copy.changeCardTypeDescriptions.warps
    }
    case 'text':
      return (entry.textOperations?.length ?? 0) > 0 ? String(entry.textOperations!.length) : copy.changeCardTypeDescriptions.text
  }
}

function changeStatus(entry: ChangeEntry, fromFile: string | undefined): 'configured' | 'optional' | 'empty' {
  switch (entry.type) {
    case 'file':
      return fromFile ? 'configured' : 'optional'
    case 'tiles':
      return (entry.mapTiles?.length ?? 0) > 0 ? 'configured' : 'optional'
    case 'properties':
      return entry.properties && Object.keys(entry.properties).length > 0 ? 'configured' : 'optional'
    case 'warps':
      return (entry.warps?.length ?? 0) + (entry.npcWarps?.length ?? 0) > 0 ? 'configured' : 'optional'
    case 'text':
      return (entry.textOperations?.length ?? 0) > 0 ? 'configured' : 'optional'
  }
}

const OPERATION_ICONS: Record<PatchOperation, typeof FileInput> = {
  file: FileInput,
  tiles: MousePointer2,
  properties: SlidersHorizontal,
  warps: Link2,
  text: FileText,
}

const COPY_MODES: Array<{ id: 'ReplaceByLayer' | 'Overlay' | 'Replace'; copyKey: 'replaceByLayer' | 'overlay' | 'replace' }> = [
  { id: 'ReplaceByLayer', copyKey: 'replaceByLayer' },
  { id: 'Overlay', copyKey: 'overlay' },
  { id: 'Replace', copyKey: 'replace' },
]

function readEmbeddedMapDocument(editorState: Record<string, unknown>): MapDocument | null {
  const value = editorState['mapDocument']
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const candidate = value as Partial<MapDocument>
  return typeof candidate.width === 'number' && typeof candidate.height === 'number' && Array.isArray(candidate.layers)
    ? (value as MapDocument)
    : null
}

function normalizePath(value: string) {
  return value.replaceAll('\\', '/').toLowerCase()
}

function uniqueResourceOptions(options: readonly ResourceBrowserOption[]) {
  const seen = new Set<string>()
  return options.filter((option) => {
    const key = option.value.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function areaToTileRect(area: Area | null): MapTileRect | null {
  return area &&
    typeof area.x === 'number' &&
    typeof area.y === 'number' &&
    typeof area.width === 'number' &&
    typeof area.height === 'number'
    ? { x: area.x, y: area.y, width: area.width, height: area.height }
    : null
}

function areaSummary(area: Area | null) {
  return area ? `${area.x}, ${area.y} · ${area.width} × ${area.height}` : '-'
}

function MapTileDiffOverlay({ document, edits }: { document: MapDocument; edits: readonly MapTileEdit[] }) {
  return edits.map((edit, index) => (
    <span
      key={`${edit.layer}:${edit.x}:${edit.y}:${index}`}
      className={cx('map-patch-diff-cell', edit.remove && 'is-remove')}
      style={{
        left: edit.x * document.tileWidth,
        top: edit.y * document.tileHeight,
        width: document.tileWidth,
        height: document.tileHeight,
      }}
    />
  ))
}

function MapWarpOverlay({ document, warps }: { document: MapDocument; warps: readonly MapWarpValue[] }) {
  return warps.map((warp, index) => (
    <span
      key={`${warp.fromX}:${warp.fromY}:${warp.toMap}:${index}`}
      className="map-warp-connection"
      style={{ left: (warp.fromX + 0.5) * document.tileWidth, top: (warp.fromY + 0.5) * document.tileHeight }}
    >
      <Link2 aria-hidden="true" />
      <span>{warp.toMap || '?'}</span>
    </span>
  ))
}

/** Project-map changes. Source map files are authored separately in MapAssetEditor. */
export const MapPatchEditor: EditorComponent = ({ patch, draftPort, resources }) => {
  const { draft, updatePatch } = draftPort
  const { locale, accentColor, theme } = resources
  const copy = useEditorCopy().studioDesk.mapPatchEditor
  const patchCopy = useEditorCopy().studioDesk.configSchemaDialog
  const authoringCopy = useMapAuthoringCopy()
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const project = useWorkbenchProject()
  const environment = useWorkbenchEnvironment()
  const copyRef = useRef(copy)
  copyRef.current = copy

  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const changes = useMemo(() => migrateToChanges(editorState), [editorState])
  const embeddedDocument = readEmbeddedMapDocument(editorState)

  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => new Set(changes.length > 0 ? [changes[0]!.id] : []))
  const [activeCardId, setActiveCardId] = useState<string | null>(changes.length > 0 ? changes[0]!.id : null)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('result')
  const [warpPick, setWarpPick] = useState<WarpPick>(null)
  const [assetOpenError, setAssetOpenError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const previewTargets = splitMapTargets(patch.target)
  const target = previewTargets[0] ?? patch.target
  const gameRootPath = draft.projectMetadata.gameRootPath
  const mapLoadKey = `${gameRootPath ?? ''}:${target}:${locale}`
  const [targetMapState, setTargetMapState] = useState<MapLoadState>({
    key: mapLoadKey,
    status: embeddedDocument ? 'ready' : gameRootPath ? 'loading' : 'idle',
    document: embeddedDocument,
    error: null,
  })

  useEffect(() => {
    if (embeddedDocument) {
      setTargetMapState({ key: mapLoadKey, status: 'ready', document: embeddedDocument, error: null })
      return
    }
    if (!gameRootPath) {
      setTargetMapState({ key: mapLoadKey, status: 'idle', document: null, error: null })
      return
    }
    let active = true
    setTargetMapState({ key: mapLoadKey, status: 'loading', document: null, error: null })
    void loadGameMapDocument(gameRootPath, target, locale)
      .then((document) => {
        if (active) setTargetMapState({ key: mapLoadKey, status: 'ready', document, error: null })
      })
      .catch(() => {
        if (active)
          setTargetMapState({ key: mapLoadKey, status: 'error', document: null, error: copyRef.current.unableToLoadTarget(target) })
      })
    return () => {
      active = false
    }
  }, [embeddedDocument, gameRootPath, locale, mapLoadKey, target])

  // The file card never owns a source path: patch.fromFile is the single
  // source of truth, so rename/delete/convert reference rewrites stay in sync.
  const fromFileForPatch = patch.fromFile
  const sourceAsset = draft.projectAssets.find((asset) => normalizePath(asset.relativePath) === normalizePath(fromFileForPatch ?? ''))
  const sourceLoadKey = sourceAsset?.relativePath ?? ''
  const [sourceMapState, setSourceMapState] = useState<MapLoadState>({ key: '', status: 'idle', document: null, error: null })
  useEffect(() => {
    if (!sourceAsset) {
      setSourceMapState({ key: sourceLoadKey, status: 'idle', document: null, error: null })
      return
    }
    let active = true
    setSourceMapState({ key: sourceLoadKey, status: 'loading', document: null, error: null })
    void project
      .loadProjectMapAsset(sourceAsset.relativePath)
      .then((asset) => {
        if (active)
          setSourceMapState({ key: sourceLoadKey, status: 'ready', document: JSON.parse(asset.content) as MapDocument, error: null })
      })
      .catch(() => {
        if (active) setSourceMapState({ key: sourceLoadKey, status: 'error', document: null, error: copyRef.current.unableToLoadMap })
      })
    return () => {
      active = false
    }
  }, [project, sourceAsset, sourceLoadKey])

  const targetDocument = embeddedDocument ?? (targetMapState.key === mapLoadKey ? targetMapState.document : null)
  const sourceDocument = sourceMapState.key === sourceLoadKey ? sourceMapState.document : null
  const allMapTiles = useMemo(() => changes.filter((c) => c.type === 'tiles').flatMap((c) => c.mapTiles ?? []), [changes])
  const allWarps = useMemo(() => changes.filter((c) => c.type === 'warps').flatMap((c) => c.warps ?? []), [changes])
  const previewDocument = useMemo(() => {
    if (!targetDocument) return null
    let doc = targetDocument
    for (const entry of changes) {
      if (entry.type === 'file' && patch.fromFile && sourceDocument) {
        doc = applyMapAreaPreview(
          doc,
          sourceDocument,
          areaToTileRect(entry.fromArea ?? null),
          areaToTileRect(entry.toArea ?? null),
          (entry.patchMode ?? 'ReplaceByLayer') as 'Overlay' | 'Replace' | 'ReplaceByLayer',
        )
      }
    }
    return applyMapTilePreview(doc, allMapTiles)
  }, [allMapTiles, changes, patch.fromFile, sourceDocument, targetDocument])
  const displayedDocument = previewMode === 'before' ? targetDocument : previewDocument

  const mapCatalog = useMapAuthoringCatalog(resources.gameRootPath, resources.directoryInfo, resources.locale)
  const mapOptions = useMemo(() => {
    const projectMaps: ResourceBrowserOption[] = draft.patches
      .filter((candidate) => candidate.target.trim().toLowerCase().startsWith('maps/'))
      .map((candidate) => ({
        id: `project-map:${candidate.id}`,
        kind: 'map' as const,
        value: candidate.target,
        label: candidate.target.replace(/^Maps\//iu, ''),
        category: authoringCopy.categories[mapCatalogCategory(candidate.target)],
        subtitle: authoringCopy.projectBadge,
        sourceKind: 'project' as const,
      }))
    return uniqueResourceOptions([
      ...projectMaps,
      ...toMapResourceBrowserOptions(mapCatalog.assets, (asset) => authoringCopy.categories[mapCatalogCategory(asset.name)], 'map-editor'),
    ])
  }, [authoringCopy, draft.patches, mapCatalog.assets])
  const projectMapAssetOptions = useMemo<ResourceBrowserOption[]>(
    () =>
      draft.projectAssets
        .filter((asset) => /\.(?:tmx|tbin)$/iu.test(asset.relativePath))
        .map((asset) => ({
          id: `project-map-asset:${asset.relativePath.toLowerCase()}`,
          kind: 'map' as const,
          value: asset.relativePath,
          label: asset.relativePath.split('/').pop() ?? asset.relativePath,
          subtitle: asset.relativePath,
          category: authoringCopy.projectBadge,
          sourceKind: 'project' as const,
        })),
    [authoringCopy.projectBadge, draft.projectAssets],
  )

  const updateChanges = useCallback(
    (next: ChangeEntry[]) => {
      updatePatch(patch.id, { editorState: { ...editorState, changes: next } })
    },
    [editorState, patch.id, updatePatch],
  )

  const updateChange = useCallback(
    (id: string, data: Partial<ChangeEntry>) => {
      updateChanges(changes.map((c) => (c.id === id ? { ...c, ...data } : c)))
    },
    [changes, updateChanges],
  )

  const addChange = useCallback(
    (type: PatchOperation) => {
      // A patch can carry at most one file card; the serializer reads the first.
      if (type === 'file' && changes.some((c) => c.type === 'file')) return
      const entry = createEmptyChange(type)
      updateChanges([...changes, entry])
      setExpandedCards((prev) => new Set(prev).add(entry.id))
      setActiveCardId(entry.id)
    },
    [changes, updateChanges],
  )

  const deleteChange = useCallback(
    (id: string) => {
      const entry = changes.find((c) => c.id === id)
      const next = changes.filter((c) => c.id !== id)
      if (entry?.type === 'file' && !next.some((c) => c.type === 'file')) {
        // Deleting the last file card must clear the patch-level path in the
        // same write, or the region-less FromFile would export as a full-map
        // copy onto the target.
        updatePatch(patch.id, { fromFile: undefined, editorState: { ...editorState, changes: next } })
      } else {
        updateChanges(next)
      }
      setExpandedCards((prev) => {
        const nextCards = new Set(prev)
        nextCards.delete(id)
        return nextCards
      })
      if (activeCardId === id) setActiveCardId(null)
    },
    [activeCardId, changes, editorState, patch.id, updateChanges, updatePatch],
  )

  const loadWarpTargetDocument = useCallback(
    (mapTarget: string) => {
      if (!gameRootPath) return Promise.reject(new Error(copyRef.current.noGameRoot))
      return loadGameMapDocument(gameRootPath, mapTarget, locale)
    },
    [gameRootPath, locale],
  )

  async function openProjectMapAsset(relativePath: string) {
    try {
      setAssetOpenError(null)
      if (!resources.onOpenMapAsset) throw new Error(copy.unableToLoadMap)
      resources.onOpenMapAsset(relativePath)
    } catch {
      setAssetOpenError(copy.unableToLoadMap)
    }
  }

  /**
   * Jumps to the asset library, pre-selecting the current `fromFile` source
   * asset so the author lands on the file they were working with.
   */
  function manageSourceInAssetLibrary() {
    if (patch.fromFile) {
      useAssetLibraryFocusStore.getState().setFocus({ kind: 'asset', key: patch.fromFile })
    }
    environment.onOpenModule('asset-library')
  }

  async function importMapFiles() {
    setImporting(true)
    try {
      const paths = await project.chooseFiles(copy.importMapAction, [{ name: 'Map files', extensions: ['tmx', 'tbin'] }])
      if (paths.length === 0) return
      await project.importProjectAssets(paths, 'assets/maps')
    } catch {
      setAssetOpenError(copy.noProjectMapAssets)
    } finally {
      setImporting(false)
    }
  }

  async function importFromGame(target: string) {
    const asset = mapCatalog.assets.find((a) => {
      const assetTarget = `Maps/${a.name.replace(/^Maps\//iu, '').replace(/\.(?:xnb|tbin|tmx)$/iu, '')}`
      return assetTarget === target
    })
    if (!asset) return
    setImporting(true)
    setAssetOpenError(null)
    try {
      const usedPaths = new Set(draft.projectAssets.map((a) => a.relativePath.replaceAll('\\', '/').toLowerCase()))
      const prepared = await prepareProjectMapCopy({
        target,
        asset,
        resources,
        usedPaths,
        invalidMapError: copy.noProjectMapAssets,
        tilesheetLoadError: (name) => authoringCopy.create.tilesheetLoadError(name),
      })
      await project.writeProjectAssets(prepared.assets, 'generated')
      updatePatch(patch.id, { fromFile: prepared.document.relativePath || undefined })
    } catch {
      setAssetOpenError(copy.noProjectMapAssets)
    } finally {
      setImporting(false)
    }
  }

  function toggleCard(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleTargetTileClick(tileX: number, tileY: number) {
    if (!activeCardId) return
    const entry = changes.find((c) => c.id === activeCardId)
    if (!entry) return
    if (entry.type === 'file' && sourceDocument) {
      const selected = areaToTileRect(entry.fromArea ?? null) ?? { x: 0, y: 0, width: sourceDocument.width, height: sourceDocument.height }
      updateChange(entry.id, { toArea: { x: tileX, y: tileY, width: selected.width, height: selected.height } })
      return
    }
    if (entry.type === 'warps' && warpPick) {
      const current = warpPick.kind === 'player' ? (entry.warps ?? []) : (entry.npcWarps ?? [])
      const next = [...current]
      const existing = next[warpPick.index]
      if (existing) next[warpPick.index] = { ...existing, fromX: tileX, fromY: tileY }
      updateChange(entry.id, warpPick.kind === 'player' ? { warps: next } : { npcWarps: next })
      setWarpPick(null)
    }
  }

  function handleFileRectSelect(rect: MapTileRect) {
    if (rect.width === 1 && rect.height === 1) {
      // Click: quickly place the ToArea origin (size follows FromArea/source map), as before.
      handleTargetTileClick(rect.x, rect.y)
      return
    }
    const entry = activeCardId ? changes.find((c) => c.id === activeCardId) : undefined
    if (!entry || entry.type !== 'file') return
    updateChange(entry.id, { toArea: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
  }

  const allOps: PatchOperation[] = ['file', 'tiles', 'properties', 'warps', 'text']
  const activeEntry = activeCardId ? changes.find((c) => c.id === activeCardId) : undefined
  const tilesSessionEnabled = canEditPatchTiles(patch.target, gameRootPath) && targetMapState.status !== 'error'
  const tilesSessionTitle = !gameRootPath
    ? copy.noGameRoot
    : patch.target.includes('{{')
      ? copy.runtimeTargetUnavailable(patch.target)
      : targetMapState.status === 'error'
        ? (targetMapState.error ?? copy.unableToLoadTarget(patch.target))
        : copy.editInMapEditor

  return (
    <div className="map-patch-page">
      <div className="map-patch-canvas-area">
        <nav className="map-patch-canvas-toolbar">
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{target.replace(/^Maps\//iu, '')}</span>
          <span className="spacer" />
          <div className="map-patch-preview-switch" role="group" aria-label={copy.previewTitle}>
            {(['before', 'result', 'diff'] as const).map((mode) => (
              <button key={mode} type="button" className={cx(previewMode === mode && 'is-active')} onClick={() => setPreviewMode(mode)}>
                {copy.previewModes[mode]}
              </button>
            ))}
          </div>
        </nav>
        <section className="map-patch-canvas" aria-label={copy.previewTitle}>
          {displayedDocument ? (
            <MapViewport
              locale={locale}
              mapDocument={displayedDocument}
              visibleLayerIds={displayedDocument.layers.map((layer) => layer.id)}
              visibleObjectGroupIds={displayedDocument.objectGroups.map((group) => group.id)}
              theme={theme}
              accentColor={accentColor}
              showGrid
              showStatsChips={false}
              contextMenuEnabled={false}
              onTileClick={handleTargetTileClick}
              onTileRectSelect={activeEntry?.type === 'file' ? handleFileRectSelect : undefined}
              selectedTileRect={activeEntry?.type === 'file' ? areaToTileRect(activeEntry.toArea ?? null) : null}
              mapOverlay={
                previewMode === 'diff' ? (
                  <MapTileDiffOverlay document={displayedDocument} edits={allMapTiles} />
                ) : (
                  <MapWarpOverlay document={displayedDocument} warps={allWarps} />
                )
              }
              scaleMapOverlayWithViewport
              mapOverlayLayer="top"
            />
          ) : (
            <div className={cx('map-patch-canvas-state', targetMapState.status === 'error' && 'is-error')}>
              {targetMapState.status === 'loading' ? <span className="animate-spin">◌</span> : <MapIcon className="h-6 w-6" />}
              <span>{targetMapState.error ?? copy.loadingMap}</span>
            </div>
          )}
        </section>
      </div>

      <aside className="map-patch-cards-panel">
        <div className="map-patch-cards-header">
          <h2>
            {copy.mapChanges} <span className="count">({copy.changeCards.changeCount(changes.length)})</span>
          </h2>
          <button type="button" className="map-patch-add-btn" onClick={() => setShowAddPanel((v) => !v)}>
            <FilePlus2 className="h-3.5 w-3.5" />
            {copy.changeCards.addChange}
          </button>
        </div>
        <div className="map-patch-cards-scroll">
          {showAddPanel && (
            <div className="map-patch-add-panel">
              <strong>{copy.changeCards.selectType}</strong>
              <div className="map-patch-type-selector">
                {allOps.map((op) => {
                  const Icon = OPERATION_ICONS[op]
                  const fileCardExists = op === 'file' && changes.some((c) => c.type === 'file')
                  return (
                    <button
                      key={op}
                      type="button"
                      className="map-patch-type-option"
                      disabled={fileCardExists}
                      title={fileCardExists ? copy.changeCardFileExists : undefined}
                      onClick={() => {
                        addChange(op)
                        setShowAddPanel(false)
                      }}
                    >
                      <span className="type-icon">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="type-text">
                        <strong>{copy.changeCardTypes[op]}</strong>
                        <small>{copy.changeCardTypeDescriptions[op]}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {changes.map((entry) => {
            const Icon = OPERATION_ICONS[entry.type]
            const typeCount = changes.filter((c) => c.type === entry.type).indexOf(entry) + 1
            const title = `${copy.changeCardTypes[entry.type]}${typeCount > 1 ? ` ${typeCount}` : ''}`
            const status = changeStatus(entry, patch.fromFile)
            const summary = changeSummary(entry, patch.fromFile, copy)
            return (
              <ChangeCard
                key={entry.id}
                icon={Icon}
                title={title}
                subtitle={summary}
                status={status}
                expanded={expandedCards.has(entry.id)}
                onToggle={() => toggleCard(entry.id)}
                onDelete={() => deleteChange(entry.id)}
                onActivate={() => setActiveCardId(entry.id)}
                isActive={activeCardId === entry.id}
                copy={copy}
              >
                {entry.type === 'file' && (
                  <>
                    <div className="change-card-field">
                      <span className="field-label">{copy.sourceMapFile}</span>
                      <span className="field-hint">{copy.sourceMapHint}</span>
                      <ResourcePicker
                        value={patch.fromFile ?? ''}
                        label={copy.fromFilePlaceholder}
                        placeholder={copy.fromFilePlaceholder}
                        emptyLabel={copy.fromFilePlaceholder}
                        options={projectMapAssetOptions}
                        selectionMode="confirm"
                        triggerClassName="control-button"
                        onSelect={(value) => updatePatch(patch.id, { fromFile: value || undefined })}
                      />
                    </div>
                    {sourceAsset && patch.fromFile && (
                      <div className="change-card-source-preview">
                        <div className="thumb">
                          {sourceDocument ? (
                            <MapViewport
                              locale={locale}
                              mapDocument={sourceDocument}
                              visibleLayerIds={sourceDocument.layers.map((layer) => layer.id)}
                              visibleObjectGroupIds={sourceDocument.objectGroups.map((group) => group.id)}
                              theme={theme}
                              accentColor={accentColor}
                              showGrid={false}
                              showStatsChips={false}
                              contextMenuEnabled={false}
                              onTileRectSelect={(rect) =>
                                updateChange(entry.id, { fromArea: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
                              }
                              selectedTileRect={areaToTileRect(entry.fromArea ?? null)}
                            />
                          ) : sourceMapState.status === 'loading' ? (
                            <span className="animate-spin">◌</span>
                          ) : sourceMapState.status === 'error' ? (
                            copy.unableToLoadMap
                          ) : (
                            '...'
                          )}
                        </div>
                        <div className="source-info">
                          <strong>{sourceAsset.relativePath.split('/').pop()}</strong>
                          <small>{sourceAsset.relativePath}</small>
                          <div className="source-links">
                            <button type="button" className="edit-link" onClick={() => void openProjectMapAsset(sourceAsset.relativePath)}>
                              {copy.editInAssetEditor}
                            </button>
                            <button type="button" className="edit-link" onClick={manageSourceInAssetLibrary}>
                              {copy.manageInAssetLibrary}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <span className="field-hint">{copy.fromAreaPickHint}</span>
                    <div className="change-card-field">
                      <span className="field-label">{copy.projectMapAssets}</span>
                      <div className="change-card-mini-assets">
                        {projectMapAssetOptions.length ? (
                          projectMapAssetOptions.map((asset) => (
                            <div
                              key={asset.id}
                              className={cx('change-card-mini-asset', patch.fromFile === asset.value && 'is-selected')}
                              onClick={() => updatePatch(patch.id, { fromFile: asset.value || undefined })}
                            >
                              <MapIcon className="h-3.5 w-3.5" />
                              <div className="mini-info">
                                <strong>{asset.label}</strong>
                                <small>{asset.subtitle}</small>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p style={{ fontSize: '0.5625rem', color: 'var(--text-tertiary)' }}>{copy.noProjectMapAssets}</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
                        <button
                          type="button"
                          className="control-button"
                          style={{ flex: 1, justifyContent: 'center', minHeight: '1.75rem' }}
                          disabled={importing}
                          onClick={() => void importMapFiles()}
                        >
                          {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {copy.importMapAction}
                        </button>
                        {mapCatalog.assets.length > 0 ? (
                          <ResourcePicker
                            value=""
                            label={copy.importFromGame}
                            placeholder={copy.importFromGame}
                            options={mapOptions.filter((opt) => opt.sourceKind === 'game')}
                            selectionMode="confirm"
                            triggerClassName="control-button"
                            triggerContent={
                              <>
                                <MapIcon className="h-3 w-3" />
                                {copy.importFromGame}
                              </>
                            }
                            onSelect={(value) => void importFromGame(value)}
                          />
                        ) : null}
                      </div>
                    </div>
                    <span className="field-hint">{copy.toAreaPickHint}</span>
                    <div className="change-card-field">
                      <span className="field-label">{copy.patchMode}</span>
                      <div className="change-card-mode-options">
                        {COPY_MODES.map((mode) => (
                          <div
                            key={mode.id}
                            className={cx('change-card-mode-option', (entry.patchMode ?? 'ReplaceByLayer') === mode.id && 'is-active')}
                            onClick={() => updateChange(entry.id, { patchMode: mode.id })}
                          >
                            <span className="radio" />
                            <span className="mode-text">
                              <strong>{copy.copyMode[mode.copyKey]}</strong>
                              <small>{copy.copyModeDescriptions[mode.copyKey]}</small>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="change-card-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
                      <ChevronDown className="h-3 w-3" style={{ transform: showAdvanced ? '' : 'rotate(-90deg)' }} />
                      {copy.advancedSettings.title}
                    </button>
                    {showAdvanced && (
                      <div className="change-card-advanced-section is-open">
                        <div className="change-card-field">
                          <span className="field-label">{copy.copyRange}</span>
                          <div className="change-card-area-row">
                            <div className="change-card-field">
                              <span className="field-label">X</span>
                              <input
                                className="field-input"
                                type="number"
                                value={entry.fromArea?.x ?? 0}
                                onChange={(e) =>
                                  updateChange(entry.id, {
                                    fromArea: {
                                      ...entry.fromArea,
                                      x: Number(e.target.value),
                                      y: entry.fromArea?.y ?? 0,
                                      width: entry.fromArea?.width ?? 0,
                                      height: entry.fromArea?.height ?? 0,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="change-card-field">
                              <span className="field-label">Y</span>
                              <input
                                className="field-input"
                                type="number"
                                value={entry.fromArea?.y ?? 0}
                                onChange={(e) =>
                                  updateChange(entry.id, {
                                    fromArea: {
                                      ...entry.fromArea,
                                      x: entry.fromArea?.x ?? 0,
                                      y: Number(e.target.value),
                                      width: entry.fromArea?.width ?? 0,
                                      height: entry.fromArea?.height ?? 0,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="change-card-field">
                              <span className="field-label">W</span>
                              <input
                                className="field-input"
                                type="number"
                                value={entry.fromArea?.width ?? 0}
                                onChange={(e) =>
                                  updateChange(entry.id, {
                                    fromArea: {
                                      ...entry.fromArea,
                                      x: entry.fromArea?.x ?? 0,
                                      y: entry.fromArea?.y ?? 0,
                                      width: Number(e.target.value),
                                      height: entry.fromArea?.height ?? 0,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="change-card-field">
                              <span className="field-label">H</span>
                              <input
                                className="field-input"
                                type="number"
                                value={entry.fromArea?.height ?? 0}
                                onChange={(e) =>
                                  updateChange(entry.id, {
                                    fromArea: {
                                      ...entry.fromArea,
                                      x: entry.fromArea?.x ?? 0,
                                      y: entry.fromArea?.y ?? 0,
                                      width: entry.fromArea?.width ?? 0,
                                      height: Number(e.target.value),
                                    },
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                        <div className="change-card-field">
                          <span className="field-label">{copy.pastePosition}</span>
                          <div className="change-card-area-row">
                            <div className="change-card-field">
                              <span className="field-label">X</span>
                              <input
                                className="field-input"
                                type="number"
                                value={entry.toArea?.x ?? 0}
                                onChange={(e) =>
                                  updateChange(entry.id, {
                                    toArea: {
                                      ...entry.toArea,
                                      x: Number(e.target.value),
                                      y: entry.toArea?.y ?? 0,
                                      width: entry.toArea?.width ?? 0,
                                      height: entry.toArea?.height ?? 0,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="change-card-field">
                              <span className="field-label">Y</span>
                              <input
                                className="field-input"
                                type="number"
                                value={entry.toArea?.y ?? 0}
                                onChange={(e) =>
                                  updateChange(entry.id, {
                                    toArea: {
                                      ...entry.toArea,
                                      x: entry.toArea?.x ?? 0,
                                      y: Number(e.target.value),
                                      width: entry.toArea?.width ?? 0,
                                      height: entry.toArea?.height ?? 0,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="change-card-field" style={{ gridColumn: 'span 2' }}>
                              <span className="field-label">{copy.mapSize}</span>
                              <input
                                className="field-input"
                                value={`${entry.toArea?.width ?? 0} × ${entry.toArea?.height ?? 0}`}
                                disabled
                              />
                            </div>
                          </div>
                        </div>
                        <div className="change-card-field">
                          <span className="field-label">{copy.advancedSettings.whenCondition}</span>
                          <span className="field-hint">{copy.advancedSettings.whenConditionHint}</span>
                          <WhenConditionEditor
                            rows={parseWhenConditions(patch.when)}
                            onChange={(rows) => updatePatch(patch.id, { when: serializeWhenConditions(rows) })}
                            extraTokenNames={[...draft.configSchema.map((e) => e.key), ...draft.dynamicTokens.map((token) => token.name)]}
                          />
                        </div>
                        {expertMode ? (
                          <div className="change-card-field">
                            <span className="field-label">{copy.advancedSettings.priority}</span>
                            <input
                              className="field-input"
                              list="map-patch-priority-options"
                              value={patch.priority ?? ''}
                              placeholder={patchCopy.priorityPatchPlaceholder}
                              onChange={(event) => {
                                const value = event.target.value.trim()
                                const numeric = Number(value)
                                updatePatch(patch.id, { priority: value === '' ? undefined : Number.isNaN(numeric) ? value : numeric })
                              }}
                            />
                            <datalist id="map-patch-priority-options">
                              <option value="Early" />
                              <option value="Default" />
                              <option value="Late" />
                            </datalist>
                          </div>
                        ) : null}
                        <div className="change-card-field">
                          <span className="field-label">{copy.advancedSettings.enabled}</span>
                          {typeof patch.enabled === 'string' ? (
                            <>
                              <span className="field-hint">{copy.advancedSettings.enabledByExpressionHint(patch.enabled)}</span>
                              <code className="map-enabled-token-chip">{patch.enabled}</code>
                              <div className="change-card-enabled-actions">
                                <button type="button" className="control-button" onClick={() => updatePatch(patch.id, { enabled: true })}>
                                  {copy.advancedSettings.setAlwaysEnabled}
                                </button>
                                <button type="button" className="control-button" onClick={() => updatePatch(patch.id, { enabled: false })}>
                                  {copy.advancedSettings.setAlwaysDisabled}
                                </button>
                              </div>
                            </>
                          ) : (
                            <label className="map-asset-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <input
                                type="checkbox"
                                checked={patch.enabled !== false}
                                onChange={(event) => updatePatch(patch.id, { enabled: event.target.checked })}
                              />
                              <span style={{ fontSize: '0.625rem' }}>
                                {patch.enabled !== false ? copy.advancedSettings.enabled : copy.advancedSettings.disabled}
                              </span>
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                    {assetOpenError && (
                      <p className="map-patch-inline-error">
                        <AlertCircle className="h-3 w-3" />
                        {assetOpenError}
                      </p>
                    )}
                  </>
                )}
                {entry.type === 'tiles' && (
                  <>
                    <div className="map-patch-tiles-summary">
                      <span className="map-patch-tiles-count">{copy.mapTileEdits(entry.mapTiles?.length ?? 0)}</span>
                      {mapTileEditLayers(entry.mapTiles).map((layer) => (
                        <span key={layer} className="map-patch-tiles-layer-chip">
                          {layer}
                        </span>
                      ))}
                    </div>
                    <div className="map-patch-tiles-actions">
                      <button
                        type="button"
                        className="control-button control-button-primary"
                        disabled={!tilesSessionEnabled}
                        title={tilesSessionTitle}
                        onClick={() => resources.onEditPatchTiles?.({ patchId: patch.id, cardId: entry.id, target: patch.target })}
                      >
                        <MapIcon className="h-3.5 w-3.5" />
                        {copy.editInMapEditor}
                      </button>
                      {(entry.mapTiles?.length ?? 0) > 0 && (
                        <button type="button" className="control-button" onClick={() => updateChange(entry.id, { mapTiles: [] })}>
                          {copy.clearTiles}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {entry.type === 'properties' && (
                  <MapPropertiesEditor
                    properties={entry.properties ?? {}}
                    categorized
                    onChange={(next) => updateChange(entry.id, { properties: next })}
                  />
                )}
                {entry.type === 'warps' && (
                  <>
                    <MapWarpsEditor
                      title={copy.playerWarps}
                      description={copy.playerWarpsDescription}
                      warps={entry.warps ?? []}
                      mapOptions={mapOptions}
                      locale={locale}
                      theme={theme}
                      accentColor={accentColor}
                      loadTargetDocument={loadWarpTargetDocument}
                      onRequestSourcePick={(index) => {
                        setWarpPick({ kind: 'player', index })
                        setActiveCardId(entry.id)
                      }}
                      onChange={(next) => updateChange(entry.id, { warps: next })}
                    />
                    <MapWarpsEditor
                      title={copy.npcWarps}
                      description={copy.npcWarpsDescription}
                      warps={entry.npcWarps ?? []}
                      mapOptions={mapOptions}
                      locale={locale}
                      theme={theme}
                      accentColor={accentColor}
                      loadTargetDocument={loadWarpTargetDocument}
                      onRequestSourcePick={(index) => {
                        setWarpPick({ kind: 'npc', index })
                        setActiveCardId(entry.id)
                      }}
                      onChange={(next) => updateChange(entry.id, { npcWarps: next })}
                    />
                  </>
                )}
                {entry.type === 'text' && (
                  <TextOperationsEditor
                    operations={entry.textOperations ?? []}
                    onChange={(next) => updateChange(entry.id, { textOperations: next })}
                  />
                )}
              </ChangeCard>
            )
          })}
          {changes.length === 0 && !showAddPanel && (
            <div className="map-patch-cards-empty">
              <FilePlus2 className="h-6 w-6" />
              <span>{copy.changeCards.selectType}</span>
              <button type="button" className="control-button control-button-primary" onClick={() => setShowAddPanel(true)}>
                {copy.changeCards.addChange}
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function ChangeCard({
  icon: Icon,
  title,
  subtitle,
  status,
  expanded,
  onToggle,
  onDelete,
  onActivate,
  isActive,
  copy,
  children,
}: {
  icon: typeof FileInput
  title: string
  subtitle: string
  status: 'configured' | 'optional' | 'empty'
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onActivate: () => void
  isActive: boolean
  copy: ReturnType<typeof useEditorCopy>['studioDesk']['mapPatchEditor']
  children: ReactNode
}) {
  const statusLabel =
    status === 'configured'
      ? copy.changeCardStatuses.configured
      : status === 'empty'
        ? copy.changeCardStatuses.empty
        : copy.changeCardStatuses.optional
  return (
    <div className={cx('change-card', expanded && 'is-active', isActive && 'is-focused')} onClick={onActivate}>
      <div className="change-card-header">
        <div
          className="change-card-toggle"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onToggle()
            }
          }}
        >
          <span className="card-icon">
            <Icon className="h-4 w-4" />
          </span>
          <div className="card-title">
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
          <span className={cx('card-status', status === 'optional' && 'is-optional')}>
            {status === 'configured' && <Check className="h-3 w-3" />}
            {statusLabel}
          </span>
          <ChevronDown className="expand-arrow h-4 w-4" />
        </div>
        <div className="card-actions">
          <button type="button" className="is-delete" title={copy.changeCardActions.delete} onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {expanded && <div className="change-card-body">{children}</div>}
    </div>
  )
}
