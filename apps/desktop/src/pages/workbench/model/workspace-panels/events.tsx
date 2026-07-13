import type { ReactNode } from 'react'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { EventBrowserPanel } from '../../ui/workspace-panels/event/EventBrowserPanel'
import { EventDetailPanel } from '../../ui/workspace-panels/event/EventDetailPanel'
import { EventStageWorkspace } from '../../workspaces/event-stage'
import type { BuildEventPanelsOptions } from './types'

/**
 * Event browse workspace: hierarchical file browser, stage preview, unified detail rail.
 * Edit-mode EventPatchEditor is unchanged and lives outside this panel set.
 */
export function buildEventsWorkspacePanels(options: BuildEventPanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    locale,
    directoryInfo,
    theme,
    accentColor,
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
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const shellClassName = 'workspace-panel-shell-flat item-workspace-panel-shell'
  const labels = copy.eventStage.workflow.workspacePanels
  const events = parsedEventAsset?.events ?? []
  const assetName = parsedEventAsset?.asset.name ?? null
  const assetPath = parsedEventAsset?.resolvedRelativePath ?? parsedEventAsset?.asset.relativePath ?? null

  return [
    {
      id: 'event-browser/browser',
      title: labels.browserTitle,
      subtitle: eventStatusMessage || labels.browserSubtitle,
      hideDockHeader: true,
      shellClassName,
      minWidth: 200,
      minHeight: 320,
      area: 'left',
      content: withPreviewReveal(
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
          events={events}
          selectedEventKey={selectedEventKey}
          assetFilter={eventAssetFilter}
          onAssetFilterChange={onEventAssetFilterChange}
          onOpenAsset={onOpenEventAsset}
          onOpenModAsset={onOpenModEventAsset}
          onSelectEvent={onSelectEvent}
        />,
      ),
    },
    {
      id: 'event-browser/stage',
      title: copy.eventStage.scene,
      subtitle: selectedEvent?.eventId ?? eventStatusMessage,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat event-stage-panel-shell',
      minWidth: 480,
      minHeight: 420,
      area: 'center',
      content: withPreviewReveal(
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
      ),
    },
    {
      id: 'event-browser/detail',
      title: labels.inspectorTitle,
      subtitle: selectedEvent?.eventId ?? eventStatusMessage,
      hideDockHeader: true,
      shellClassName,
      minWidth: 220,
      minHeight: 320,
      area: 'right',
      content: withPreviewReveal(
        'workbench-events-detail',
        2,
        <EventDetailPanel
          selectedEvent={selectedEvent}
          selectedTimelineEntryId={selectedTimelineEntryId}
          currentCommandId={currentEventCommandId}
          assetName={assetName}
          assetPath={assetPath}
          modSources={activeEventModSources}
          onSelectTimelineEntry={onSelectTimelineEntry}
          onActivateTimelineEntry={onActivateTimelineEntry}
        />,
      ),
    },
  ]
}
