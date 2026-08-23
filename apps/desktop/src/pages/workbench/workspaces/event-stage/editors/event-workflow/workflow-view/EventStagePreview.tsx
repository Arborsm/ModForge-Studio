import { orNull } from '@platform/observability'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { EVENT_SETUP_ENTRY_ID } from '@entities/event'
import { loadImageResource, type LoadedImageResource } from '@shared/lib/assets'
import type { EventAssetSummary } from '@entities/game/api'
import type { GameDirectoryInfo, MapAssetContent } from '@entities/game/api'
import { validateGameDirectory } from '@entities/game/api'
import type { EventScript, ParsedEventAsset, PlayerAppearanceProfile } from '@entities/event'
import type { LocaleCode, ThemeMode } from '@locales/api'
import EventStageWorkspace, { type EventStageWorkspaceChromeMode } from '../../../view/EventStageWorkspace'
import { useEditorStore } from '../workflow-model/editorStore'

export type EventStagePreviewAssetLoader = {
  loadMapAsset: (gameRootPath: string, mapPath: string, locale: string) => Promise<MapAssetContent>
  loadOptionalImageDataUrl: (path: string, locale?: string) => Promise<string | null>
  loadOptionalImageResource?: (path: string, locale?: string) => Promise<LoadedImageResource | null>
  validateGameDirectory: (gameRootPath: string) => Promise<GameDirectoryInfo>
}

type EventStagePreviewProps = {
  eventData: {
    eventScript: EventScript | null
    mapName: string | null
    playerAppearanceProfile?: PlayerAppearanceProfile | null
  }
  environment: {
    gameRootPath: string | null
    locale?: LocaleCode
    theme?: ThemeMode
    accentColor?: string
    directoryInfo?: GameDirectoryInfo | null
  }
  chrome?: {
    className?: string
    additionalViewportOverlay?: ReactNode
    hideViewportStatus?: boolean
    hideHeader?: boolean
    chromeMode?: EventStageWorkspaceChromeMode
  }
  loaders?: {
    assetLoader?: EventStagePreviewAssetLoader
  }
  actions?: {
    tileClick?: (tileX: number, tileY: number) => void
    contextMenuAction?: (action: 'addActor' | 'setCamera' | 'addWarp' | 'conditionBuilder', tileX: number, tileY: number) => void
    actorAssetsChange?: (assets: Record<string, { spriteUrl: string | null; portraitUrl: string | null }>) => void
    openPlayerAppearanceWindow?: () => void
    playbackCommandChange?: (commandId: string | null) => void
  }
}

export function EventStagePreview({ eventData, environment, chrome, loaders, actions }: EventStagePreviewProps) {
  const { eventScript, mapName, playerAppearanceProfile } = eventData
  const { gameRootPath, locale = 'en-US', theme = 'light', accentColor = '#6366f1', directoryInfo } = environment
  const { className, additionalViewportOverlay, hideViewportStatus, hideHeader, chromeMode = 'workspace' } = chrome ?? {}
  const { assetLoader } = loaders ?? {}
  const {
    tileClick: onTileClick,
    contextMenuAction: onContextMenuAction,
    actorAssetsChange: onActorAssetsChange,
    openPlayerAppearanceWindow: onOpenPlayerAppearanceWindow,
    playbackCommandChange: onPlaybackCommandChange,
  } = actions ?? {}
  const seekRef = useRef<((entryId: string) => void) | null>(null)
  const selectedCommandIndex = useEditorStore((state) => state.selectedCommandIndex)
  const selectedCommandId = selectedCommandIndex == null ? EVENT_SETUP_ENTRY_ID : (eventScript?.commands[selectedCommandIndex]?.id ?? null)
  const imageResourceLoader = async (path: string, imageLocale?: string) => {
    if (!assetLoader) {
      return null
    }
    if (assetLoader.loadOptionalImageResource) {
      return assetLoader.loadOptionalImageResource(path, imageLocale)
    }
    const dataUrl = await assetLoader.loadOptionalImageDataUrl(path, imageLocale)
    return dataUrl ? orNull(loadImageResource(dataUrl), 'eventStagePreview.loadImageResource') : null
  }

  const effectiveDirectoryInfo = useMemo<GameDirectoryInfo | null>(() => {
    if (directoryInfo) {
      return directoryInfo
    }
    if (!gameRootPath) {
      return null
    }
    return {
      rootPath: gameRootPath,
      executablePath: '',
      mapsPath: `${gameRootPath}\\Content\\Maps`,
      mapCount: 0,
    }
  }, [directoryInfo, gameRootPath])

  const parsedEventAsset = useMemo<ParsedEventAsset | null>(() => {
    if (!eventScript || !mapName) {
      return null
    }

    const relativePath = `Data/Events/${mapName}`
    const asset: EventAssetSummary = {
      id: `draft-event:${eventScript.key}`,
      name: mapName,
      fileName: `${mapName}.json`,
      absolutePath: relativePath,
      relativePath,
      sizeBytes: eventScript.rawScript.length,
    }

    return {
      asset,
      locale,
      resolvedRelativePath: relativePath,
      events: [eventScript],
      eventIndex: { [eventScript.key]: eventScript },
    }
  }, [eventScript, locale, mapName])

  const registerSeek = (seekTimelineEntry: (entryId: string) => void) => {
    seekRef.current = seekTimelineEntry
    return () => {
      if (seekRef.current === seekTimelineEntry) {
        seekRef.current = null
      }
    }
  }

  useEffect(() => {
    if (!selectedCommandId) {
      return
    }
    seekRef.current?.(selectedCommandId)
  }, [selectedCommandId])

  useEffect(() => {
    if (!gameRootPath || directoryInfo || !assetLoader) {
      return
    }
    void assetLoader.validateGameDirectory(gameRootPath).catch(() => validateGameDirectory(gameRootPath))
  }, [assetLoader, directoryInfo, gameRootPath])

  return (
    <EventStageWorkspace
      environment={{ locale, directoryInfo: effectiveDirectoryInfo, theme, accentColor }}
      eventData={{
        parsedEventAsset,
        selectedEvent: eventScript,
        eventStatusMessage: mapName ?? '',
        playerAppearanceProfile: playerAppearanceProfile ?? null,
      }}
      chrome={{ className, hideHeader, chromeMode, additionalViewportOverlay, hideViewportStatus }}
      loaders={{
        mapAssetLoader: assetLoader?.loadMapAsset,
        imageResourceLoader: assetLoader ? imageResourceLoader : undefined,
      }}
      actions={{
        selectTimelineEntry: () => {},
        playbackCommandChange: onPlaybackCommandChange ?? (() => {}),
        stageSeekReady: registerSeek,
        openPlayerAppearanceWindow: onOpenPlayerAppearanceWindow ?? (() => {}),
        tileClick: onTileClick,
        contextMenuAction: onContextMenuAction,
        actorAssetsChange: onActorAssetsChange,
      }}
    />
  )
}
