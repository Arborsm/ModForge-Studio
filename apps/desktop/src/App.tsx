import { useCallback, useEffect, useRef, useState } from 'react'
import { DevDebugOverlay } from './components/DevDebugOverlay'
import PlayerAppearanceWindow from './components/PlayerAppearanceWindow'
import StatusBar from './components/StatusBar'
import SettingsWindow from './components/SettingsWindow'
import TopMenuBar from './components/TopMenuBar'
import { WorkspaceLayout, type WorkspaceLayoutHandle, type WorkspacePanelMeta } from './components/WorkspaceLayout'
import {
  canUseDesktopHost,
  clearDesktopLocaleCache,
  closeCurrentWindow,
  minimizeCurrentWindow,
  toggleMaximizeCurrentWindow,
} from './lib/desktop'
import {
  editorCopy,
  getSettingsMenuCopy,
  getViewMenuCopy,
  getWorldAtlasViewLabel,
  type LocaleCode,
  type ThemeMode,
  type WorkspaceMode,
} from './lib/editor-shell'
import { rgbaFromHex } from './lib/app/color'
import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY,
  PLAYER_APPEARANCE_PROFILES_STORAGE_KEY,
  WORKSPACE_LAYOUT_VERSION,
} from './lib/app/constants'
import {
  clonePlayerAppearanceProfile,
  createDefaultPlayerAppearanceProfile,
  readStoredPlayerAppearanceState,
  sanitizePlayerAppearanceProfile,
  type PlayerAppearanceProfile,
} from './lib/app/playerAppearance'
import { clearLocalizedStageMetadataCache } from './lib/app/eventStageShared'
import { clearMapViewportLocaleCache } from './lib/mapViewportCache'
import { useEventWorkspace } from './lib/app/useEventWorkspace'
import { useMapWorkspace } from './lib/app/useMapWorkspace'
import { buildWorkspacePanels } from './lib/app/workspacePanels'

export default function App() {
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
  const [playerAppearanceWindowOpen, setPlayerAppearanceWindowOpen] = useState(false)
  const [playerAppearanceWindowNonce, setPlayerAppearanceWindowNonce] = useState(0)
  const [viewMenuPanelItems, setViewMenuPanelItems] = useState<WorkspacePanelMeta[]>([])
  const [viewMenuPresetNames, setViewMenuPresetNames] = useState<string[]>([])
  const [currentEventCommandId, setCurrentEventCommandId] = useState<string | null>(null)
  useEffect(() => {
    if (workspaceMode !== 'map') {
      return
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [workspaceMode])

  const [playerAppearanceProfiles, setPlayerAppearanceProfiles] = useState(() => {
    if (typeof window === 'undefined') {
      return [createDefaultPlayerAppearanceProfile()]
    }

    return readStoredPlayerAppearanceState(
      window.localStorage.getItem(PLAYER_APPEARANCE_PROFILES_STORAGE_KEY),
      window.localStorage.getItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY),
    ).profiles
  })
  const [activePlayerAppearanceProfileId, setActivePlayerAppearanceProfileId] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }

    return readStoredPlayerAppearanceState(
      window.localStorage.getItem(PLAYER_APPEARANCE_PROFILES_STORAGE_KEY),
      window.localStorage.getItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY),
    ).activeProfileId
  })
  const workspaceLayoutRef = useRef<WorkspaceLayoutHandle | null>(null)
  const previousLocaleRef = useRef<LocaleCode>(locale)

  const copy = editorCopy[locale]
  const desktopHost = canUseDesktopHost()
  const {
    workspaceStatus,
    resourcePreloadState,
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
  } = useMapWorkspace({
    copy,
    locale,
    desktopHost,
    setWorkspaceMode,
    getWorldAtlasViewLabel,
  })

  const {
    eventAssets,
    filteredEventAssets,
    eventAssetFilter,
    setEventAssetFilter,
    activeEventAssetId,
    activeEventAsset,
    parsedEventAsset,
    selectedEventKey,
    selectedEvent,
    selectedTimelineEntryId,
    setSelectedTimelineEntryId,
    timelineJumpRequestId,
    requestTimelineJump,
    clearTimelineJumpRequest,
    eventStatusMessage,
    handleOpenEventAsset,
    handleSelectEvent,
  } = useEventWorkspace({
    copy,
    locale,
    directoryInfo,
  })

  const moduleBlueprint = workspaceMode === 'map' || workspaceMode === 'events' ? undefined : copy.moduleBlueprints[workspaceMode]
  const viewMenuCopy = getViewMenuCopy(locale)
  const settingsMenuCopy = getSettingsMenuCopy(locale)
  const activeAccentPreset = ACCENT_PRESETS.find((preset) => preset.id === accentPresetId) ?? ACCENT_PRESETS[0]
  const activeAssetName = mapDocument?.name ?? activeAsset?.name
  const activeSceneLabel = workspaceMode === 'events' ? activeEventAsset?.name : activeAssetName
  const activePlayerAppearanceProfile =
    playerAppearanceProfiles.find((profile) => profile.id === activePlayerAppearanceProfileId) ?? playerAppearanceProfiles[0] ?? null

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = locale
  }, [locale, theme])

  useEffect(() => {
    const previousLocale = previousLocaleRef.current
    if (previousLocale === locale) {
      return
    }

    clearDesktopLocaleCache(previousLocale)
    clearLocalizedStageMetadataCache(previousLocale)
    clearMapViewportLocaleCache(previousLocale)
    previousLocaleRef.current = locale
  }, [locale])

  useEffect(() => {
    if (workspaceMode !== 'events' || !currentEventCommandId) {
      return
    }

    workspaceLayoutRef.current?.setPanelVisibility('diagnostics', true)
  }, [currentEventCommandId, workspaceMode])

  useEffect(() => {
    const root = document.documentElement
    const accent = activeAccentPreset.color
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-soft', rgbaFromHex(accent, theme === 'dark' ? 0.18 : 0.14))
    root.style.setProperty('--bg-active', theme === 'dark' ? rgbaFromHex(accent, 0.22) : rgbaFromHex(accent, 0.12))
    window.localStorage.setItem(ACCENT_STORAGE_KEY, activeAccentPreset.id)
  }, [activeAccentPreset.color, activeAccentPreset.id, theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(PLAYER_APPEARANCE_PROFILES_STORAGE_KEY, JSON.stringify(playerAppearanceProfiles))
    if (activePlayerAppearanceProfileId) {
      window.localStorage.setItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY, activePlayerAppearanceProfileId)
    } else {
      window.localStorage.removeItem(PLAYER_APPEARANCE_ACTIVE_PROFILE_STORAGE_KEY)
    }
  }, [activePlayerAppearanceProfileId, playerAppearanceProfiles])

  const openAppearanceWindow = useCallback(() => {
    setPlayerAppearanceWindowNonce((current) => current + 1)
    setPlayerAppearanceWindowOpen(true)
  }, [])

  const handleCreatePlayerAppearanceProfile = useCallback(() => {
    const nextProfile = createDefaultPlayerAppearanceProfile(locale === 'zh-CN' ? `玩家 ${playerAppearanceProfiles.length + 1}` : `Player ${playerAppearanceProfiles.length + 1}`)
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
    openAppearanceWindow()
  }, [locale, openAppearanceWindow, playerAppearanceProfiles.length])

  const handleDuplicatePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const nextProfile = clonePlayerAppearanceProfile(activePlayerAppearanceProfile)
    setPlayerAppearanceProfiles((current) => [...current, nextProfile])
    setActivePlayerAppearanceProfileId(nextProfile.id)
  }, [activePlayerAppearanceProfile])

  const handleDeletePlayerAppearanceProfile = useCallback(() => {
    if (!activePlayerAppearanceProfile) {
      return
    }

    const remainingProfiles = playerAppearanceProfiles.filter((profile) => profile.id !== activePlayerAppearanceProfile.id)
    if (remainingProfiles.length === 0) {
      const fallback = createDefaultPlayerAppearanceProfile(locale === 'zh-CN' ? '默认玩家' : 'Default Player')
      setPlayerAppearanceProfiles([fallback])
      setActivePlayerAppearanceProfileId(fallback.id)
      return
    }

    setPlayerAppearanceProfiles(remainingProfiles)
    setActivePlayerAppearanceProfileId(remainingProfiles[0]?.id ?? null)
  }, [activePlayerAppearanceProfile, locale, playerAppearanceProfiles])

  const handleChangePlayerAppearanceProfile = useCallback((nextProfile: Parameters<typeof sanitizePlayerAppearanceProfile>[0]) => {
    const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
    setPlayerAppearanceProfiles((current) => current.map((profile) => (profile.id === sanitized.id ? sanitized : profile)))
  }, [])

  const handleImportPlayerAppearanceProfile = useCallback(
    (nextProfile: PlayerAppearanceProfile) => {
      const sanitized = sanitizePlayerAppearanceProfile(nextProfile)
      setPlayerAppearanceProfiles((current) => [...current, sanitized])
      setActivePlayerAppearanceProfileId(sanitized.id)
      openAppearanceWindow()
    },
    [openAppearanceWindow],
  )

  const workspacePanels = buildWorkspacePanels({
    copy,
    locale,
    workspaceMode,
    desktopHost,
    gameDirectory,
    onGameDirectoryChange: setGameDirectory,
    onChooseDirectory: () => void handleChooseDirectory(),
    onUseKnownPath: () => void handleUseKnownPath(),
    onValidateOnly: () => void handleValidateOnly(),
    onScanAndOpenTown: () => void handleScanAndOpenTown(),
    directoryInfo,
    mapAssets,
    filteredAssets,
    activeMapId,
    activeAssetName,
    assetFilter,
    onAssetFilterChange: setAssetFilter,
    onOpenAsset: (asset) => {
      void openMap(asset)
    },
    workspaceTabs,
    activeTabId,
    onSelectWorkspaceTab: handleSelectWorkspaceTab,
    onCloseWorkspaceTab: handleCloseWorkspaceTab,
    onReorderWorkspaceTabs: handleReorderWorkspaceTabs,
    mapDocument,
    worldAtlasViews,
    activeWorldAtlasViewId,
    onSelectWorldAtlasView: handleSelectWorldAtlasView,
    onOpenAtlasTarget: handleOpenAtlasTarget,
    theme,
    accentColor: activeAccentPreset.color,
    visibleLayerIds,
    onToggleLayer: toggleLayer,
    onShowAllLayers: () => setAllLayers(true),
    onHideAllLayers: () => setAllLayers(false),
    visibleObjectGroupIds,
    onToggleObjectGroup: toggleObjectGroup,
    onShowAllObjectGroups: () => setAllObjectGroups(true),
    onHideAllObjectGroups: () => setAllObjectGroups(false),
    focusedObjectTarget,
    onFocusObject: focusObject,
    onHoverChange: setHoverInfo,
    workspaceStatus,
    resourcePreloadState,
    moduleBlueprint,
    eventAssets,
    filteredEventAssets,
    activeEventAssetId,
    eventAssetFilter,
    onEventAssetFilterChange: setEventAssetFilter,
    onOpenEventAsset: handleOpenEventAsset,
    parsedEventAsset,
    selectedEventKey,
    selectedEvent,
    selectedTimelineEntryId,
    timelineJumpRequestId,
    currentEventCommandId,
    eventStatusMessage,
    onSelectEvent: handleSelectEvent,
    onSelectTimelineEntry: setSelectedTimelineEntryId,
    onActivateTimelineEntry: requestTimelineJump,
    onTimelineJumpHandled: clearTimelineJumpRequest,
    activeSceneLabel,
    onPlaybackCommandChange: setCurrentEventCommandId,
    activePlayerAppearanceProfile,
    onOpenPlayerAppearanceWindow: openAppearanceWindow,
  })

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

      <PlayerAppearanceWindow
        key={`player-appearance:${playerAppearanceWindowNonce}`}
        open={playerAppearanceWindowOpen}
        locale={locale}
        rootPath={directoryInfo?.rootPath ?? null}
        profiles={playerAppearanceProfiles}
        activeProfileId={activePlayerAppearanceProfileId}
        onSelectProfile={setActivePlayerAppearanceProfileId}
        onCreateProfile={handleCreatePlayerAppearanceProfile}
        onDuplicateProfile={handleDuplicatePlayerAppearanceProfile}
        onDeleteProfile={handleDeletePlayerAppearanceProfile}
        onImportProfile={handleImportPlayerAppearanceProfile}
        onChangeProfile={handleChangePlayerAppearanceProfile}
        onClose={() => setPlayerAppearanceWindowOpen(false)}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceLayout
          key={`${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`}
          ref={workspaceLayoutRef}
          storageKey={`modforge:workspace-layout:${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`}
          panels={workspacePanels}
          onLayoutMetaChange={handleLayoutMetaChange}
        />
      </div>

      {import.meta.env.DEV ? (
        <DevDebugOverlay
          workspaceMode={workspaceMode}
          mapName={activeAssetName ?? worldAtlasDocument?.name ?? null}
          eventName={selectedEvent?.eventId ?? null}
          currentEventCommandId={currentEventCommandId}
          actorCount={selectedEvent?.scene.actors.length ?? 0}
        />
      ) : null}

      <StatusBar
        copy={copy}
        workspaceMode={workspaceMode}
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
