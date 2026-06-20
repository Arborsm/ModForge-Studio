import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { LocaleCode, ThemeMode, WorkspaceMode } from '@locales/api'
import { useModWorkspaceCopy } from '@locales/provider'
import { useEventWorkspace } from '../workspaces/event-stage'
import { useCharacterWorkspace } from '../workspaces/character'
import { useBuildingWorkspace } from '../workspaces/building/state/useBuildingWorkspace'
import { useItemWorkspace } from '../workspaces/item'
import { buildCoreWorkspacePanels } from '../model/workspace-panels/core'
import { buildItemsWorkspacePanels } from '../model/workspace-panels/items'
import type { PlayerAppearanceProfile } from '@entities/event'
import type { EventScript, ParsedEventAsset } from '@entities/event'
import type { GameDirectoryInfo, ResourcePreloadState, WorkspaceLayoutHandle, WorkspacePanelMeta } from '@shared/contracts'
import type { WorkspaceStatus, WorkspaceStoredState } from '@shared/contracts'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { WorkbenchLayoutHost } from './WorkbenchLayoutHost'
import type { MapPreviewStatusSnapshot } from './WorkbenchMapPreviewRuntime'
import { createPreviewPanelDefaults } from './workbenchPreviewPanelDefaults'

const EMPTY_RESOURCE_PRELOAD_STATE: ResourcePreloadState = {
  active: false,
  message: '',
  completed: 0,
  total: 0,
  currentLabel: '',
}

type PreviewStatusSnapshot = {
  workspaceStatus: WorkspaceStatus
  resourcePreloadState: ResourcePreloadState
  eventCount: number
  eventStatusMessage: string
  characterCount: number
  characterStatusMessage: string
  buildingBrowserCount: number
  buildingStatusMessage: string
  itemCount: number
  itemStatusMessage: string
  selectedEvent: EventScript | null
  parsedEventAsset: ParsedEventAsset | null
  selectedTimelineEntryId: string
  currentEventCommandId: string | null
}

type WorkbenchPreviewRuntimeProps = {
  copy: (typeof import('@locales/api').editorCopy)[LocaleCode]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  desktopHost: boolean
  workspaceMode: WorkspaceMode
  directoryInfo: GameDirectoryInfo | null
  heavyWorkspaceReady: boolean
  workspaceLayoutRef: RefObject<WorkspaceLayoutHandle | null>
  workspaceLayoutStorageKey: string
  workspaceLayouts: Record<string, WorkspaceStoredState>
  playerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
  onPersistStateChange: (storageKey: string, state: WorkspaceStoredState) => void
  onLayoutMetaChange: (payload: { panelItems: WorkspacePanelMeta[]; presetNames: string[] }) => void
  onDirectoryInvalid: (message: string) => void
  onMapStatusSnapshotChange: Dispatch<SetStateAction<MapPreviewStatusSnapshot>>
  onStatusSnapshotChange: Dispatch<SetStateAction<PreviewStatusSnapshot>>
}

function usePublishPreviewSnapshot(
  snapshot: PreviewStatusSnapshot,
  onStatusSnapshotChange: Dispatch<SetStateAction<PreviewStatusSnapshot>>,
) {
  useEffect(() => {
    onStatusSnapshotChange((current) => {
      if (
        current.workspaceStatus.tone === snapshot.workspaceStatus.tone &&
        current.workspaceStatus.message === snapshot.workspaceStatus.message &&
        current.resourcePreloadState === snapshot.resourcePreloadState &&
        current.eventCount === snapshot.eventCount &&
        current.eventStatusMessage === snapshot.eventStatusMessage &&
        current.characterCount === snapshot.characterCount &&
        current.characterStatusMessage === snapshot.characterStatusMessage &&
        current.buildingBrowserCount === snapshot.buildingBrowserCount &&
        current.buildingStatusMessage === snapshot.buildingStatusMessage &&
        current.itemCount === snapshot.itemCount &&
        current.itemStatusMessage === snapshot.itemStatusMessage &&
        current.selectedEvent === snapshot.selectedEvent &&
        current.parsedEventAsset === snapshot.parsedEventAsset &&
        current.selectedTimelineEntryId === snapshot.selectedTimelineEntryId &&
        current.currentEventCommandId === snapshot.currentEventCommandId
      ) {
        return current
      }

      return snapshot
    })
  }, [onStatusSnapshotChange, snapshot])
}

function EventsPreviewRuntime({
  copy,
  locale,
  theme,
  accentColor,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
  onPersistStateChange,
  onLayoutMetaChange,
  onStatusSnapshotChange,
}: Omit<WorkbenchPreviewRuntimeProps, 'desktopHost' | 'workspaceMode' | 'onDirectoryInvalid' | 'onMapStatusSnapshotChange'>) {
  const modWorkspaceCopy = useModWorkspaceCopy()
  const eventWorkspace = useEventWorkspace({
    copy,
    locale,
    directoryInfo,
  })
  const [currentEventCommandId, setCurrentEventCommandId] = useState<string | null>(null)
  const [stageSeek, setStageSeek] = useState<((entryId: string) => void) | null>(null)
  const registerStageSeek = useCallback((seekTimelineEntry: (entryId: string) => void) => {
    setStageSeek(() => seekTimelineEntry)
    return () => setStageSeek(null)
  }, [])
  const handleActivateTimelineEntry = useCallback(
    (entryId: string) => {
      stageSeek?.(entryId)
    },
    [stageSeek],
  )

  useEffect(() => {
    if (!currentEventCommandId) {
      return
    }

    workspaceLayoutRef.current?.setPanelVisibility('diagnostics', true)
  }, [currentEventCommandId, workspaceLayoutRef])

  const snapshot = useMemo<PreviewStatusSnapshot>(
    () => ({
      workspaceStatus: { tone: 'idle', message: eventWorkspace.eventStatusMessage },
      resourcePreloadState: EMPTY_RESOURCE_PRELOAD_STATE,
      eventCount: eventWorkspace.eventAssets.length,
      eventStatusMessage: eventWorkspace.eventStatusMessage,
      characterCount: 0,
      characterStatusMessage: '',
      buildingBrowserCount: 0,
      buildingStatusMessage: '',
      itemCount: 0,
      itemStatusMessage: '',
      selectedEvent: eventWorkspace.selectedEvent,
      parsedEventAsset: eventWorkspace.parsedEventAsset,
      selectedTimelineEntryId: eventWorkspace.selectedTimelineEntryId,
      currentEventCommandId,
    }),
    [
      currentEventCommandId,
      eventWorkspace.eventAssets.length,
      eventWorkspace.eventStatusMessage,
      eventWorkspace.parsedEventAsset,
      eventWorkspace.selectedEvent,
      eventWorkspace.selectedTimelineEntryId,
    ],
  )
  usePublishPreviewSnapshot(snapshot, onStatusSnapshotChange)

  const workspacePanels = useMemo(
    () =>
      buildCoreWorkspacePanels({
        ...createPreviewPanelDefaults({
          copy,
          modWorkspaceCopy,
          locale,
          workspaceMode: 'events',
          directoryInfo,
          theme,
          accentColor,
          heavyWorkspaceReady,
        }),
        eventAssets: eventWorkspace.eventAssets,
        filteredEventAssets: eventWorkspace.filteredEventAssets,
        eventBrowserSourceMode: eventWorkspace.browserSourceMode,
        onEventBrowserSourceModeChange: eventWorkspace.setBrowserSourceMode,
        modEventGroups: eventWorkspace.modEventGroups,
        activeModEventSelectionId: eventWorkspace.activeModEventSelectionId,
        activeEventModSources: eventWorkspace.activeEventModSources,
        activeEventAssetId: eventWorkspace.activeEventAssetId,
        eventAssetFilter: eventWorkspace.eventAssetFilter,
        onEventAssetFilterChange: eventWorkspace.setEventAssetFilter,
        onOpenEventAsset: eventWorkspace.handleOpenEventAsset,
        onOpenModEventAsset: eventWorkspace.handleOpenModEventAsset,
        parsedEventAsset: eventWorkspace.parsedEventAsset,
        selectedEventKey: eventWorkspace.selectedEventKey,
        selectedEvent: eventWorkspace.selectedEvent,
        selectedTimelineEntryId: eventWorkspace.selectedTimelineEntryId,
        currentEventCommandId,
        eventStatusMessage: eventWorkspace.eventStatusMessage,
        onSelectEvent: eventWorkspace.handleSelectEvent,
        onSelectTimelineEntry: eventWorkspace.setSelectedTimelineEntryId,
        onActivateTimelineEntry: handleActivateTimelineEntry,
        onPlaybackCommandChange: setCurrentEventCommandId,
        onStageSeekReady: registerStageSeek,
        activePlayerAppearanceProfile: playerAppearanceProfile,
        onOpenPlayerAppearanceWindow,
      }),
    [
      accentColor,
      copy,
      currentEventCommandId,
      directoryInfo,
      eventWorkspace,
      handleActivateTimelineEntry,
      heavyWorkspaceReady,
      locale,
      modWorkspaceCopy,
      onOpenPlayerAppearanceWindow,
      playerAppearanceProfile,
      registerStageSeek,
      theme,
    ],
  ) satisfies WorkspacePanelConfig[]

  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={workspaceLayoutRef}
      workspaceLayoutStorageKey={workspaceLayoutStorageKey}
      workspaceLayouts={workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={onPersistStateChange}
      onLayoutMetaChange={onLayoutMetaChange}
    />
  )
}

function CharactersPreviewRuntime({
  copy,
  locale,
  theme,
  accentColor,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  onPersistStateChange,
  onLayoutMetaChange,
  onStatusSnapshotChange,
}: Omit<
  WorkbenchPreviewRuntimeProps,
  | 'desktopHost'
  | 'workspaceMode'
  | 'onDirectoryInvalid'
  | 'onMapStatusSnapshotChange'
  | 'playerAppearanceProfile'
  | 'onOpenPlayerAppearanceWindow'
>) {
  const modWorkspaceCopy = useModWorkspaceCopy()
  const characterWorkspace = useCharacterWorkspace({
    directoryInfo,
    locale,
    copy: copy.charactersPanel,
    enableVisualAssets: heavyWorkspaceReady,
  })

  const snapshot = useMemo<PreviewStatusSnapshot>(
    () => ({
      workspaceStatus: { tone: 'idle', message: characterWorkspace.characterStatusMessage },
      resourcePreloadState: EMPTY_RESOURCE_PRELOAD_STATE,
      eventCount: 0,
      eventStatusMessage: '',
      characterCount: characterWorkspace.characters.length,
      characterStatusMessage: characterWorkspace.characterStatusMessage,
      buildingBrowserCount: 0,
      buildingStatusMessage: '',
      itemCount: 0,
      itemStatusMessage: '',
      selectedEvent: null,
      parsedEventAsset: null,
      selectedTimelineEntryId: '',
      currentEventCommandId: null,
    }),
    [characterWorkspace.characterStatusMessage, characterWorkspace.characters.length],
  )
  usePublishPreviewSnapshot(snapshot, onStatusSnapshotChange)

  const workspacePanels = useMemo(
    () =>
      buildCoreWorkspacePanels({
        ...createPreviewPanelDefaults({
          copy,
          modWorkspaceCopy,
          locale,
          workspaceMode: 'characters',
          directoryInfo,
          theme,
          accentColor,
          heavyWorkspaceReady,
        }),
        characters: characterWorkspace.characters,
        filteredCharacters: characterWorkspace.filteredCharacters,
        characterBrowserSourceMode: characterWorkspace.browserSourceMode,
        onCharacterBrowserSourceModeChange: characterWorkspace.setBrowserSourceMode,
        modCharacterGroups: characterWorkspace.modCharacterGroups,
        activeModCharacterSelectionId: characterWorkspace.activeModCharacterSelectionId,
        activeCharacterModSources: characterWorkspace.activeCharacterModSources,
        activeCharacterId: characterWorkspace.activeCharacterId,
        activeCharacter: characterWorkspace.activeCharacter,
        activeCharacterVariant: characterWorkspace.activeVariant,
        characterFilter: characterWorkspace.characterFilter,
        characterStatusMessage: characterWorkspace.characterStatusMessage,
        activeCharacterAssetState: characterWorkspace.assetState,
        onCharacterFilterChange: characterWorkspace.setCharacterFilter,
        onSelectCharacter: characterWorkspace.handleSelectCharacter,
        onSelectModCharacter: characterWorkspace.handleSelectModCharacter,
        onSelectCharacterVariant: characterWorkspace.handleSelectVariant,
      }),
    [accentColor, characterWorkspace, copy, directoryInfo, heavyWorkspaceReady, locale, modWorkspaceCopy, theme],
  ) satisfies WorkspacePanelConfig[]

  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={workspaceLayoutRef}
      workspaceLayoutStorageKey={workspaceLayoutStorageKey}
      workspaceLayouts={workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={onPersistStateChange}
      onLayoutMetaChange={onLayoutMetaChange}
    />
  )
}

function BuildingsPreviewRuntime({
  copy,
  locale,
  theme,
  accentColor,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  onPersistStateChange,
  onLayoutMetaChange,
  onStatusSnapshotChange,
}: Omit<
  WorkbenchPreviewRuntimeProps,
  | 'desktopHost'
  | 'workspaceMode'
  | 'onDirectoryInvalid'
  | 'onMapStatusSnapshotChange'
  | 'playerAppearanceProfile'
  | 'onOpenPlayerAppearanceWindow'
>) {
  const modWorkspaceCopy = useModWorkspaceCopy()
  const buildingWorkspace = useBuildingWorkspace({
    directoryInfo,
    locale,
    copy: copy.buildingsPanel,
  })

  const buildingBrowserCount = buildingWorkspace.constructibleGroups.length + buildingWorkspace.worldBuildings.length
  const snapshot = useMemo<PreviewStatusSnapshot>(
    () => ({
      workspaceStatus: { tone: 'idle', message: buildingWorkspace.buildingStatusMessage },
      resourcePreloadState: EMPTY_RESOURCE_PRELOAD_STATE,
      eventCount: 0,
      eventStatusMessage: '',
      characterCount: 0,
      characterStatusMessage: '',
      buildingBrowserCount,
      buildingStatusMessage: buildingWorkspace.buildingStatusMessage,
      itemCount: 0,
      itemStatusMessage: '',
      selectedEvent: null,
      parsedEventAsset: null,
      selectedTimelineEntryId: '',
      currentEventCommandId: null,
    }),
    [buildingBrowserCount, buildingWorkspace.buildingStatusMessage],
  )
  usePublishPreviewSnapshot(snapshot, onStatusSnapshotChange)

  const workspacePanels = useMemo(
    () =>
      buildCoreWorkspacePanels({
        ...createPreviewPanelDefaults({
          copy,
          modWorkspaceCopy,
          locale,
          workspaceMode: 'buildings',
          directoryInfo,
          theme,
          accentColor,
          heavyWorkspaceReady,
        }),
        constructibleGroups: buildingWorkspace.constructibleGroups,
        filteredConstructibleGroups: buildingWorkspace.filteredConstructibleGroups,
        worldBuildings: buildingWorkspace.worldBuildings,
        filteredWorldBuildings: buildingWorkspace.filteredWorldBuildings,
        buildingBrowserSourceMode: buildingWorkspace.browserSourceMode,
        onBuildingBrowserSourceModeChange: buildingWorkspace.setBrowserSourceMode,
        modBuildingGroups: buildingWorkspace.modBuildingGroups,
        activeModBuildingSelectionId: buildingWorkspace.activeModBuildingSelectionId,
        activeBuildingModSources: buildingWorkspace.activeBuildingModSources,
        activeBuildingId: buildingWorkspace.activeBuildingId,
        activeBuilding: buildingWorkspace.activeBuilding,
        activeUpgradeChain: buildingWorkspace.activeUpgradeChain,
        buildingFilter: buildingWorkspace.buildingFilter,
        buildingStatusMessage: buildingWorkspace.buildingStatusMessage,
        activeBuildingTextureState: buildingWorkspace.activeTextureState,
        activeBuildingChainTextureStates: buildingWorkspace.activeChainTextureStates,
        activeBuildingIndoorMapDocument: buildingWorkspace.activeIndoorMapDocument,
        activeBuildingIndoorMapPath: buildingWorkspace.activeIndoorMapPath,
        activeBuildingIndoorMapMessage: buildingWorkspace.activeIndoorMapMessage,
        activeBuildingExteriorMapDocument: buildingWorkspace.activeExteriorMapDocument,
        activeBuildingExteriorMapPath: buildingWorkspace.activeExteriorMapPath,
        activeBuildingExteriorMapMessage: buildingWorkspace.activeExteriorMapMessage,
        activeBuildingExteriorFocusPoint: buildingWorkspace.activeExteriorFocusPoint,
        buildingSpringObjectsState: buildingWorkspace.springObjectsState,
        onBuildingFilterChange: buildingWorkspace.setBuildingFilter,
        onSelectBuilding: buildingWorkspace.handleSelectBuilding,
        onSelectModBuilding: buildingWorkspace.handleSelectModBuilding,
      }),
    [accentColor, buildingWorkspace, copy, directoryInfo, heavyWorkspaceReady, locale, modWorkspaceCopy, theme],
  ) satisfies WorkspacePanelConfig[]

  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={workspaceLayoutRef}
      workspaceLayoutStorageKey={workspaceLayoutStorageKey}
      workspaceLayouts={workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={onPersistStateChange}
      onLayoutMetaChange={onLayoutMetaChange}
    />
  )
}

function ItemsPreviewRuntime({
  copy,
  locale,
  theme,
  accentColor,
  directoryInfo,
  heavyWorkspaceReady,
  workspaceLayoutRef,
  workspaceLayoutStorageKey,
  workspaceLayouts,
  onPersistStateChange,
  onLayoutMetaChange,
  onStatusSnapshotChange,
}: Omit<
  WorkbenchPreviewRuntimeProps,
  | 'desktopHost'
  | 'workspaceMode'
  | 'onDirectoryInvalid'
  | 'onMapStatusSnapshotChange'
  | 'playerAppearanceProfile'
  | 'onOpenPlayerAppearanceWindow'
>) {
  const modWorkspaceCopy = useModWorkspaceCopy()
  const itemWorkspace = useItemWorkspace({
    directoryInfo,
    locale,
    copy: copy.itemsPanel,
  })

  const snapshot = useMemo<PreviewStatusSnapshot>(
    () => ({
      workspaceStatus: { tone: 'idle', message: itemWorkspace.itemStatusMessage },
      resourcePreloadState: EMPTY_RESOURCE_PRELOAD_STATE,
      eventCount: 0,
      eventStatusMessage: '',
      characterCount: 0,
      characterStatusMessage: '',
      buildingBrowserCount: 0,
      buildingStatusMessage: '',
      itemCount: itemWorkspace.items.length,
      itemStatusMessage: itemWorkspace.itemStatusMessage,
      selectedEvent: null,
      parsedEventAsset: null,
      selectedTimelineEntryId: '',
      currentEventCommandId: null,
    }),
    [itemWorkspace.itemStatusMessage, itemWorkspace.items.length],
  )
  usePublishPreviewSnapshot(snapshot, onStatusSnapshotChange)

  const workspacePanels = useMemo(
    () =>
      buildItemsWorkspacePanels({
        ...createPreviewPanelDefaults({
          copy,
          modWorkspaceCopy,
          locale,
          workspaceMode: 'items',
          directoryInfo,
          theme,
          accentColor,
          heavyWorkspaceReady,
        }),
        items: itemWorkspace.items,
        filteredItems: itemWorkspace.filteredItems,
        itemBrowserSourceMode: itemWorkspace.browserSourceMode,
        onItemBrowserSourceModeChange: itemWorkspace.setBrowserSourceMode,
        modItemGroups: itemWorkspace.modItemGroups,
        activeModItemSelectionId: itemWorkspace.activeModItemSelectionId,
        activeItemModSources: itemWorkspace.activeItemModSources,
        activeItemId: itemWorkspace.activeItemId,
        activeItem: itemWorkspace.activeItem,
        itemLookup: itemWorkspace.itemLookup,
        itemFilter: itemWorkspace.itemFilter,
        itemStatusMessage: itemWorkspace.itemStatusMessage,
        itemTextureStatesByAssetName: itemWorkspace.textureStatesByAssetName,
        ensureItemTextureAssetStates: itemWorkspace.ensureTextureAssetStates,
        onItemFilterChange: itemWorkspace.setItemFilter,
        onSelectItem: itemWorkspace.handleSelectItem,
        onSelectModItem: itemWorkspace.handleSelectModItem,
      }),
    [accentColor, copy, directoryInfo, heavyWorkspaceReady, itemWorkspace, locale, modWorkspaceCopy, theme],
  ) satisfies WorkspacePanelConfig[]

  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={workspaceLayoutRef}
      workspaceLayoutStorageKey={workspaceLayoutStorageKey}
      workspaceLayouts={workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={onPersistStateChange}
      onLayoutMetaChange={onLayoutMetaChange}
    />
  )
}

/** Dispatches preview workspaces so inactive preview hooks do not mount or scan. */
export function WorkbenchPreviewRuntime(props: WorkbenchPreviewRuntimeProps) {
  if (props.workspaceMode === 'map') {
    return null
  }

  if (props.workspaceMode === 'events') {
    return <EventsPreviewRuntime {...props} />
  }

  if (props.workspaceMode === 'characters') {
    return <CharactersPreviewRuntime {...props} />
  }

  if (props.workspaceMode === 'buildings') {
    return <BuildingsPreviewRuntime {...props} />
  }

  if (props.workspaceMode === 'items') {
    return <ItemsPreviewRuntime {...props} />
  }

  return null
}

export type { PreviewStatusSnapshot }
