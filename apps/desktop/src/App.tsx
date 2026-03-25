import { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import CentralWorkspace from './components/CentralWorkspace'
import { AssetBrowserPanel, ProjectPanel } from './components/LeftPanels'
import {
  DiagnosticsPanel,
  InspectorPanel,
  LayersPanel,
  ObjectGroupsPanel,
} from './components/RightPanels'
import StatusBar from './components/StatusBar'
import SettingsWindow from './components/SettingsWindow'
import TopMenuBar from './components/TopMenuBar'
import { WorkspaceLayout, type WorkspaceLayoutHandle, type WorkspacePanelMeta } from './components/WorkspaceLayout'
import type { FocusedMapObjectTarget, TileHoverInfo } from './components/MapViewport'
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

type MapWorkspaceTab = {
  id: string
  assetId: string
  document: MapDocument
}

type AccentPreset = {
  id: string
  label: string
  color: string
}

const WORLD_ROOT_MAP_NAME = 'Town'
const REMOTE_WORLD_ROOT_CANDIDATES = ['Island_S', 'Desert', 'Summit', 'Island_W', 'Island_N', 'Island_E', 'Island_SE']
const WORLD_ATLAS_TAB_ID = 'world-atlas'
const ACCENT_STORAGE_KEY = 'modforge:accent-preset:v1'
const DEFAULT_WORLD_ATLAS_VIEW_ZOOM = 1

const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { id: 'blue', label: 'Blue', color: '#0078ff' },
  { id: 'cyan', label: 'Cyan', color: '#0891b2' },
  { id: 'emerald', label: 'Emerald', color: '#059669' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
]

function getMapWorkspaceTabId(assetId: string) {
  return `map:${assetId}`
}

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
  const townPlacement =
    viewId === 'main' ? document.atlas?.placements.find((placement) => /^town$/i.test(placement.mapName)) : null

  return {
    ...document,
    name: `World Atlas · ${label}`,
    relativePath: `World Atlas / ${label}`,
    properties: {
      ...document.properties,
      atlasViewId: viewId,
      atlasViewLabel: label,
      ...(townPlacement
        ? {
            defaultViewportCenterX: (townPlacement.offsetX + townPlacement.width / 2) * document.tileWidth,
            defaultViewportCenterY: (townPlacement.offsetY + townPlacement.height / 2) * document.tileHeight,
            defaultViewportZoom: DEFAULT_WORLD_ATLAS_VIEW_ZOOM,
          }
        : {}),
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

function matchesWorldAtlasMapName(left: string, right: string) {
  const rightAliases = new Set(getWorldAtlasNameAliases(right))
  return getWorldAtlasNameAliases(left).some((alias) => rightAliases.has(alias))
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

function getViewMenuCopy(locale: LocaleCode) {
  if (locale === 'zh-CN') {
    return {
      title: '视图',
      resetLabel: '重置默认布局',
      savePresetLabel: '保存当前布局',
      panelsLabel: '窗口',
      presetsLabel: '工作区预设',
      emptyPresetsLabel: '还没有保存的预设',
      presetNamePrompt: '输入预设名称',
      deletePresetConfirm: (name: string) => `删除预设“${name}”？`,
    }
  }

  return {
    title: 'View',
    resetLabel: 'Reset Default Layout',
    savePresetLabel: 'Save Current Layout',
    panelsLabel: 'Windows',
    presetsLabel: 'Workspace Presets',
    emptyPresetsLabel: 'No saved presets yet',
    presetNamePrompt: 'Preset name',
    deletePresetConfirm: (name: string) => `Delete preset "${name}"?`,
  }
}

function getSettingsMenuCopy(locale: LocaleCode) {
  if (locale === 'zh-CN') {
    return {
      title: '设置',
      categories: {
        appearance: '外观',
        view: '视图',
        interaction: '交互',
        advanced: '高级',
      },
      accentLabel: '强调色',
      resetAccentLabel: '恢复默认强调色',
      accentDescription: '影响视口背景、入口点高亮，以及编辑器中的强调态元素。',
      futureLabel: '更多配置',
      futureDescription: '后续的编辑器偏好、显示选项和行为设置都会放在这里。',
      categoryDescriptions: {
        appearance: '主题、强调色和整体视觉风格。',
        view: '地图显示、画布与信息呈现方式。',
        interaction: '输入、导航和编辑交互体验。',
        advanced: '实验性选项、诊断和更高级的行为控制。',
      },
    }
  }

  return {
    title: 'Settings',
    categories: {
      appearance: 'Appearance',
      view: 'View',
      interaction: 'Interaction',
      advanced: 'Advanced',
    },
    accentLabel: 'Accent Color',
    resetAccentLabel: 'Reset Accent Color',
    accentDescription: 'Controls the viewport background, portal highlights, and accent-driven UI states.',
    futureLabel: 'More Settings',
    futureDescription: 'Future editor preferences, display options, and behavior settings will live here.',
    categoryDescriptions: {
      appearance: 'Theme, accent color, and overall visual style.',
      view: 'Map display, canvas, and information presentation.',
      interaction: 'Input, navigation, and editing behavior.',
      advanced: 'Experimental options, diagnostics, and advanced controls.',
    },
  }
}

function hexToRgb(value: string) {
  const normalized = value.replace('#', '')
  const hex = normalized.length === 3 ? normalized.split('').map((char) => `${char}${char}`).join('') : normalized
  const parsed = Number.parseInt(hex, 16)

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

function rgbaFromHex(value: string, alpha: number) {
  const { r, g, b } = hexToRgb(value)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function App() {
  const workspaceLayoutVersion = 'v7'
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  )
  const [locale, setLocale] = useState<LocaleCode>(() =>
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US',
  )
  const [accentPresetId, setAccentPresetId] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return ACCENT_PRESETS[0].id
    }

    return window.localStorage.getItem(ACCENT_STORAGE_KEY) ?? ACCENT_PRESETS[0].id
  })
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('map')
  const [settingsWindowOpen, setSettingsWindowOpen] = useState(false)
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
  const [viewMenuPanelItems, setViewMenuPanelItems] = useState<WorkspacePanelMeta[]>([])
  const [viewMenuPresetNames, setViewMenuPresetNames] = useState<string[]>([])
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)

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
  const activeAtlasView =
    (activeWorldAtlasViewId ? worldAtlasViews.find((view) => view.id === activeWorldAtlasViewId) : null) ??
    worldAtlasViews[0] ??
    null
  const activeAsset = mapAssets.find((asset) => asset.id === activeMapId) ?? null
  const worldAtlasDocument = activeAtlasView?.document ?? null
  const workspaceTabs = [
    {
      id: WORLD_ATLAS_TAB_ID,
      title: worldAtlasDocument?.name ?? 'World Atlas',
      pathLabel: worldAtlasDocument?.relativePath ?? 'World Atlas',
      closable: false,
      pinned: true,
    },
    ...mapTabs.map((tab) => ({
      id: tab.id,
      title: tab.document.name,
      pathLabel: tab.document.relativePath,
      closable: true,
      pinned: false,
    })),
  ]
  const moduleBlueprint = workspaceMode === 'map' ? undefined : copy.moduleBlueprints[workspaceMode]
  const viewMenuCopy = getViewMenuCopy(locale)
  const settingsMenuCopy = getSettingsMenuCopy(locale)
  const activeAccentPreset =
    ACCENT_PRESETS.find((preset) => preset.id === accentPresetId) ?? ACCENT_PRESETS[0]

  function getDefaultVisibleLayerIds(nextDocument: MapDocument) {
    return nextDocument.layers.filter((layer) => layer.visible).map((layer) => layer.id)
  }

  function getDefaultVisibleObjectGroupIds(nextDocument: MapDocument) {
    return nextDocument.objectGroups.filter((group) => group.visible).map((group) => group.id)
  }

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = locale
  }, [locale, theme])

  useEffect(() => {
    const root = document.documentElement
    const accent = activeAccentPreset.color
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-soft', rgbaFromHex(accent, theme === 'dark' ? 0.18 : 0.14))
    root.style.setProperty('--bg-active', theme === 'dark' ? rgbaFromHex(accent, 0.22) : rgbaFromHex(accent, 0.12))
    window.localStorage.setItem(ACCENT_STORAGE_KEY, activeAccentPreset.id)
  }, [activeAccentPreset.color, activeAccentPreset.id, theme])

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
      setMapTabs([])
      setActiveTabId(WORLD_ATLAS_TAB_ID)
      setActiveMapId(null)
      setMapDocument(null)
      setWorldAtlasViews([])
      setActiveWorldAtlasViewId(null)
      setHoverInfo(null)
      setVisibleLayerIds([])
      setVisibleObjectGroupIds([])
      setFocusedObjectTarget(null)
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
      mapAssets.find((asset) => asset.format === 'tmx' && getWorldAtlasNameAliases(asset.name).some((alias) => normalizedAliases.has(alias))) ??
      null
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
          message: copy.messages.loadedMapAssetsWithActiveMap(knownMapCount, existingTab.document.format, existingTab.document.name),
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

  function focusObject(groupId: number, objectId: number) {
    setVisibleObjectGroupIds((current) => (current.includes(groupId) ? current : [...current, groupId]))
    setFocusedObjectTarget((current) => ({
      groupId,
      objectId,
      nonce: (current?.nonce ?? 0) + 1,
    }))
  }

  const workspacePanels = [
      {
        id: 'project',
        title: copy.leftDock.project,
        subtitle: copy.leftDock.projectSubtitle,
        minWidth: 300,
        minHeight: 280,
        dockMinHeight: 220,
        dockAutoHeight: true,
        defaultDock: 'left-top' as const,
        defaultDockHeight: 280,
        content: (
          <ProjectPanel
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
            activeMapId={activeMapId}
            sceneLabel={workspaceMode === 'map' ? mapDocument?.name ?? activeAsset?.name ?? undefined : undefined}
          />
        ),
      },
      {
        id: 'assets',
        title: copy.leftDock.contentBrowser,
        subtitle: copy.leftDock.contentSubtitle,
        minWidth: 320,
        minHeight: 320,
        dockMinHeight: 240,
        defaultDock: 'left-bottom' as const,
        defaultDockHeight: 520,
        content: (
          <AssetBrowserPanel
            copy={copy}
            mapAssets={mapAssets}
            filteredAssets={filteredAssets}
            activeMapId={activeMapId}
            assetFilter={assetFilter}
            onAssetFilterChange={setAssetFilter}
            onOpenAsset={(asset) => {
              void openMap(asset)
            }}
          />
        ),
      },
      {
        id: 'viewport',
        title: copy.center.viewport,
        subtitle: copy.center.activeScene,
        minWidth: 640,
        minHeight: 420,
        defaultDock: 'center' as const,
        defaultDockHeight: 760,
        content: (
          <CentralWorkspace
            copy={copy}
            workspaceMode={workspaceMode}
            tabs={workspaceTabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectWorkspaceTab}
            onCloseTab={handleCloseWorkspaceTab}
            onReorderTabs={handleReorderWorkspaceTabs}
            mapDocument={mapDocument}
            worldAtlasViews={worldAtlasViews}
            activeWorldAtlasViewId={activeWorldAtlasViewId}
            onSelectWorldAtlasView={handleSelectWorldAtlasView}
            onOpenAtlasTarget={handleOpenAtlasTarget}
            theme={theme}
            accentColor={activeAccentPreset.color}
            visibleLayerIds={visibleLayerIds}
            visibleObjectGroupIds={visibleObjectGroupIds}
            focusedObjectTarget={focusedObjectTarget}
            onHoverChange={setHoverInfo}
            moduleBlueprint={moduleBlueprint}
          />
        ),
      },
      {
        id: 'inspector',
        title: copy.rightDock.inspector,
        subtitle: copy.rightDock.sceneSummary,
        minWidth: 320,
        minHeight: 260,
        dockMinHeight: 180,
        dockAutoHeight: true,
        defaultDock: 'right-top' as const,
        defaultDockHeight: 220,
        content: <InspectorPanel copy={copy} mapDocument={mapDocument} moduleBlueprint={moduleBlueprint} />,
      },
      {
        id: 'layers',
        title: copy.rightDock.layers,
        subtitle: copy.rightDock.subtitle,
        minWidth: 320,
        minHeight: 260,
        dockMinHeight: 220,
        defaultDock: 'right-bottom' as const,
        defaultDockHeight: 320,
        content: (
          <LayersPanel
            copy={copy}
            mapDocument={mapDocument}
            visibleLayerIds={visibleLayerIds}
            onToggleLayer={toggleLayer}
            onShowAllLayers={() => setAllLayers(true)}
            onHideAllLayers={() => setAllLayers(false)}
          />
        ),
      },
      {
        id: 'object-groups',
        title: copy.rightDock.objectGroups,
        subtitle: copy.rightDock.subtitle,
        minWidth: 320,
        minHeight: 300,
        dockMinHeight: 240,
        defaultDock: 'right-bottom' as const,
        defaultDockHeight: 360,
        content: (
          <ObjectGroupsPanel
            copy={copy}
            mapDocument={mapDocument}
            visibleObjectGroupIds={visibleObjectGroupIds}
            onToggleObjectGroup={toggleObjectGroup}
            onShowAllObjectGroups={() => setAllObjectGroups(true)}
            onHideAllObjectGroups={() => setAllObjectGroups(false)}
            focusedObjectTarget={focusedObjectTarget}
            onFocusObject={focusObject}
          />
        ),
      },
      {
        id: 'diagnostics',
        title: copy.rightDock.diagnostics,
        subtitle: copy.rightDock.projectFacts,
        minWidth: 320,
        minHeight: 260,
        dockMinHeight: 160,
        dockAutoHeight: true,
        defaultDock: 'bottom-right' as const,
        defaultDockHeight: 300,
        content: (
          <DiagnosticsPanel
            copy={copy}
            directoryInfo={directoryInfo}
            visibleLayerIds={visibleLayerIds}
            visibleObjectGroupIds={visibleObjectGroupIds}
            workspaceStatus={workspaceStatus}
          />
        ),
      },
    ]

  const handleLayoutMetaChange = useCallback(
    ({ panelItems, presetNames }: { panelItems: typeof viewMenuPanelItems; presetNames: string[] }) => {
      setViewMenuPanelItems((current) => {
        if (
          current.length === panelItems.length &&
          current.every(
            (item, index) =>
              item.id === panelItems[index]?.id &&
              item.title === panelItems[index]?.title &&
              item.visible === panelItems[index]?.visible &&
              item.mode === panelItems[index]?.mode &&
              item.dock === panelItems[index]?.dock,
          )
        ) {
          return current
        }

        return panelItems
      })

      setViewMenuPresetNames((current) => {
        if (current.length === presetNames.length && current.every((name, index) => name === presetNames[index])) {
          return current
        }

        return presetNames
      })
    },
    [],
  )

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
        viewMenu={{
          title: viewMenuCopy.title,
          resetLabel: viewMenuCopy.resetLabel,
          savePresetLabel: viewMenuCopy.savePresetLabel,
          panelsLabel: viewMenuCopy.panelsLabel,
          presetsLabel: viewMenuCopy.presetsLabel,
          emptyPresetsLabel: viewMenuCopy.emptyPresetsLabel,
          panelItems: viewMenuPanelItems,
          presetNames: viewMenuPresetNames,
          onTogglePanel: (id, visible) => workspaceLayoutRef.current?.setPanelVisibility(id, visible),
          onResetLayout: () => workspaceLayoutRef.current?.resetLayout(),
          onSavePreset: () => {
            const presetName = window.prompt(viewMenuCopy.presetNamePrompt)
            if (!presetName?.trim()) {
              return
            }

            workspaceLayoutRef.current?.savePreset(presetName.trim())
          },
          onLoadPreset: (name) => workspaceLayoutRef.current?.loadPreset(name),
          onDeletePreset: (name) => {
            if (!window.confirm(viewMenuCopy.deletePresetConfirm(name))) {
              return
            }

            workspaceLayoutRef.current?.deletePreset(name)
          },
        }}
        settingsMenu={{
          title: settingsMenuCopy.title,
          onOpen: () => setSettingsWindowOpen(true),
        }}
      />

      <SettingsWindow
        open={settingsWindowOpen}
        title={settingsMenuCopy.title}
        categories={settingsMenuCopy.categories}
        categoryDescriptions={settingsMenuCopy.categoryDescriptions}
        accentLabel={settingsMenuCopy.accentLabel}
        resetAccentLabel={settingsMenuCopy.resetAccentLabel}
        accentDescription={settingsMenuCopy.accentDescription}
        futureLabel={settingsMenuCopy.futureLabel}
        futureDescription={settingsMenuCopy.futureDescription}
        accentOptions={ACCENT_PRESETS}
        activeAccentId={activeAccentPreset.id}
        onSelectAccent={setAccentPresetId}
        onResetAccent={() => setAccentPresetId(ACCENT_PRESETS[0].id)}
        onClose={() => setSettingsWindowOpen(false)}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceLayout
          key={workspaceLayoutVersion}
          ref={workspaceLayoutRef}
          storageKey={`modforge:workspace-layout:${workspaceLayoutVersion}`}
          panels={workspacePanels}
          onLayoutMetaChange={handleLayoutMetaChange}
        />
      </div>

      <StatusBar
        copy={copy}
        workspaceStatus={workspaceStatus}
        directoryInfo={directoryInfo}
        mapAssets={mapAssets}
        activeAsset={activeAsset}
        mapDocument={mapDocument}
        pathLabel={mapDocument?.relativePath ?? activeAsset?.relativePath ?? worldAtlasDocument?.relativePath ?? copy.common.none}
        hoverInfo={hoverInfo}
      />
    </div>
  )
}
