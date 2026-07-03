import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { parseEventCommand, parseEventCommands, parseEventSceneSetup, type EventScript } from '@entities/event'
import type { GameDirectoryInfo, MapAssetContent } from '@entities/game/api'
import { localeBundles } from '@locales'
import { useEventStageWorkspace } from '@pages/workbench/workspaces/event-stage/state/useEventStageWorkspace'
import { resetAudioPreview } from '@pages/workbench/workspaces/event-stage/state/audioPreview'

vi.mock('@pages/workbench/workspaces/event-stage/state/audioPreview', () => ({
  playMusicCue: vi.fn(),
  playSoundCue: vi.fn(),
  resetAudioPreview: vi.fn(),
  stopMusicPreview: vi.fn(),
  stopSoundPreview: vi.fn(),
}))

const directoryInfo: GameDirectoryInfo = {
  rootPath: 'E:\\Games\\Stardew Valley',
  executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
  mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
  mapCount: 1,
}

const eventStageCopy = localeBundles['en-US'].editor.eventStage
const viewportLabels = localeBundles['en-US'].editor.viewportLabels

function eventScript(rawScript: string, key = '900001'): EventScript {
  const rawSegments = parseEventCommands(rawScript)
  return {
    key,
    eventId: key,
    preconditions: [key],
    rawScript,
    rawSegments,
    scene: parseEventSceneSetup(rawSegments),
    commands: rawSegments.slice(3).map((rawCommand, index) => parseEventCommand(rawCommand, index)),
  }
}

function mapAssetContent(name: string): MapAssetContent {
  return {
    name,
    format: 'xnb',
    absolutePath: `${directoryInfo.mapsPath}\\${name}.xnb`,
    relativePath: `Content\\Maps\\${name}.xnb`,
    content: JSON.stringify({
      name,
      format: 'xnb',
      sourcePath: `${directoryInfo.mapsPath}\\${name}.xnb`,
      relativePath: `Content\\Maps\\${name}.xnb`,
      width: 4,
      height: 4,
      tileWidth: 16,
      tileHeight: 16,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      properties: {},
      tilesets: [],
      layers: [],
      objectGroups: [],
    }),
  }
}

function renderStageWorkspaceHook(onPlaybackCommandChange = vi.fn()) {
  const selectedEvent = eventScript('spring/follow/Abigail 12 45 2/playMusic wavy/end dialogue')

  return renderHook(() =>
    useEventStageWorkspace({
      copy: eventStageCopy,
      locale: 'en-US',
      directoryInfo,
      viewportLabels,
      parsedEventAsset: {
        asset: {
          id: 'event-town',
          name: 'Town',
          fileName: 'Town.xnb',
          absolutePath: `${directoryInfo.rootPath}\\Content\\Data\\Events\\Town.xnb`,
          relativePath: 'Content\\Data\\Events\\Town.xnb',
          sizeBytes: selectedEvent.rawScript.length,
        },
        locale: 'en-US',
        resolvedRelativePath: 'Content\\Data\\Events\\Town.xnb',
        events: [selectedEvent],
        eventIndex: { [selectedEvent.key]: selectedEvent },
      },
      selectedEvent,
      playerAppearanceProfile: null,
      onSelectTimelineEntry: vi.fn(),
      onPlaybackCommandChange,
      mapAssetLoader: vi.fn(async () => mapAssetContent('Town')),
    }),
  )
}

describe('useEventStageWorkspace audio lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('resets event preview audio when the stage unmounts', async () => {
    const onPlaybackCommandChange = vi.fn()
    const { unmount } = renderStageWorkspaceHook(onPlaybackCommandChange)

    await waitFor(() => expect(resetAudioPreview).toHaveBeenCalled())
    vi.mocked(resetAudioPreview).mockClear()
    onPlaybackCommandChange.mockClear()

    unmount()

    expect(resetAudioPreview).toHaveBeenCalledTimes(1)
    expect(onPlaybackCommandChange).toHaveBeenCalledWith(null)
  })
})
