import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { loadImageDataUrl, loadMapAsset, loadTextAsset, scanMaps, type GameDirectoryInfo, type MapAssetSummary } from '@entities/game/api'
import type { FocusedMapObjectTarget, TileHoverInfo } from '@shared/contracts'
import type { EditorCopy, LocaleCode } from '@locales'
import { scheduleDeferred } from '@shared/lib/react'
import { resolveTilesetImagePath } from '@entities/map'
import type { MapAtlasPlacement, MapDocument } from '@shared/contracts'
import {
  buildWorldAtlas,
  getExteriorWarpTargetNames,
  getWorldAtlasNameAliases,
  getWorldAtlasSeedNames,
  parseWorldMapLayout,
} from '@entities/map'
import { resolveEffectAsset } from '@entities/event'
import type { EffectAssetState } from '@entities/event'
import {
  MAP_PREVIEW_TAB_ID,
  WORLD_ATLAS_TAB_ID,
  buildMapWorkspaceTabs,
  getDefaultVisibleLayerIds,
  getMapDocumentDisplayTitle,
  getMapWorkspaceTabId,
  getDefaultVisibleObjectGroupIds,
  getInitialWorldAtlasSeedNames,
  getPreferredScene,
  isRemoteWorldAtlasDocument,
  matchesWorldAtlasMapName,
  type MapWorkspaceTab,
  pickWorldAtlasRootMapName,
  withWorldAtlasViewMetadata,
} from '@entities/map'
import {
  buildAtlasWorldOverlaySprites,
  buildBuildingDataIndex,
  buildStageWorldOverlaySprites,
  type StageBuildingDataEntry,
} from '@entities/map'
import {
  buildModBrowserGroups,
  buildModEntryLookup,
  findModBrowserEntry,
  findModSources,
  type BrowserSourceMode,
  type ModBrowserEntry,
} from '@pages/workbench/workspaces/mod'
import { useModAssetIndex } from '@pages/workbench/workspaces/mod'
import { loadModResultMapDocument } from '@pages/workbench/workspaces/mod'
import type { ResourcePreloadState, WorldAtlasView, WorkspaceStatus } from '@shared/contracts'

const WORLD_ROOT_MAP_NAME = 'Town'
const REMOTE_WORLD_ROOT_CANDIDATES = ['Island_S', 'Desert', 'Summit', 'Island_W', 'Island_N', 'Island_E', 'Island_SE'] as const

type UseMapWorkspaceOptions = {
  copy: EditorCopy
  locale: LocaleCode
  desktopHost: boolean
  active: boolean
  directoryInfo: GameDirectoryInfo | null
  onDirectoryInvalid?: (message: string) => void
  getWorldAtlasViewLabel: (locale: LocaleCode, viewId: WorldAtlasView['id']) => string
}

type OpenMapOptions = {
  forceReload?: boolean
}

type OpenWorldAtlasOptions = {
  initialOnly?: boolean
  preserveActiveTab?: boolean
}

type WorldAtlasCacheEntry = {
  views: WorldAtlasView[]
  sourceDocuments: MapDocument[]
}

const EMPTY_RESOURCE_PRELOAD_STATE: ResourcePreloadState = {
  active: false,
  message: '',
  completed: 0,
  total: 0,
  currentLabel: '',
}

const PRELOAD_STATE_THROTTLE_MS = 150

function formatPreloadError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getPathFileStem(path: string) {
  const normalizedPath = path.trim().replaceAll('\\', '/')
  const fileName = normalizedPath.split('/').pop() ?? ''
  return fileName.replace(/\.[^.]+$/u, '')
}

function getWorldAtlasCacheKey(rootPath: string, locale: LocaleCode, assets: MapAssetSummary[], worldRootName: string) {
  const signature = assets
    .filter((asset) => asset.format === 'xnb')
    .map((asset) => `${asset.absolutePath.replaceAll('/', '\\')}:${asset.sizeBytes}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|')

  return `${rootPath.replaceAll('/', '\\')}::${locale}::${worldRootName}::${signature}`
}

function normalizeLoadedMapDocument(
  parsedDocument: MapDocument,
  asset: {
    name: string
    absolutePath: string
    relativePath: string
  },
) {
  const fallbackName = asset.name.trim() || getPathFileStem(asset.relativePath) || getMapDocumentDisplayTitle(parsedDocument)
  const nextName = fallbackName || getMapDocumentDisplayTitle(parsedDocument)
  const nextRelativePath = asset.relativePath.trim() || parsedDocument.relativePath
  const nextSourcePath = asset.absolutePath.trim() || parsedDocument.sourcePath

  if (
    parsedDocument.name === nextName &&
    parsedDocument.relativePath === nextRelativePath &&
    parsedDocument.sourcePath === nextSourcePath
  ) {
    return parsedDocument
  }

  return {
    ...parsedDocument,
    name: nextName,
    relativePath: nextRelativePath,
    sourcePath: nextSourcePath,
  }
}

function formatPreloadLabel(rootPath: string, assetPath: string) {
  const normalizedRoot = rootPath.trim().replaceAll('/', '\\').replace(/\\+$/u, '')
  const normalizedAssetPath = assetPath.trim().replaceAll('/', '\\')

  if (!normalizedRoot) {
    return normalizedAssetPath
  }

  const rootWithSeparator = `${normalizedRoot}\\`
  if (normalizedAssetPath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
    return normalizedAssetPath.slice(rootWithSeparator.length)
  }

  return normalizedAssetPath
}

function cloneMapDocumentCache(cache: Map<string, MapDocument>) {
  return new Map(cache)
}

function waitForIdlePreloadTurn(isCancelled: () => boolean) {
  return new Promise<void>((resolve) => {
    if (isCancelled()) {
      resolve()
      return
    }

    if (typeof window === 'undefined' || typeof window.requestIdleCallback !== 'function') {
      setTimeout(resolve, 0)
      return
    }

    window.requestIdleCallback(() => resolve(), { timeout: 250 })
  })
}

export function useMapWorkspace({
  copy,
  locale,
  desktopHost,
  active,
  directoryInfo,
  onDirectoryInvalid,
  getWorldAtlasViewLabel,
}: UseMapWorkspaceOptions) {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({ tone: 'idle', message: '' })
  const [resourcePreloadState, setResourcePreloadState] = useState<ResourcePreloadState>(EMPTY_RESOURCE_PRELOAD_STATE)
  const [mapAssets, setMapAssets] = useState<MapAssetSummary[]>([])
  const [mapTabs, setMapTabs] = useState<MapWorkspaceTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>(WORLD_ATLAS_TAB_ID)
  const activeTabIdRef = useRef(activeTabId)
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [worldAtlasViews, setWorldAtlasViews] = useState<WorldAtlasView[]>([])
  const [activeWorldAtlasViewId, setActiveWorldAtlasViewId] = useState<WorldAtlasView['id'] | null>(null)
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [visibleLayerIds, setVisibleLayerIds] = useState<number[]>([])
  const [visibleObjectGroupIds, setVisibleObjectGroupIds] = useState<number[]>([])
  const [focusedObjectTarget, setFocusedObjectTarget] = useState<FocusedMapObjectTarget | null>(null)
  const [showGameWorldAdditions, setShowGameWorldAdditions] = useState(false)
  const [buildingDataState, setBuildingDataState] = useState<{
    rootPath: string
    index: Record<string, StageBuildingDataEntry>
  }>({ rootPath: '', index: {} })
  const [worldOverlayTextureAssets, setWorldOverlayTextureAssets] = useState<Record<string, EffectAssetState>>({})
  const [assetFilter, setAssetFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const [activeModMapSelectionId, setActiveModMapSelectionId] = useState<string | null>(null)
  const parsedMapCacheRef = useRef(new Map<string, MapDocument>())
  const worldAtlasCacheRef = useRef(new Map<string, WorldAtlasCacheEntry>())
  const idleResourcePreloadCancelRef = useRef<() => void>(() => {})
  const loadedResourceLocaleRef = useRef<LocaleCode | null>(null)
  const [parsedMapCacheSnapshot, setParsedMapCacheSnapshot] = useState(() => new Map<string, MapDocument>())
  const { modIndex } = useModAssetIndex(directoryInfo)
  const buildingDataIndex = useMemo(
    () => (buildingDataState.rootPath === (directoryInfo?.rootPath ?? '') ? buildingDataState.index : {}),
    [buildingDataState.index, buildingDataState.rootPath, directoryInfo?.rootPath],
  )

  const deferredAssetFilter = useDeferredValue(assetFilter.trim().toLowerCase())
  const filteredAssets = useMemo(
    () =>
      mapAssets.filter((asset) => {
        if (!deferredAssetFilter) {
          return true
        }

        const haystack = `${asset.name} ${asset.fileName} ${asset.relativePath}`.toLowerCase()
        return haystack.includes(deferredAssetFilter)
      }),
    [deferredAssetFilter, mapAssets],
  )
  const mapLookup = useMemo(() => buildModEntryLookup(mapAssets, (asset) => asset.id), [mapAssets])
  const modMapGroups = useMemo(
    () =>
      buildModBrowserGroups({
        mods: modIndex.mods,
        selectReferences: (group) => group.maps,
        entryLookup: mapLookup,
        filterText: assetFilter,
        getSearchText: (asset) => `${asset.name} ${asset.fileName} ${asset.relativePath}`.toLowerCase(),
        getFallbackLabel: (asset) => asset.name,
      }),
    [assetFilter, mapLookup, modIndex.mods],
  )
  const activeMapModSources = useMemo(
    () =>
      findModSources({
        mods: modIndex.mods,
        selectReferences: (group) => group.maps,
        key: activeMapId,
      }),
    [activeMapId, modIndex.mods],
  )
  const activeModMapEntry = useMemo(
    () => findModBrowserEntry(modMapGroups, activeModMapSelectionId),
    [activeModMapSelectionId, modMapGroups],
  )
  const activeAtlasView =
    (activeWorldAtlasViewId ? worldAtlasViews.find((view) => view.id === activeWorldAtlasViewId) : null) ?? worldAtlasViews[0] ?? null
  const activeAsset = mapAssets.find((asset) => asset.id === activeMapId) ?? null
  const worldAtlasDocument = activeAtlasView?.document ?? null
  const workspaceTabs = useMemo(() => buildMapWorkspaceTabs(worldAtlasDocument, mapTabs), [worldAtlasDocument, mapTabs])
  const worldOverlaySprites = useMemo(() => {
    if (!showGameWorldAdditions || !mapDocument) {
      return []
    }

    if (mapDocument.format === 'atlas') {
      return buildAtlasWorldOverlaySprites(mapDocument, (sourcePath) => parsedMapCacheSnapshot.get(sourcePath) ?? null, buildingDataIndex)
    }

    return buildStageWorldOverlaySprites(mapDocument, buildingDataIndex)
  }, [buildingDataIndex, mapDocument, parsedMapCacheSnapshot, showGameWorldAdditions])

  function applyMapDocument(nextDocument: MapDocument | null, nextMapId: string | null) {
    setActiveMapId(nextMapId)
    startTransition(() => {
      setMapDocument(nextDocument)
      setVisibleLayerIds(nextDocument ? getDefaultVisibleLayerIds(nextDocument) : [])
      setVisibleObjectGroupIds(nextDocument ? getDefaultVisibleObjectGroupIds(nextDocument) : [])
      setFocusedObjectTarget(null)
      setHoverInfo(null)
    })
  }

  function selectActiveTab(tabId: string) {
    activeTabIdRef.current = tabId
    setActiveTabId(tabId)
  }

  function resetLoadedMaps() {
    idleResourcePreloadCancelRef.current()
    idleResourcePreloadCancelRef.current = () => {}
    parsedMapCacheRef.current.clear()
    setParsedMapCacheSnapshot(new Map())
    worldAtlasCacheRef.current.clear()
    loadedResourceLocaleRef.current = null
    setMapAssets([])
    setMapTabs([])
    selectActiveTab(WORLD_ATLAS_TAB_ID)
    setWorldAtlasViews([])
    setActiveWorldAtlasViewId(null)
    setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
    applyMapDocument(null, null)
  }

  useEffect(() => {
    if (!active) {
      idleResourcePreloadCancelRef.current()
      idleResourcePreloadCancelRef.current = () => {}
      return
    }
  }, [active])

  useEffect(() => {
    if (!active) {
      return
    }

    if (!directoryInfo?.rootPath) {
      return scheduleDeferred(resetLoadedMaps)
    }

    if (loadedResourceLocaleRef.current === locale && mapAssets.length > 0) {
      return
    }

    let cancelled = false
    void loadGameDirectoryInBackground(directoryInfo, () => cancelled)

    return () => {
      cancelled = true
      idleResourcePreloadCancelRef.current()
      idleResourcePreloadCancelRef.current = () => {}
    }
  }, [active, directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!active) {
      return
    }

    if (!directoryInfo?.rootPath) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const buildingsDataAsset = await loadTextAsset(directoryInfo.rootPath, 'Content\\Data\\Buildings.xnb', locale)
        if (!cancelled) {
          setBuildingDataState({
            rootPath: directoryInfo.rootPath,
            index: buildBuildingDataIndex(buildingsDataAsset.content),
          })
        }
      } catch {
        if (!cancelled) {
          setBuildingDataState({ rootPath: directoryInfo.rootPath, index: {} })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, directoryInfo?.rootPath, locale])

  function publishParsedMapCacheSnapshot() {
    setParsedMapCacheSnapshot(cloneMapDocumentCache(parsedMapCacheRef.current))
  }

  async function loadParsedMap(summary: MapAssetSummary, info: GameDirectoryInfo, options?: { publishCacheSnapshot?: boolean }) {
    const cachedDocument = parsedMapCacheRef.current.get(summary.absolutePath)
    if (cachedDocument) {
      return cachedDocument
    }

    const asset = await loadMapAsset(info.rootPath, summary.absolutePath, locale)
    if (asset.format !== 'xnb') {
      throw new Error(copy.messages.onlyTmxSupported)
    }

    const parsedDocument = normalizeLoadedMapDocument(JSON.parse(asset.content) as MapDocument, {
      name: asset.name,
      absolutePath: asset.absolutePath,
      relativePath: asset.relativePath,
    })
    parsedMapCacheRef.current.set(summary.absolutePath, parsedDocument)
    if (options?.publishCacheSnapshot !== false) {
      publishParsedMapCacheSnapshot()
    }
    return parsedDocument
  }

  async function preloadResources(assets: MapAssetSummary[], info: GameDirectoryInfo, isCancelled = () => false) {
    const xnbAssets = assets.filter((asset) => asset.format === 'xnb')
    let completed = 0
    let total = xnbAssets.length + 1
    let lastPublishedAt = 0

    function updatePreloadState(message: string, currentLabel = '', force = false) {
      if (isCancelled()) {
        return
      }

      const now = Date.now()
      if (!force && now - lastPublishedAt < PRELOAD_STATE_THROTTLE_MS) {
        return
      }
      lastPublishedAt = now
      setResourcePreloadState({
        active: true,
        message,
        completed,
        total,
        currentLabel,
      })
    }

    updatePreloadState(copy.messages.preloadingWorldData, 'Content\\Data\\WorldMap.xnb', true)
    try {
      await loadTextAsset(info.rootPath, 'Content\\Data\\WorldMap.xnb', locale)
    } catch {
      // WorldMap is optional; atlas construction already has its own fallback path.
    }
    if (isCancelled()) {
      return
    }
    completed += 1
    updatePreloadState(copy.messages.preloadingMaps, '', true)

    const tilesetImagePaths = new Set<string>()
    for (const asset of xnbAssets) {
      if (isCancelled()) {
        return
      }
      await waitForIdlePreloadTurn(isCancelled)
      if (isCancelled()) {
        return
      }
      updatePreloadState(copy.messages.preloadingMaps, asset.relativePath)
      try {
        const document = await loadParsedMap(asset, info, { publishCacheSnapshot: false })
        for (const tileset of document.tilesets) {
          const resolvedPath = resolveTilesetImagePath(document, tileset)
          if (resolvedPath) {
            tilesetImagePaths.add(resolvedPath)
          }
        }
      } catch (error) {
        console.warn(`[resource-preload] skipped map preload for ${asset.absolutePath}: ${formatPreloadError(error)}`)
      }
      completed += 1
      updatePreloadState(copy.messages.preloadingMaps, asset.relativePath)
    }
    if (!isCancelled()) {
      publishParsedMapCacheSnapshot()
    }

    const imagePaths = Array.from(tilesetImagePaths)
    total += imagePaths.length
    updatePreloadState(copy.messages.preloadingTilesets, '', true)

    for (const imagePath of imagePaths) {
      if (isCancelled()) {
        return
      }
      await waitForIdlePreloadTurn(isCancelled)
      if (isCancelled()) {
        return
      }
      updatePreloadState(copy.messages.preloadingTilesets, formatPreloadLabel(info.rootPath, imagePath))
      try {
        await loadImageDataUrl(imagePath, locale)
      } catch (error) {
        console.warn(`[resource-preload] skipped image preload for ${imagePath}: ${formatPreloadError(error)}`)
      }
      completed += 1
      updatePreloadState(copy.messages.preloadingTilesets, formatPreloadLabel(info.rootPath, imagePath))
    }

    setResourcePreloadState({
      active: true,
      message: copy.messages.loadingMap,
      completed,
      total,
      currentLabel: '',
    })
  }

  function startIdleResourcePreload(assets: MapAssetSummary[], info: GameDirectoryInfo, isCancelled = () => false) {
    let cancelled = false

    void (async () => {
      await waitForIdlePreloadTurn(() => cancelled || isCancelled())
      if (cancelled || isCancelled()) {
        return
      }
      await preloadResources(assets, info, () => cancelled || isCancelled())
      if (!cancelled && !isCancelled() && activeTabIdRef.current === WORLD_ATLAS_TAB_ID) {
        await openWorldAtlasRef.current(assets, info, WORLD_ROOT_MAP_NAME, { preserveActiveTab: true })
      }
      if (!cancelled && !isCancelled()) {
        setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
      }
    })()

    return () => {
      cancelled = true
    }
  }

  async function loadGameDirectoryInBackground(info: GameDirectoryInfo, isCancelled = () => false) {
    setResourcePreloadState({
      active: true,
      message: copy.messages.validatingAndScanning,
      completed: 0,
      total: 0,
      currentLabel: info.rootPath,
    })
    setWorkspaceStatus({ tone: 'working', message: copy.messages.validatingAndScanning })

    try {
      const assets = await scanMaps(info.rootPath, locale)
      if (isCancelled()) {
        return null
      }

      setMapAssets(assets)
      loadedResourceLocaleRef.current = locale

      await openWorldAtlas(assets, info, WORLD_ROOT_MAP_NAME, { initialOnly: true })
      if (!isCancelled()) {
        idleResourcePreloadCancelRef.current()
        idleResourcePreloadCancelRef.current = startIdleResourcePreload(assets, info, isCancelled)
      }
      return info
    } catch (error) {
      if (!isCancelled()) {
        setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
        resetLoadedMaps()
        const message = `${copy.messages.resourcePreloadFailed} ${error instanceof Error ? error.message : String(error)}`
        setWorkspaceStatus({
          tone: 'error',
          message,
        })
        onDirectoryInvalid?.(message)
      }
      return null
    }
  }

  function findMapAssetByName(mapName: string) {
    const normalizedAliases = new Set(getWorldAtlasNameAliases(mapName))
    return (
      mapAssets.find(
        (asset) => asset.format === 'xnb' && getWorldAtlasNameAliases(asset.name).some((alias) => normalizedAliases.has(alias)),
      ) ?? null
    )
  }

  function findWorldAtlasViewByMapName(mapName: string) {
    return (
      worldAtlasViews.find((view) =>
        view.document.atlas?.placements.some((placement: MapAtlasPlacement) => matchesWorldAtlasMapName(placement.mapName, mapName)),
      ) ?? null
    )
  }

  async function openMap(
    summary: MapAssetSummary,
    knownDirectoryInfo?: GameDirectoryInfo | null,
    knownMapCount = mapAssets.length,
    options?: OpenMapOptions,
  ) {
    const info = knownDirectoryInfo ?? directoryInfo
    if (!info) {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.enterFolderBeforeScanning })
      return
    }

    if (summary.format !== 'xnb') {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.onlyTmxSupported })
      return
    }

    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    try {
      const forceReload = options?.forceReload === true
      const existingTab = mapTabs.find((tab) => tab.assetId === summary.id)
      if (existingTab && !forceReload) {
        selectActiveTab(existingTab.id)
        applyMapDocument(existingTab.document, summary.id)
        setWorkspaceStatus({
          tone: 'ready',
          message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, existingTab.document.format, existingTab.document.name),
        })
        return
      }

      const parsedDocument = await loadParsedMap(summary, info)
      const reusablePreviewTab = existingTab ?? mapTabs.find((tab) => tab.preview && !tab.dirty) ?? null
      const nextTab = {
        id: reusablePreviewTab?.id ?? MAP_PREVIEW_TAB_ID,
        assetId: summary.id,
        document: parsedDocument,
        preview: true,
        dirty: false,
      }

      setMapTabs((current) => {
        const reusableTabId = reusablePreviewTab?.id
        if (!reusableTabId) {
          return [...current, nextTab]
        }

        return current.map((tab) => (tab.id === reusableTabId ? nextTab : tab))
      })
      selectActiveTab(nextTab.id)
      applyMapDocument(parsedDocument, summary.id)

      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, parsedDocument.format, parsedDocument.name),
      })
    } catch (error) {
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.loadingMapFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async function openModMapEntry(
    entry: ModBrowserEntry<MapAssetSummary>,
    knownDirectoryInfo?: GameDirectoryInfo | null,
    knownMapCount = mapAssets.length,
    options?: OpenMapOptions,
  ) {
    const info = knownDirectoryInfo ?? directoryInfo
    if (!info) {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.enterFolderBeforeScanning })
      return
    }

    const summary = entry.value
    if (summary.format !== 'xnb') {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.onlyTmxSupported })
      return
    }

    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })
    setActiveModMapSelectionId(entry.selectionId)

    try {
      const forceReload = options?.forceReload === true
      const tabId = getMapWorkspaceTabId(entry.selectionId)
      const existingTab = mapTabs.find((tab) => tab.id === tabId)
      if (existingTab && !forceReload) {
        selectActiveTab(existingTab.id)
        applyMapDocument(existingTab.document, summary.id)
        setWorkspaceStatus({
          tone: 'ready',
          message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, existingTab.document.format, existingTab.document.name),
        })
        return
      }

      const preferredTarget = summary.relativePath
        .replace(/^Content[\\/]/iu, '')
        .replace(/\\/g, '/')
        .replace(/\.xnb$/iu, '')
      const parsedDocument =
        (await loadModResultMapDocument({
          rootPath: info.rootPath,
          entry,
          preferredTargets: [preferredTarget],
          fallbackName: summary.name,
          fallbackRelativePath: summary.relativePath,
          fallbackSourcePath: summary.absolutePath,
        })) ?? (await loadParsedMap(summary, info))
      const reusablePreviewTab = existingTab ?? mapTabs.find((tab) => tab.preview && !tab.dirty) ?? null
      const nextTab = {
        id: reusablePreviewTab?.id ?? tabId,
        assetId: summary.id,
        document: parsedDocument,
        preview: true,
        dirty: false,
      }

      setMapTabs((current) => {
        const reusableTabId = reusablePreviewTab?.id
        if (!reusableTabId) {
          return [...current, nextTab]
        }

        return current.map((tab) => (tab.id === reusableTabId ? nextTab : tab))
      })
      selectActiveTab(nextTab.id)
      applyMapDocument(parsedDocument, summary.id)
      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, parsedDocument.format, parsedDocument.name),
      })
    } catch (error) {
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.loadingMapFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async function openWorldAtlas(
    assets: MapAssetSummary[],
    info: GameDirectoryInfo,
    worldRootName = WORLD_ROOT_MAP_NAME,
    options?: OpenWorldAtlasOptions,
  ) {
    const atlasCacheKey = getWorldAtlasCacheKey(info.rootPath, locale, assets, worldRootName)
    const preserveActiveTab = options?.preserveActiveTab === true

    if (!preserveActiveTab) {
      setMapTabs((current) => current.filter((tab) => tab.dirty))
      selectActiveTab(WORLD_ATLAS_TAB_ID)
      setWorldAtlasViews([])
      setActiveWorldAtlasViewId(null)
      applyMapDocument(null, null)
      setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })
    }

    const cachedAtlas = worldAtlasCacheRef.current.get(atlasCacheKey)
    if (cachedAtlas) {
      for (const document of cachedAtlas.sourceDocuments) {
        parsedMapCacheRef.current.set(document.sourcePath, document)
      }
      setParsedMapCacheSnapshot(cloneMapDocumentCache(parsedMapCacheRef.current))

      const nextWorldAtlasView = cachedAtlas.views[0]
      if (!nextWorldAtlasView) {
        return
      }

      setWorldAtlasViews(cachedAtlas.views)
      if (!preserveActiveTab || activeTabIdRef.current === WORLD_ATLAS_TAB_ID) {
        setActiveWorldAtlasViewId(nextWorldAtlasView.id)
        selectActiveTab(WORLD_ATLAS_TAB_ID)
        applyMapDocument(nextWorldAtlasView.document, null)
        setWorkspaceStatus({
          tone: 'ready',
          message: copy.messages.loadedMapAssetsWithActiveMap(
            assets.length,
            nextWorldAtlasView.document.format,
            nextWorldAtlasView.document.name,
          ),
        })
      }
      return
    }

    let worldMapLayout
    try {
      const worldMapAsset = await loadTextAsset(info.rootPath, 'Content\\Data\\WorldMap.xnb', locale)
      worldMapLayout = parseWorldMapLayout(worldMapAsset.content)
    } catch {
      worldMapLayout = undefined
    }

    const xnbAssetsByAlias = new Map<string, MapAssetSummary>()
    for (const asset of assets.filter((candidate) => candidate.format === 'xnb')) {
      for (const alias of getWorldAtlasNameAliases(asset.name)) {
        if (!xnbAssetsByAlias.has(alias)) {
          xnbAssetsByAlias.set(alias, asset)
        }
      }
    }
    const pendingNames = options?.initialOnly
      ? getInitialWorldAtlasSeedNames(worldRootName, worldMapLayout)
      : Array.from(new Set([worldRootName, ...getWorldAtlasSeedNames(), ...(worldMapLayout ? Object.keys(worldMapLayout) : [])]))
    const loadedDocuments = new Map<string, MapDocument>()
    const resolvedNames = new Set<string>()

    while (pendingNames.length) {
      const currentName = pendingNames.shift()
      if (!currentName) {
        continue
      }

      const normalizedName = currentName.trim().toLowerCase()
      if (resolvedNames.has(normalizedName)) {
        continue
      }

      const summary = xnbAssetsByAlias.get(normalizedName)
      if (!summary) {
        resolvedNames.add(normalizedName)
        continue
      }

      const summaryName = summary.name.trim().toLowerCase()
      let document = loadedDocuments.get(summaryName)
      if (!document) {
        document = await loadParsedMap(summary, info)
        loadedDocuments.set(summaryName, document)
      }

      for (const alias of getWorldAtlasNameAliases(summary.name)) {
        resolvedNames.add(alias)
      }

      if (!options?.initialOnly) {
        for (const targetName of getExteriorWarpTargetNames(document)) {
          const normalizedTargetName = targetName.trim().toLowerCase()
          if (!resolvedNames.has(normalizedTargetName) && xnbAssetsByAlias.has(normalizedTargetName)) {
            pendingNames.push(targetName)
          }
        }
      }
    }

    const sourceDocuments = Array.from(loadedDocuments.values())
    const mainDocuments = sourceDocuments.filter((document) => !isRemoteWorldAtlasDocument(document))
    const remoteDocuments = sourceDocuments.filter((document) => isRemoteWorldAtlasDocument(document))
    const nextWorldAtlasViews: WorldAtlasView[] = []

    const mainRootMapName = pickWorldAtlasRootMapName(mainDocuments, [worldRootName, 'Forest', 'Mountain'])
    if (mainRootMapName) {
      const mainAtlasDocument = buildWorldAtlas(mainDocuments, mainRootMapName, worldMapLayout)
      if (mainAtlasDocument) {
        const label = getWorldAtlasViewLabel(locale, 'main')
        nextWorldAtlasViews.push({
          id: 'main',
          label,
          document: withWorldAtlasViewMetadata(mainAtlasDocument, 'main', label),
        })
      }
    }

    const remoteRootMapName = pickWorldAtlasRootMapName(remoteDocuments, REMOTE_WORLD_ROOT_CANDIDATES)
    if (remoteRootMapName) {
      const remoteAtlasDocument = buildWorldAtlas(remoteDocuments, remoteRootMapName, worldMapLayout)
      if (remoteAtlasDocument) {
        const label = getWorldAtlasViewLabel(locale, 'remote')
        nextWorldAtlasViews.push({
          id: 'remote',
          label,
          document: withWorldAtlasViewMetadata(remoteAtlasDocument, 'remote', label),
        })
      }
    }

    if (!nextWorldAtlasViews.length) {
      const preferredScene = getPreferredScene(assets)
      if (preferredScene && !preserveActiveTab) {
        await openMap(preferredScene, info, assets.length)
        return
      }

      if (!preserveActiveTab || activeTabIdRef.current === WORLD_ATLAS_TAB_ID) {
        setWorkspaceStatus({
          tone: 'ready',
          message: copy.messages.loadedMapAssets(assets.length, 'xnb'),
        })
      }
      return
    }

    const nextWorldAtlasView = nextWorldAtlasViews[0]
    if (!options?.initialOnly) {
      worldAtlasCacheRef.current.set(atlasCacheKey, {
        views: nextWorldAtlasViews,
        sourceDocuments,
      })
    }
    setWorldAtlasViews(nextWorldAtlasViews)
    if (!preserveActiveTab || activeTabIdRef.current === WORLD_ATLAS_TAB_ID) {
      setActiveWorldAtlasViewId(nextWorldAtlasView.id)
      selectActiveTab(WORLD_ATLAS_TAB_ID)
      applyMapDocument(nextWorldAtlasView.document, null)
      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssetsWithActiveMap(
          assets.length,
          nextWorldAtlasView.document.format,
          nextWorldAtlasView.document.name,
        ),
      })
    }
  }

  function handleSelectWorldAtlasView(viewId: WorldAtlasView['id']) {
    const nextWorldAtlasView = worldAtlasViews.find((view) => view.id === viewId)
    if (!nextWorldAtlasView) {
      return
    }

    setActiveWorldAtlasViewId(viewId)
    selectActiveTab(WORLD_ATLAS_TAB_ID)
    applyMapDocument(nextWorldAtlasView.document, null)
    setWorkspaceStatus({
      tone: 'ready',
      message: copy.messages.loadedMapAssetsWithActiveMap(
        mapAssets.length,
        nextWorldAtlasView.document.format,
        nextWorldAtlasView.document.name,
      ),
    })
  }

  function handleSelectWorkspaceTab(tabId: string) {
    if (tabId === WORLD_ATLAS_TAB_ID) {
      selectActiveTab(WORLD_ATLAS_TAB_ID)
      applyMapDocument(worldAtlasDocument, null)
      if (directoryInfo && mapAssets.length) {
        const atlasCacheKey = getWorldAtlasCacheKey(directoryInfo.rootPath, locale, mapAssets, WORLD_ROOT_MAP_NAME)
        if (!worldAtlasCacheRef.current.has(atlasCacheKey)) {
          void openWorldAtlas(mapAssets, directoryInfo)
        }
      }
      return
    }

    const nextTab = mapTabs.find((tab) => tab.id === tabId)
    if (!nextTab) {
      return
    }

    selectActiveTab(nextTab.id)
    applyMapDocument(nextTab.document, nextTab.assetId)
  }

  function handleCloseWorkspaceTab(tabId: string) {
    if (tabId === WORLD_ATLAS_TAB_ID) {
      return
    }

    const index = mapTabs.findIndex((tab) => tab.id === tabId)
    if (index === -1) {
      return
    }

    const nextTabs = mapTabs.filter((tab) => tab.id !== tabId)
    setMapTabs(nextTabs)

    if (activeTabId !== tabId) {
      return
    }

    const fallbackTab = nextTabs[index] ?? nextTabs[index - 1] ?? null
    if (fallbackTab) {
      selectActiveTab(fallbackTab.id)
      applyMapDocument(fallbackTab.document, fallbackTab.assetId)
      return
    }

    selectActiveTab(WORLD_ATLAS_TAB_ID)
    applyMapDocument(worldAtlasDocument, null)
  }

  function handleReorderWorkspaceTabs(sourceTabId: string, targetTabId: string) {
    if (sourceTabId === targetTabId || sourceTabId === WORLD_ATLAS_TAB_ID || targetTabId === WORLD_ATLAS_TAB_ID) {
      return
    }

    setMapTabs((current) => {
      const sourceIndex = current.findIndex((tab) => tab.id === sourceTabId)
      const targetIndex = current.findIndex((tab) => tab.id === targetTabId)

      if (sourceIndex === -1 || targetIndex === -1) {
        return current
      }

      const nextTabs = [...current]
      const [movedTab] = nextTabs.splice(sourceIndex, 1)
      nextTabs.splice(targetIndex, 0, movedTab)
      return nextTabs
    })
  }

  function handleOpenAtlasTarget(targetMapName: string) {
    const atlasView = findWorldAtlasViewByMapName(targetMapName)
    if (atlasView) {
      handleSelectWorldAtlasView(atlasView.id)
      return
    }

    const targetAsset = findMapAssetByName(targetMapName)
    if (targetAsset) {
      void openMap(targetAsset)
      return
    }

    setWorkspaceStatus({
      tone: 'error',
      message: `${copy.messages.loadingMapFailed} Missing map asset "${targetMapName}".`,
    })
  }

  const preloadResourcesRef = useRef(preloadResources)
  const openWorldAtlasRef = useRef(openWorldAtlas)
  const openMapRef = useRef(openMap)
  const openModMapRef = useRef(openModMapEntry)
  const startIdleResourcePreloadRef = useRef(startIdleResourcePreload)

  useEffect(() => {
    preloadResourcesRef.current = preloadResources
    openWorldAtlasRef.current = openWorldAtlas
    openMapRef.current = openMap
    openModMapRef.current = openModMapEntry
    startIdleResourcePreloadRef.current = startIdleResourcePreload
  })

  useEffect(() => {
    if (!active) {
      return
    }

    if (!directoryInfo?.rootPath || !mapAssets.length) {
      return
    }
    const info = directoryInfo

    if (loadedResourceLocaleRef.current === null || loadedResourceLocaleRef.current === locale) {
      return
    }

    let cancelled = false
    const previousLoadedLocale = loadedResourceLocaleRef.current
    loadedResourceLocaleRef.current = locale

    async function reloadLocalizedResources() {
      setResourcePreloadState({
        active: true,
        message: copy.messages.preloadingResources,
        completed: 0,
        total: 0,
        currentLabel: '',
      })
      setWorkspaceStatus({ tone: 'working', message: copy.messages.preloadingResources })

      try {
        const assets = await scanMaps(info.rootPath, locale)
        if (cancelled) {
          return
        }

        setMapAssets(assets)
        parsedMapCacheRef.current.clear()
        setParsedMapCacheSnapshot(new Map())
        worldAtlasCacheRef.current.clear()
        const nextAsset =
          assets.find((asset) => asset.id === activeMapId) ?? assets.find((asset) => asset.name === mapDocument?.name) ?? assets[0] ?? null

        if (activeTabId === WORLD_ATLAS_TAB_ID || worldAtlasViews.length) {
          await openWorldAtlasRef.current(assets, info)
          if (cancelled) {
            return
          }
        }

        if (activeTabId !== WORLD_ATLAS_TAB_ID && nextAsset) {
          await openMapRef.current(nextAsset, info, assets.length, { forceReload: true })
        }

        if (!cancelled) {
          idleResourcePreloadCancelRef.current()
          idleResourcePreloadCancelRef.current = startIdleResourcePreloadRef.current(assets, info, () => cancelled)
        }
      } catch (error) {
        if (!cancelled) {
          loadedResourceLocaleRef.current = previousLoadedLocale
          setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
          setWorkspaceStatus({
            tone: 'error',
            message: `${copy.messages.resourcePreloadFailed} ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    }

    void reloadLocalizedResources()

    return () => {
      cancelled = true
      idleResourcePreloadCancelRef.current()
      idleResourcePreloadCancelRef.current = () => {}
    }
  }, [
    activeMapId,
    activeTabId,
    copy.messages.preloadingResources,
    copy.messages.resourcePreloadFailed,
    directoryInfo,
    locale,
    mapAssets.length,
    mapDocument?.name,
    worldAtlasViews.length,
    active,
  ])

  const visibleResourcePreloadState = active ? resourcePreloadState : EMPTY_RESOURCE_PRELOAD_STATE

  useEffect(() => {
    activeTabIdRef.current = activeTabId
  }, [activeTabId])

  function toggleLayer(id: number) {
    setVisibleLayerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function toggleObjectGroup(id: number) {
    setVisibleObjectGroupIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function setAllLayers(visible: boolean) {
    setVisibleLayerIds(visible && mapDocument ? mapDocument.layers.map((layer) => layer.id) : [])
  }

  function setAllObjectGroups(visible: boolean) {
    setVisibleObjectGroupIds(visible && mapDocument ? mapDocument.objectGroups.map((group) => group.id) : [])
  }

  function focusObject(groupId: number, objectId: number) {
    setVisibleObjectGroupIds((current) => (current.includes(groupId) ? current : [...current, groupId]))
    setFocusedObjectTarget((current) => ({
      groupId,
      objectId,
      nonce: (current?.nonce ?? 0) + 1,
    }))
  }

  const worldOverlayTextureRequests = useMemo(
    () => Array.from(new Set(worldOverlaySprites.map((sprite) => sprite.textureName))),
    [worldOverlaySprites],
  )

  const currentWorldOverlayTextureAssets = useMemo(
    () =>
      Object.fromEntries(
        worldOverlayTextureRequests.flatMap((textureName) => {
          const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
          const asset = worldOverlayTextureAssets[textureName]
          return asset?.requestKey === requestKey ? [[textureName, asset] as const] : []
        }),
      ),
    [directoryInfo?.rootPath, worldOverlayTextureAssets, worldOverlayTextureRequests],
  )

  const pendingWorldOverlayTextureRequests = useMemo(
    () =>
      worldOverlayTextureRequests.filter((textureName) => {
        const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
        return currentWorldOverlayTextureAssets[textureName]?.requestKey !== requestKey
      }),
    [currentWorldOverlayTextureAssets, directoryInfo?.rootPath, worldOverlayTextureRequests],
  )

  useEffect(() => {
    if (!active) {
      return
    }

    if (!directoryInfo?.rootPath || pendingWorldOverlayTextureRequests.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingWorldOverlayTextureRequests.map(
          async (textureName) => [textureName, await resolveEffectAsset(textureName, directoryInfo.rootPath)] as const,
        ),
      )
      if (cancelled) {
        return
      }

      setWorldOverlayTextureAssets((current) => ({
        ...current,
        ...Object.fromEntries(resolvedEntries),
      }))
    })()

    return () => {
      cancelled = true
    }
  }, [active, directoryInfo?.rootPath, pendingWorldOverlayTextureRequests])

  useEffect(() => {
    if (!active) {
      return
    }

    if (browserSourceMode !== 'mod') {
      return
    }

    const nextEntry =
      activeModMapEntry ??
      modMapGroups.flatMap((group) => group.items).find((item) => item.value.id === activeMapId) ??
      modMapGroups[0]?.items[0] ??
      null

    if (!nextEntry) {
      return
    }

    if (nextEntry.selectionId !== activeModMapSelectionId || nextEntry.value.id !== activeMapId) {
      void openModMapRef.current(nextEntry)
    }
  }, [active, activeMapId, activeModMapEntry, activeModMapSelectionId, browserSourceMode, modMapGroups])

  function handleSetBrowserSourceMode(mode: BrowserSourceMode) {
    setBrowserSourceMode(mode)
    if (mode !== 'mod') {
      setActiveModMapSelectionId(null)
    }
  }

  function handleOpenModMapAsset(entry: ModBrowserEntry<MapAssetSummary>) {
    void openModMapEntry(entry)
  }

  return {
    workspaceStatus: desktopHost ? workspaceStatus : ({ tone: 'idle', message: copy.messages.browserHostPrompt } satisfies WorkspaceStatus),
    resourcePreloadState: visibleResourcePreloadState,
    directoryInfo,
    mapAssets,
    filteredAssets,
    browserSourceMode,
    setBrowserSourceMode: handleSetBrowserSourceMode,
    modMapGroups,
    activeModMapSelectionId,
    activeMapModSources,
    activeMapId,
    activeAsset,
    assetFilter,
    setAssetFilter,
    mapDocument,
    worldAtlasViews,
    activeWorldAtlasViewId,
    workspaceTabs,
    activeTabId,
    hoverInfo,
    setHoverInfo,
    visibleLayerIds,
    visibleObjectGroupIds,
    focusedObjectTarget,
    showGameWorldAdditions,
    setShowGameWorldAdditions,
    worldOverlaySprites,
    worldOverlayTextureAssets: currentWorldOverlayTextureAssets,
    worldAtlasDocument,
    openMap,
    handleOpenModMapAsset,
    handleSelectWorldAtlasView,
    handleSelectWorkspaceTab,
    handleCloseWorkspaceTab,
    handleReorderWorkspaceTabs,
    handleOpenAtlasTarget,
    toggleLayer,
    toggleObjectGroup,
    setAllLayers,
    setAllObjectGroups,
    focusObject,
  }
}
