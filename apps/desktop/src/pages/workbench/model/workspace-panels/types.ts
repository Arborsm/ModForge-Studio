import type { EventAssetSummary, GameDirectoryInfo, MapAssetSummary } from '@shared/contracts'
import type { FocusedMapObjectTarget, TileHoverInfo, ViewportWorldPoint } from '@shared/contracts'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, ConstructibleBuildingGroup } from '../../workspaces/building'
import type { CharacterAppearanceVariant, CharacterVisualAssetState, CharacterWorkspaceEntry } from '../../workspaces/character'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from '../../workspaces/item'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup, ModSourceEntry } from '@shared/contracts'
import type { EditorCopy, LocaleCode, ModuleBlueprint, ThemeMode, WorkspaceMode } from '@locales'
import type { EventScript, ParsedEventAsset } from '@entities/event'
import type { EffectAssetState, PlayerAppearanceProfile } from '@entities/event'
import type { MapDocument } from '@shared/contracts'
import type { StageWorldOverlaySprite } from '@entities/map'
import type { WorldAtlasView } from '@shared/contracts'
import type { BuildModWorkspacePanelsOptions } from './modWorkspaceTypes'

export type BuildWorkspacePanelsOptions = Omit<BuildModWorkspacePanelsOptions, 'gameRootPath'> & {
  copy: EditorCopy
  locale: LocaleCode
  workspaceMode: WorkspaceMode
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
  onFocusObject: (groupId: number, objectId: number) => void
  onHoverChange: (hoverInfo: TileHoverInfo | null) => void
  workspaceStatus: {
    tone: 'idle' | 'working' | 'ready' | 'error'
    message: string
  }
  moduleBlueprint?: ModuleBlueprint
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
  onCharacterFilterChange: (value: string) => void
  onSelectCharacter: (characterKey: string) => void
  onSelectModCharacter: (entry: ModBrowserEntry<CharacterWorkspaceEntry>) => void
  onSelectCharacterVariant: (variant: CharacterAppearanceVariant) => void
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
  heavyWorkspaceReady: boolean
}
