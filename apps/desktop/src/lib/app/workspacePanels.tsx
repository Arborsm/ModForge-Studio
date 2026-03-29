import CentralWorkspace from '../../components/CentralWorkspace'
import BuildingWorkspace from '../../components/BuildingWorkspace'
import CharacterWorkspace from '../../components/CharacterWorkspace'
import { ItemCatalogPanel, ItemDetailPanel, ItemNavigationPanel } from '../../components/ItemWorkspace'
import EventStageWorkspace from '../../components/EventStageWorkspace'
import { AssetBrowserPanel, EventBrowserPanel } from '../../components/LeftPanels'
import { DiagnosticsPanel, InspectorPanel, LayersPanel, ObjectGroupsPanel } from '../../components/RightPanels'
import { BuildingBrowserPanel } from '../../components/panels/left/BuildingBrowserPanel'
import { CharacterBrowserPanel } from '../../components/panels/left/CharacterBrowserPanel'
import { EventTimelinePanel } from '../../components/panels/bottom/EventTimelinePanel'
import { BuildingDetailsPanel } from '../../components/panels/right/BuildingDetailsPanel'
import { BuildingInspectorPanel } from '../../components/panels/right/BuildingInspectorPanel'
import { CharacterInspectorPanel } from '../../components/panels/right/CharacterInspectorPanel'
import { CharacterRelationsPanel } from '../../components/panels/right/CharacterRelationsPanel'
import { CharacterVariantsPanel } from '../../components/panels/right/CharacterVariantsPanel'
import { EventCommandInspectorPanel } from '../../components/panels/right/EventCommandInspectorPanel'
import { EventDirectoryPanel } from '../../components/panels/right/EventDirectoryPanel'
import type { FocusedMapObjectTarget, TileHoverInfo, ViewportWorldPoint } from '../../components/MapViewport'
import type { WorkspacePanelConfig } from '../../components/WorkspaceLayout'
import type { EventAssetSummary, GameDirectoryInfo, MapAssetSummary } from '../desktop'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry, ConstructibleBuildingGroup } from './buildingWorkspace'
import type { CharacterAppearanceVariant, CharacterVisualAssetState, CharacterWorkspaceEntry } from './characterWorkspace'
import type { EffectAssetState } from './eventStageShared'
import type { ItemTextureAssetState, ItemWorkspaceEntry } from './itemWorkspace'
import type { StageWorldOverlaySprite } from './mapWorldStatePreview'
import type { PlayerAppearanceProfile } from './playerAppearance'
import type { EditorCopy, LocaleCode, ModuleBlueprint, ThemeMode, WorkspaceMode } from '../editor-shell'
import type { EventScript, ParsedEventAsset } from '../events/types'
import type { MapDocument } from '../maps/types'
import type { WorldAtlasView } from './types'

type BuildWorkspacePanelsOptions = {
  copy: EditorCopy
  locale: LocaleCode
  workspaceMode: WorkspaceMode
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
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
  activeItemId: string | null
  activeItem: ItemWorkspaceEntry | null
  itemLookup: Map<string, ItemWorkspaceEntry>
  itemFilter: string
  itemStatusMessage: string
  itemTextureStatesByAssetName: Record<string, ItemTextureAssetState>
  onItemFilterChange: (value: string) => void
  onSelectItem: (itemKey: string) => void
}

export function buildWorkspacePanels({
  copy,
  locale,
  workspaceMode,
  directoryInfo,
  mapAssets,
  filteredAssets,
  activeMapId,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
  workspaceTabs,
  activeTabId,
  onSelectWorkspaceTab,
  onCloseWorkspaceTab,
  onReorderWorkspaceTabs,
  mapDocument,
  worldAtlasViews,
  activeWorldAtlasViewId,
  onSelectWorldAtlasView,
  onOpenAtlasTarget,
  theme,
  accentColor,
  visibleLayerIds,
  onToggleLayer,
  onShowAllLayers,
  onHideAllLayers,
  visibleObjectGroupIds,
  onToggleObjectGroup,
  onShowAllObjectGroups,
  onHideAllObjectGroups,
  focusedObjectTarget,
  showGameWorldAdditions,
  onToggleGameWorldAdditions,
  worldOverlaySprites,
  worldOverlayTextureAssets,
  onFocusObject,
  onHoverChange,
  workspaceStatus,
  moduleBlueprint,
  eventAssets,
  filteredEventAssets,
  activeEventAssetId,
  eventAssetFilter,
  onEventAssetFilterChange,
  onOpenEventAsset,
  parsedEventAsset,
  selectedEventKey,
  selectedEvent,
  selectedTimelineEntryId,
  timelineJumpRequestId,
  currentEventCommandId,
  eventStatusMessage,
  onSelectEvent,
  onSelectTimelineEntry,
  onActivateTimelineEntry,
  onTimelineJumpHandled,
  onPlaybackCommandChange,
  activePlayerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
  characters,
  filteredCharacters,
  activeCharacterId,
  activeCharacter,
  activeCharacterVariant,
  characterFilter,
  characterStatusMessage,
  activeCharacterAssetState,
  onCharacterFilterChange,
  onSelectCharacter,
  onSelectCharacterVariant,
  constructibleGroups,
  filteredConstructibleGroups,
  worldBuildings,
  filteredWorldBuildings,
  activeBuildingId,
  activeBuilding,
  activeUpgradeChain,
  buildingFilter,
  buildingStatusMessage,
  activeBuildingTextureState,
  activeBuildingChainTextureStates,
  activeBuildingIndoorMapDocument,
  activeBuildingIndoorMapPath,
  activeBuildingIndoorMapMessage,
  activeBuildingExteriorMapDocument,
  activeBuildingExteriorMapPath,
  activeBuildingExteriorMapMessage,
  activeBuildingExteriorFocusPoint,
  buildingSpringObjectsState,
  onBuildingFilterChange,
  onSelectBuilding,
  items,
  filteredItems,
  activeItemId,
  activeItem,
  itemLookup,
  itemFilter,
  itemStatusMessage,
  itemTextureStatesByAssetName,
  onItemFilterChange,
  onSelectItem,
}: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  if (workspaceMode === 'items') {
    return [
      {
        id: 'item-navigation',
        title: copy.itemsPanel.statsAllLabel === 'All' ? 'Category Filters' : '分类过滤',
        subtitle: activeItem?.displayName ?? itemStatusMessage,
        shellClassName: 'workspace-panel-shell-flat',
        minWidth: 220,
        minHeight: 320,
        dockMinHeight: 220,
        defaultDock: 'left-top',
        defaultDockHeight: 760,
        content: (
          <ItemNavigationPanel
            copy={copy.itemsPanel}
            item={activeItem}
            items={items}
            filteredItems={filteredItems}
            activeItemId={activeItemId}
            itemFilter={itemFilter}
            itemLookup={itemLookup}
            textureStatesByAssetName={itemTextureStatesByAssetName}
            onItemFilterChange={onItemFilterChange}
            onSelectItem={onSelectItem}
          />
        ),
      },
      {
        id: 'item-catalog',
        title: copy.itemsPanel.browserTitle,
        subtitle: itemStatusMessage,
        hideDockHeader: true,
        shellClassName: 'workspace-panel-shell-flat',
        minWidth: 520,
        minHeight: 520,
        defaultDock: 'center',
        defaultDockHeight: 760,
        content: (
          <ItemCatalogPanel
            copy={copy.itemsPanel}
            item={activeItem}
            items={items}
            filteredItems={filteredItems}
            activeItemId={activeItemId}
            itemFilter={itemFilter}
            itemLookup={itemLookup}
            textureStatesByAssetName={itemTextureStatesByAssetName}
            onItemFilterChange={onItemFilterChange}
            onSelectItem={onSelectItem}
          />
        ),
      },
      {
        id: 'item-details',
        title: copy.itemsPanel.workspaceTitle,
        subtitle: activeItem?.displayName ?? itemStatusMessage,
        shellClassName: 'workspace-panel-shell-flat',
        minWidth: 520,
        minHeight: 320,
        dockMinHeight: 220,
        defaultDock: 'right-top',
        defaultDockHeight: 760,
        content: (
          <ItemDetailPanel
            copy={copy.itemsPanel}
            item={activeItem}
            items={items}
            filteredItems={filteredItems}
            activeItemId={activeItemId}
            itemFilter={itemFilter}
            itemLookup={itemLookup}
            textureStatesByAssetName={itemTextureStatesByAssetName}
            onItemFilterChange={onItemFilterChange}
            onSelectItem={onSelectItem}
          />
        ),
      },
    ]
  }

  return [
    {
      id: 'assets',
      title: copy.leftDock.contentBrowser,
      subtitle: copy.leftDock.contentSubtitle,
      minWidth: 320,
      minHeight: 320,
      dockMinHeight: 240,
      defaultDock: 'left-top',
      defaultDockHeight: 760,
      content: workspaceMode === 'events' ? (
        <EventBrowserPanel
          locale={locale}
          eventAssets={eventAssets}
          filteredEventAssets={filteredEventAssets}
          activeEventAssetId={activeEventAssetId}
          assetFilter={eventAssetFilter}
          onAssetFilterChange={onEventAssetFilterChange}
          onOpenAsset={onOpenEventAsset}
        />
      ) : workspaceMode === 'characters' ? (
        <CharacterBrowserPanel
          copy={copy.charactersPanel}
          noneLabel={copy.common.none}
          characters={characters}
          filteredCharacters={filteredCharacters}
          activeCharacterId={activeCharacterId}
          characterFilter={characterFilter}
          onCharacterFilterChange={onCharacterFilterChange}
          onSelectCharacter={onSelectCharacter}
        />
      ) : workspaceMode === 'buildings' ? (
        <BuildingBrowserPanel
          copy={copy.buildingsPanel}
          constructibleGroups={constructibleGroups}
          filteredConstructibleGroups={filteredConstructibleGroups}
          worldBuildings={worldBuildings}
          filteredWorldBuildings={filteredWorldBuildings}
          activeBuildingId={activeBuildingId}
          activeBuildingGroupKey={activeBuilding?.groupKey ?? null}
          buildingFilter={buildingFilter}
          onBuildingFilterChange={onBuildingFilterChange}
          onSelectBuilding={onSelectBuilding}
        />
      ) : (
        <AssetBrowserPanel
          copy={copy}
          mapAssets={mapAssets}
          filteredAssets={filteredAssets}
          activeMapId={activeMapId}
          assetFilter={assetFilter}
          onAssetFilterChange={onAssetFilterChange}
          onOpenAsset={onOpenAsset}
        />
      ),
    },
    {
      id: 'viewport',
      title: copy.center.viewport,
      subtitle: copy.center.activeScene,
      minWidth: 640,
      minHeight: 420,
      defaultDock: 'center',
      defaultDockHeight: 760,
      content: workspaceMode === 'events' ? (
        <EventStageWorkspace
          locale={locale}
          directoryInfo={directoryInfo}
          viewportLabels={copy.viewportLabels}
          copy={copy.eventStage}
          theme={theme}
          accentColor={accentColor}
          parsedEventAsset={parsedEventAsset}
          selectedEvent={selectedEvent}
          eventStatusMessage={eventStatusMessage}
          playerAppearanceProfile={activePlayerAppearanceProfile}
          timelineJumpRequestId={timelineJumpRequestId}
          onTimelineJumpHandled={onTimelineJumpHandled}
          onSelectTimelineEntry={onSelectTimelineEntry}
          onPlaybackCommandChange={onPlaybackCommandChange}
          onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
        />
      ) : workspaceMode === 'characters' ? (
        <CharacterWorkspace
          copy={copy.charactersPanel}
          character={activeCharacter}
          activeVariant={activeCharacterVariant}
          assetState={activeCharacterAssetState}
        />
      ) : workspaceMode === 'buildings' ? (
        <BuildingWorkspace
          locale={locale}
          copy={copy.buildingsPanel}
          viewportLabels={copy.viewportLabels}
          theme={theme}
          accentColor={accentColor}
          building={activeBuilding}
          upgradeChain={activeUpgradeChain}
          activeTextureState={activeBuildingTextureState}
          chainTextureStates={activeBuildingChainTextureStates}
          activeIndoorMapDocument={activeBuildingIndoorMapDocument}
          activeIndoorMapPath={activeBuildingIndoorMapPath}
          activeIndoorMapMessage={activeBuildingIndoorMapMessage}
          activeExteriorMapDocument={activeBuildingExteriorMapDocument}
          activeExteriorMapPath={activeBuildingExteriorMapPath}
          activeExteriorMapMessage={activeBuildingExteriorMapMessage}
          activeExteriorFocusPoint={activeBuildingExteriorFocusPoint}
          springObjectsState={buildingSpringObjectsState}
          onSelectBuildingStage={onSelectBuilding}
        />
      ) : (
        <CentralWorkspace
          copy={copy}
          locale={locale}
          workspaceMode={workspaceMode}
          tabs={workspaceTabs}
          activeTabId={activeTabId}
          onSelectTab={onSelectWorkspaceTab}
          onCloseTab={onCloseWorkspaceTab}
          onReorderTabs={onReorderWorkspaceTabs}
          mapDocument={mapDocument}
          worldAtlasViews={worldAtlasViews}
          activeWorldAtlasViewId={activeWorldAtlasViewId}
          onSelectWorldAtlasView={onSelectWorldAtlasView}
          onOpenAtlasTarget={onOpenAtlasTarget}
          theme={theme}
          accentColor={accentColor}
          visibleLayerIds={visibleLayerIds}
          visibleObjectGroupIds={visibleObjectGroupIds}
          focusedObjectTarget={focusedObjectTarget}
          showGameWorldAdditions={showGameWorldAdditions}
          onToggleGameWorldAdditions={onToggleGameWorldAdditions}
          worldOverlaySprites={worldOverlaySprites}
          worldOverlayTextureAssets={worldOverlayTextureAssets}
          onHoverChange={onHoverChange}
          moduleBlueprint={moduleBlueprint}
        />
      ),
    },
    {
      id: 'inspector',
      title:
        workspaceMode === 'events'
          ? 'Event Directory'
          : workspaceMode === 'characters'
            ? copy.charactersPanel.inspectorTitle
            : workspaceMode === 'buildings'
              ? copy.buildingsPanel.inspectorTitle
              : copy.rightDock.inspector,
      subtitle:
        workspaceMode === 'events'
          ? eventStatusMessage
          : workspaceMode === 'characters'
            ? characterStatusMessage
            : workspaceMode === 'buildings'
              ? buildingStatusMessage
              : copy.rightDock.sceneSummary,
      minWidth: 320,
      minHeight: 260,
      dockMinHeight: 180,
      dockAutoHeight: false,
      defaultDock: 'right-top',
      defaultDockHeight: workspaceMode === 'events' ? 280 : 220,
      content:
        workspaceMode === 'events' ? (
          <EventDirectoryPanel
            locale={locale}
            events={parsedEventAsset?.events ?? []}
            selectedEventKey={selectedEventKey}
            subtitle={eventStatusMessage}
            onSelectEvent={onSelectEvent}
          />
        ) : workspaceMode === 'characters' ? (
          <CharacterInspectorPanel
            copy={copy.charactersPanel}
            yesLabel={copy.common.yes}
            noLabel={copy.common.no}
            noneLabel={copy.common.none}
            character={activeCharacter}
            activeVariant={activeCharacterVariant}
            assetState={activeCharacterAssetState}
          />
        ) : workspaceMode === 'buildings' ? (
          <BuildingInspectorPanel
            copy={copy.buildingsPanel}
            yesLabel={copy.common.yes}
            noLabel={copy.common.no}
            building={activeBuilding}
            textureState={activeBuildingTextureState}
            activeIndoorMapPath={activeBuildingIndoorMapPath}
            activeExteriorMapPath={activeBuildingExteriorMapPath}
          />
        ) : (
          <InspectorPanel copy={copy} mapDocument={mapDocument} moduleBlueprint={moduleBlueprint} />
        ),
    },
    {
      id: 'layers',
      title:
        workspaceMode === 'events'
          ? 'Command Inspector'
          : workspaceMode === 'characters'
            ? copy.charactersPanel.variantsPanelTitle
            : copy.rightDock.layers,
      subtitle:
        workspaceMode === 'events'
          ? (selectedEvent?.eventId ?? parsedEventAsset?.asset.name ?? '')
          : workspaceMode === 'characters'
            ? (activeCharacterVariant?.label ?? activeCharacter?.displayName ?? '')
            : copy.rightDock.subtitle,
      minWidth: 320,
      minHeight: workspaceMode === 'events' ? 180 : 260,
      dockMinHeight: workspaceMode === 'events' ? 160 : 220,
      dockAutoHeight: false,
      defaultDock: workspaceMode === 'characters' ? 'left-bottom' : 'right-bottom',
      defaultDockHeight: workspaceMode === 'events' ? 220 : workspaceMode === 'characters' ? 300 : 320,
      content:
        workspaceMode === 'events' ? (
          <EventCommandInspectorPanel
            locale={locale}
            selectedEvent={selectedEvent}
            selectedTimelineEntryId={selectedTimelineEntryId}
          />
        ) : workspaceMode === 'characters' ? (
          <CharacterVariantsPanel
            copy={copy.charactersPanel}
            yesLabel={copy.common.yes}
            noLabel={copy.common.no}
            noneLabel={copy.common.none}
            character={activeCharacter}
            activeVariant={activeCharacterVariant}
            onSelectVariant={onSelectCharacterVariant}
          />
        ) : (
          <LayersPanel
            copy={copy}
            mapDocument={mapDocument}
            visibleLayerIds={visibleLayerIds}
            onToggleLayer={onToggleLayer}
            onShowAllLayers={onShowAllLayers}
            onHideAllLayers={onHideAllLayers}
          />
        ),
    },
    ...(workspaceMode === 'map'
      ? [
          {
            id: 'object-groups',
            title: copy.rightDock.objectGroups,
            subtitle: copy.rightDock.subtitle,
            minWidth: 320,
            minHeight: 300,
            dockMinHeight: 240,
            defaultDock: 'right-bottom',
            defaultDockHeight: 360,
            content: (
              <ObjectGroupsPanel
                copy={copy}
                mapDocument={mapDocument}
                visibleObjectGroupIds={visibleObjectGroupIds}
                onToggleObjectGroup={onToggleObjectGroup}
                onShowAllObjectGroups={onShowAllObjectGroups}
                onHideAllObjectGroups={onHideAllObjectGroups}
                focusedObjectTarget={focusedObjectTarget}
                onFocusObject={onFocusObject}
              />
            ),
          } satisfies WorkspacePanelConfig,
        ]
      : []),
    ...(workspaceMode === 'buildings'
      ? [
          {
            id: 'diagnostics',
            title: copy.buildingsPanel.detailsTitle,
            subtitle: activeBuilding?.builder ?? buildingStatusMessage,
            minWidth: 320,
            minHeight: 180,
            dockMinHeight: 140,
            dockAutoHeight: false,
            defaultDock: 'right-bottom',
            defaultDockHeight: 340,
            content: <BuildingDetailsPanel copy={copy.buildingsPanel} building={activeBuilding} />,
          } satisfies WorkspacePanelConfig,
        ]
      : [
          {
            id: 'diagnostics',
            title:
              workspaceMode === 'events'
                ? 'Script Timeline'
                : workspaceMode === 'characters'
                  ? copy.charactersPanel.detailsTitle
                  : copy.rightDock.diagnostics,
            subtitle:
              workspaceMode === 'events'
                ? (selectedEvent?.eventId ?? parsedEventAsset?.asset.name ?? '')
                : workspaceMode === 'characters'
                  ? (activeCharacter?.homeRegion ?? characterStatusMessage)
                  : copy.rightDock.projectFacts,
            minWidth: 320,
            minHeight: 180,
            dockMinHeight: 140,
            dockAutoHeight: false,
            defaultDock: workspaceMode === 'events' ? 'left-bottom' : workspaceMode === 'characters' ? 'right-bottom' : 'bottom-right',
            defaultDockHeight: workspaceMode === 'characters' ? 320 : 190,
            content:
              workspaceMode === 'events' ? (
                <EventTimelinePanel
                  locale={locale}
                  selectedEvent={selectedEvent}
                  selectedTimelineEntryId={selectedTimelineEntryId}
                  currentCommandId={currentEventCommandId}
                  onSelectTimelineEntry={onSelectTimelineEntry}
                  onActivateTimelineEntry={onActivateTimelineEntry}
                />
              ) : workspaceMode === 'characters' ? (
                <CharacterRelationsPanel
                  copy={copy.charactersPanel}
                  yesLabel={copy.common.yes}
                  noLabel={copy.common.no}
                  noneLabel={copy.common.none}
                  character={activeCharacter}
                />
              ) : (
                <DiagnosticsPanel
                  copy={copy}
                  directoryInfo={directoryInfo}
                  visibleLayerIds={visibleLayerIds}
                  visibleObjectGroupIds={visibleObjectGroupIds}
                  workspaceStatus={workspaceStatus}
                />
              ),
          } satisfies WorkspacePanelConfig,
        ]),
  ]
}
