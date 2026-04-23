import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Grid2x2, UserPlus, Camera, MapPin, Route } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { loadMapAsset, validateGameDirectory } from '../../lib/desktop'
import { loadImageUrlFromPath } from '../../lib/imageMetrics'
import type { MapDocument } from '../../lib/maps/types'
import type { EventSceneActor, EventScript } from '../../lib/events/types'
import { MapViewport, type ViewportWorldPoint, type TileHoverInfo } from '../MapViewport'
import { cx } from '../../lib/cx'
import { StagePathOverlay } from './StagePathOverlay'
import { ActorSprite } from './ActorSprite'
import { useEditorStore } from '../../lib/events/editorStore'

const FARMER_NAME_PATTERN = /^farmer\d*$/iu
const EVENT_STAGE_INITIAL_ZOOM = 2.5

function normalizeActorName(value: string) {
  return value.trim().replace(/\?$/u, '')
}

function toActorKey(actorName: string) {
  return normalizeActorName(actorName).toLowerCase()
}

function isFarmerActor(actorName: string) {
  return FARMER_NAME_PATTERN.test(normalizeActorName(actorName))
}

function getTextureName(actorName: string) {
  const normalized = normalizeActorName(actorName)
  if (!normalized || normalized === 'player' || isFarmerActor(normalized) || normalized === 'spouse') {
    return null
  }
  return normalized
}

function getDefaultFrame(direction: number) {
  switch (direction) {
    case 0:
      return 8
    case 1:
      return 4
    case 3:
      return 12
    default:
      return 0
  }
}

function resolveActorFocusTile(actorMap: Record<string, EventActorState>) {
  const farmer = Object.values(actorMap).find((actor) => isFarmerActor(actor.actorName))
  const primary = farmer ?? Object.values(actorMap)[0]
  return primary ? { tileX: primary.tileX, tileY: primary.tileY } : null
}

function resolveCameraFocus(
  event: EventScript | null,
  actorMap: Record<string, EventActorState>,
) {
  if (!event) return resolveActorFocusTile(actorMap)
  const raw = event.scene.cameraInstruction?.trim()
  if (!raw || raw === 'continue' || raw === 'follow') {
    return resolveActorFocusTile(actorMap)
  }
  const parts = raw.split(/\s+/u)
  const tileX = Number.parseInt(parts[0] ?? '', 10)
  const tileY = Number.parseInt(parts[1] ?? '', 10)
  if (Number.isFinite(tileX) && Number.isFinite(tileY)) {
    return { tileX, tileY }
  }
  const actor = actorMap[toActorKey(raw)]
  return actor ? { tileX: actor.tileX, tileY: actor.tileY } : resolveActorFocusTile(actorMap)
}

type EventActorState = {
  id: string
  actorName: string
  textureName: string | null
  tileX: number
  tileY: number
  facingDirection: number
  frame: number
  spritePath: string | null
  portraitPath: string | null
  spriteUrl: string | null
  portraitUrl: string | null
}

function createActorState(actor: EventSceneActor, rootPath: string | null): EventActorState {
  const textureName = getTextureName(actor.actorName)
  return {
    id: actor.id,
    actorName: actor.actorName,
    textureName,
    tileX: actor.tileX,
    tileY: actor.tileY,
    facingDirection: actor.facingDirection,
    frame: getDefaultFrame(actor.facingDirection),
    spritePath: textureName && rootPath ? `${rootPath}\\Content\\Characters\\${textureName}.xnb` : null,
    portraitPath: textureName && rootPath ? `${rootPath}\\Content\\Portraits\\${textureName}.xnb` : null,
    spriteUrl: null,
    portraitUrl: null,
  }
}

function buildActorMap(event: EventScript | null, rootPath: string | null): Record<string, EventActorState> {
  if (!event) return {}
  return Object.fromEntries(
    event.scene.actors.map((actor) => {
      const actorState = createActorState(actor, rootPath)
      return [toActorKey(actor.actorName), actorState]
    }),
  )
}

// ─── Component ───────────────────────────────────────────────────────────

export interface EventStagePreviewProps {
  eventScript: EventScript | null
  mapName: string | null
  gameRootPath: string | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  className?: string
  /** Additional overlay rendered on top of the map (inside map coordinate space). */
  additionalMapOverlay?: ReactNode
  /** Additional overlay rendered on top of the viewport (screen space). */
  additionalViewportOverlay?: ReactNode
  /** Hide default header. */
  hideHeader?: boolean
  /** Initial zoom level. */
  initialZoom?: number
  /** Callback fired when actor sprite/portrait assets are loaded. */
  onActorAssetsChange?: (assets: Record<string, { spriteUrl: string | null; portraitUrl: string | null }>) => void
  /** Callback fired when user clicks on a tile in the map. */
  onTileClick?: (tileX: number, tileY: number) => void
  /** Callback fired when user selects a context menu action on the map. */
  onContextMenuAction?: (action: 'addActor' | 'setCamera' | 'addWarp', tileX: number, tileY: number) => void
}

export function EventStagePreview({
  eventScript,
  mapName,
  gameRootPath,
  locale = 'en-US',
  theme = 'light',
  accentColor = '#6366f1',
  viewportLabels = {} as ViewportLabels,
  className,
  additionalMapOverlay,
  additionalViewportOverlay,
  hideHeader,
  initialZoom = EVENT_STAGE_INITIAL_ZOOM,
  onActorAssetsChange,
  onTileClick,
  onContextMenuAction,
}: EventStagePreviewProps) {
  const [mapDocument, setMapDocument] = useState<MapDocument | null>(null)
  const [mapError, setMapError] = useState('')
  const [actorAssets, setActorAssets] = useState<Record<string, { spriteUrl: string | null; portraitUrl: string | null }>>({})
  const [showGrid, setShowGrid] = useState(true)
  const [showPaths, setShowPaths] = useState(true)
  const [hoverInfo, setHoverInfo] = useState<TileHoverInfo | null>(null)
  const selectedCommandIndex = useEditorStore((s) => s.selectedCommandIndex)

  // Load map
  useEffect(() => {
    if (!gameRootPath || !mapName) {
      setMapDocument(null)
      setMapError(gameRootPath ? 'No map name provided.' : '')
      return
    }

    let cancelled = false
    setMapError('')

    void (async () => {
      try {
        const directoryInfo = await validateGameDirectory(gameRootPath)
        if (cancelled) return
        if (!directoryInfo.mapsPath) {
          setMapDocument(null)
          setMapError('No maps folder found in game directory.')
          return
        }

        const mapPath = `${directoryInfo.mapsPath}\\${mapName}.xnb`
        const asset = await loadMapAsset(gameRootPath, mapPath, locale)
        if (cancelled) return

        if (asset.format === 'xnb') {
          const doc = JSON.parse(asset.content) as MapDocument
          setMapDocument(doc)
        } else {
          setMapDocument(null)
          setMapError('Only XNB maps can be staged for events.')
        }
      } catch (err) {
        if (!cancelled) {
          setMapDocument(null)
          setMapError(err instanceof Error ? err.message : String(err))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gameRootPath, mapName, locale])

  // Build actor map from event script
  const actorMap = useMemo(() => buildActorMap(eventScript, gameRootPath), [eventScript, gameRootPath])

  // Load actor sprites and portraits
  useEffect(() => {
    if (!gameRootPath || Object.keys(actorMap).length === 0) {
      setActorAssets({})
      onActorAssetsChange?.({})
      return
    }

    let cancelled = false

    void (async () => {
      const entries = await Promise.all(
        Object.values(actorMap).map(async (actor) => {
          const key = toActorKey(actor.actorName)
          const spriteUrl = actor.spritePath ? await loadImageUrlFromPath(actor.spritePath).catch(() => null) : null
          const portraitUrl = actor.portraitPath ? await loadImageUrlFromPath(actor.portraitPath).catch(() => null) : null
          return [key, { spriteUrl, portraitUrl }] as const
        }),
      )
      const next = Object.fromEntries(entries)
      if (!cancelled) {
        setActorAssets(next)
        onActorAssetsChange?.(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [actorMap, gameRootPath, onActorAssetsChange])

  const focusWorldPoint = useMemo<ViewportWorldPoint | null>(() => {
    if (!mapDocument) return null
    const focusTile = resolveCameraFocus(eventScript, actorMap)
    if (!focusTile) return null
    return {
      worldX: (focusTile.tileX + 0.5) * mapDocument.tileWidth,
      worldY: (focusTile.tileY + 0.5) * mapDocument.tileHeight,
    }
  }, [mapDocument, eventScript, actorMap])

  const baseMapOverlay = useMemo(() => {
    if (!mapDocument) return null

    return (
      <>
        {showPaths && (
          <StagePathOverlay
            eventScript={eventScript}
            mapDocument={mapDocument}
            selectedCommandIndex={selectedCommandIndex}
          />
        )}
        {Object.values(actorMap)
          .sort((left, right) => left.tileY - right.tileY)
          .map((actor) => {
            const actorKey = toActorKey(actor.actorName)
            const spriteUrl = actorAssets[actorKey]?.spriteUrl ?? null

            return (
              <ActorSprite
                key={actor.id}
                actorKey={actorKey}
                actorName={actor.actorName}
                spriteUrl={spriteUrl}
                initialTileX={actor.tileX}
                initialTileY={actor.tileY}
                initialDirection={actor.facingDirection}
                tileWidth={mapDocument.tileWidth}
                tileHeight={mapDocument.tileHeight}
                eventScript={eventScript}
                selectedCommandIndex={selectedCommandIndex}
              />
            )
          })}
      </>
    )
  }, [actorMap, actorAssets, mapDocument, eventScript, showPaths, selectedCommandIndex])

  const mapOverlay = (
    <div className="absolute inset-0">
      {baseMapOverlay}
      {additionalMapOverlay}
    </div>
  )

  const viewportOverlay = (
    <div className="absolute inset-0">
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex justify-between gap-3">
          <div className="pointer-events-none rounded-full border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_82%,transparent)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
            {eventScript?.eventId ?? mapName ?? 'Scene'}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          {hoverInfo && (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_86%,transparent)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-panel)]">
                ({hoverInfo.tileX}, {hoverInfo.tileY})
              </span>
              {onTileClick && (
                <button
                  type="button"
                  className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-semibold text-white shadow-sm hover:opacity-90"
                  onClick={() => onTileClick(hoverInfo.tileX, hoverInfo.tileY)}
                >
                  Use
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {additionalViewportOverlay}
    </div>
  )

  const hasValidStage = Boolean(mapDocument && eventScript)
  const bodyHeightClass = hideHeader ? 'h-full' : 'h-[calc(100%-58px)]'

  return (
    <div className={`flex h-full flex-col ${className ?? ''}`}>
      {!hideHeader && (
        <div className="panel-header">
          <div>
            <p className="panel-title">Stage Preview</p>
            <p className="panel-subtitle">
              {mapError || (mapDocument ? `${mapName} — ${eventScript?.scene.actors.length ?? 0} actors` : 'Loading stage...')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cx('workspace-viewport-toolbar-icon-button', showGrid && 'workspace-viewport-toolbar-button-active')}
              title="Toggle grid"
              aria-label="Toggle grid"
              aria-pressed={showGrid}
              disabled={!mapDocument}
              onClick={() => setShowGrid((current) => !current)}
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cx('workspace-viewport-toolbar-icon-button', showPaths && 'workspace-viewport-toolbar-button-active')}
              title="Toggle movement paths"
              aria-label="Toggle movement paths"
              aria-pressed={showPaths}
              disabled={!mapDocument || !eventScript}
              onClick={() => setShowPaths((current) => !current)}
            >
              <Route className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className={`panel-body ${bodyHeightClass} min-h-0 p-3`}>
        {hasValidStage ? (
          <div className="relative h-full">
            <MapViewport
              key={mapDocument ? `${mapDocument.sourcePath}:${eventScript?.key ?? 'event'}` : `empty:${eventScript?.key ?? 'event'}`}
              locale={locale}
              mapDocument={mapDocument}
              visibleLayerIds={mapDocument?.layers.map((layer) => layer.id) ?? []}
              visibleObjectGroupIds={[]}
              labels={viewportLabels}
              theme={theme}
              accentColor={accentColor}
              showGrid={showGrid}
              showStatsChips={false}
              contextMenuEnabled={true}
              contextMenuExtraItems={
                onContextMenuAction && hoverInfo ? (
                  <>
                    <ContextMenu.Separator className="context-menu-separator" />
                    <ContextMenu.Item
                      className="context-menu-item"
                      onSelect={() => onContextMenuAction('addActor', hoverInfo.tileX, hoverInfo.tileY)}
                    >
                      <UserPlus className="mr-1.5 inline h-3.5 w-3.5" />
                      Add Actor Here ({hoverInfo.tileX}, {hoverInfo.tileY})
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="context-menu-item"
                      onSelect={() => onContextMenuAction('setCamera', hoverInfo.tileX, hoverInfo.tileY)}
                    >
                      <Camera className="mr-1.5 inline h-3.5 w-3.5" />
                      Set Camera Here ({hoverInfo.tileX}, {hoverInfo.tileY})
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="context-menu-item"
                      onSelect={() => onContextMenuAction('addWarp', hoverInfo.tileX, hoverInfo.tileY)}
                    >
                      <MapPin className="mr-1.5 inline h-3.5 w-3.5" />
                      Add Warp Here ({hoverInfo.tileX}, {hoverInfo.tileY})
                    </ContextMenu.Item>
                  </>
                ) : null
              }
              initialZoom={initialZoom}
              mapOverlay={mapOverlay}
              viewportOverlay={viewportOverlay}
              focusWorldPoint={focusWorldPoint}
              onHoverChange={setHoverInfo}
              onTileClick={onTileClick}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            {mapError ? (
              <>
                <p className="text-xs text-red-400">{mapError}</p>
                <p className="text-[10px]">Check that the game root path is configured correctly.</p>
              </>
            ) : (
              <>
                <p className="text-xs">Stage preview unavailable.</p>
                <p className="text-[10px]">Requires a valid game root path and map name.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
