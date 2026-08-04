import type { EventAssetSummary, GameDirectoryInfo, MapAssetSummary } from '@entities/game/api'
import type { FocusedMapObjectTarget, TileHoverInfo, ViewportWorldPoint } from '@entities/map'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, ConstructibleBuildingGroup } from '@entities/building'
import type { CharacterAppearanceVariant, CharacterVisualAssetState, CharacterWorkspaceEntry } from '@entities/character'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from '@entities/item'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup, ModSourceEntry } from '@pages/workbench/workspaces/mod/state/browser'
import type { EditorCopy, LocaleCode, ThemeMode } from '@locales'
import type { EventScript, ParsedEventAsset } from '@entities/event'
import type { EffectAssetState, PlayerAppearanceProfile } from '@entities/event'
import type { MapDocument } from '@entities/map'
import type { ObjectLightItemIndex } from '@entities/map'
import type { StageWorldOverlaySprite } from '@entities/map'
import type { WorldAtlasView } from '@entities/map'

export type BuildWorkspacePanelsOptions = {
  copy: EditorCopy
  locale: LocaleCode
  gameRootPath: string | null
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
  mapBrowserSourceMode: BrowserSourceMode
  onMapBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modMapGroups: ModBrowserGroup<MapAssetSummary>[]
  activeModMapSelectionId: string | null
  activeMapModSources: ModSourceEntry[]
  activeMapId: string | null
  activeAssetName?: string
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: MapAssetSummary) => void
  onOpenModAsset: (entry: ModBrowserEntry<MapAssetSummary>) => void
  workspaceTabs: Array<{
    id: string
    title: string
    pathLabel: string
    closable: boolean
    pinned: boolean
  }>
  activeTabId: string
  onSelectWorkspaceTab: (tabId: string) => void
  onCloseWorkspaceTab: (tabId: string) => void
  onReorderWorkspaceTabs: (sourceTabId: string, targetTabId: string) => void
  mapDocument: MapDocument | null
  worldAtlasViews: WorldAtlasView[]
  activeWorldAtlasViewId: WorldAtlasView['id'] | null
  onSelectWorldAtlasView: (viewId: WorldAtlasView['id']) => void
  onOpenAtlasTarget: (targetMapName: string) => void
  theme: ThemeMode
  accentColor: string
  visibleLayerIds: number[]
  onToggleLayer: (id: number) => void
  onShowAllLayers: () => void
  onHideAllLayers: () => void
  visibleObjectGroupIds: number[]
  onToggleObjectGroup: (id: number) => void
  onShowAllObjectGroups: () => void
  onHideAllObjectGroups: () => void
  focusedObjectTarget: FocusedMapObjectTarget | null
  showGameWorldAdditions: boolean
  onToggleGameWorldAdditions: () => void
  worldOverlaySprites: StageWorldOverlaySprite[]
  worldOverlayTextureAssets: Record<string, EffectAssetState>
  /** Data/BigCraftables + Data/Furniture lookup for object-layer lamp markers in the lighting preview. */
  objectLightIndex: ObjectLightItemIndex | null
  onFocusObject: (groupId: number, objectId: number) => void
  onHoverChange: (hoverInfo: TileHoverInfo | null) => void
  workspaceStatus: {
    tone: 'idle' | 'working' | 'ready' | 'error'
    message: string
  }
  eventAssets: EventAssetSummary[]
  filteredEventAssets: EventAssetSummary[]
  eventBrowserSourceMode: BrowserSourceMode
  onEventBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modEventGroups: ModBrowserGroup<EventAssetSummary>[]
  activeModEventSelectionId: string | null
  activeEventModSources: ModSourceEntry[]
  activeEventAssetId: string | null
  eventAssetFilter: string
  onEventAssetFilterChange: (value: string) => void
  onOpenEventAsset: (asset: EventAssetSummary) => void
  onOpenModEventAsset: (entry: ModBrowserEntry<EventAssetSummary>) => void
  parsedEventAsset: ParsedEventAsset | null
  selectedEventKey: string | null
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
  currentEventCommandId: string | null
  eventStatusMessage: string
  onSelectEvent: (eventKey: string) => void
  onSelectTimelineEntry: (entryId: string) => void
  onActivateTimelineEntry: (entryId: string) => void
  onPlaybackCommandChange: (commandId: string | null) => void
  onStageSeekReady: (seekTimelineEntry: (entryId: string) => void) => () => void
  activePlayerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
  characters: CharacterWorkspaceEntry[]
  filteredCharacters: CharacterWorkspaceEntry[]
  characterBrowserSourceMode: BrowserSourceMode
  onCharacterBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modCharacterGroups: ModBrowserGroup<CharacterWorkspaceEntry>[]
  activeModCharacterSelectionId: string | null
  activeCharacterModSources: ModSourceEntry[]
  activeCharacterId: string | null
  activeCharacter: CharacterWorkspaceEntry | null
  activeCharacterVariant: CharacterAppearanceVariant | null
  characterFilter: string
  characterStatusMessage: string
  activeCharacterAssetState: CharacterVisualAssetState
  activeCharacterAssetLoading: boolean
  onCharacterFilterChange: (value: string) => void
  onSelectCharacter: (characterKey: string) => void
  onSelectModCharacter: (entry: ModBrowserEntry<CharacterWorkspaceEntry>) => void
  onSelectCharacterVariant: (variant: CharacterAppearanceVariant) => void
  /** Hands an NPC key to the character authoring module and navigates there. */
  onOpenCharacterInAuthoring: (characterKey: string) => void
  constructibleGroups: ConstructibleBuildingGroup[]
  filteredConstructibleGroups: ConstructibleBuildingGroup[]
  worldBuildings: BuildingWorkspaceEntry[]
  filteredWorldBuildings: BuildingWorkspaceEntry[]
  buildingBrowserSourceMode: BrowserSourceMode
  onBuildingBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modBuildingGroups: ModBrowserGroup<BuildingWorkspaceEntry>[]
  activeModBuildingSelectionId: string | null
  activeBuildingModSources: ModSourceEntry[]
  activeBuildingId: string | null
  activeBuilding: BuildingWorkspaceEntry | null
  activeUpgradeChain: BuildingWorkspaceEntry[]
  buildingFilter: string
  buildingStatusMessage: string
  activeBuildingTextureState: BuildingTextureAssetState | null
  activeBuildingChainTextureStates: Record<string, BuildingTextureAssetState>
  activeBuildingIndoorMapDocument: MapDocument | null
  activeBuildingIndoorMapPath: string | null
  activeBuildingIndoorMapMessage: string
  activeBuildingExteriorMapDocument: MapDocument | null
  activeBuildingExteriorMapPath: string | null
  activeBuildingExteriorMapMessage: string
  activeBuildingExteriorFocusPoint: ViewportWorldPoint | null
  buildingSpringObjectsState: BuildingTextureAssetState
  onBuildingFilterChange: (value: string) => void
  onSelectBuilding: (buildingKey: string) => void
  onSelectModBuilding: (entry: ModBrowserEntry<BuildingWorkspaceEntry>) => void
  /** Hands a building key to the building authoring module and navigates there. */
  onOpenBuildingInAuthoring: (buildingKey: string) => void
  items: ItemWorkspaceEntry[]
  filteredItems: ItemWorkspaceEntry[]
  itemBrowserSourceMode: BrowserSourceMode
  onItemBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[]
  activeModItemSelectionId: string | null
  activeItemModSources: ModSourceEntry[]
  activeItemId: string | null
  activeItem: ItemWorkspaceEntry | null
  itemLookup: Map<string, ItemWorkspaceEntry>
  itemFilter: string
  itemStatusMessage: string
  itemTextureStatesByAssetName: Record<string, ItemTextureAssetState>
  ensureItemTextureAssetStates: (assetNames: string[]) => void
  onItemFilterChange: (value: string) => void
  onSelectItem: (itemKey: string) => void
  onSelectModItem: (entry: ModBrowserEntry<ItemWorkspaceEntry>) => void
  onOpenItemInAuthoring: (item: ItemWorkspaceEntry) => void
  heavyWorkspaceReady: boolean
}

export type BuildMapPanelsOptions = Pick<
  BuildWorkspacePanelsOptions,
  | 'copy'
  | 'theme'
  | 'accentColor'
  | 'mapAssets'
  | 'filteredAssets'
  | 'mapBrowserSourceMode'
  | 'onMapBrowserSourceModeChange'
  | 'modMapGroups'
  | 'activeModMapSelectionId'
  | 'activeMapModSources'
  | 'activeMapId'
  | 'assetFilter'
  | 'onAssetFilterChange'
  | 'onOpenAsset'
  | 'onOpenModAsset'
  | 'workspaceTabs'
  | 'activeTabId'
  | 'onSelectWorkspaceTab'
  | 'onCloseWorkspaceTab'
  | 'onReorderWorkspaceTabs'
  | 'mapDocument'
  | 'worldAtlasViews'
  | 'activeWorldAtlasViewId'
  | 'onSelectWorldAtlasView'
  | 'onOpenAtlasTarget'
  | 'visibleLayerIds'
  | 'onToggleLayer'
  | 'onShowAllLayers'
  | 'onHideAllLayers'
  | 'visibleObjectGroupIds'
  | 'onToggleObjectGroup'
  | 'onShowAllObjectGroups'
  | 'onHideAllObjectGroups'
  | 'focusedObjectTarget'
  | 'showGameWorldAdditions'
  | 'onToggleGameWorldAdditions'
  | 'worldOverlaySprites'
  | 'worldOverlayTextureAssets'
  | 'objectLightIndex'
  | 'onFocusObject'
  | 'onHoverChange'
  | 'heavyWorkspaceReady'
>

export type BuildEventPanelsOptions = Pick<
  BuildWorkspacePanelsOptions,
  | 'copy'
  | 'locale'
  | 'directoryInfo'
  | 'theme'
  | 'accentColor'
  | 'eventAssets'
  | 'filteredEventAssets'
  | 'eventBrowserSourceMode'
  | 'onEventBrowserSourceModeChange'
  | 'modEventGroups'
  | 'activeModEventSelectionId'
  | 'activeEventModSources'
  | 'activeEventAssetId'
  | 'eventAssetFilter'
  | 'onEventAssetFilterChange'
  | 'onOpenEventAsset'
  | 'onOpenModEventAsset'
  | 'parsedEventAsset'
  | 'selectedEventKey'
  | 'selectedEvent'
  | 'selectedTimelineEntryId'
  | 'currentEventCommandId'
  | 'eventStatusMessage'
  | 'onSelectEvent'
  | 'onSelectTimelineEntry'
  | 'onActivateTimelineEntry'
  | 'onPlaybackCommandChange'
  | 'onStageSeekReady'
  | 'activePlayerAppearanceProfile'
  | 'onOpenPlayerAppearanceWindow'
>

export type BuildCharacterPanelsOptions = Pick<
  BuildWorkspacePanelsOptions,
  | 'copy'
  | 'characters'
  | 'filteredCharacters'
  | 'characterBrowserSourceMode'
  | 'onCharacterBrowserSourceModeChange'
  | 'modCharacterGroups'
  | 'activeModCharacterSelectionId'
  | 'activeCharacterModSources'
  | 'activeCharacterId'
  | 'activeCharacter'
  | 'activeCharacterVariant'
  | 'characterFilter'
  | 'characterStatusMessage'
  | 'activeCharacterAssetState'
  | 'activeCharacterAssetLoading'
  | 'onCharacterFilterChange'
  | 'onSelectCharacter'
  | 'onSelectModCharacter'
  | 'onSelectCharacterVariant'
  | 'onOpenCharacterInAuthoring'
  | 'heavyWorkspaceReady'
>

export type BuildBuildingPanelsOptions = Pick<
  BuildWorkspacePanelsOptions,
  | 'copy'
  | 'locale'
  | 'theme'
  | 'accentColor'
  | 'constructibleGroups'
  | 'filteredConstructibleGroups'
  | 'worldBuildings'
  | 'filteredWorldBuildings'
  | 'buildingBrowserSourceMode'
  | 'onBuildingBrowserSourceModeChange'
  | 'modBuildingGroups'
  | 'activeModBuildingSelectionId'
  | 'activeBuildingModSources'
  | 'activeBuildingId'
  | 'activeBuilding'
  | 'activeUpgradeChain'
  | 'buildingFilter'
  | 'buildingStatusMessage'
  | 'activeBuildingTextureState'
  | 'activeBuildingChainTextureStates'
  | 'activeBuildingIndoorMapDocument'
  | 'activeBuildingIndoorMapPath'
  | 'activeBuildingIndoorMapMessage'
  | 'activeBuildingExteriorMapDocument'
  | 'activeBuildingExteriorMapPath'
  | 'activeBuildingExteriorMapMessage'
  | 'activeBuildingExteriorFocusPoint'
  | 'buildingSpringObjectsState'
  | 'onBuildingFilterChange'
  | 'onSelectBuilding'
  | 'onSelectModBuilding'
  | 'onOpenBuildingInAuthoring'
>

export type BuildItemPanelsOptions = Pick<
  BuildWorkspacePanelsOptions,
  | 'copy'
  | 'items'
  | 'filteredItems'
  | 'itemBrowserSourceMode'
  | 'onItemBrowserSourceModeChange'
  | 'modItemGroups'
  | 'activeModItemSelectionId'
  | 'activeItemModSources'
  | 'activeItemId'
  | 'activeItem'
  | 'itemLookup'
  | 'itemFilter'
  | 'itemStatusMessage'
  | 'itemTextureStatesByAssetName'
  | 'ensureItemTextureAssetStates'
  | 'onItemFilterChange'
  | 'onSelectItem'
  | 'onSelectModItem'
  | 'onOpenItemInAuthoring'
>
