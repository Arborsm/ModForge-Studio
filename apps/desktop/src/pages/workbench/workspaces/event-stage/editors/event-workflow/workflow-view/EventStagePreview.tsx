import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { EVENT_SETUP_ENTRY_ID } from '@entities/event'
import { loadImageResource, type LoadedImageResource } from '@shared/lib/assets'
import type { EventAssetSummary } from '@entities/game/api'
import type { GameDirectoryInfo, MapAssetContent } from '@entities/game/api'
import { validateGameDirectory } from '@entities/game/api'
import type { EventScript, ParsedEventAsset, PlayerAppearanceProfile } from '@entities/event'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import EventStageWorkspace, { type EventStageWorkspaceChromeMode } from '../../../view/EventStageWorkspace'
import { useEditorStore } from '../workflow-model/editorStore'

export type EventStagePreviewAssetLoader = {
  loadMapAsset: (gameRootPath: string, mapPath: string, locale: string) => Promise<MapAssetContent>
  loadOptionalImageDataUrl: (path: string, locale?: string) => Promise<string | null>
  loadOptionalImageResource?: (path: string, locale?: string) => Promise<LoadedImageResource | null>
  validateGameDirectory: (gameRootPath: string) => Promise<GameDirectoryInfo>
}

type EventStagePreviewProps = {
  eventScript: EventScript | null
  mapName: string | null
  gameRootPath: string | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  className?: string
  additionalViewportOverlay?: ReactNode
  hideViewportStatus?: boolean
  hideHeader?: boolean
  chromeMode?: EventStageWorkspaceChromeMode
  onTileClick?: (tileX: number, tileY: number) => void
  onContextMenuAction?: (action: 'addActor' | 'setCamera' | 'addWarp' | 'conditionBuilder', tileX: number, tileY: number) => void
  conditionBuilderLabel?: string
  onActorAssetsChange?: (assets: Record<string, { spriteUrl: string | null; portraitUrl: string | null }>) => void
  assetLoader?: EventStagePreviewAssetLoader
  directoryInfo?: GameDirectoryInfo | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
  onPlaybackCommandChange?: (commandId: string | null) => void
}

const EMPTY_VIEWPORT_LABELS = {} as ViewportLabels

const fallbackViewportLabels: ViewportLabels = {
  loadPrompt: 'Load a map',
  zoomOut: 'Zoom out',
  oneToOne: '1:1',
  fit: 'Fit',
  zoomIn: 'Zoom in',
  fitMap: 'Fit map',
  setOneToOne: 'Set 1:1',
  centerView: 'Center view',
  resetPan: 'Reset pan',
  addObjectHere: 'Add object here',
  inspectHover: 'Inspect hover',
  unavailable: 'Unavailable',
  tilesLabel: 'Tiles',
  tilesetsLoadedLabel: (loaded, total) => `${loaded}/${total} tilesets`,
  layersVisibleLabel: (visible, total) => `${visible}/${total} layers`,
  objectGroupsVisibleLabel: (visible, total) => `${visible}/${total} object groups`,
  zoomLabel: (zoom) => `${Math.round(zoom * 100)}%`,
  failedToLoadTilesetImage: (path) => `Failed to load ${path}`,
}

function mergeViewportLabels(labels: ViewportLabels) {
  return { ...fallbackViewportLabels, ...labels }
}

export function EventStagePreview({
  eventScript,
  mapName,
  gameRootPath,
  locale = 'en-US',
  theme = 'light',
  accentColor = '#6366f1',
  viewportLabels = EMPTY_VIEWPORT_LABELS,
  className,
  additionalViewportOverlay,
  hideViewportStatus,
  hideHeader,
  chromeMode = 'workspace',
  onTileClick,
  onContextMenuAction,
  conditionBuilderLabel,
  onActorAssetsChange,
  assetLoader,
  directoryInfo,
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
  onPlaybackCommandChange,
}: EventStagePreviewProps) {
  const seekRef = useRef<((entryId: string) => void) | null>(null)
  const selectedCommandIndex = useEditorStore((state) => state.selectedCommandIndex)
  const selectedCommandId = selectedCommandIndex == null ? EVENT_SETUP_ENTRY_ID : (eventScript?.commands[selectedCommandIndex]?.id ?? null)
  const effectiveViewportLabels = useMemo(() => mergeViewportLabels(viewportLabels), [viewportLabels])
  const imageResourceLoader = useCallback(
    async (path: string, imageLocale?: string) => {
      if (!assetLoader) {
        return null
      }
      if (assetLoader.loadOptionalImageResource) {
        return assetLoader.loadOptionalImageResource(path, imageLocale)
      }
      const dataUrl = await assetLoader.loadOptionalImageDataUrl(path, imageLocale)
      return dataUrl ? loadImageResource(dataUrl).catch(() => null) : null
    },
    [assetLoader],
  )

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

  const registerSeek = useCallback((seekTimelineEntry: (entryId: string) => void) => {
    seekRef.current = seekTimelineEntry
    return () => {
      if (seekRef.current === seekTimelineEntry) {
        seekRef.current = null
      }
    }
  }, [])

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
    void assetLoader.validateGameDirectory(gameRootPath).catch(() => validateGameDirectory(gameRootPath).catch(() => null))
  }, [assetLoader, directoryInfo, gameRootPath])

  return (
    <EventStageWorkspace
      locale={locale}
      directoryInfo={effectiveDirectoryInfo}
      viewportLabels={effectiveViewportLabels}
      theme={theme}
      accentColor={accentColor}
      parsedEventAsset={parsedEventAsset}
      selectedEvent={eventScript}
      eventStatusMessage={mapName ?? ''}
      playerAppearanceProfile={playerAppearanceProfile ?? null}
      onSelectTimelineEntry={() => {}}
      onPlaybackCommandChange={onPlaybackCommandChange ?? (() => {})}
      onStageSeekReady={registerSeek}
      onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow ?? (() => {})}
      className={className}
      hideHeader={hideHeader}
      chromeMode={chromeMode}
      additionalViewportOverlay={additionalViewportOverlay}
      hideViewportStatus={hideViewportStatus}
      onTileClick={onTileClick}
      onContextMenuAction={onContextMenuAction}
      conditionBuilderLabel={conditionBuilderLabel}
      mapAssetLoader={assetLoader?.loadMapAsset}
      imageResourceLoader={assetLoader ? imageResourceLoader : undefined}
      onActorAssetsChange={onActorAssetsChange}
    />
  )
}
