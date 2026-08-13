import type { ReactNode } from 'react'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import { AudioBrowserPanel } from '../../ui/workspace-panels/audio/AudioBrowserPanel'
import { AudioPreviewPanel } from '../../ui/workspace-panels/audio/AudioPreviewPanel'
import type { AudioCueEntry, AudioKindFilter, AudioQuickPlayRequest } from '../../workspaces/audio'

type BuildAudioPanelsOptions = {
  copy: {
    audioPanel: {
      browserTitle: string
      browserSubtitle: string
      previewTitle: string
    }
  }
  cues: AudioCueEntry[]
  filteredCues: AudioCueEntry[]
  filter: string
  onFilterChange: (value: string) => void
  kindFilter: AudioKindFilter
  onKindFilterChange: (value: AudioKindFilter) => void
  activeCueId: string | null
  activeCue: AudioCueEntry | null
  playing: boolean
  quickPlayRequest: AudioQuickPlayRequest | null
  onSelectCue: (cueId: string) => void
  onQuickPlay: (cueId: string) => void
  onPlayingChange: (playing: boolean) => void
  active: boolean
  rootPath: string | null
  loading: boolean
  statusMessage: string
}

/**
 * Audio browse workspace: full-width catalog grid on top, player bar docked bottom.
 */
export function buildAudioWorkspacePanels(options: BuildAudioPanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    cues,
    filteredCues,
    filter,
    onFilterChange,
    kindFilter,
    onKindFilterChange,
    activeCueId,
    activeCue,
    playing,
    quickPlayRequest,
    onSelectCue,
    onQuickPlay,
    onPlayingChange,
    active,
    rootPath,
    loading,
    statusMessage,
  } = options

  const withPreviewReveal = (itemId: string, index: number, content: ReactNode) => (
    <LoadingMotionReveal itemId={itemId} index={index} className="h-full min-h-0">
      {content}
    </LoadingMotionReveal>
  )

  const shellClassName = 'workspace-panel-shell-flat audio-browser-panel-shell'
  const labels = copy.audioPanel
  const subtitle = activeCue?.label ?? statusMessage

  return [
    {
      id: 'audio-browser/browser',
      title: labels.browserTitle,
      subtitle: labels.browserSubtitle,
      hideDockHeader: true,
      shellClassName,
      minWidth: 480,
      minHeight: 320,
      area: 'center',
      content: withPreviewReveal(
        'workbench-audio-browser',
        0,
        <AudioBrowserPanel
          cues={cues}
          filteredCues={filteredCues}
          filter={filter}
          onFilterChange={onFilterChange}
          kindFilter={kindFilter}
          onKindFilterChange={onKindFilterChange}
          activeCueId={activeCueId}
          playing={playing}
          onSelectCue={onSelectCue}
          onQuickPlay={onQuickPlay}
        />,
      ),
    },
    {
      id: 'audio-browser/preview',
      title: labels.previewTitle,
      subtitle,
      hideDockHeader: true,
      shellClassName,
      minWidth: 480,
      minHeight: 180,
      area: 'bottom',
      content: withPreviewReveal(
        'workbench-audio-preview',
        1,
        <AudioPreviewPanel
          cue={activeCue}
          rootPath={rootPath}
          loading={loading}
          statusMessage={statusMessage}
          active={active}
          quickPlayRequest={quickPlayRequest}
          onPlayingChange={onPlayingChange}
        />,
      ),
    },
  ]
}
