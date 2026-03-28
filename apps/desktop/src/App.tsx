import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DevDebugOverlay } from './components/DevDebugOverlay'
import InitializationOverlay from './components/InitializationOverlay'
import StatusBar from './components/StatusBar'
import TopMenuBar from './components/TopMenuBar'
import { WorkspaceLayout, type WorkspaceLayoutHandle, type WorkspacePanelMeta } from './components/WorkspaceLayout'
import {
  canUseDesktopHost,
  clearDesktopLocaleCache,
  closeCurrentWindow,
  listKnownGameDirectories,
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
  RECENT_GAME_DIRECTORIES_STORAGE_KEY,
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

const SettingsWindow = lazy(() => import('./components/SettingsWindow'))
const PlayerAppearanceWindow = lazy(() => import('./components/PlayerAppearanceWindow'))

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
  const [storedRecentGameDirectories] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(RECENT_GAME_DIRECTORIES_STORAGE_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
    } catch {
      return []
    }
  })
  const [knownGameDirectories, setKnownGameDirectories] = useState<string[]>([])
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
  const activePlayerAppearanceProfile =
    playerAppearanceProfiles.find((profile) => profile.id === activePlayerAppearanceProfileId) ?? playerAppearanceProfiles[0] ?? null
  const needsInitialization = !directoryInfo
  const interactionLocked = resourcePreloadState.active
  const recentGameDirectories = useMemo(() => {
    const currentRoot = directoryInfo?.rootPath
    if (!currentRoot) {
      return storedRecentGameDirectories
    }

    return [currentRoot, ...storedRecentGameDirectories.filter((path) => path !== currentRoot)].slice(0, 6)
  }, [directoryInfo?.rootPath, storedRecentGameDirectories])

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

    window.localStorage.setItem(RECENT_GAME_DIRECTORIES_STORAGE_KEY, JSON.stringify(recentGameDirectories))
  }, [recentGameDirectories])

  useEffect(() => {
    if (!desktopHost) {
      return
    }

    let disposed = false

    void listKnownGameDirectories()
      .then((paths) => {
        if (!disposed) {
          setKnownGameDirectories(paths)
        }
      })
      .catch(() => {
        if (!disposed) {
          setKnownGameDirectories([])
        }
      })

    return () => {
      disposed = true
    }
  }, [desktopHost])

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
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]"
      aria-busy={interactionLocked}
    >
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

      {settingsWindowOpen ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      {playerAppearanceWindowOpen ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceLayout
          key={`${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`}
          ref={workspaceLayoutRef}
          storageKey={`modforge:workspace-layout:${WORKSPACE_LAYOUT_VERSION}:${workspaceMode}`}
          panels={workspacePanels}
          onLayoutMetaChange={handleLayoutMetaChange}
        />
      </div>

      {needsInitialization && !interactionLocked ? (
        <InitializationOverlay
          copy={copy}
          desktopHost={desktopHost}
          gameDirectory={gameDirectory}
          recentDirectories={recentGameDirectories}
          detectedDirectories={knownGameDirectories}
          onGameDirectoryChange={setGameDirectory}
          onSelectDirectory={setGameDirectory}
          onChooseDirectory={() => void handleChooseDirectory()}
          onUseKnownPath={() => void handleUseKnownPath()}
          onValidateOnly={() => void handleValidateOnly()}
          onScanAndOpenTown={() => void handleScanAndOpenTown()}
        />
      ) : null}

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

      {interactionLocked ? (
        <div className="absolute inset-0 z-50 flex cursor-wait items-center justify-center bg-[color-mix(in_srgb,var(--bg-app)_64%,transparent)] backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] px-6 py-5 shadow-[var(--shadow-panel)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              {copy.messages.preloadingResources}
            </p>
            <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">{resourcePreloadState.message}</p>
            {resourcePreloadState.currentLabel ? (
              <p className="mt-2 truncate text-sm text-[var(--text-secondary)]">{resourcePreloadState.currentLabel}</p>
            ) : null}
            <div className="mt-4 h-2 rounded-full bg-[var(--bg-panel-muted)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                style={{
                  width:
                    resourcePreloadState.total > 0
                      ? `${Math.max(6, (resourcePreloadState.completed / resourcePreloadState.total) * 100)}%`
                      : '18%',
                }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>{resourcePreloadState.total > 0 ? `${resourcePreloadState.completed}/${resourcePreloadState.total}` : '...'}</span>
              <span>{resourcePreloadState.total > 0 ? `${Math.round((resourcePreloadState.completed / resourcePreloadState.total) * 100)}%` : ''}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
