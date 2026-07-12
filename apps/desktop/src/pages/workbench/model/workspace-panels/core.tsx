import { DeferredWorkspaceCrossfade, DeferredWorkspacePlaceholder, DeferredWorkspaceReveal } from '@shared/ui/WorkspaceDeferred'
import type { ReactNode } from 'react'
import { EventStageWorkspace } from '../../workspaces/event-stage'
import { CentralWorkspace } from '../../workspaces/map'
import { CharacterWorkspace } from '../../workspaces/character'
import { EventTimelinePanel } from '../../ui/workspace-panels/event/EventTimelinePanel'
import { EventBrowserPanel } from '../../ui/workspace-panels/event/EventBrowserPanel'
import { EventDirectoryPanel } from '../../ui/workspace-panels/event/EventDirectoryPanel'
import { EventCommandInspectorPanel } from '../../ui/workspace-panels/event/EventCommandInspectorPanel'
import { CharacterBrowserPanel } from '../../ui/workspace-panels/character/CharacterBrowserPanel'
import { CharacterInspectorPanel } from '../../ui/workspace-panels/character/CharacterInspectorPanel'
import { CharacterVariantsPanel } from '../../ui/workspace-panels/character/CharacterVariantsPanel'
import { CharacterRelationsPanel } from '../../ui/workspace-panels/character/CharacterRelationsPanel'
import { AssetBrowserPanel } from '../../ui/workspace-panels/map/AssetBrowserPanel'
import { InspectorPanel } from '../../ui/workspace-panels/map/InspectorPanel'
import { LayersPanel } from '../../ui/workspace-panels/map/LayersPanel'
import { ObjectGroupsPanel } from '../../ui/workspace-panels/map/ObjectGroupsPanel'
import { DiagnosticsPanel } from '../../ui/workspace-panels/map/DiagnosticsPanel'
import type { WorkspacePanelConfig } from '@shared/contracts'
import type { BuildWorkspacePanelsOptions } from './types'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'

export function buildCoreWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const { workspaceMode } = options
  if (workspaceMode === 'items' || workspaceMode === 'buildings') {
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
    activeModMapSelectionId,
    activeMapModSources,
    activeMapId,
    assetFilter,
    onAssetFilterChange,
    onOpenAsset,
    onOpenModAsset,
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
    activeModEventSelectionId,
    activeEventModSources,
    activeEventAssetId,
    eventAssetFilter,
    onEventAssetFilterChange,
    onOpenEventAsset,
    onOpenModEventAsset,
    parsedEventAsset,
    selectedEventKey,
    selectedEvent,
    selectedTimelineEntryId,
    currentEventCommandId,
    eventStatusMessage,
    onSelectEvent,
    onSelectTimelineEntry,
    onActivateTimelineEntry,
    onPlaybackCommandChange,
    onStageSeekReady,
    activePlayerAppearanceProfile,
    onOpenPlayerAppearanceWindow,
    characters,
    filteredCharacters,
    characterBrowserSourceMode,
    onCharacterBrowserSourceModeChange,
    modCharacterGroups,
    activeModCharacterSelectionId,
    activeCharacterModSources,
    activeCharacterId,
    activeCharacter,
    activeCharacterVariant,
    characterFilter,
    characterStatusMessage,
    activeCharacterAssetState,
    activeCharacterAssetLoading,
    onCharacterFilterChange,
    onSelectCharacter,
    onSelectModCharacter,
    onSelectCharacterVariant,
    heavyWorkspaceReady,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const shellClassName =
    workspaceMode === 'events'
      ? 'workspace-panel-shell-flat event-stage-panel-shell'
      : workspaceMode === 'characters'
        ? 'character-workspace-panel-shell'
        : undefined

  const eventDiagnosticsPanel = {
    id: 'diagnostics',
    title: 'Script Timeline',
    subtitle: selectedEvent?.eventId ?? parsedEventAsset?.asset.name ?? '',
    minWidth: 320,
    minHeight: 180,
    dockMinHeight: 140,
    dockAutoHeight: false,
    defaultDock: 'right-top',
    defaultDockHeight: 190,
    content: withPreviewReveal(
      'workbench-events-timeline',
      4,
      <EventTimelinePanel
        locale={locale}
        selectedEvent={selectedEvent}
        selectedTimelineEntryId={selectedTimelineEntryId}
        currentCommandId={currentEventCommandId}
        onSelectTimelineEntry={onSelectTimelineEntry}
        onActivateTimelineEntry={onActivateTimelineEntry}
      />,
    ),
  } satisfies WorkspacePanelConfig

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
      shellClassName,
      content:
        workspaceMode === 'events'
          ? withPreviewReveal(
              'workbench-events-browser',
              0,
              <EventBrowserPanel
                eventAssets={eventAssets}
                filteredEventAssets={filteredEventAssets}
                browserSourceMode={eventBrowserSourceMode}
                onBrowserSourceModeChange={onEventBrowserSourceModeChange}
                modEventGroups={modEventGroups}
                activeModEventSelectionId={activeModEventSelectionId}
                activeEventAssetId={activeEventAssetId}
                events={parsedEventAsset?.events ?? []}
                selectedEventKey={selectedEventKey}
                assetFilter={eventAssetFilter}
                onAssetFilterChange={onEventAssetFilterChange}
                onOpenAsset={onOpenEventAsset}
                onOpenModAsset={onOpenModEventAsset}
                onSelectEvent={onSelectEvent}
              />,
            )
          : workspaceMode === 'characters'
            ? withPreviewReveal(
                'workbench-characters-browser',
                0,
                <CharacterBrowserPanel
                  characters={characters}
                  filteredCharacters={filteredCharacters}
                  browserSourceMode={characterBrowserSourceMode}
                  onBrowserSourceModeChange={onCharacterBrowserSourceModeChange}
                  modCharacterGroups={modCharacterGroups}
                  activeModCharacterSelectionId={activeModCharacterSelectionId}
                  activeCharacterId={activeCharacterId}
                  characterFilter={characterFilter}
                  onCharacterFilterChange={onCharacterFilterChange}
                  onSelectCharacter={onSelectCharacter}
                  onSelectModCharacter={onSelectModCharacter}
                />,
              )
            : withPreviewReveal(
                'workbench-map-browser',
                0,
                <AssetBrowserPanel
                  mapAssets={mapAssets}
                  filteredAssets={filteredAssets}
                  browserSourceMode={mapBrowserSourceMode}
                  onBrowserSourceModeChange={onMapBrowserSourceModeChange}
                  modMapGroups={modMapGroups}
                  activeModMapSelectionId={activeModMapSelectionId}
                  activeMapId={activeMapId}
                  assetFilter={assetFilter}
                  onAssetFilterChange={onAssetFilterChange}
                  onOpenAsset={onOpenAsset}
                  onOpenModAsset={onOpenModAsset}
                />,
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
      hideDockHeader: workspaceMode === 'events',
      shellClassName,
      content:
        workspaceMode === 'events' ? (
          withPreviewReveal(
            'workbench-events-viewport',
            1,
            <EventStageWorkspace
              key={`${selectedEvent?.key ?? 'none'}:${parsedEventAsset?.asset.relativePath ?? 'none'}`}
              locale={locale}
              directoryInfo={directoryInfo}
              viewportLabels={copy.viewportLabels}
              theme={theme}
              accentColor={accentColor}
              parsedEventAsset={parsedEventAsset}
              selectedEvent={selectedEvent}
              eventStatusMessage={eventStatusMessage}
              playerAppearanceProfile={activePlayerAppearanceProfile}
              onSelectTimelineEntry={onSelectTimelineEntry}
              onPlaybackCommandChange={onPlaybackCommandChange}
              onStageSeekReady={onStageSeekReady}
              onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
            />,
          )
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
              {withPreviewReveal(
                'workbench-characters-viewport',
                1,
                <CharacterWorkspace
                  character={activeCharacter}
                  activeVariant={activeCharacterVariant}
                  assetState={activeCharacterAssetState}
                  assetLoading={activeCharacterAssetLoading}
                />,
              )}
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : workspaceMode === 'map' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={<DeferredWorkspacePlaceholder title={copy.center.viewport} subtitle={copy.center.activeScene} lines={5} />}
          >
            <DeferredWorkspaceReveal>
              {withPreviewReveal(
                'workbench-map-viewport',
                1,
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
                />,
              )}
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : (
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-preview-view',
              1,
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
              />,
            )}
          </DeferredWorkspaceReveal>
        ),
    },
    ...(workspaceMode === 'events' ? [eventDiagnosticsPanel] : []),
    {
      id: 'inspector',
      title:
        workspaceMode === 'events'
          ? 'Event Directory'
          : workspaceMode === 'characters'
            ? copy.charactersPanel.inspectorTitle
            : copy.rightDock.inspector,
      subtitle:
        workspaceMode === 'events'
          ? eventStatusMessage
          : workspaceMode === 'characters'
            ? characterStatusMessage
            : copy.rightDock.sceneSummary,
      minWidth: 320,
      minHeight: 260,
      dockMinHeight: 180,
      dockAutoHeight: false,
      defaultDock: 'right-top',
      defaultDockHeight: workspaceMode === 'events' ? 280 : 220,
      shellClassName,
      content:
        workspaceMode === 'events' ? (
          withPreviewReveal(
            'workbench-events-directory',
            2,
            <EventDirectoryPanel
              locale={locale}
              events={parsedEventAsset?.events ?? []}
              selectedEventKey={selectedEventKey}
              subtitle={eventStatusMessage}
              modSources={activeEventModSources}
              onSelectEvent={onSelectEvent}
            />,
          )
        ) : workspaceMode === 'characters' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={
              <DeferredWorkspacePlaceholder title={copy.charactersPanel.inspectorTitle} subtitle={copy.charactersPanel.inspectorSubtitle} />
            }
          >
            <DeferredWorkspaceReveal>
              {withPreviewReveal(
                'workbench-characters-inspector',
                2,
                <CharacterInspectorPanel
                  character={activeCharacter}
                  activeVariant={activeCharacterVariant}
                  assetState={activeCharacterAssetState}
                  modSources={activeCharacterModSources}
                />,
              )}
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : workspaceMode === 'map' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.inspector} subtitle={copy.rightDock.sceneSummary} />}
          >
            <DeferredWorkspaceReveal>
              {withPreviewReveal(
                'workbench-map-inspector',
                2,
                <InspectorPanel mapDocument={mapDocument} modSources={activeMapModSources} moduleBlueprint={moduleBlueprint} />,
              )}
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : (
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-preview-inspector',
              2,
              <InspectorPanel mapDocument={mapDocument} modSources={activeMapModSources} moduleBlueprint={moduleBlueprint} />,
            )}
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
      defaultDock: workspaceMode === 'characters' ? 'left-top' : 'right-top',
      defaultDockHeight: workspaceMode === 'events' ? 220 : workspaceMode === 'characters' ? 300 : 320,
      content:
        workspaceMode === 'events' ? (
          withPreviewReveal(
            'workbench-events-command-inspector',
            3,
            <EventCommandInspectorPanel locale={locale} selectedEvent={selectedEvent} selectedTimelineEntryId={selectedTimelineEntryId} />,
          )
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
              {withPreviewReveal(
                'workbench-characters-variants',
                3,
                <CharacterVariantsPanel
                  character={activeCharacter}
                  activeVariant={activeCharacterVariant}
                  onSelectVariant={onSelectCharacterVariant}
                />,
              )}
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : workspaceMode === 'map' ? (
          <DeferredWorkspaceCrossfade
            ready={heavyWorkspaceReady}
            placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.layers} subtitle={copy.rightDock.subtitle} />}
          >
            <DeferredWorkspaceReveal>
              {withPreviewReveal(
                'workbench-map-layers',
                3,
                <LayersPanel
                  mapDocument={mapDocument}
                  visibleLayerIds={visibleLayerIds}
                  onToggleLayer={onToggleLayer}
                  onShowAllLayers={onShowAllLayers}
                  onHideAllLayers={onHideAllLayers}
                />,
              )}
            </DeferredWorkspaceReveal>
          </DeferredWorkspaceCrossfade>
        ) : (
          <DeferredWorkspaceReveal>
            {withPreviewReveal(
              'workbench-preview-layers',
              3,
              <LayersPanel
                mapDocument={mapDocument}
                visibleLayerIds={visibleLayerIds}
                onToggleLayer={onToggleLayer}
                onShowAllLayers={onShowAllLayers}
                onHideAllLayers={onHideAllLayers}
              />,
            )}
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
            defaultDock: 'right-top',
            defaultDockHeight: 360,
            content: (
              <DeferredWorkspaceCrossfade
                ready={heavyWorkspaceReady}
                placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.objectGroups} subtitle={copy.rightDock.subtitle} />}
              >
                <DeferredWorkspaceReveal>
                  {withPreviewReveal(
                    'workbench-map-object-groups',
                    4,
                    <ObjectGroupsPanel
                      mapDocument={mapDocument}
                      visibleObjectGroupIds={visibleObjectGroupIds}
                      onToggleObjectGroup={onToggleObjectGroup}
                      onShowAllObjectGroups={onShowAllObjectGroups}
                      onHideAllObjectGroups={onHideAllObjectGroups}
                      focusedObjectTarget={focusedObjectTarget}
                      onFocusObject={onFocusObject}
                    />,
                  )}
                </DeferredWorkspaceReveal>
              </DeferredWorkspaceCrossfade>
            ),
          } satisfies WorkspacePanelConfig,
        ]
      : []),
    ...(workspaceMode === 'events'
      ? []
      : [
          {
            id: 'diagnostics',
            title: copy.charactersPanel.detailsTitle,
            subtitle: activeCharacter?.homeRegion ?? characterStatusMessage,
            minWidth: 320,
            minHeight: 180,
            dockMinHeight: 140,
            dockAutoHeight: false,
            defaultDock: 'right-top',
            defaultDockHeight: workspaceMode === 'characters' ? 320 : 190,
            content:
              workspaceMode === 'characters' ? (
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
                    {withPreviewReveal('workbench-characters-relations', 4, <CharacterRelationsPanel character={activeCharacter} />)}
                  </DeferredWorkspaceReveal>
                </DeferredWorkspaceCrossfade>
              ) : workspaceMode === 'map' ? (
                <DeferredWorkspaceCrossfade
                  ready={heavyWorkspaceReady}
                  placeholder={<DeferredWorkspacePlaceholder title={copy.rightDock.diagnostics} subtitle={copy.rightDock.projectFacts} />}
                >
                  <DeferredWorkspaceReveal>
                    {withPreviewReveal(
                      'workbench-map-diagnostics',
                      5,
                      <DiagnosticsPanel
                        directoryInfo={directoryInfo}
                        visibleLayerIds={visibleLayerIds}
                        visibleObjectGroupIds={visibleObjectGroupIds}
                        workspaceStatus={workspaceStatus}
                      />,
                    )}
                  </DeferredWorkspaceReveal>
                </DeferredWorkspaceCrossfade>
              ) : (
                <DeferredWorkspaceReveal>
                  {withPreviewReveal(
                    'workbench-preview-diagnostics',
                    4,
                    <DiagnosticsPanel
                      directoryInfo={directoryInfo}
                      visibleLayerIds={visibleLayerIds}
                      visibleObjectGroupIds={visibleObjectGroupIds}
                      workspaceStatus={workspaceStatus}
                    />,
                  )}
                </DeferredWorkspaceReveal>
              ),
          } satisfies WorkspacePanelConfig,
        ]),
  ]
}
