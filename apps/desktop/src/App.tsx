import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import CentralWorkspace from './components/CentralWorkspace'
import LeftDock from './components/LeftDock'
import RightDock from './components/RightDock'
import StatusBar from './components/StatusBar'
import TopMenuBar from './components/TopMenuBar'
import type { TileHoverInfo } from './components/MapViewport'
import {
  canUseDesktopHost,
  chooseGameDirectory,
  closeCurrentWindow,
  detectDefaultGameDirectory,
  loadMapAsset,
  loadTextAsset,
  minimizeCurrentWindow,
  scanMaps,
  toggleMaximizeCurrentWindow,
  validateGameDirectory,
  type GameDirectoryInfo,
  type MapAssetSummary,
} from './lib/desktop'
import { editorCopy, type LocaleCode, type ThemeMode, type WorkspaceMode } from './lib/editor-shell'
import { parseTmxMap } from './lib/maps/tmx'
import type { MapDocument } from './lib/maps/types'
import {
  buildWorldAtlas,
  getExteriorWarpTargetNames,
  getWorldAtlasNameAliases,
  getWorldAtlasSeedNames,
  parseWorldMapLayout,
} from './lib/maps/world'

type WorkspaceStatus = {
  tone: 'idle' | 'working' | 'ready' | 'error'
  message: string
}

type WorldAtlasView = {
  id: 'main' | 'remote'
  label: string
  document: MapDocument
}

const WORLD_ROOT_MAP_NAME = 'Town'
const REMOTE_WORLD_ROOT_CANDIDATES = ['Island_S', 'Desert', 'Summit', 'Island_W', 'Island_N', 'Island_E', 'Island_SE']

function getPreferredScene(assets: MapAssetSummary[]) {
  return (
    assets.find((asset) => asset.format === 'tmx' && /^town$/i.test(asset.name)) ??
    assets.find((asset) => asset.format === 'tmx') ??
    null
  )
}

function getWorldAtlasViewLabel(locale: LocaleCode, viewId: WorldAtlasView['id']) {
  if (locale === 'zh-CN') {
    return viewId === 'main' ? '主世界' : '远程区域'
  }

  return viewId === 'main' ? 'Main World' : 'Remote Regions'
}

function withWorldAtlasViewMetadata(document: MapDocument, viewId: WorldAtlasView['id'], label: string): MapDocument {
  return {
    ...document,
    name: `World Atlas · ${label}`,
    relativePath: `World Atlas / ${label}`,
    properties: {
      ...document.properties,
      atlasViewId: viewId,
      atlasViewLabel: label,
    },
  }
}

function pickWorldAtlasRootMapName(mapDocuments: MapDocument[], candidates: string[]) {
  const availableNames = new Set(mapDocuments.map((document) => document.name.trim().toLowerCase()))
  for (const candidate of candidates) {
    if (availableNames.has(candidate.trim().toLowerCase())) {
      return candidate
    }
  }

  return mapDocuments[0]?.name ?? null
}

function isRemoteWorldAtlasDocument(document: MapDocument) {
  const normalizedName = document.name.trim().toLowerCase()
  const locationContext =
    typeof document.properties.LocationContext === 'string'
      ? document.properties.LocationContext.trim().toLowerCase()
      : ''

  return (
    normalizedName === 'desert' ||
    normalizedName === 'summit' ||
    normalizedName.startsWith('island_') ||
    locationContext === 'island'
  )
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  )
  const [locale, setLocale] = useState<LocaleCode>(() =>
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US',
  )
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('map')
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({ tone: 'idle', message: '' })
  const [gameDirectory, setGameDirectory] = useState('')
  const [directoryInfo, setDirectoryInfo] = useState<GameDirectoryInfo | null>(null)
  const [mapAssets, setMapAssets] = useState<MapAssetSummary[]>([])
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [worldAtlasViews, setWorldAtlasViews] = useState<WorldAtlasView[]>([])
  const [activeWorldAtlasViewId, setActiveWorldAtlasViewId] = useState<WorldAtlasView['id'] | null>(null)
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const [visibleLayerIds, setVisibleLayerIds] = useState<number[]>([])
  const [visibleObjectGroupIds, setVisibleObjectGroupIds] = useState<number[]>([])
  const [assetFilter, setAssetFilter] = useState('')

  const copy = editorCopy[locale]
  const desktopHost = canUseDesktopHost()
  const deferredAssetFilter = useDeferredValue(assetFilter.trim().toLowerCase())
  const filteredAssets = mapAssets.filter((asset) => {
    if (!deferredAssetFilter) {
      return true
    }

    const haystack = `${asset.name} ${asset.fileName} ${asset.relativePath}`.toLowerCase()
    return haystack.includes(deferredAssetFilter)
  })
  const activeAsset = mapAssets.find((asset) => asset.id === activeMapId) ?? null
  const moduleBlueprint = workspaceMode === 'map' ? undefined : copy.moduleBlueprints[workspaceMode]

  function getDefaultVisibleLayerIds(nextDocument: MapDocument) {
    return nextDocument.layers.filter((layer) => layer.visible).map((layer) => layer.id)
  }

  function getDefaultVisibleObjectGroupIds(nextDocument: MapDocument) {
    return nextDocument.objectGroups.filter((group) => group.visible).map((group) => group.id)
  }

  function applyMapDocument(nextDocument: MapDocument) {
    startTransition(() => {
      setMapDocument(nextDocument)
      setVisibleLayerIds(getDefaultVisibleLayerIds(nextDocument))
      setVisibleObjectGroupIds(getDefaultVisibleObjectGroupIds(nextDocument))
      setHoverInfo(null)
    })
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = locale
  }, [locale, theme])

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
      setMapAssets([])
      setActiveMapId(null)
      setMapDocument(null)
      setWorldAtlasViews([])
      setActiveWorldAtlasViewId(null)
      setHoverInfo(null)
      setVisibleLayerIds([])
      setVisibleObjectGroupIds([])
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
    setActiveMapId(summary.id)
    setWorldAtlasViews([])
    setActiveWorldAtlasViewId(null)
    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    try {
      const parsedDocument = await loadParsedMap(summary, info)
      applyMapDocument(parsedDocument)

      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, parsedDocument.format, parsedDocument.name),
      })
    } catch (error) {
      setMapDocument(null)
      setHoverInfo(null)
      setVisibleLayerIds([])
      setVisibleObjectGroupIds([])
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
    setActiveMapId(null)
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
    applyMapDocument(nextWorldAtlasView.document)
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
    setActiveMapId(null)
    setActiveWorldAtlasViewId(viewId)
    applyMapDocument(nextWorldAtlasView.document)
    setWorkspaceStatus({
      tone: 'ready',
      message: copy.messages.loadedMapAssetsWithActiveMap(
        mapAssets.length,
        nextWorldAtlasView.document.format,
        nextWorldAtlasView.document.name,
      ),
    })
  }

  async function handleValidateOnly() {
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
    if (!desktopHost) {
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
    setVisibleLayerIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
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
    setVisibleObjectGroupIds(
      visible && mapDocument ? mapDocument.objectGroups.map((group) => group.id) : [],
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      <TopMenuBar
        copy={copy}
        workspaceMode={workspaceMode}
        onWorkspaceChange={setWorkspaceMode}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        locale={locale}
        onToggleLocale={() => setLocale((current) => (current === 'zh-CN' ? 'en-US' : 'zh-CN'))}
        statusTone={workspaceStatus.tone}
        desktopHost={desktopHost}
        onMinimizeWindow={() => void minimizeCurrentWindow()}
        onToggleMaximizeWindow={() => void toggleMaximizeCurrentWindow()}
        onCloseWindow={() => void closeCurrentWindow()}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <Group orientation="horizontal" id="modforge-desktop-layout">
          <Panel defaultSize={23} minSize={18}>
            <LeftDock
              copy={copy}
              workspaceMode={workspaceMode}
              desktopHost={desktopHost}
              gameDirectory={gameDirectory}
              onGameDirectoryChange={setGameDirectory}
              onChooseDirectory={() => void handleChooseDirectory()}
              onUseKnownPath={() => void handleUseKnownPath()}
              onValidateOnly={() => void handleValidateOnly()}
              onScanAndOpenTown={() => void handleScanAndOpenTown()}
              directoryInfo={directoryInfo}
              mapAssets={mapAssets}
              filteredAssets={filteredAssets}
              activeMapId={activeMapId}
              sceneLabel={workspaceMode === 'map' ? mapDocument?.name ?? activeAsset?.name ?? undefined : undefined}
              assetFilter={assetFilter}
              onAssetFilterChange={setAssetFilter}
              onOpenAsset={(asset) => {
                void openMap(asset)
              }}
            />
          </Panel>

          <Separator className="resize-handle" />

          <Panel defaultSize={54} minSize={34}>
            <CentralWorkspace
              copy={copy}
              workspaceMode={workspaceMode}
              activeAsset={activeAsset}
              mapDocument={mapDocument}
              worldAtlasViews={worldAtlasViews}
              activeWorldAtlasViewId={activeWorldAtlasViewId}
              onSelectWorldAtlasView={handleSelectWorldAtlasView}
              theme={theme}
              visibleLayerIds={visibleLayerIds}
              visibleObjectGroupIds={visibleObjectGroupIds}
              onHoverChange={setHoverInfo}
              moduleBlueprint={moduleBlueprint}
            />
          </Panel>

          <Separator className="resize-handle" />

          <Panel defaultSize={23} minSize={18}>
            <RightDock
              copy={copy}
              mapDocument={mapDocument}
              hoverInfo={hoverInfo}
              visibleLayerIds={visibleLayerIds}
              visibleObjectGroupIds={visibleObjectGroupIds}
              onToggleLayer={toggleLayer}
              onToggleObjectGroup={toggleObjectGroup}
              onShowAllLayers={() => setAllLayers(true)}
              onHideAllLayers={() => setAllLayers(false)}
              onShowAllObjectGroups={() => setAllObjectGroups(true)}
              onHideAllObjectGroups={() => setAllObjectGroups(false)}
              directoryInfo={directoryInfo}
              workspaceStatus={workspaceStatus}
              moduleBlueprint={moduleBlueprint}
            />
          </Panel>
        </Group>
      </div>

      <StatusBar
        copy={copy}
        workspaceStatus={workspaceStatus}
        directoryInfo={directoryInfo}
        mapAssets={mapAssets}
        activeAsset={activeAsset}
        mapDocument={mapDocument}
        hoverInfo={hoverInfo}
      />
    </div>
  )
}
