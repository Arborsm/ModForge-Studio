import { Fragment, useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type HTMLAttributes } from 'react'
import { useSelectionContainer, type Box } from '@air/react-drag-to-select'
import {
  AlertCircle,
  Check,
  FileCode2,
  FileInput,
  FilePlus2,
  FileQuestion,
  FolderInput,
  Grid2X2,
  Image as ImageIcon,
  Link2,
  List,
  Map as MapIcon,
  Music2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { type EditorResources, type ProjectAssetRef, type VirtualPreviewAsset } from '@features/cp-maker'
import { scanAudioAssets, scanDataAssets, scanImageAssets, type MapAssetSummary } from '@entities/game/api'
import {
  ResourcePicker,
  toGameAudioResourceBrowserOptions,
  toGameDataResourceBrowserOptions,
  toGameImageResourceBrowserOptions,
  toMapResourceBrowserOptions,
  type ResourceBrowserOption,
} from '@features/resource-browser'
import { useAssetLibraryCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useAssetLibraryFocusStore } from '@shared/lib/app-state/assetLibraryFocusStore'
import { usePendingMapAssetEditStore } from '@shared/lib/app-state/pendingMapAssetEditStore'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { dismissNotification, useNotificationPublisher } from '@shared/ui/notifications'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import { useWorkbenchAssetDraftPort } from '../../../model/useWorkbenchAssetDraftPort'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../../model/workbenchModuleContexts'
import { useWorkbenchRuntimeInputs } from '../../../ui/module-runtimes/runtimeInputs'
import { mapCatalogCategory, mapTargetFromAsset } from '../../map/state/mapAuthoringCatalog'
import { useMapAuthoringCatalog } from '../../map/state/useMapAuthoringCatalog'
import {
  allocateProjectAssetPath,
  classifyProjectAsset,
  isProjectMapAssetPath,
  pngAssetPath,
  sanitizeProjectAssetPath,
  type ProjectAssetKind,
} from '../model/projectAssets'
import { buildAssetDependencyView, findMissingAssetDependencies, type MissingAssetDependency } from '../model/assetDependencies'
import {
  collectLoadPatches,
  groupLoadPatchesByFamily,
  loadAssetFamily,
  loadFamilyWorkspace,
  LOAD_FAMILY_ORDER,
  placeholderLoadTarget,
  type LoadAssetFamily,
} from '../model/mapLoadBinding'
import { prepareProjectMapCopy } from '../model/importGameMap'
import { prepareGameAssetImport, type GameAssetImportKind, type GameAssetImportSource } from '../model/importGameAsset'
import { useGameAssetScan } from '../model/useGameAssetScan'
import { AssetImageThumbnail } from './AssetImageThumbnail'
import { AssetMapThumbnail } from './AssetMapThumbnail'
import { NewMapDialog } from './NewMapDialog'
import { PixelEditorDialog } from './PixelEditorDialog'
import { LoadBindingEditor } from '../editors/LoadBindingEditor'
import { LoadFamilyIcon } from './LoadFamilyIcon'

type AssetView = 'grid' | 'list'
type AssetFilter = 'all' | ProjectAssetKind

/** Group display order for the all-filter grid view. */
const ASSET_KIND_ORDER: ProjectAssetKind[] = ['map', 'image', 'audio', 'data', 'other']

/** The four copy-from-game entries; each opens its own resource picker. */
const GAME_IMPORT_KINDS: Array<{
  kind: GameAssetImportKind
  icon: typeof MapIcon
}> = [
  { kind: 'map', icon: MapIcon },
  { kind: 'image', icon: ImageIcon },
  { kind: 'audio', icon: Music2 },
  { kind: 'data', icon: FileCode2 },
]

function assetDataUrl(asset: VirtualPreviewAsset) {
  return `data:${asset.mediaType};base64,${asset.bytesBase64}`
}

function fileToAsset(file: File, relativePath: string): Promise<VirtualPreviewAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve({
        relativePath,
        mediaType: file.type || 'application/octet-stream',
        bytesBase64: result.split(',')[1] ?? '',
      })
    }
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AssetGlyph({ kind }: { kind: ProjectAssetKind }) {
  const Icon =
    kind === 'map' ? MapIcon : kind === 'image' ? ImageIcon : kind === 'audio' ? Music2 : kind === 'data' ? FileCode2 : FileQuestion
  return <Icon className="h-5 w-5" aria-hidden="true" />
}

/** Project-scoped asset browser that loads persisted bytes only for the selected asset. */
export function AssetLibraryWorkspace() {
  const project = useWorkbenchProject()
  const copy = useAssetLibraryCopy()
  // Operation failures surface through the shared notification system, not an
  // inline banner; stable ids make repeated failures replace each other.
  const publishNotification = useNotificationPublisher()
  const replaceRef = useRef<HTMLInputElement>(null)
  const renameTitleId = useId()
  const deleteTitleId = useId()
  const deleteSelectedTitleId = useId()
  const browserRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssetFilter>('all')
  const [view, setView] = useState<AssetView>('grid')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedAssetPaths, setSelectedAssetPaths] = useState<ReadonlySet<string>>(new Set())
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false)
  const [isBoxSelecting, setIsBoxSelecting] = useState(false)
  const [browserElement, setBrowserElement] = useState<HTMLDivElement | null>(null)
  const [selectedLoadBindingId, setSelectedLoadBindingId] = useState<string | null>(null)
  const [showLoadFamilyPicker, setShowLoadFamilyPicker] = useState(false)
  const [showGameImportPicker, setShowGameImportPicker] = useState(false)
  const [gameImportPicker, setGameImportPicker] = useState<{
    kind: GameAssetImportKind
    request: number
  } | null>(null)
  const [renamePath, setRenamePath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deletePath, setDeletePath] = useState<string | null>(null)
  const [pixelAsset, setPixelAsset] = useState<VirtualPreviewAsset | null>(null)
  const [loadedAsset, setLoadedAsset] = useState<VirtualPreviewAsset | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [createMapOpen, setCreateMapOpen] = useState(false)
  const [repairingKey, setRepairingKey] = useState<string | null>(null)
  const [dismissedMissingSignature, setDismissedMissingSignature] = useState<string | null>(null)
  const assets = project.projectAssets
  const missingDependencies = findMissingAssetDependencies(assets)
  const missingSignature = missingDependencies.map((missing) => `${missing.assetPath}\u0000${missing.missingPath}`).join('\n')
  const missingByAsset = new Set(missingDependencies.map((missing) => missing.assetPath))

  const environment = useWorkbenchEnvironment()
  const { locale, theme } = useWorkbenchRuntimeInputs()
  const { port, saveState } = useWorkbenchAssetDraftPort('map')
  const gameRootPath = environment.directoryInfo?.rootPath ?? null
  const mapCatalog = useMapAuthoringCatalog(gameRootPath, environment.directoryInfo, locale)
  // The non-map game asset scans run beside the map catalog and surface their
  // failures through the shared notification system (see effects below).
  const scanImages = useCallback((path: string) => scanImageAssets(path), [])
  const scanAudios = useCallback((path: string) => scanAudioAssets(path), [])
  const scanDatas = useCallback((path: string) => scanDataAssets(path), [])
  const imageScan = useGameAssetScan(gameRootPath, scanImages)
  const audioScan = useGameAssetScan(gameRootPath, scanAudios)
  const dataScan = useGameAssetScan(gameRootPath, scanDatas)
  const resources: EditorResources = {
    locale,
    theme,
    accentColor: environment.accentColor,
    gameRootPath: environment.directoryInfo?.rootPath ?? null,
    directoryInfo: environment.directoryInfo,
    playerAppearanceProfile: environment.playerAppearanceProfile ?? null,
    onOpenPlayerAppearanceWindow: environment.onOpenPlayerAppearanceWindow,
    onReadProjectAsset: (relativePath) => project.readProjectAsset(relativePath),
  }
  const loadBindings = port ? collectLoadPatches(port.draft.patches) : []
  const loadBindingsByFamily = groupLoadPatchesByFamily(loadBindings)
  const selectedBinding = loadBindings.find((patch) => patch.id === selectedLoadBindingId) ?? null

  // The game map scan failure is an environment problem, not page state:
  // surface it through the notification system and clear it once the scan recovers.
  const mapScanError = mapCatalog.error
  useEffect(() => {
    if (!mapScanError) {
      dismissNotification('asset-library-map-scan')
      return
    }
    publishNotification({
      id: 'asset-library-map-scan',
      level: 'error',
      title: copy.mapScanFailed,
      description: mapScanError,
    })
  }, [copy.mapScanFailed, mapScanError, publishNotification])

  // Image/audio/data scans follow the same contract: errors go to notifications
  // with the original message and are dismissed as soon as the scan recovers.
  useEffect(() => {
    if (!imageScan.error) {
      dismissNotification('asset-library-image-scan')
      return
    }
    publishNotification({
      id: 'asset-library-image-scan',
      level: 'error',
      title: copy.gameAssetScanFailed,
      description: imageScan.error,
    })
  }, [copy.gameAssetScanFailed, imageScan.error, publishNotification])

  useEffect(() => {
    if (!audioScan.error) {
      dismissNotification('asset-library-audio-scan')
      return
    }
    publishNotification({
      id: 'asset-library-audio-scan',
      level: 'error',
      title: copy.gameAssetScanFailed,
      description: audioScan.error,
    })
  }, [audioScan.error, copy.gameAssetScanFailed, publishNotification])

  useEffect(() => {
    if (!dataScan.error) {
      dismissNotification('asset-library-data-scan')
      return
    }
    publishNotification({
      id: 'asset-library-data-scan',
      level: 'error',
      title: copy.gameAssetScanFailed,
      description: dataScan.error,
    })
  }, [copy.gameAssetScanFailed, dataScan.error, publishNotification])

  useEffect(() => {
    if (selectedPath && !assets.some((asset) => asset.relativePath === selectedPath)) {
      setSelectedPath(assets[0]?.relativePath ?? null)
    }
  }, [assets, selectedPath])

  // Keep the multi-selection free of paths that left the project (e.g. an
  // asset deleted through the inspector while the batch bar is visible).
  useEffect(() => {
    setSelectedAssetPaths((current) => {
      if (current.size === 0) return current
      const existing = new Set(assets.map((asset) => asset.relativePath))
      const pruned = new Set(Array.from(current).filter((path) => existing.has(path)))
      return pruned.size === current.size ? current : pruned
    })
  }, [assets])

  // Escape dismisses the batch selection without touching the inspector focus.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedAssetPaths(new Set())
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const setBrowserNode = (node: HTMLDivElement | null) => {
    browserRef.current = node
    setBrowserElement((current) => (current === node ? current : node))
  }

  // Box selection mirrors the launcher library grid: cards carry a
  // `data-asset-path` marker, the drag box is compared against their
  // viewport-relative rects, and the drawn overlay lives in a dedicated layer.
  const updateDragSelection = (box: Box) => {
    const browser = browserRef.current
    if (!browser) return
    const selectedPaths = Array.from(browser.querySelectorAll<HTMLElement>('[data-asset-path]'))
      .filter((element) => {
        const path = element.getAttribute('data-asset-path')
        if (!path) return false
        const rect = element.getBoundingClientRect()
        return (
          box.left <= rect.left + rect.width &&
          box.left + box.width >= rect.left &&
          box.top <= rect.top + rect.height &&
          box.top + box.height >= rect.top
        )
      })
      .map((element) => element.getAttribute('data-asset-path'))
      .filter((path): path is string => Boolean(path))
    setSelectedAssetPaths(new Set(selectedPaths))
  }
  const { DragSelection } = useSelectionContainer<HTMLDivElement>({
    eventsElement: browserElement,
    isEnabled: view === 'grid' && !selectedBinding,
    isValidSelectionStart: () => true,
    onSelectionStart: () => setIsBoxSelecting(true),
    onSelectionEnd: () => setIsBoxSelecting(false),
    onSelectionChange: updateDragSelection,
    selectionProps: {
      'data-testid': 'asset-library-box-select',
      className: 'asset-library-box-select',
    } as HTMLAttributes<HTMLDivElement>,
    shouldStartSelecting: (target) =>
      target instanceof HTMLElement && !target.closest('.asset-library-asset') && !target.closest('.asset-library-selection-pill'),
  })

  // Cross-module jumps (map workspace "manage in asset library" links) stage a
  // transient focus here; consume it once and clear it so a stale value never
  // fires on a later visit.
  const pendingFocus = useAssetLibraryFocusStore((state) => state.focus)
  useEffect(() => {
    if (!pendingFocus) return
    const focus = useAssetLibraryFocusStore.getState().consumeFocus()
    if (!focus) return
    if (focus.kind === 'asset') {
      setSelectedPath(focus.key)
      setSelectedLoadBindingId(null)
    } else {
      setSelectedLoadBindingId(focus.key)
    }
  }, [pendingFocus])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleAssets = assets.filter((asset) => {
    const kind = classifyProjectAsset(asset.mediaType, asset.relativePath)
    return (filter === 'all' || filter === kind) && (normalizedQuery === '' || asset.relativePath.toLowerCase().includes(normalizedQuery))
  })
  const selected = assets.find((asset) => asset.relativePath === selectedPath) ?? visibleAssets[0] ?? null
  const selectedKind = selected ? classifyProjectAsset(selected.mediaType, selected.relativePath) : null
  // The all-filter grid view groups cards by kind (path order is preserved by
  // filtering the already sorted project asset list); list view and filtered
  // grids stay flat.
  const kindGroups =
    view === 'grid' && filter === 'all'
      ? ASSET_KIND_ORDER.map((kind) => ({
          kind,
          assets: visibleAssets.filter((asset) => classifyProjectAsset(asset.mediaType, asset.relativePath) === kind),
        })).filter((group) => group.assets.length > 0)
      : null
  const selectedPayload = loadedAsset?.relativePath === selected?.relativePath ? loadedAsset : null
  const gameImportOptions: Record<Exclude<GameAssetImportKind, 'map'>, ResourceBrowserOption[]> = {
    image: toGameImageResourceBrowserOptions(imageScan.assets),
    audio: toGameAudioResourceBrowserOptions(audioScan.assets),
    data: toGameDataResourceBrowserOptions(dataScan.assets),
  }
  const selectedReferences = selected
    ? (project.activeDraft?.patches.filter(
        (patch) => patch.fromFile?.replaceAll('\\', '/').toLowerCase() === selected.relativePath.replaceAll('\\', '/').toLowerCase(),
      ) ?? [])
    : []
  const dependencyView = selected ? buildAssetDependencyView(assets, selected.relativePath) : { dependencies: [], dependents: [] }
  const readProjectAsset = project.readProjectAsset

  useEffect(() => {
    if (!selected) {
      setLoadedAsset(null)
      setPreviewLoading(false)
      return
    }
    let current = true
    setLoadedAsset(null)
    setPreviewLoading(true)
    void readProjectAsset(selected.relativePath)
      .then((payload) => {
        if (current) {
          setLoadedAsset({
            ...payload.asset,
            bytesBase64: payload.bytesBase64,
          })
          dismissNotification('asset-library-preview')
        }
      })
      .catch(() => {
        if (current)
          publishNotification({
            id: 'asset-library-preview',
            level: 'error',
            title: copy.previewFailed,
          })
      })
      .finally(() => {
        if (current) setPreviewLoading(false)
      })
    return () => {
      current = false
    }
  }, [copy.previewFailed, publishNotification, readProjectAsset, selected?.relativePath, selected?.sha256])

  async function importPaths(sourcePaths: string[]) {
    if (sourcePaths.length === 0) return
    setImporting(true)
    dismissNotification('asset-library-import')
    try {
      const previousPaths = new Set(assets.map((asset) => asset.relativePath.toLowerCase()))
      const imported = await project.importProjectAssets(sourcePaths)
      const firstImported = imported.projectAssets.find((asset) => !previousPaths.has(asset.relativePath.toLowerCase()))
      if (firstImported) setSelectedPath(firstImported.relativePath)
    } catch {
      publishNotification({
        id: 'asset-library-import',
        level: 'error',
        title: copy.importFailed,
      })
    } finally {
      setImporting(false)
    }
  }

  async function chooseImportFiles() {
    const paths = await project.chooseFiles(copy.selectFilesTitle)
    await importPaths(paths)
  }

  async function chooseImportFolder() {
    const path = await project.chooseDirectory(copy.selectFolderTitle)
    if (path) await importPaths([path])
  }

  /**
   * Creates a fresh `Load` patch for one asset family and selects it so the
   * graphical binding editor opens. Maps stay in the map workspace (the map
   * catalog lists them); every other family lands in the mods workspace since
   * no other workspace owns them. Load bindings are owned by the asset
   * library, so other workspaces only see read-only summaries.
   */
  function createLoadBindingForFamily(family: LoadAssetFamily) {
    if (!port) return
    const patchId = port.addPatch('Load', placeholderLoadTarget(family))
    if (!patchId) return
    // The port is bound to the map workspace; the wanted workspace only
    // differs for non-map families, so this is a no-op for maps. Functional
    // state updates queue in order, so the workspace lands on the new patch.
    port.updatePatch(patchId, { workspace: loadFamilyWorkspace(family) })
    setShowLoadFamilyPicker(false)
    setSelectedLoadBindingId(patchId)
  }

  function deleteLoadBinding(patchId: string) {
    if (!port) return
    port.removePatch(patchId)
    if (selectedLoadBindingId === patchId) setSelectedLoadBindingId(null)
  }

  /** Copies a scanned game map and its tilesheets into the project as assets. */
  async function importFromGame(asset: MapAssetSummary) {
    dismissNotification('asset-library-import-map')
    try {
      const target = mapTargetFromAsset(asset)
      const usedPaths = new Set(project.projectAssets.map((a) => a.relativePath.replaceAll('\\', '/').toLowerCase()))
      const prepared = await prepareProjectMapCopy({
        target,
        asset,
        resources,
        usedPaths,
        invalidMapError: copy.importMapFailed,
        tilesheetLoadError: copy.create.tilesheetLoadError,
      })
      await project.writeProjectAssets(prepared.assets, 'generated')
      setSelectedPath(prepared.document.relativePath)
      setSelectedLoadBindingId(null)
    } catch {
      publishNotification({
        id: 'asset-library-import-map',
        level: 'error',
        title: copy.importMapFailed,
      })
    }
  }

  /** Opens the copy-from-game picker for one asset family (map/image/audio/data). */
  function openGameImportPicker(kind: GameAssetImportKind) {
    setShowGameImportPicker(false)
    setGameImportPicker((current) => ({
      kind,
      request: (current?.request ?? 0) + 1,
    }))
  }

  function findGameAssetImportSource(kind: Exclude<GameAssetImportKind, 'map'>, value: string): GameAssetImportSource | null {
    if (kind === 'image') {
      const asset = imageScan.assets.find((candidate) => candidate.relativePath === value)
      return asset ? { kind, asset } : null
    }
    if (kind === 'audio') {
      const asset = audioScan.assets.find((candidate) => candidate.relativePath === value)
      return asset ? { kind, asset } : null
    }
    const asset = dataScan.assets.find((candidate) => candidate.relativePath === value)
    return asset ? { kind, asset } : null
  }

  /**
   * Imports one scanned game asset (image/audio/data) into the project through
   * the shared pipeline. Failures keep the original error message in the
   * notification description so nothing is silently swallowed.
   */
  async function importGameSelection(kind: GameAssetImportKind, value: string) {
    if (kind === 'map') {
      const asset = mapCatalog.assets.find((candidate) => mapTargetFromAsset(candidate) === value)
      if (asset) await importFromGame(asset)
      return
    }
    const source = findGameAssetImportSource(kind, value)
    if (!source) return
    dismissNotification('asset-library-import-game-asset')
    try {
      const usedPaths = new Set(project.projectAssets.map((asset) => asset.relativePath.replaceAll('\\', '/').toLowerCase()))
      const prepared = await prepareGameAssetImport(source, {
        resources,
        existingPaths: usedPaths,
        invalidDataError: copy.importGameAssetFailed,
      })
      await project.writeProjectAssets([prepared], 'generated')
      setSelectedPath(prepared.relativePath)
      setSelectedLoadBindingId(null)
    } catch (error) {
      publishNotification({
        id: 'asset-library-import-game-asset',
        level: 'error',
        title: copy.importGameAssetFailed,
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Imports files picked to satisfy one missing dependency edge. Files whose
   * basename matches the missing file are placed into the expected directory
   * so the edge resolves; other files land in the default assets root and the
   * missing prompt naturally stays visible.
   */
  async function repairMissingDependency(missing: MissingAssetDependency) {
    const repairKey = `${missing.assetPath}\u0000${missing.missingPath}`
    setRepairingKey(repairKey)
    dismissNotification('asset-library-dependency-repair')
    try {
      const paths = await project.chooseFiles(copy.missingDependencyPickTitle)
      if (paths.length === 0) return
      const normalizedMissingPath = missing.missingPath.replaceAll('\\', '/')
      const expectedName = (normalizedMissingPath.split('/').at(-1) ?? '').toLowerCase()
      const expectedDirectory = normalizedMissingPath.includes('/')
        ? normalizedMissingPath.slice(0, normalizedMissingPath.lastIndexOf('/'))
        : ''
      const matching = paths.filter((path) => (path.split(/[\\/]/).at(-1) ?? '').toLowerCase() === expectedName)
      const others = paths.filter((path) => !matching.includes(path))
      if (matching.length > 0) await project.importProjectAssets(matching, expectedDirectory || 'assets')
      if (others.length > 0) await project.importProjectAssets(others)
      setDismissedMissingSignature(null)
    } catch {
      publishNotification({
        id: 'asset-library-dependency-repair',
        level: 'error',
        title: copy.missingDependencyImportFailed,
      })
    } finally {
      setRepairingKey(null)
    }
  }

  async function replaceSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selected) return
    dismissNotification('asset-library-replace')
    try {
      await project.writeProjectAsset(await fileToAsset(file, selected.relativePath), 'edited')
    } catch {
      publishNotification({
        id: 'asset-library-replace',
        level: 'error',
        title: copy.replaceFailed,
      })
    }
  }

  async function confirmRename() {
    if (!renamePath || sanitizeProjectAssetPath(renameDraft) === '') return
    const nextPath = allocateProjectAssetPath(
      assets.map((asset) => asset.relativePath),
      renameDraft,
      renamePath,
    )
    try {
      await project.renameProjectAsset(renamePath, nextPath)
      setSelectedPath(nextPath)
      setRenamePath(null)
    } catch {
      publishNotification({
        id: 'asset-library-rename',
        level: 'error',
        title: copy.renameFailed,
      })
    }
  }

  async function confirmDelete() {
    if (!deletePath) return
    try {
      await project.deleteProjectAsset(deletePath)
      setDeletePath(null)
    } catch {
      publishNotification({
        id: 'asset-library-delete',
        level: 'error',
        title: copy.deleteFailed,
      })
    }
  }

  /**
   * Deletes every box-selected asset sequentially; a single failure keeps the
   * remaining deletes running and is reported with the original error message
   * through the notification system. Successfully deleted paths leave the
   * selection, failed ones stay so the user can retry.
   */
  async function confirmDeleteSelected() {
    if (selectedAssetPaths.size === 0) return
    dismissNotification('asset-library-delete-selected')
    const remaining = new Set(selectedAssetPaths)
    const failed: Array<{ path: string; message: string }> = []
    for (const path of Array.from(selectedAssetPaths)) {
      try {
        await project.deleteProjectAsset(path)
        remaining.delete(path)
      } catch (error) {
        failed.push({
          path,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    if (failed.length > 0) {
      publishNotification({
        id: 'asset-library-delete-selected',
        level: 'error',
        title: copy.deleteSelectedPartialFailed(failed.length),
        description: failed.map((item) => `${item.path}: ${item.message}`).join('\n'),
      })
    }
    setSelectedAssetPaths(remaining)
    setDeleteSelectedOpen(false)
  }

  async function savePixelEdit(bytesBase64: string) {
    if (!pixelAsset) return
    const wantedPath = allocateProjectAssetPath(
      assets.map((asset) => asset.relativePath),
      pngAssetPath(pixelAsset.relativePath),
      pixelAsset.relativePath,
    )
    try {
      if (wantedPath !== pixelAsset.relativePath) await project.renameProjectAsset(pixelAsset.relativePath, wantedPath)
      await project.writeProjectAsset({ relativePath: wantedPath, mediaType: 'image/png', bytesBase64 }, 'edited')
      setSelectedPath(wantedPath)
      setPixelAsset(null)
    } catch {
      publishNotification({
        id: 'asset-library-pixel-save',
        level: 'error',
        title: copy.pixelSaveFailed,
      })
    }
  }

  if (!project.activeDraft) {
    return (
      <div className="asset-library-empty">
        <ImageIcon className="h-10 w-10" />
        <h1>{copy.noProjectTitle}</h1>
        <p>{copy.noProjectHint}</p>
      </div>
    )
  }

  // Save status comes from the draft port's single auto-save pipeline; the
  // idle state falls back to project dirtiness so a clean draft reads "Saved".
  const saveStateLabel =
    saveState === 'saving'
      ? copy.savingStatus
      : saveState === 'error'
        ? copy.saveFailed
        : saveState === 'saved' || !project.isDirty
          ? copy.savedStatus
          : copy.dirtyStatus

  const renderAssetCard = (asset: ProjectAssetRef) => {
    const kind = classifyProjectAsset(asset.mediaType, asset.relativePath)
    const active = selected?.relativePath === asset.relativePath
    const multiSelected = selectedAssetPaths.has(asset.relativePath)
    const toggleMultiSelect = () => {
      setSelectedAssetPaths((current) => {
        const next = new Set(current)
        if (next.has(asset.relativePath)) next.delete(asset.relativePath)
        else next.add(asset.relativePath)
        return next
      })
    }
    return (
      <div
        key={asset.relativePath}
        data-asset-path={asset.relativePath}
        className={cx('asset-library-asset', active && 'is-selected', multiSelected && 'is-multi-selected')}
      >
        <button
          type="button"
          className="asset-library-asset-main"
          aria-pressed={active}
          onClick={(event) => {
            // Ctrl/Cmd+click toggles multi-selection without leaving the detail view.
            if (event.ctrlKey || event.metaKey) {
              toggleMultiSelect()
              return
            }
            setSelectedPath(asset.relativePath)
          }}
        >
          <span className="asset-library-thumb">
            {isProjectMapAssetPath(asset.relativePath) ? (
              <AssetMapThumbnail
                assetPath={asset.relativePath}
                sha256={asset.sha256}
                width={240}
                height={176}
                fallback={<AssetGlyph kind={kind} />}
              />
            ) : kind === 'image' ? (
              <AssetImageThumbnail
                assetPath={asset.relativePath}
                sha256={asset.sha256}
                mediaType={asset.mediaType}
                fallback={<AssetGlyph kind={kind} />}
              />
            ) : (
              <AssetGlyph kind={kind} />
            )}
            {missingByAsset.has(asset.relativePath) ? (
              <span
                className="asset-library-missing-badge"
                title={copy.missingDependenciesBadge}
                aria-label={copy.missingDependenciesBadge}
              >
                {copy.missingDependenciesBadge}
              </span>
            ) : null}
          </span>
          <span className="asset-library-asset-copy" title={asset.relativePath}>
            <strong>{asset.relativePath.split('/').at(-1)}</strong>
            <span>{asset.relativePath}</span>
          </span>
          <span className="asset-library-asset-meta">
            {copy.filters[kind]} · {formatBytes(asset.sizeBytes)}
          </span>
        </button>
        <button
          type="button"
          className={cx('asset-library-asset-check', multiSelected && 'is-checked')}
          aria-label={copy.selectAsset(asset.relativePath)}
          title={copy.selectAsset(asset.relativePath)}
          aria-pressed={multiSelected}
          onClick={toggleMultiSelect}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="asset-library-workspace">
      <div className="asset-library-toolbar">
        <span className="asset-library-save-state" aria-live="polite">
          {saveStateLabel}
        </span>
        <label className="asset-library-search">
          <Search className="h-4 w-4" />
          <span className="sr-only">{copy.searchPlaceholder}</span>
          <input
            className="control-input"
            type="search"
            value={query}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedAssetPaths(new Set())
            }}
          />
        </label>
        <label className="asset-library-filter">
          <span className="sr-only">{copy.filterLabel}</span>
          <select
            className="control-input"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as AssetFilter)
              setSelectedAssetPaths(new Set())
            }}
          >
            {Object.entries(copy.filters).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="asset-library-count">{copy.assetCount(visibleAssets.length, assets.length)}</span>
        <div className="asset-library-view-switch" role="group">
          <button
            type="button"
            className={cx('icon-button', view === 'grid' && 'is-active')}
            aria-label={copy.gridView}
            title={copy.gridView}
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cx('icon-button', view === 'list' && 'is-active')}
            aria-label={copy.listView}
            title={copy.listView}
            aria-pressed={view === 'list'}
            onClick={() => {
              setView('list')
              setSelectedAssetPaths(new Set())
            }}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        <div className="asset-library-toolbar-actions">
          <div className="asset-library-import-game">
            <button
              type="button"
              className="control-button"
              aria-expanded={showGameImportPicker}
              aria-haspopup="menu"
              onClick={() => setShowGameImportPicker((value) => !value)}
            >
              <FolderInput className="h-4 w-4" aria-hidden="true" />
              {copy.importFromGame}
            </button>
            {showGameImportPicker ? (
              <div className="asset-library-import-kind-picker" role="menu" aria-label={copy.importFromGame}>
                {GAME_IMPORT_KINDS.map(({ kind, icon: KindIcon }) => (
                  <button key={kind} type="button" role="menuitem" onClick={() => openGameImportPicker(kind)}>
                    <KindIcon className="h-4 w-4" aria-hidden="true" />
                    {copy.importGameKinds[kind]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {gameImportPicker ? (
            <ResourcePicker
              key={gameImportPicker.kind}
              value=""
              label={copy.importGamePickerLabel[gameImportPicker.kind]}
              placeholder={copy.importGamePickerLabel[gameImportPicker.kind]}
              options={
                gameImportPicker.kind === 'map'
                  ? toMapResourceBrowserOptions(
                      mapCatalog.assets,
                      (asset) => copy.mapCategories[mapCatalogCategory(mapTargetFromAsset(asset))],
                      'map-import',
                    )
                  : gameImportOptions[gameImportPicker.kind]
              }
              selectionMode="confirm"
              triggerClassName="sr-only"
              openRequest={gameImportPicker.request}
              onSelect={(value) => void importGameSelection(gameImportPicker.kind, value)}
            />
          ) : null}
          <button type="button" className="control-button" onClick={() => setCreateMapOpen(true)}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            {copy.newMapAction}
          </button>
          <button type="button" className="control-button" disabled={importing} onClick={() => void chooseImportFolder()}>
            <FolderInput className="h-4 w-4" aria-hidden="true" />
            <span>{copy.importFolderAction}</span>
          </button>
          <button
            type="button"
            className="control-button control-button-primary"
            disabled={importing}
            onClick={() => void chooseImportFiles()}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>{importing ? copy.importing : copy.importAction}</span>
          </button>
        </div>
      </div>

      <div className="asset-library-status-rows">
        {mapCatalog.loading ? (
          <div className="asset-library-missing-banner" role="status">
            <header className="asset-library-missing-header">
              <MapIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <strong>{copy.mapScanLoading}</strong>
            </header>
          </div>
        ) : null}

        {imageScan.loading || audioScan.loading || dataScan.loading ? (
          <div className="asset-library-missing-banner" role="status">
            <header className="asset-library-missing-header">
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <strong>{copy.gameAssetScanLoading}</strong>
            </header>
          </div>
        ) : null}

        {missingDependencies.length > 0 && missingSignature !== dismissedMissingSignature ? (
          <div className="asset-library-missing-banner" role="alert">
            <header className="asset-library-missing-header">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <strong>{copy.missingDependenciesTitle}</strong>
              <span className="asset-library-missing-hint">{copy.missingDependenciesHint}</span>
              <button
                type="button"
                className="icon-button asset-library-missing-dismiss"
                aria-label={copy.dismissAction}
                title={copy.dismissAction}
                onClick={() => setDismissedMissingSignature(missingSignature)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <ul className="asset-library-missing-list">
              {missingDependencies.map((missing) => {
                const repairKey = `${missing.assetPath}\u0000${missing.missingPath}`
                return (
                  <li key={repairKey} className="asset-library-missing-row">
                    <span className="asset-library-missing-copy">
                      <strong>{missing.assetPath}</strong>
                      <span>{copy.missingDependencyTarget(missing.missingPath, missing.kind)}</span>
                    </span>
                    <button
                      type="button"
                      className="control-button"
                      disabled={repairingKey !== null}
                      onClick={() => void repairMissingDependency(missing)}
                    >
                      {repairingKey === repairKey ? copy.importing : copy.missingDependencyPickAction}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <WorkspaceSplitView
        sidebarClassName="custom-scrollbar"
        sidebar={
          <div className="asset-library-bindings">
            <header className="asset-library-bindings-header">
              <div className="asset-library-bindings-title-row">
                <strong>{copy.viewLoadBindings}</strong>
                <span className="asset-library-count">{copy.loadBindingCount(loadBindings.length)}</span>
                <button type="button" className="control-button control-button-primary" onClick={() => setShowLoadFamilyPicker(true)}>
                  <FileInput className="h-4 w-4" aria-hidden="true" />
                  {copy.newLoadBindingAction}
                </button>
              </div>
              <p className="asset-library-bindings-hint">{copy.loadBindingsHint}</p>
            </header>
            <div className="asset-library-load-binding-list">
              {loadBindings.length === 0 ? (
                <div className="asset-library-empty">
                  <Link2 className="h-8 w-8" />
                  <h2>{copy.loadBindingsTitle}</h2>
                  <p>{copy.loadBindingsEmpty}</p>
                  <button type="button" className="control-button control-button-primary" onClick={() => setShowLoadFamilyPicker(true)}>
                    <FileInput className="h-4 w-4" />
                    {copy.newLoadBindingAction}
                  </button>
                </div>
              ) : (
                LOAD_FAMILY_ORDER.map((family) => {
                  const familyPatches = loadBindingsByFamily[family]
                  if (familyPatches.length === 0) return null
                  return (
                    <div key={family} className="asset-library-load-family-group">
                      <header className="asset-library-load-family-header">
                        <LoadFamilyIcon family={family} className="h-3.5 w-3.5" />
                        {copy.loadFamilyGroupCount(copy.loadFamilyNames[family], familyPatches.length)}
                      </header>
                      {familyPatches.map((patch) => {
                        const active = patch.id === selectedLoadBindingId
                        return (
                          <div key={patch.id} className={cx('asset-library-load-binding-row', active && 'is-selected')}>
                            <button
                              type="button"
                              className="asset-library-load-binding-main"
                              aria-pressed={active}
                              aria-label={copy.openLoadBinding(patch.target)}
                              onClick={() => setSelectedLoadBindingId(active ? null : patch.id)}
                            >
                              <span className="asset-library-load-binding-target">{patch.target}</span>
                              <span className={cx('asset-library-load-binding-file', !patch.fromFile && 'is-empty')}>
                                {patch.fromFile ?? copy.mapLoadBinding.emptyResolved}
                              </span>
                              <span
                                className={cx(
                                  'asset-editor-badge',
                                  typeof patch.enabled === 'string' || patch.enabled !== false ? 'is-ok' : 'is-missing',
                                )}
                              >
                                {typeof patch.enabled === 'string'
                                  ? copy.loadBindingEnabledExpression(patch.enabled)
                                  : patch.enabled !== false
                                    ? copy.loadBindingEnabled
                                    : copy.loadBindingDisabled}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              title={copy.deleteLoadBinding}
                              aria-label={copy.deleteLoadBinding}
                              onClick={() => deleteLoadBinding(patch.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        }
      >
        <div className="asset-library-main">
          {showLoadFamilyPicker ? (
            <div className="load-family-picker">
              <header className="load-family-picker-header">
                <strong>{copy.newLoadBindingFamilyTitle}</strong>
                <span className="map-load-section-hint">{copy.newLoadBindingFamilyHint}</span>
              </header>
              <div className="load-family-picker-grid">
                {LOAD_FAMILY_ORDER.map((family) => (
                  <button
                    key={family}
                    type="button"
                    className="load-family-picker-card"
                    aria-label={copy.loadFamilyNames[family]}
                    onClick={() => createLoadBindingForFamily(family)}
                  >
                    <LoadFamilyIcon family={family} className="h-5 w-5" />
                    <span>{copy.loadFamilyNames[family]}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="control-button" onClick={() => setShowLoadFamilyPicker(false)}>
                {copy.newLoadBindingFamilyCancel}
              </button>
            </div>
          ) : null}
          {selectedBinding && port ? (
            <div className="asset-library-load-binding-editor custom-scrollbar">
              <header className="asset-library-binding-editor-header">
                <LoadFamilyIcon family={loadAssetFamily(selectedBinding.target)} className="h-4 w-4" />
                <strong>{selectedBinding.target}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={copy.closeAction}
                  title={copy.closeAction}
                  onClick={() => setSelectedLoadBindingId(null)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </header>
              <LoadBindingEditor patch={selectedBinding} schema={null} draftPort={port} resources={resources} />
            </div>
          ) : (
            <div className="asset-library-assets-pane">
              <main
                ref={setBrowserNode}
                className={cx(
                  'asset-library-browser custom-scrollbar',
                  isBoxSelecting && 'is-box-selecting',
                  selectedAssetPaths.size > 0 && 'has-batch-selection',
                )}
              >
                <div className="asset-library-box-select-layer" data-asset-library-box-select-layer="browser">
                  <DragSelection />
                </div>
                {assets.length === 0 ? (
                  <div className="asset-library-empty">
                    <ImageIcon className="h-10 w-10" />
                    <h2>{copy.emptyTitle}</h2>
                    <p>{copy.emptyHint}</p>
                    <button type="button" className="control-button control-button-primary" onClick={() => void chooseImportFiles()}>
                      <Upload className="h-4 w-4" />
                      {copy.importAction}
                    </button>
                    <button type="button" className="control-button" onClick={() => void chooseImportFolder()}>
                      <FolderInput className="h-4 w-4" />
                      {copy.importFolderAction}
                    </button>
                  </div>
                ) : visibleAssets.length === 0 ? (
                  <div className="asset-library-empty">
                    <Search className="h-8 w-8" />
                    <p>{copy.noResults}</p>
                  </div>
                ) : (
                  <div className={cx('asset-library-assets', view === 'list' && 'is-list')}>
                    {kindGroups
                      ? kindGroups.map((group) => (
                          <Fragment key={group.kind}>
                            <header className="asset-library-kind-header" data-kind={group.kind}>
                              <strong>{copy.filters[group.kind]}</strong>
                              <span>{copy.assetKindCount(group.assets.length)}</span>
                            </header>
                            {group.assets.map((asset) => renderAssetCard(asset))}
                          </Fragment>
                        ))
                      : visibleAssets.map((asset) => renderAssetCard(asset))}
                  </div>
                )}
                {selectedAssetPaths.size > 0 ? (
                  <div className="asset-library-selection-pill" role="toolbar" aria-label={copy.selectionCount(selectedAssetPaths.size)}>
                    <span className="asset-library-selection-count">{copy.selectionCount(selectedAssetPaths.size)}</span>
                    <span className="asset-library-selection-divider" aria-hidden="true" />
                    <button
                      type="button"
                      className="control-button"
                      disabled={selectedAssetPaths.size >= visibleAssets.length}
                      onClick={() => setSelectedAssetPaths(new Set(visibleAssets.map((asset) => asset.relativePath)))}
                    >
                      {copy.selectAll}
                    </button>
                    <button type="button" className="control-button" onClick={() => setSelectedAssetPaths(new Set())}>
                      {copy.clearSelection}
                    </button>
                    <span className="asset-library-selection-divider" aria-hidden="true" />
                    <button type="button" className="control-button is-danger" onClick={() => setDeleteSelectedOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {copy.deleteSelectedAction}
                    </button>
                  </div>
                ) : null}
              </main>

              <aside className="asset-library-inspector">
                {selected ? (
                  <>
                    <div className="asset-library-preview">
                      {isProjectMapAssetPath(selected.relativePath) ? (
                        <AssetMapThumbnail
                          assetPath={selected.relativePath}
                          sha256={selected.sha256}
                          width={480}
                          height={352}
                          fallback={<AssetGlyph kind={selectedKind ?? 'other'} />}
                        />
                      ) : selectedKind === 'image' && selectedPayload ? (
                        <img src={assetDataUrl(selectedPayload)} alt={copy.previewAlt(selected.relativePath)} />
                      ) : selectedKind === 'audio' && selectedPayload ? (
                        <audio controls src={assetDataUrl(selectedPayload)} />
                      ) : (
                        <AssetGlyph kind={selectedKind ?? 'other'} />
                      )}
                    </div>
                    <div className="asset-library-inspector-title">
                      <strong>{selected.relativePath.split('/').at(-1)}</strong>
                      <span>{selected.relativePath}</span>
                      <span className="asset-library-kind-chip">{copy.filters[selectedKind ?? 'other']}</span>
                    </div>
                    <dl className="asset-library-facts">
                      <div>
                        <dt>{copy.typeLabel}</dt>
                        <dd>{selected.mediaType}</dd>
                      </div>
                      <div>
                        <dt>{copy.sizeLabel}</dt>
                        <dd>{formatBytes(selected.sizeBytes)}</dd>
                      </div>
                      <div>
                        <dt>{copy.referencesLabel}</dt>
                        <dd>{copy.referenceCount(selectedReferences.length)}</dd>
                      </div>
                    </dl>
                    {dependencyView.dependencies.length > 0 || dependencyView.dependents.length > 0 ? (
                      <section className="asset-library-dependencies">
                        {dependencyView.dependencies.length > 0 ? (
                          <>
                            <h3>{copy.dependenciesLabel}</h3>
                            <ul className="asset-library-dependency-list">
                              {dependencyView.dependencies.map((dependency) => (
                                <li key={dependency.path}>
                                  <button
                                    type="button"
                                    className="asset-library-dependency-link"
                                    disabled={!dependency.exists}
                                    title={dependency.exists ? copy.openDependencyAction(dependency.path) : undefined}
                                    onClick={() => {
                                      if (dependency.exists) setSelectedPath(dependency.path)
                                    }}
                                  >
                                    <span className="asset-library-dependency-path">{dependency.path}</span>
                                    <span className="asset-library-dependency-kind">{dependency.kind}</span>
                                  </button>
                                  <span className={cx('asset-editor-badge', dependency.exists ? 'is-ok' : 'is-missing')}>
                                    {dependency.exists ? copy.dependencyExistsLabel : copy.dependencyMissingLabel}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {dependencyView.dependents.length > 0 ? (
                          <>
                            <h3>{copy.dependentsLabel}</h3>
                            <ul className="asset-library-dependency-list">
                              {dependencyView.dependents.map((path) => (
                                <li key={path}>
                                  <button
                                    type="button"
                                    className="asset-library-dependency-link"
                                    title={copy.openDependencyAction(path)}
                                    onClick={() => setSelectedPath(path)}
                                  >
                                    {path}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </section>
                    ) : null}
                    <div className="asset-library-actions">
                      {isProjectMapAssetPath(selected.relativePath) ? (
                        <button
                          type="button"
                          className="control-button control-button-primary"
                          onClick={() => {
                            usePendingMapAssetEditStore.getState().requestEdit(selected.relativePath)
                            environment.onOpenModule('map-authoring')
                          }}
                        >
                          <MapIcon className="h-4 w-4" aria-hidden="true" />
                          {copy.editInMapEditorAction}
                        </button>
                      ) : null}
                      {selected.mediaType.startsWith('image/') ? (
                        <button
                          type="button"
                          className="control-button"
                          disabled={previewLoading || !selectedPayload}
                          onClick={() => setPixelAsset(selectedPayload)}
                        >
                          <Pencil className="h-4 w-4" />
                          {copy.editPixelsAction}
                        </button>
                      ) : null}
                      <button type="button" className="control-button" onClick={() => replaceRef.current?.click()}>
                        <RefreshCw className="h-4 w-4" />
                        {copy.replaceAction}
                      </button>
                      <button
                        type="button"
                        className="control-button"
                        onClick={() => {
                          setRenamePath(selected.relativePath)
                          setRenameDraft(selected.relativePath)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        {copy.renameAction}
                      </button>
                      <button type="button" className="control-button is-danger" onClick={() => setDeletePath(selected.relativePath)}>
                        <Trash2 className="h-4 w-4" />
                        {copy.deleteAction}
                      </button>
                    </div>
                  </>
                ) : null}
              </aside>
            </div>
          )}
        </div>
      </WorkspaceSplitView>

      <input ref={replaceRef} className="sr-only" type="file" onChange={(event) => void replaceSelected(event)} />

      <Dialog open={renamePath !== null} onClose={() => setRenamePath(null)} labelledBy={renameTitleId} size="sm">
        <DialogHeader
          id={renameTitleId}
          title={copy.renameTitle}
          subtitle={copy.renameHint}
          onClose={() => setRenamePath(null)}
          closeLabel={copy.closeAction}
        />
        <DialogBody>
          <label className="asset-library-dialog-field">
            <span>{copy.renamePathLabel}</span>
            <input className="control-input" data-autofocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
          </label>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setRenamePath(null)}>{copy.cancelAction}</DialogAction>
          <DialogAction tone="primary" disabled={sanitizeProjectAssetPath(renameDraft) === ''} onClick={() => void confirmRename()}>
            {copy.confirmRenameAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>

      <Dialog open={deletePath !== null} onClose={() => setDeletePath(null)} labelledBy={deleteTitleId} size="sm">
        <DialogHeader
          id={deleteTitleId}
          title={copy.deleteTitle}
          tone="danger"
          onClose={() => setDeletePath(null)}
          closeLabel={copy.closeAction}
        />
        <DialogBody>
          <p className="asset-library-delete-message">
            {deletePath
              ? copy.deleteMessage(deletePath, project.activeDraft.patches.filter((patch) => patch.fromFile === deletePath).length)
              : ''}
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setDeletePath(null)}>{copy.cancelAction}</DialogAction>
          <DialogAction tone="danger" onClick={() => void confirmDelete()}>
            {copy.confirmDeleteAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>

      <Dialog open={deleteSelectedOpen} onClose={() => setDeleteSelectedOpen(false)} labelledBy={deleteSelectedTitleId} size="sm">
        <DialogHeader
          id={deleteSelectedTitleId}
          title={copy.deleteSelectedTitle}
          tone="danger"
          onClose={() => setDeleteSelectedOpen(false)}
          closeLabel={copy.closeAction}
        />
        <DialogBody>
          <p className="asset-library-delete-message">{copy.deleteSelectedMessage(selectedAssetPaths.size)}</p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setDeleteSelectedOpen(false)}>{copy.cancelAction}</DialogAction>
          <DialogAction tone="danger" onClick={() => void confirmDeleteSelected()}>
            {copy.confirmDeleteAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>

      <PixelEditorDialog asset={pixelAsset} onClose={() => setPixelAsset(null)} onSave={(bytes) => void savePixelEdit(bytes)} />

      <NewMapDialog
        open={createMapOpen}
        assets={mapCatalog.assets}
        resources={resources}
        onClose={() => setCreateMapOpen(false)}
        onCreated={(relativePath) => {
          setCreateMapOpen(false)
          setSelectedPath(relativePath)
          setSelectedLoadBindingId(null)
        }}
      />
    </div>
  )
}
