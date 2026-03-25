import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import type { FocusedMapObjectTarget, TileHoverInfo } from '../../components/MapViewport'
import {
  canUseDesktopHost,
  chooseGameDirectory,
  detectDefaultGameDirectory,
  loadMapAsset,
  loadTextAsset,
  scanMaps,
  validateGameDirectory,
  type GameDirectoryInfo,
  type MapAssetSummary,
} from '../desktop'
import type { EditorCopy, LocaleCode, WorkspaceMode } from '../editor-shell'
import { parseTmxMap } from '../maps/tmx'
import type { MapDocument } from '../maps/types'
import {
  buildWorldAtlas,
  getExteriorWarpTargetNames,
  getWorldAtlasNameAliases,
  getWorldAtlasSeedNames,
  parseWorldMapLayout,
} from '../maps/world'
import { REMOTE_WORLD_ROOT_CANDIDATES, WORLD_ATLAS_TAB_ID, WORLD_ROOT_MAP_NAME } from './constants'
import {
  buildWorkspaceTabs,
  getDefaultVisibleLayerIds,
  getDefaultVisibleObjectGroupIds,
  getMapWorkspaceTabId,
  getPreferredScene,
  isRemoteWorldAtlasDocument,
  matchesWorldAtlasMapName,
  pickWorldAtlasRootMapName,
  withWorldAtlasViewMetadata,
} from './mapWorkspace'
import type { MapWorkspaceTab, WorldAtlasView, WorkspaceStatus } from './types'

type UseMapWorkspaceOptions = {
  copy: EditorCopy
  locale: LocaleCode
  desktopHost: boolean
  setWorkspaceMode: (mode: WorkspaceMode) => void
  getWorldAtlasViewLabel: (locale: LocaleCode, viewId: WorldAtlasView['id']) => string
}

export function useMapWorkspace({
  copy,
  locale,
  desktopHost,
  setWorkspaceMode,
  getWorldAtlasViewLabel,
}: UseMapWorkspaceOptions) {
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({ tone: 'idle', message: '' })
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
  const [assetFilter, setAssetFilter] = useState('')

  const deferredAssetFilter = useDeferredValue(assetFilter.trim().toLowerCase())
  const filteredAssets = mapAssets.filter((asset) => {
    if (!deferredAssetFilter) {
      return true
    }

    const haystack = `${asset.name} ${asset.fileName} ${asset.relativePath}`.toLowerCase()
    return haystack.includes(deferredAssetFilter)
  })
  const activeAtlasView =
    (activeWorldAtlasViewId ? worldAtlasViews.find((view) => view.id === activeWorldAtlasViewId) : null) ??
    worldAtlasViews[0] ??
    null
  const activeAsset = mapAssets.find((asset) => asset.id === activeMapId) ?? null
  const worldAtlasDocument = activeAtlasView?.document ?? null
  const workspaceTabs = buildWorkspaceTabs(worldAtlasDocument, mapTabs)

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
    setMapAssets([])
    setMapTabs([])
    setActiveTabId(WORLD_ATLAS_TAB_ID)
    setWorldAtlasViews([])
    setActiveWorldAtlasViewId(null)
    applyMapDocument(null, null)
  }

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
          setWorkspaceStatus({ tone: 'idle', message: copy.messages.detectedKnownPath(detectedPath) })
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
    const asset = await loadMapAsset(info.rootPath, summary.absolutePath)
    if (asset.format !== 'tmx') {
      throw new Error(copy.messages.onlyTmxSupported)
    }

    return parseTmxMap(asset.absolutePath, asset.relativePath, asset.content)
  }

  function findMapAssetByName(mapName: string) {
    const normalizedAliases = new Set(getWorldAtlasNameAliases(mapName))
    return (
      mapAssets.find(
        (asset) =>
          asset.format === 'tmx' && getWorldAtlasNameAliases(asset.name).some((alias) => normalizedAliases.has(alias)),
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
  ) {
    const info = knownDirectoryInfo ?? directoryInfo ?? (await ensureValidatedDirectory(gameDirectory))
    if (!info) {
      return
    }

    if (summary.format !== 'tmx') {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.onlyTmxSupported })
      return
    }

    setWorkspaceMode('map')
    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    try {
      const existingTab = mapTabs.find((tab) => tab.assetId === summary.id)
      if (existingTab) {
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
      const nextTab = {
        id: getMapWorkspaceTabId(summary.id),
        assetId: summary.id,
        document: parsedDocument,
      }

      setMapTabs((current) => [...current, nextTab])
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
    let worldMapLayout
    try {
      const worldMapAsset = await loadTextAsset(info.rootPath, 'Content (unpacked)\\Data\\WorldMap.json')
      worldMapLayout = parseWorldMapLayout(worldMapAsset.content)
    } catch {
      worldMapLayout = undefined
    }

    const tmxAssetsByAlias = new Map<string, MapAssetSummary>()
    for (const asset of assets.filter((candidate) => candidate.format === 'tmx')) {
      for (const alias of getWorldAtlasNameAliases(asset.name)) {
        if (!tmxAssetsByAlias.has(alias)) {
          tmxAssetsByAlias.set(alias, asset)
        }
      }
    }
    const pendingNames = Array.from(
      new Set([worldRootName, ...getWorldAtlasSeedNames(), ...(worldMapLayout ? Object.keys(worldMapLayout) : [])]),
    )
    const loadedDocuments = new Map<string, MapDocument>()
    const resolvedNames = new Set<string>()

    setWorkspaceMode('map')
    setMapTabs([])
    setActiveTabId(WORLD_ATLAS_TAB_ID)
    setWorldAtlasViews([])
    setActiveWorldAtlasViewId(null)
    applyMapDocument(null, null)
    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    while (pendingNames.length) {
      const currentName = pendingNames.shift()
      if (!currentName) {
        continue
      }

      const normalizedName = currentName.trim().toLowerCase()
      if (resolvedNames.has(normalizedName)) {
        continue
      }

      const summary = tmxAssetsByAlias.get(normalizedName)
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
        if (!resolvedNames.has(normalizedTargetName) && tmxAssetsByAlias.has(normalizedTargetName)) {
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
        message: copy.messages.loadedMapAssets(assets.length, info.preferredFormat),
      })
      return
    }

    const nextWorldAtlasView = nextWorldAtlasViews[0]
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

  async function handleScanAndOpenTown() {
    const trimmedPath = gameDirectory.trim()
    if (!trimmedPath) {
      setWorkspaceStatus({ tone: 'error', message: copy.messages.enterFolderBeforeScanning })
      return
    }

    setWorkspaceStatus({ tone: 'working', message: copy.messages.validatingAndScanning })

    try {
      const info = await validateGameDirectory(trimmedPath)
      const assets = await scanMaps(trimmedPath)
      setDirectoryInfo(info)
      setGameDirectory(info.rootPath)
      setMapAssets(assets)

      await openWorldAtlas(assets, info)
    } catch (error) {
      setWorkspaceStatus({
        tone: 'error',
        message: `${copy.messages.mapScanFailed} ${error instanceof Error ? error.message : String(error)}`,
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

  return {
    workspaceStatus,
    gameDirectory,
    setGameDirectory,
    directoryInfo,
    mapAssets,
    filteredAssets,
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
