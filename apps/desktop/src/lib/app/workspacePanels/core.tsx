import {
  DeferredWorkspaceCrossfade,
  DeferredWorkspacePlaceholder,
  DeferredWorkspaceReveal,
} from '../../../components/ui/WorkspaceDeferred'
import CentralWorkspace from '../../../components/CentralWorkspace'
import BuildingWorkspace from '../../../components/BuildingWorkspace'
import CharacterWorkspace from '../../../components/CharacterWorkspace'
import EventStageWorkspace from '../../../components/EventStageWorkspace'
import { AssetBrowserPanel, EventBrowserPanel } from '../../../components/LeftPanels'
import { DiagnosticsPanel, InspectorPanel, LayersPanel, ObjectGroupsPanel } from '../../../components/RightPanels'
import { BuildingBrowserPanel } from '../../../components/panels/left/BuildingBrowserPanel'
import { CharacterBrowserPanel } from '../../../components/panels/left/CharacterBrowserPanel'
import { EventTimelinePanel } from '../../../components/panels/bottom/EventTimelinePanel'
import { BuildingDetailsPanel } from '../../../components/panels/right/BuildingDetailsPanel'
import { BuildingInspectorPanel } from '../../../components/panels/right/BuildingInspectorPanel'
import { CharacterInspectorPanel } from '../../../components/panels/right/CharacterInspectorPanel'
import { CharacterRelationsPanel } from '../../../components/panels/right/CharacterRelationsPanel'
import { CharacterVariantsPanel } from '../../../components/panels/right/CharacterVariantsPanel'
import { EventCommandInspectorPanel } from '../../../components/panels/right/EventCommandInspectorPanel'
import { EventDirectoryPanel } from '../../../components/panels/right/EventDirectoryPanel'
import type { WorkspacePanelConfig } from '../../../components/WorkspaceLayout'
import type { BuildWorkspacePanelsOptions } from './types'

export function buildCoreWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const { workspaceMode } = options
  if (workspaceMode === 'items' || workspaceMode === 'mods') {
    throw new Error(`Unsupported workspace mode: ${workspaceMode}`)
  }

  const {
    copy,
    locale,
    directoryInfo,
    mapAssets,
    filteredAssets,
    mapBrowserSourceMode,
    onMapBrowserSourceModeChange,
    modMapGroups,
    activeMapModSources,
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
    eventBrowserSourceMode,
    onEventBrowserSourceModeChange,
    modEventGroups,
    activeEventModSources,
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
    characterBrowserSourceMode,
    onCharacterBrowserSourceModeChange,
    modCharacterGroups,
    activeCharacterModSources,
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
    buildingBrowserSourceMode,
    onBuildingBrowserSourceModeChange,
    modBuildingGroups,
    activeBuildingModSources,
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
    heavyWorkspaceReady,
  } = options

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
          browserSourceMode={eventBrowserSourceMode}
          onBrowserSourceModeChange={onEventBrowserSourceModeChange}
          modEventGroups={modEventGroups}
          activeEventAssetId={activeEventAssetId}
          assetFilter={eventAssetFilter}
          onAssetFilterChange={onEventAssetFilterChange}
          onOpenAsset={onOpenEventAsset}
        />
      ) : workspaceMode === 'characters' ? (
        <CharacterBrowserPanel
          characters={characters}
          filteredCharacters={filteredCharacters}
          browserSourceMode={characterBrowserSourceMode}
          onBrowserSourceModeChange={onCharacterBrowserSourceModeChange}
          modCharacterGroups={modCharacterGroups}
          activeCharacterId={activeCharacterId}
          characterFilter={characterFilter}
          onCharacterFilterChange={onCharacterFilterChange}
          onSelectCharacter={onSelectCharacter}
        />
      ) : workspaceMode === 'buildings' ? (
        <BuildingBrowserPanel
          constructibleGroups={constructibleGroups}
          filteredConstructibleGroups={filteredConstructibleGroups}
          worldBuildings={worldBuildings}
          filteredWorldBuildings={filteredWorldBuildings}
          browserSourceMode={buildingBrowserSourceMode}
          onBrowserSourceModeChange={onBuildingBrowserSourceModeChange}
          modBuildingGroups={modBuildingGroups}
          activeBuildingId={activeBuildingId}
          activeBuildingGroupKey={activeBuilding?.groupKey ?? null}
          buildingFilter={buildingFilter}
          onBuildingFilterChange={onBuildingFilterChange}
          onSelectBuilding={onSelectBuilding}
        />
      ) : (
        <AssetBrowserPanel
          mapAssets={mapAssets}
          filteredAssets={filteredAssets}
          browserSourceMode={mapBrowserSourceMode}
          onBrowserSourceModeChange={onMapBrowserSourceModeChange}
          modMapGroups={modMapGroups}
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
        <DeferredWorkspaceCrossfade
          ready={heavyWorkspaceReady}
          placeholder={
            <DeferredWorkspacePlaceholder
              title={copy.charactersPanel.workspaceTitle}
              subtitle={copy.charactersPanel.workspaceSubtitle}
              lines={4}
            />
          }
        >
          <DeferredWorkspaceReveal>
            <CharacterWorkspace
              character={activeCharacter}
              activeVariant={activeCharacterVariant}
              assetState={activeCharacterAssetState}
            />
          </DeferredWorkspaceReveal>
        </DeferredWorkspaceCrossfade>
      ) : workspaceMode === 'buildings' ? (
        <BuildingWorkspace
          locale={locale}
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
      ) : workspaceMode === 'map' ? (
        <DeferredWorkspaceCrossfade
          ready={heavyWorkspaceReady}
          placeholder={<DeferredWorkspacePlaceholder title={copy.center.viewport} subtitle={copy.center.activeScene} lines={5} />}
        >
          <DeferredWorkspaceReveal>
            <CentralWorkspace
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
          </DeferredWorkspaceReveal>
        </DeferredWorkspaceCrossfade>
      ) : (
        <DeferredWorkspaceReveal>
          <CentralWorkspace
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
        </DeferredWorkspaceReveal>
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
            modSources={activeEventModSources}
            onSelectEvent={onSelectEvent}
          />
        ) : workspaceMode === 'characters' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={
              <DeferredWorkspacePlaceholder
                title={copy.charactersPanel.inspectorTitle}
                subtitle={copy.charactersPanel.inspectorSubtitle}
              />
            }
          >
            <DeferredWorkspaceReveal>
              <CharacterInspectorPanel
                character={activeCharacter}
                activeVariant={activeCharacterVariant}
                assetState={activeCharacterAssetState}
                modSources={activeCharacterModSources}
              />
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : workspaceMode === 'buildings' ? (
          <BuildingInspectorPanel
            building={activeBuilding}
            textureState={activeBuildingTextureState}
            activeIndoorMapPath={activeBuildingIndoorMapPath}
            activeExteriorMapPath={activeBuildingExteriorMapPath}
            modSources={activeBuildingModSources}
          />
        ) : workspaceMode === 'map' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.inspector} subtitle={copy.rightDock.sceneSummary} />}
          >
            <DeferredWorkspaceReveal>
              <InspectorPanel mapDocument={mapDocument} modSources={activeMapModSources} moduleBlueprint={moduleBlueprint} />
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : (
          <DeferredWorkspaceReveal>
            <InspectorPanel mapDocument={mapDocument} modSources={activeMapModSources} moduleBlueprint={moduleBlueprint} />
          </DeferredWorkspaceReveal>
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
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={
              <DeferredWorkspacePlaceholder
                title={copy.charactersPanel.variantsPanelTitle}
                subtitle={copy.charactersPanel.variantsPanelSubtitle}
              />
            }
          >
            <DeferredWorkspaceReveal>
              <CharacterVariantsPanel
                character={activeCharacter}
                activeVariant={activeCharacterVariant}
                onSelectVariant={onSelectCharacterVariant}
              />
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : workspaceMode === 'map' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.layers} subtitle={copy.rightDock.subtitle} />}
          >
            <DeferredWorkspaceReveal>
              <LayersPanel
                mapDocument={mapDocument}
                visibleLayerIds={visibleLayerIds}
                onToggleLayer={onToggleLayer}
                onShowAllLayers={onShowAllLayers}
                onHideAllLayers={onHideAllLayers}
              />
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : (
          <DeferredWorkspaceReveal>
            <LayersPanel
              mapDocument={mapDocument}
              visibleLayerIds={visibleLayerIds}
              onToggleLayer={onToggleLayer}
              onShowAllLayers={onShowAllLayers}
              onHideAllLayers={onHideAllLayers}
            />
          </DeferredWorkspaceReveal>
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
              <DeferredWorkspaceCrossfade
                ready={heavyWorkspaceReady}
                placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.objectGroups} subtitle={copy.rightDock.subtitle} />}
              >
                <DeferredWorkspaceReveal>
                  <ObjectGroupsPanel
                    mapDocument={mapDocument}
                    visibleObjectGroupIds={visibleObjectGroupIds}
                    onToggleObjectGroup={onToggleObjectGroup}
                    onShowAllObjectGroups={onShowAllObjectGroups}
                    onHideAllObjectGroups={onHideAllObjectGroups}
                    focusedObjectTarget={focusedObjectTarget}
                    onFocusObject={onFocusObject}
                  />
                </DeferredWorkspaceReveal>
              </DeferredWorkspaceCrossfade>
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
            content: <BuildingDetailsPanel building={activeBuilding} />,
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
                <DeferredWorkspaceCrossfade
                  ready={heavyWorkspaceReady}
                  placeholder={
                    <DeferredWorkspacePlaceholder
                      title={copy.charactersPanel.detailsTitle}
                      subtitle={copy.charactersPanel.detailsSubtitle}
                    />
                  }
                >
                  <DeferredWorkspaceReveal>
                    <CharacterRelationsPanel
                      character={activeCharacter}
                    />
                  </DeferredWorkspaceReveal>
                </DeferredWorkspaceCrossfade>
              ) : workspaceMode === 'map' ? (
                <DeferredWorkspaceCrossfade
                  ready={heavyWorkspaceReady}
                  placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.diagnostics} subtitle={copy.rightDock.projectFacts} />}
                >
                  <DeferredWorkspaceReveal>
                    <DiagnosticsPanel
                      directoryInfo={directoryInfo}
                      visibleLayerIds={visibleLayerIds}
                      visibleObjectGroupIds={visibleObjectGroupIds}
                      workspaceStatus={workspaceStatus}
                    />
                  </DeferredWorkspaceReveal>
                </DeferredWorkspaceCrossfade>
              ) : (
                <DeferredWorkspaceReveal>
                  <DiagnosticsPanel
                    directoryInfo={directoryInfo}
                    visibleLayerIds={visibleLayerIds}
                    visibleObjectGroupIds={visibleObjectGroupIds}
                    workspaceStatus={workspaceStatus}
                  />
                </DeferredWorkspaceReveal>
              ),
          } satisfies WorkspacePanelConfig,
        ]),
  ]
}
