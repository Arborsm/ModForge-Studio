import { useCallback, useMemo, useState } from 'react'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { useEventWorkspace } from '../../workspaces/event-stage'
import { buildEventsWorkspacePanels } from '../../model/workspace-panels/events'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useEntityBrowserRuntimeProps } from './entityBrowserRuntimeProps'

export default function EventBrowserModuleRuntime() {
  const props = useEntityBrowserRuntimeProps()
  const eventWorkspace = useEventWorkspace({ copy: props.copy, locale: props.locale, directoryInfo: props.directoryInfo })
  const [currentEventCommandId, setCurrentEventCommandId] = useState<string | null>(null)
  const [stageSeek, setStageSeek] = useState<((entryId: string) => void) | null>(null)
  const registerStageSeek = useCallback((seekTimelineEntry: (entryId: string) => void) => {
    setStageSeek(() => seekTimelineEntry)
    return () => setStageSeek(null)
  }, [])
  const handleActivateTimelineEntry = useCallback((entryId: string) => stageSeek?.(entryId), [stageSeek])
  const workspacePanels = useMemo(
    () =>
      buildEventsWorkspacePanels({
        copy: props.copy,
        locale: props.locale,
        directoryInfo: props.directoryInfo,
        theme: props.theme,
        accentColor: props.accentColor,
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
        activePlayerAppearanceProfile: props.playerAppearanceProfile,
        onOpenPlayerAppearanceWindow: props.onOpenPlayerAppearanceWindow,
      }),
    [props, eventWorkspace, currentEventCommandId, handleActivateTimelineEntry, registerStageSeek],
  ) satisfies WorkspacePanelConfig[]
  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={props.workspaceLayoutRef}
      workspaceLayoutStorageKey={props.workspaceLayoutStorageKey}
      workspaceLayouts={props.workspaceLayouts}
      workspacePanels={workspacePanels}
      onPersistStateChange={props.onPersistStateChange}
    />
  )
}
