import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { FocusedMapObjectTarget, TileHoverInfo } from '../../components/MapViewport'
import {
  canUseDesktopHost,
  chooseGameDirectory,
  detectDefaultGameDirectory,
  loadImageDataUrl,
  loadMapAsset,
  loadTextAsset,
  scanMaps,
  validateGameDirectory,
  type GameDirectoryInfo,
  type MapAssetSummary,
} from '../desktop'
import type { EditorCopy, LocaleCode, WorkspaceMode } from '../editor-shell'
import { resolveTilesetImagePath } from '../maps/assets'
import type { MapDocument } from '../maps/types'
import {
  buildWorldAtlas,
  getExteriorWarpTargetNames,
  getWorldAtlasNameAliases,
  getWorldAtlasSeedNames,
  parseWorldMapLayout,
} from '../maps/world'
import { MAP_PREVIEW_TAB_ID, REMOTE_WORLD_ROOT_CANDIDATES, WORLD_ATLAS_TAB_ID, WORLD_ROOT_MAP_NAME } from './constants'
import { resolveEffectAsset } from './eventStageAssets'
import type { EffectAssetState } from './eventStageShared'
import {
  buildWorkspaceTabs,
  getDefaultVisibleLayerIds,
  getMapDocumentDisplayTitle,
  getDefaultVisibleObjectGroupIds,
  getPreferredScene,
  isRemoteWorldAtlasDocument,
  matchesWorldAtlasMapName,
  pickWorldAtlasRootMapName,
  withWorldAtlasViewMetadata,
} from './mapWorkspace'
import {
  buildAtlasWorldOverlaySprites,
  buildBuildingDataIndex,
  buildStageWorldOverlaySprites,
  type StageBuildingDataEntry,
} from './mapWorldStatePreview'
import { buildModBrowserGroups, buildModEntryLookup, findModSources, useModAssetIndex, type BrowserSourceMode } from './modAssetIndex'
import type { MapWorkspaceTab, ResourcePreloadState, WorldAtlasView, WorkspaceStatus } from './types'

type UseMapWorkspaceOptions = {
  copy: EditorCopy
  locale: LocaleCode
  desktopHost: boolean
  setWorkspaceMode: (mode: WorkspaceMode) => void
  getWorldAtlasViewLabel: (locale: LocaleCode, viewId: WorldAtlasView['id']) => string
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

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0

  async function consumeNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => consumeNext()))
}

function formatPreloadError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getPathFileStem(path: string) {
  const normalizedPath = path.trim().replaceAll('\\', '/')
  const fileName = normalizedPath.split('/').pop() ?? ''
  return fileName.replace(/\.[^.]+$/u, '')
}

function getWorldAtlasCacheKey(
  rootPath: string,
  locale: LocaleCode,
  assets: MapAssetSummary[],
  worldRootName: string,
) {
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

export function useMapWorkspace({
  copy,
  locale,
  desktopHost,
  setWorkspaceMode,
  getWorldAtlasViewLabel,
}: UseMapWorkspaceOptions) {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({ tone: 'idle', message: '' })
  const [resourcePreloadState, setResourcePreloadState] = useState<ResourcePreloadState>(EMPTY_RESOURCE_PRELOAD_STATE)
  const [gameDirectory, setGameDirectory] = useState('')
  const [directoryInfo, setDirectoryInfo] = useState<GameDirectoryInfo | null>(null)
  const [mapAssets, setMapAssets] = useState<MapAssetSummary[]>([])
  const [mapTabs, setMapTabs] = useState<MapWorkspaceTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>(WORLD_ATLAS_TAB_ID)
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [worldAtlasViews, setWorldAtlasViews] = useState<WorldAtlasView[]>([])
  const [activeWorldAtlasViewId, setActiveWorldAtlasViewId] = useState<WorldAtlasView['id'] | null>(null)
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [visibleLayerIds, setVisibleLayerIds] = useState<number[]>([])
  const [visibleObjectGroupIds, setVisibleObjectGroupIds] = useState<number[]>([])
  const [focusedObjectTarget, setFocusedObjectTarget] = useState<FocusedMapObjectTarget | null>(null)
  const [showGameWorldAdditions, setShowGameWorldAdditions] = useState(false)
  const [buildingDataIndex, setBuildingDataIndex] = useState<Record<string, StageBuildingDataEntry>>({})
  const [worldOverlayTextureAssets, setWorldOverlayTextureAssets] = useState<Record<string, EffectAssetState>>({})
  const [assetFilter, setAssetFilter] = useState('')
  const [browserSourceMode, setBrowserSourceMode] = useState<BrowserSourceMode>('original')
  const parsedMapCacheRef = useRef(new Map<string, MapDocument>())
  const worldAtlasCacheRef = useRef(new Map<string, WorldAtlasCacheEntry>())
  const loadedResourceLocaleRef = useRef<LocaleCode | null>(null)
  const { modIndex } = useModAssetIndex(directoryInfo)

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
  const activeAtlasView =
    (activeWorldAtlasViewId ? worldAtlasViews.find((view) => view.id === activeWorldAtlasViewId) : null) ??
    worldAtlasViews[0] ??
    null
  const activeAsset = mapAssets.find((asset) => asset.id === activeMapId) ?? null
  const worldAtlasDocument = activeAtlasView?.document ?? null
  const workspaceTabs = useMemo(() => buildWorkspaceTabs(worldAtlasDocument, mapTabs), [worldAtlasDocument, mapTabs])
  const worldOverlaySprites = useMemo(
    () => {
      if (!showGameWorldAdditions || !mapDocument) {
        return []
      }

      if (mapDocument.format === 'atlas') {
        return buildAtlasWorldOverlaySprites(
          mapDocument,
          (sourcePath) => parsedMapCacheRef.current.get(sourcePath) ?? null,
          buildingDataIndex,
        )
      }

      return buildStageWorldOverlaySprites(mapDocument, buildingDataIndex)
    },
    [buildingDataIndex, mapDocument, showGameWorldAdditions],
  )

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

  function resetLoadedMaps() {
    parsedMapCacheRef.current.clear()
    worldAtlasCacheRef.current.clear()
    loadedResourceLocaleRef.current = null
    setMapAssets([])
    setMapTabs([])
    setActiveTabId(WORLD_ATLAS_TAB_ID)
    setWorldAtlasViews([])
    setActiveWorldAtlasViewId(null)
    setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
    applyMapDocument(null, null)
  }

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      setBuildingDataIndex({})
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const buildingsDataAsset = await loadTextAsset(directoryInfo.rootPath, 'Content\\Data\\Buildings.xnb', locale)
        if (!cancelled) {
          setBuildingDataIndex(buildBuildingDataIndex(buildingsDataAsset.content))
        }
      } catch {
        if (!cancelled) {
          setBuildingDataIndex({})
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [directoryInfo?.rootPath, locale])

  useEffect(() => {
    if (!desktopHost) {
      setWorkspaceStatus({ tone: 'idle', message: copy.messages.browserHostPrompt })
      return
    }

    let cancelled = false

    async function detectKnownPath() {
      setWorkspaceStatus({ tone: 'working', message: copy.messages.detectingDefaultInstall })

      try {
        const detectedPath = await detectDefaultGameDirectory()
        if (cancelled) {
          return
        }

        if (detectedPath) {
          setGameDirectory(detectedPath)
          const validatedInfo = await validateGameDirectory(detectedPath)
          if (cancelled) {
            return
          }

          setGameDirectory(validatedInfo.rootPath)
          setWorkspaceStatus({ tone: 'ready', message: copy.messages.validatedDirectory(validatedInfo.rootPath) })
        } else {
          setWorkspaceStatus({ tone: 'idle', message: copy.messages.automaticDetectionFailed })
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceStatus({
            tone: 'error',
            message: `${copy.messages.automaticDetectionFailed} ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }
    }

    void detectKnownPath()

    return () => {
      cancelled = true
    }
  }, [copy.messages, desktopHost])

  async function ensureValidatedDirectory(currentPath: string) {
    const trimmedPath = currentPath.trim()
    if (!trimmedPath) {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.enterFolderBeforeValidating })
      return null
    }

    setWorkspaceStatus({ tone: 'working', message: copy.messages.validatingDirectory })

    try {
      const info = await validateGameDirectory(trimmedPath)
      setDirectoryInfo(info)
      setGameDirectory(info.rootPath)
      setWorkspaceStatus({ tone: 'ready', message: copy.messages.validatedDirectory(info.rootPath) })
      return info
    } catch (error) {
      setDirectoryInfo(null)
      resetLoadedMaps()
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.validationFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    }
  }

  async function loadParsedMap(summary: MapAssetSummary, info: GameDirectoryInfo) {
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
    return parsedDocument
  }

  async function preloadResources(assets: MapAssetSummary[], info: GameDirectoryInfo) {
    const xnbAssets = assets.filter((asset) => asset.format === 'xnb')
    let completed = 0
    let total = xnbAssets.length + 1

    function updatePreloadState(message: string, currentLabel = '') {
      setResourcePreloadState({
        active: true,
        message,
        completed,
        total,
        currentLabel,
      })
    }

    updatePreloadState(copy.messages.preloadingWorldData, 'Content\\Data\\WorldMap.xnb')
    try {
      await loadTextAsset(info.rootPath, 'Content\\Data\\WorldMap.xnb', locale)
    } catch {
      // WorldMap is optional; atlas construction already has its own fallback path.
    }
    completed += 1
    updatePreloadState(copy.messages.preloadingMaps)

    const tilesetImagePaths = new Set<string>()
    await runWithConcurrency(xnbAssets, 4, async (asset) => {
      updatePreloadState(copy.messages.preloadingMaps, asset.relativePath)
      try {
        const document = await loadParsedMap(asset, info)
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
    })

    const imagePaths = Array.from(tilesetImagePaths)
    total += imagePaths.length
    updatePreloadState(copy.messages.preloadingTilesets)

    await runWithConcurrency(imagePaths, 6, async (imagePath) => {
      updatePreloadState(copy.messages.preloadingTilesets, formatPreloadLabel(info.rootPath, imagePath))
      try {
        await loadImageDataUrl(imagePath, locale)
      } catch (error) {
        console.warn(`[resource-preload] skipped image preload for ${imagePath}: ${formatPreloadError(error)}`)
      }
      completed += 1
      updatePreloadState(copy.messages.preloadingTilesets, formatPreloadLabel(info.rootPath, imagePath))
    })

    setResourcePreloadState({
      active: true,
      message: copy.messages.loadingMap,
      completed,
      total,
      currentLabel: '',
    })
  }

  function findMapAssetByName(mapName: string) {
    const normalizedAliases = new Set(getWorldAtlasNameAliases(mapName))
    return (
      mapAssets.find(
        (asset) =>
          asset.format === 'xnb' && getWorldAtlasNameAliases(asset.name).some((alias) => normalizedAliases.has(alias)),
      ) ?? null
    )
  }

  function findWorldAtlasViewByMapName(mapName: string) {
    return (
      worldAtlasViews.find((view) =>
        view.document.atlas?.placements.some((placement) => matchesWorldAtlasMapName(placement.mapName, mapName)),
      ) ?? null
    )
  }

  async function openMap(
    summary: MapAssetSummary,
    knownDirectoryInfo?: GameDirectoryInfo | null,
    knownMapCount = mapAssets.length,
    options?: { forceReload?: boolean },
  ) {
    const info = knownDirectoryInfo ?? directoryInfo ?? (await ensureValidatedDirectory(gameDirectory))
    if (!info) {
      return
    }

    if (summary.format !== 'xnb') {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.onlyTmxSupported })
      return
    }

    setWorkspaceMode('map')
    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    try {
      const forceReload = options?.forceReload === true
      const existingTab = mapTabs.find((tab) => tab.assetId === summary.id)
      if (existingTab && !forceReload) {
        setActiveTabId(existingTab.id)
        applyMapDocument(existingTab.document, summary.id)
        setWorkspaceStatus({
          tone: 'ready',
          message: copy.messages.loadedMapAssetsWithActiveMap(
            knownMapCount,
            existingTab.document.format,
            existingTab.document.name,
          ),
        })
        return
      }

      const parsedDocument = await loadParsedMap(summary, info)
      const reusablePreviewTab =
        existingTab ?? mapTabs.find((tab) => tab.preview && !tab.dirty) ?? null
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
      setActiveTabId(nextTab.id)
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
  ) {
    const atlasCacheKey = getWorldAtlasCacheKey(info.rootPath, locale, assets, worldRootName)

    setWorkspaceMode('map')
    setMapTabs((current) => current.filter((tab) => tab.dirty))
    setActiveTabId(WORLD_ATLAS_TAB_ID)
    setWorldAtlasViews([])
    setActiveWorldAtlasViewId(null)
    applyMapDocument(null, null)
    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    const cachedAtlas = worldAtlasCacheRef.current.get(atlasCacheKey)
    if (cachedAtlas) {
      for (const document of cachedAtlas.sourceDocuments) {
        parsedMapCacheRef.current.set(document.sourcePath, document)
      }

      const nextWorldAtlasView = cachedAtlas.views[0]
      if (!nextWorldAtlasView) {
        return
      }

      setWorldAtlasViews(cachedAtlas.views)
      setActiveWorldAtlasViewId(nextWorldAtlasView.id)
      setActiveTabId(WORLD_ATLAS_TAB_ID)
      applyMapDocument(nextWorldAtlasView.document, null)
      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssetsWithActiveMap(
          assets.length,
          nextWorldAtlasView.document.format,
          nextWorldAtlasView.document.name,
        ),
      })
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
    const pendingNames = Array.from(
      new Set([worldRootName, ...getWorldAtlasSeedNames(), ...(worldMapLayout ? Object.keys(worldMapLayout) : [])]),
    )
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

      for (const targetName of getExteriorWarpTargetNames(document)) {
        const normalizedTargetName = targetName.trim().toLowerCase()
        if (!resolvedNames.has(normalizedTargetName) && xnbAssetsByAlias.has(normalizedTargetName)) {
          pendingNames.push(targetName)
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
      if (preferredScene) {
        await openMap(preferredScene, info, assets.length)
        return
      }

      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssets(assets.length, 'xnb'),
      })
      return
    }

    const nextWorldAtlasView = nextWorldAtlasViews[0]
    worldAtlasCacheRef.current.set(atlasCacheKey, {
      views: nextWorldAtlasViews,
      sourceDocuments,
    })
    setWorldAtlasViews(nextWorldAtlasViews)
    setActiveWorldAtlasViewId(nextWorldAtlasView.id)
    setActiveTabId(WORLD_ATLAS_TAB_ID)
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

  function handleSelectWorldAtlasView(viewId: WorldAtlasView['id']) {
    const nextWorldAtlasView = worldAtlasViews.find((view) => view.id === viewId)
    if (!nextWorldAtlasView) {
      return
    }

    setWorkspaceMode('map')
    setActiveWorldAtlasViewId(viewId)
    setActiveTabId(WORLD_ATLAS_TAB_ID)
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
    setWorkspaceMode('map')

    if (tabId === WORLD_ATLAS_TAB_ID) {
      setActiveTabId(WORLD_ATLAS_TAB_ID)
      applyMapDocument(worldAtlasDocument, null)
      return
    }

    const nextTab = mapTabs.find((tab) => tab.id === tabId)
    if (!nextTab) {
      return
    }

    setActiveTabId(nextTab.id)
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
      setActiveTabId(fallbackTab.id)
      applyMapDocument(fallbackTab.document, fallbackTab.assetId)
      return
    }

    setActiveTabId(WORLD_ATLAS_TAB_ID)
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

  function handleValidateOnly() {
    void ensureValidatedDirectory(gameDirectory)
  }

  const preloadResourcesRef = useRef(preloadResources)
  const openWorldAtlasRef = useRef(openWorldAtlas)
  const openMapRef = useRef(openMap)
  preloadResourcesRef.current = preloadResources
  openWorldAtlasRef.current = openWorldAtlas
  openMapRef.current = openMap

  useEffect(() => {
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
        worldAtlasCacheRef.current.clear()
        const nextAsset =
          assets.find((asset) => asset.id === activeMapId) ??
          assets.find((asset) => asset.name === mapDocument?.name) ??
          assets[0] ??
          null

        await preloadResourcesRef.current(assets, info)
        if (cancelled) {
          return
        }

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
          setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
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
    }
  }, [activeMapId, activeTabId, copy.messages.preloadingResources, copy.messages.resourcePreloadFailed, directoryInfo, locale, mapAssets.length, mapDocument?.name, worldAtlasViews.length])

  async function handleScanAndOpenTown() {
    const trimmedPath = gameDirectory.trim()
    if (!trimmedPath) {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.enterFolderBeforeScanning })
      return
    }

    setResourcePreloadState({
      active: true,
      message: copy.messages.validatingAndScanning,
      completed: 0,
      total: 0,
      currentLabel: '',
    })
    setWorkspaceStatus({ tone: 'working', message: copy.messages.validatingAndScanning })

    try {
      const info = await validateGameDirectory(trimmedPath)
      const assets = await scanMaps(info.rootPath, locale)
      setDirectoryInfo(info)
      setGameDirectory(info.rootPath)
      setMapAssets(assets)
      loadedResourceLocaleRef.current = locale

      await preloadResources(assets, info)
      await openWorldAtlas(assets, info)
      setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
    } catch (error) {
      setResourcePreloadState(EMPTY_RESOURCE_PRELOAD_STATE)
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.resourcePreloadFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async function handleChooseDirectory() {
    try {
      const selectedPath = await chooseGameDirectory()
      if (!selectedPath) {
        return
      }

      setGameDirectory(selectedPath)
      setWorkspaceStatus({ tone: 'idle', message: copy.messages.detectedKnownPath(selectedPath) })
    } catch (error) {
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.directorySelectionFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  async function handleUseKnownPath() {
    if (!canUseDesktopHost()) {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.browserHostPrompt })
      return
    }

    setWorkspaceStatus({ tone: 'working', message: copy.messages.detectingDefaultInstall })

    try {
      const detectedPath = await detectDefaultGameDirectory()
      if (!detectedPath) {
        setWorkspaceStatus({ tone: 'error', message: copy.messages.automaticDetectionFailed })
        return
      }

      setGameDirectory(detectedPath)
      setWorkspaceStatus({ tone: 'ready', message: copy.messages.detectedKnownPath(detectedPath) })
      void ensureValidatedDirectory(detectedPath)
    } catch (error) {
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.automaticDetectionFailed} ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  function toggleLayer(id: number) {
    setVisibleLayerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function toggleObjectGroup(id: number) {
    setVisibleObjectGroupIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
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

  useEffect(() => {
    setWorldOverlayTextureAssets((current) =>
      Object.fromEntries(
        worldOverlayTextureRequests.flatMap((textureName) => {
          const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
          const asset = current[textureName]
          return asset?.requestKey === requestKey ? [[textureName, asset] as const] : []
        }),
      ),
    )
  }, [directoryInfo?.rootPath, worldOverlayTextureRequests])

  const pendingWorldOverlayTextureRequests = useMemo(
    () =>
      worldOverlayTextureRequests.filter((textureName) => {
        const requestKey = `${directoryInfo?.rootPath ?? ''}::${textureName}`
        return worldOverlayTextureAssets[textureName]?.requestKey !== requestKey
      }),
    [directoryInfo?.rootPath, worldOverlayTextureAssets, worldOverlayTextureRequests],
  )

  useEffect(() => {
    if (!directoryInfo?.rootPath || pendingWorldOverlayTextureRequests.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(
        pendingWorldOverlayTextureRequests.map(async (textureName) => [textureName, await resolveEffectAsset(textureName, directoryInfo.rootPath)] as const),
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
  }, [directoryInfo?.rootPath, pendingWorldOverlayTextureRequests])

  useEffect(() => {
    if (browserSourceMode !== 'mod') {
      return
    }

    const nextAsset =
      modMapGroups
        .flatMap((group) => group.items)
        .find((item) => item.value.id === activeMapId)?.value ??
      modMapGroups[0]?.items[0]?.value ??
      null

    if (nextAsset && nextAsset.id !== activeMapId) {
      void openMapRef.current(nextAsset)
    }
  }, [activeMapId, browserSourceMode, modMapGroups])

  return {
    workspaceStatus,
    resourcePreloadState,
    gameDirectory,
    setGameDirectory,
    directoryInfo,
    mapAssets,
    filteredAssets,
    browserSourceMode,
    setBrowserSourceMode,
    modMapGroups,
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
    worldOverlayTextureAssets,
    worldAtlasDocument,
    openMap,
    handleSelectWorldAtlasView,
    handleSelectWorkspaceTab,
    handleCloseWorkspaceTab,
    handleReorderWorkspaceTabs,
    handleOpenAtlasTarget,
    handleValidateOnly,
    handleScanAndOpenTown,
    handleChooseDirectory,
    handleUseKnownPath,
    toggleLayer,
    toggleObjectGroup,
    setAllLayers,
    setAllObjectGroups,
    focusObject,
  }
}
