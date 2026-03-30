import type { FocusedMapObjectTarget, TileHoverInfo, ViewportWorldPoint } from '../../../components/MapViewport'
import type { EventAssetSummary, GameDirectoryInfo, MapAssetSummary } from '../../desktop'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, ConstructibleBuildingGroup } from '../buildingWorkspace'
import type { CharacterAppearanceVariant, CharacterVisualAssetState, CharacterWorkspaceEntry } from '../characterWorkspace'
import type { EffectAssetState } from '../eventStageShared'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from '../itemWorkspace'
import type { StageWorldOverlaySprite } from '../mapWorldStatePreview'
import type { BrowserSourceMode, ModBrowserGroup, ModSourceEntry } from '../modAssetIndex'
import type { PlayerAppearanceProfile } from '../playerAppearance'
import type { EditorCopy, LocaleCode, ModuleBlueprint, ThemeMode, WorkspaceMode } from '../../editor-shell'
import type { EventScript, ParsedEventAsset } from '../../events/types'
import type { MapDocument } from '../../maps/types'
import type { WorldAtlasView } from '../types'
import type { BuildModWorkspacePanelsOptions } from '../modWorkspacePanels'

export type BuildWorkspacePanelsOptions = Omit<BuildModWorkspacePanelsOptions, 'gameRootPath'> & {
  copy: EditorCopy
  locale: LocaleCode
  workspaceMode: WorkspaceMode
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
  mapBrowserSourceMode: BrowserSourceMode
  onMapBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modMapGroups: ModBrowserGroup<MapAssetSummary>[]
  activeMapModSources: ModSourceEntry[]
  activeMapId: string | null
  activeAssetName?: string
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: MapAssetSummary) => void
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
  activeEventModSources: ModSourceEntry[]
  activeEventAssetId: string | null
  eventAssetFilter: string
  onEventAssetFilterChange: (value: string) => void
  onOpenEventAsset: (asset: EventAssetSummary) => void
  parsedEventAsset: ParsedEventAsset | null
  selectedEventKey: string | null
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
  timelineJumpRequestId: string | null
  currentEventCommandId: string | null
  eventStatusMessage: string
  onSelectEvent: (eventKey: string) => void
  onSelectTimelineEntry: (entryId: string) => void
  onActivateTimelineEntry: (entryId: string) => void
  onTimelineJumpHandled: () => void
  onPlaybackCommandChange: (commandId: string | null) => void
  activePlayerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
  characters: CharacterWorkspaceEntry[]
  filteredCharacters: CharacterWorkspaceEntry[]
  characterBrowserSourceMode: BrowserSourceMode
  onCharacterBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modCharacterGroups: ModBrowserGroup<CharacterWorkspaceEntry>[]
  activeCharacterModSources: ModSourceEntry[]
  activeCharacterId: string | null
  activeCharacter: CharacterWorkspaceEntry | null
  activeCharacterVariant: CharacterAppearanceVariant | null
  characterFilter: string
  characterStatusMessage: string
  activeCharacterAssetState: CharacterVisualAssetState
  onCharacterFilterChange: (value: string) => void
  onSelectCharacter: (characterKey: string) => void
  onSelectCharacterVariant: (variant: CharacterAppearanceVariant) => void
  constructibleGroups: ConstructibleBuildingGroup[]
  filteredConstructibleGroups: ConstructibleBuildingGroup[]
  worldBuildings: BuildingWorkspaceEntry[]
  filteredWorldBuildings: BuildingWorkspaceEntry[]
  buildingBrowserSourceMode: BrowserSourceMode
  onBuildingBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modBuildingGroups: ModBrowserGroup<BuildingWorkspaceEntry>[]
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
  items: ItemWorkspaceEntry[]
  filteredItems: ItemWorkspaceEntry[]
  itemBrowserSourceMode: BrowserSourceMode
  onItemBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[]
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
  heavyWorkspaceReady: boolean
}
