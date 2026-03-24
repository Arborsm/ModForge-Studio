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

type WorkspaceStatus = {
  tone: 'idle' | 'working' | 'ready' | 'error'
  message: string
}

function getPreferredScene(assets: MapAssetSummary[]) {
  return (
    assets.find((asset) => asset.format === 'tmx' && /^town$/i.test(asset.name)) ??
    assets.find((asset) => asset.format === 'tmx') ??
    null
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
    setWorkspaceStatus({ tone: 'working', message: copy.messages.loadingMap })

    try {
      const asset = await loadMapAsset(info.rootPath, summary.absolutePath)
      if (asset.format !== 'tmx') {
        throw new Error(copy.messages.onlyTmxSupported)
      }

      const parsedDocument = parseTmxMap(asset.absolutePath, asset.relativePath, asset.content)
      startTransition(() => {
        setMapDocument(parsedDocument)
        setVisibleLayerIds(parsedDocument.layers.filter((layer) => layer.visible).map((layer) => layer.id))
        setVisibleObjectGroupIds(
          parsedDocument.objectGroups.filter((group) => group.visible).map((group) => group.id),
        )
        setHoverInfo(null)
      })

      setWorkspaceStatus({
        tone: 'ready',
        message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, asset.format, asset.name),
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

      const preferredScene = getPreferredScene(assets)
      if (preferredScene) {
        await openMap(preferredScene, info, assets.length)
      } else {
        setWorkspaceStatus({
          tone: 'ready',
          message: copy.messages.loadedMapAssets(assets.length, info.preferredFormat),
        })
      }
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
        hoverInfo={hoverInfo}
      />
    </div>
  )
}
