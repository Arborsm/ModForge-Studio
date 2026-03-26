import CentralWorkspace from '../../components/CentralWorkspace'
import EventStageWorkspace from '../../components/EventStageWorkspace'
import { AssetBrowserPanel, EventBrowserPanel, ProjectPanel } from '../../components/LeftPanels'
import { DiagnosticsPanel, InspectorPanel, LayersPanel, ObjectGroupsPanel } from '../../components/RightPanels'
import { EventTimelinePanel } from '../../components/panels/bottom/EventTimelinePanel'
import { EventCommandInspectorPanel } from '../../components/panels/right/EventCommandInspectorPanel'
import { EventDirectoryPanel } from '../../components/panels/right/EventDirectoryPanel'
import type { FocusedMapObjectTarget, TileHoverInfo } from '../../components/MapViewport'
import type { WorkspacePanelConfig } from '../../components/WorkspaceLayout'
import type { EventAssetSummary, GameDirectoryInfo, MapAssetSummary } from '../desktop'
import type { PlayerAppearanceProfile } from './playerAppearance'
import type { EditorCopy, LocaleCode, ModuleBlueprint, ThemeMode, WorkspaceMode } from '../editor-shell'
import type { EventScript, ParsedEventAsset } from '../events/types'
import type { MapDocument } from '../maps/types'
import type { WorldAtlasView } from './types'

type BuildWorkspacePanelsOptions = {
  copy: EditorCopy
  locale: LocaleCode
  workspaceMode: WorkspaceMode
  desktopHost: boolean
  gameDirectory: string
  onGameDirectoryChange: (value: string) => void
  onChooseDirectory: () => void
  onUseKnownPath: () => void
  onValidateOnly: () => void
  onScanAndOpenTown: () => void
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
  activeSceneLabel?: string
  activePlayerAppearanceProfile: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow: () => void
}

export function buildWorkspacePanels({
  copy,
  locale,
  workspaceMode,
  desktopHost,
  gameDirectory,
  onGameDirectoryChange,
  onChooseDirectory,
  onUseKnownPath,
  onValidateOnly,
  onScanAndOpenTown,
  directoryInfo,
  mapAssets,
  filteredAssets,
  activeMapId,
  activeAssetName,
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
  activeSceneLabel,
  activePlayerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
}: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  return [
    {
      id: 'project',
      title: copy.leftDock.project,
      subtitle: copy.leftDock.projectSubtitle,
      minWidth: 300,
      minHeight: 280,
      dockMinHeight: 220,
      dockAutoHeight: true,
      defaultDock: 'left-top',
      defaultDockHeight: 280,
      content: (
        <ProjectPanel
          copy={copy}
          workspaceMode={workspaceMode}
          desktopHost={desktopHost}
          gameDirectory={gameDirectory}
          onGameDirectoryChange={onGameDirectoryChange}
          onChooseDirectory={onChooseDirectory}
          onUseKnownPath={onUseKnownPath}
          onValidateOnly={onValidateOnly}
          onScanAndOpenTown={onScanAndOpenTown}
          directoryInfo={directoryInfo}
          mapAssets={mapAssets}
          activeMapId={activeMapId}
          sceneLabel={workspaceMode === 'map' ? activeAssetName : activeSceneLabel}
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
      defaultDock: 'left-bottom',
      defaultDockHeight: 520,
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
      ) : (
        <CentralWorkspace
          copy={copy}
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
          onHoverChange={onHoverChange}
          moduleBlueprint={moduleBlueprint}
        />
      ),
    },
    {
      id: 'inspector',
      title: workspaceMode === 'events' ? 'Event Directory' : copy.rightDock.inspector,
      subtitle: workspaceMode === 'events' ? eventStatusMessage : copy.rightDock.sceneSummary,
      minWidth: 320,
      minHeight: 260,
      dockMinHeight: 180,
      dockAutoHeight: true,
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
        ) : (
          <InspectorPanel copy={copy} mapDocument={mapDocument} moduleBlueprint={moduleBlueprint} />
        ),
    },
    {
      id: 'layers',
      title: workspaceMode === 'events' ? 'Command Inspector' : copy.rightDock.layers,
      subtitle: workspaceMode === 'events' ? (selectedEvent?.eventId ?? parsedEventAsset?.asset.name ?? '') : copy.rightDock.subtitle,
      minWidth: 320,
      minHeight: workspaceMode === 'events' ? 180 : 260,
      dockMinHeight: workspaceMode === 'events' ? 160 : 220,
      dockAutoHeight: workspaceMode === 'events',
      defaultDock: 'right-bottom',
      defaultDockHeight: workspaceMode === 'events' ? 220 : 320,
      content:
        workspaceMode === 'events' ? (
          <EventCommandInspectorPanel
            locale={locale}
            selectedEvent={selectedEvent}
            selectedTimelineEntryId={selectedTimelineEntryId}
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
    ...(workspaceMode === 'events'
      ? []
      : [
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
        ]),
    {
      id: 'diagnostics',
      title: workspaceMode === 'events' ? 'Script Timeline' : copy.rightDock.diagnostics,
      subtitle: workspaceMode === 'events' ? (selectedEvent?.eventId ?? parsedEventAsset?.asset.name ?? '') : copy.rightDock.projectFacts,
      minWidth: 320,
      minHeight: 180,
      dockMinHeight: 140,
      dockAutoHeight: true,
      defaultDock: workspaceMode === 'events' ? 'left-bottom' : 'bottom-right',
      defaultDockHeight: 190,
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
        ) : (
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
}
