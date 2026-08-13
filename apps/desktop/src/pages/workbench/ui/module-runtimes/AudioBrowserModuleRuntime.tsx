import { useMemo } from 'react'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { useAudioWorkspace } from '../../workspaces/audio'
import { buildAudioWorkspacePanels } from '../../model/workspace-panels/audio'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'

export default function AudioBrowserModuleRuntime() {
  const { copy, locale, environment, moduleState } = useWorkbenchRuntimeInputs()
  const workspace = useAudioWorkspace({
    directoryInfo: environment.directoryInfo,
    locale,
    active: environment.active,
  })

  const workspacePanels = useMemo(
    () =>
      buildAudioWorkspacePanels({
        copy,
        cues: workspace.cues,
        filteredCues: workspace.filteredCues,
        filter: workspace.filter,
        onFilterChange: workspace.setFilter,
        kindFilter: workspace.kindFilter,
        onKindFilterChange: workspace.setKindFilter,
        activeCueId: workspace.activeCueId,
        activeCue: workspace.activeCue,
        playing: workspace.playing,
        quickPlayRequest: workspace.quickPlayRequest,
        onSelectCue: workspace.handleSelectCue,
        onQuickPlay: workspace.handleQuickPlay,
        onPlayingChange: workspace.reportPlaying,
        active: environment.active,
        rootPath: environment.directoryInfo?.rootPath ?? null,
        loading: workspace.status === 'loading',
        statusMessage: workspace.statusMessage,
      }) satisfies WorkspacePanelConfig[],
    [copy, workspace, environment.directoryInfo?.rootPath],
  )

  return (
    <div className="absolute inset-0 min-h-0 overflow-hidden">
      <WorkbenchLayoutHost
        workspaceLayoutRef={moduleState.layoutRef}
        workspaceLayoutStorageKey={moduleState.persistenceKey}
        workspaceLayouts={moduleState.layouts}
        workspacePanels={workspacePanels}
        onPersistStateChange={moduleState.onPersistStateChange}
      />
    </div>
  )
}
