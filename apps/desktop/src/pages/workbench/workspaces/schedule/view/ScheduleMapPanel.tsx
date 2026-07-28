/**
 * Map panel for the schedule editor.
 *
 * Turns the segment table into a spatial view: the selected segment's location
 * is rendered as a real game map, clicking a tile writes the segment's `x`/`y`
 * back through the normal update path, and consecutive same-location points are
 * connected by a schematic line. No tile pathfinding is attempted — the copy
 * says so explicitly, because the game's own routing is not reproduced here.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { MapPin, RefreshCw } from 'lucide-react'
import { loadCharacterImageState, type CharacterImageState } from '@entities/character'
import { loadMapAsset } from '@entities/game/api'
import { MapViewport, type MapDocument, type MapViewportHandle, type ViewportWorldPoint } from '@entities/map'
import { useLocale, useScheduleEditorCopy } from '@locales/provider'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { useWorkbenchEnvironment } from '../../../model/workbenchModuleContexts'
import { buildScheduleMapPath, resolveScheduleMapLocation, type ScheduleMapPath, type ScheduleSegment } from '../entities/schedule'
import type { ScheduleLocationOption } from '../state/useScheduleWorkspace'

/** Map sub-bundle of the schedule copy, shared by the panel and its overlay. */
type ScheduleMapCopy = ReturnType<typeof useScheduleEditorCopy>['map']

type ScheduleMapPanelProps = {
  segments: ScheduleSegment[]
  locationOptions: ScheduleLocationOption[]
  /** Segment row the author selected; clicks write coordinates into it. */
  selectedIndex: number | null
  /** NPC whose sprite marks the selected point. */
  npcId: string | null
  readOnly: boolean
  onPickTile: (location: string, tileX: number, tileY: number) => void
}

type MapLoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Location the loaded document belongs to, so a stale doc is never drawn. */
  location: string | null
  document: MapDocument | null
  errorMessage: string | null
}

const IDLE_MAP_STATE: MapLoadState = { status: 'idle', location: null, document: null, errorMessage: null }

/** Sprite sheet geometry for an NPC walk sheet: 16x32 frames, 4 per row. */
const NPC_FRAME_WIDTH = 16
const NPC_FRAME_HEIGHT = 32

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template)
}

function formatScheduleTime(time: number) {
  const hours = Math.floor(time / 100)
  const minutes = time % 100
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * NPC walk-sheet load state. A failure is not fatal for the panel — the marker
 * falls back to the numbered dot — but it is still reported in the header so the
 * author knows the sprite is missing rather than assuming the map is wrong.
 */
type SpriteLoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  image: CharacterImageState | null
  errorMessage: string | null
}

const IDLE_SPRITE_STATE: SpriteLoadState = { status: 'idle', image: null, errorMessage: null }

/** Visible layers of a freshly parsed document; authors get the map as shipped. */
function getVisibleLayerIds(document: MapDocument | null) {
  return document?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []
}

function getVisibleObjectGroupIds(document: MapDocument | null) {
  return document?.objectGroups.filter((group) => group.visible).map((group) => group.id) ?? []
}

/**
 * Renders the schematic path as one `<svg>` in the map's own pixel space.
 *
 * The overlay is mounted with `scaleMapOverlayWithViewport`, so the viewport
 * applies zoom around it and every coordinate here stays in unscaled world
 * pixels — tile index times tile size, centred on the tile.
 */
function SchedulePathOverlay({
  path,
  document,
  selectedSegmentIndex,
  sprite,
  copy,
}: {
  path: ScheduleMapPath
  document: MapDocument
  selectedSegmentIndex: number | null
  sprite: SpriteLoadState
  copy: ScheduleMapCopy
}) {
  const clipIdPrefix = useId()
  const width = document.width * document.tileWidth
  const height = document.height * document.tileHeight
  const centerOf = (marker: { tileX: number; tileY: number }) => ({
    x: (marker.tileX + 0.5) * document.tileWidth,
    y: (marker.tileY + 0.5) * document.tileHeight,
  })

  const spriteImage = sprite.status === 'ready' ? sprite.image : null
  const spriteReady = spriteImage?.url != null && spriteImage.width != null && spriteImage.height != null

  return (
    <svg className="schedule-map-overlay-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {path.legs.map((leg) => {
        const from = centerOf(leg.from)
        const to = centerOf(leg.to)
        return (
          <line
            key={`leg-${leg.from.ordinal}-${leg.to.ordinal}`}
            className={leg.uncertain ? 'schedule-map-leg is-uncertain' : 'schedule-map-leg'}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        )
      })}

      {path.transitions.map((transition) => {
        const center = centerOf(transition.marker)
        return (
          <text
            key={`transition-${transition.marker.ordinal}-${transition.direction}`}
            className="schedule-map-transition-label"
            x={center.x}
            y={center.y - document.tileHeight}
            textAnchor="middle"
          >
            {formatTemplate(transition.direction === 'out' ? copy.departsToTemplate : copy.arrivesFromTemplate, {
              location: transition.location,
            })}
          </text>
        )
      })}

      {path.markers.map((marker) => {
        const center = centerOf(marker)
        const selected = marker.segmentIndex === selectedSegmentIndex

        if (selected && spriteReady && spriteImage?.url) {
          // Frame 0 of the walk sheet: one tile wide, two tall, feet on the tile.
          const frameWidth = Math.min(NPC_FRAME_WIDTH, spriteImage.width ?? NPC_FRAME_WIDTH)
          const frameHeight = Math.min(NPC_FRAME_HEIGHT, spriteImage.height ?? NPC_FRAME_HEIGHT)
          const left = center.x - frameWidth / 2
          const top = center.y + document.tileHeight / 2 - frameHeight
          const clipId = `${clipIdPrefix}-${marker.ordinal}`

          return (
            <g key={`marker-${marker.ordinal}`}>
              <clipPath id={clipId}>
                <rect x={left} y={top} width={frameWidth} height={frameHeight} />
              </clipPath>
              <image
                className="schedule-map-marker-sprite"
                href={spriteImage.url}
                x={left}
                y={top}
                width={spriteImage.width ?? frameWidth}
                height={spriteImage.height ?? frameHeight}
                clipPath={`url(#${clipId})`}
              />
            </g>
          )
        }

        return (
          <g key={`marker-${marker.ordinal}`} className={selected ? 'schedule-map-marker is-current' : 'schedule-map-marker'}>
            <circle cx={center.x} cy={center.y} r={document.tileWidth * 0.45} />
            <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="central">
              {marker.ordinal}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function ScheduleMapLegend({ copy }: { copy: ScheduleMapCopy }) {
  return (
    <ul className="schedule-map-legend">
      <li className="schedule-map-legend-item">
        <span className="schedule-map-legend-swatch is-current" aria-hidden="true" />
        {copy.legendCurrent}
      </li>
      <li className="schedule-map-legend-item">
        <span className="schedule-map-legend-swatch is-other" aria-hidden="true" />
        {copy.legendOther}
      </li>
      <li className="schedule-map-legend-item">
        <span className="schedule-map-legend-line is-movement" aria-hidden="true" />
        {copy.legendMovement}
      </li>
      <li className="schedule-map-legend-item">
        <span className="schedule-map-legend-line is-uncertain" aria-hidden="true" />
        {copy.legendUncertain}
      </li>
    </ul>
  )
}

/** Centred message used for every non-map state, so the panel never renders blank. */
function ScheduleMapPlaceholder({ message, busy }: { message: string; busy?: boolean }) {
  return (
    <div className="schedule-map-panel-empty">
      <p className="schedule-map-panel-empty-text" role="status" aria-busy={busy ? 'true' : undefined}>
        <MapPin className="schedule-map-panel-empty-icon" aria-hidden="true" />
        {message}
      </p>
    </div>
  )
}

export function ScheduleMapPanel({ segments, locationOptions, selectedIndex, npcId, readOnly, onPickTile }: ScheduleMapPanelProps) {
  const locale = useLocale()
  const copy = useScheduleEditorCopy().map
  const theme = usePreferencesStore((state) => state.theme)
  const { accentColor, directoryInfo } = useWorkbenchEnvironment()
  const rootPath = directoryInfo?.rootPath ?? null
  const viewportRef = useRef<MapViewportHandle | null>(null)

  const location = useMemo(() => resolveScheduleMapLocation(segments, selectedIndex), [segments, selectedIndex])
  const locationOption = useMemo(() => locationOptions.find((option) => option.value === location) ?? null, [locationOptions, location])
  const mapPath = locationOption?.mapPath ?? null

  const [mapState, setMapState] = useState<MapLoadState>(IDLE_MAP_STATE)
  const [spriteState, setSpriteState] = useState<SpriteLoadState>(IDLE_SPRITE_STATE)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    if (!rootPath || !location || !mapPath) {
      setMapState(IDLE_MAP_STATE)
      return
    }

    let cancelled = false
    setMapState({ status: 'loading', location, document: null, errorMessage: null })

    void (async () => {
      try {
        const asset = await loadMapAsset(rootPath, mapPath, locale)
        if (cancelled) {
          return
        }
        if (asset.format !== 'xnb') {
          setMapState({
            status: 'error',
            location,
            document: null,
            errorMessage: formatTemplate(copy.unsupportedFormatTemplate, { format: asset.format }),
          })
          return
        }
        setMapState({ status: 'ready', location, document: JSON.parse(asset.content) as MapDocument, errorMessage: null })
      } catch (error) {
        if (cancelled) {
          return
        }
        setMapState({
          status: 'error',
          location,
          document: null,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rootPath, location, mapPath, locale, reloadNonce, copy.unsupportedFormatTemplate])

  useEffect(() => {
    if (!rootPath || !npcId) {
      setSpriteState(IDLE_SPRITE_STATE)
      return
    }

    let cancelled = false
    setSpriteState({ status: 'loading', image: null, errorMessage: null })

    void (async () => {
      try {
        const image = await loadCharacterImageState(`${rootPath}\\Content\\Characters\\${npcId}.xnb`, locale)
        if (!cancelled) {
          setSpriteState({ status: 'ready', image, errorMessage: null })
        }
      } catch (error) {
        // Not fatal: the marker degrades to a numbered dot, but the author is
        // told why the sprite is missing instead of silently getting the dot.
        if (!cancelled) {
          setSpriteState({
            status: 'error',
            image: null,
            errorMessage: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [rootPath, npcId, locale])

  const mapDocument = mapState.status === 'ready' && mapState.location === location ? mapState.document : null
  const path = useMemo(() => (mapDocument && location ? buildScheduleMapPath(segments, location) : null), [mapDocument, location, segments])
  const visibleLayerIds = useMemo(() => getVisibleLayerIds(mapDocument), [mapDocument])
  const visibleObjectGroupIds = useMemo(() => getVisibleObjectGroupIds(mapDocument), [mapDocument])

  // The viewport only re-centres when the displayed map changes. Recentring on
  // every row selection would drag the view out from under an author who is
  // clicking tiles.
  const [focusWorldPoint, setFocusWorldPoint] = useState<ViewportWorldPoint | null>(null)
  const focusedLocationRef = useRef<string | null>(null)
  useEffect(() => {
    if (!mapDocument || !path || !location || focusedLocationRef.current === location) {
      return
    }
    focusedLocationRef.current = location
    const target = path.markers[0]
    setFocusWorldPoint(
      target
        ? {
            worldX: (target.tileX + 0.5) * mapDocument.tileWidth,
            worldY: (target.tileY + 0.5) * mapDocument.tileHeight,
          }
        : null,
    )
  }, [mapDocument, path, location])

  const selectedMarker = path?.markers.find((marker) => marker.segmentIndex === selectedIndex) ?? null
  const pickable = !readOnly && selectedIndex !== null
  const locationLabel = locationOption?.label ?? location

  return (
    <section className="schedule-map-panel" aria-label={copy.title}>
      <header className="schedule-map-panel-header">
        <div className="schedule-map-panel-title-group">
          <span className="schedule-map-panel-location">
            {locationLabel ? formatTemplate(copy.locationLabelTemplate, { location: locationLabel }) : copy.title}
          </span>
          {selectedMarker ? (
            <span className="schedule-map-panel-selected">
              {formatTemplate(copy.markerTooltipTemplate, {
                ordinal: String(selectedMarker.ordinal),
                time: formatScheduleTime(selectedMarker.time),
                x: String(selectedMarker.tileX),
                y: String(selectedMarker.tileY),
              })}
            </span>
          ) : null}
        </div>
        {mapState.status === 'error' ? (
          <button type="button" className="schedule-map-panel-retry" onClick={() => setReloadNonce((value) => value + 1)}>
            <RefreshCw className="schedule-map-panel-retry-icon" aria-hidden="true" />
            {copy.retryAction}
          </button>
        ) : null}
      </header>

      <div className="schedule-map-panel-viewport">
        {!rootPath ? <ScheduleMapPlaceholder message={copy.noDirectoryHint} /> : null}
        {rootPath && !location ? <ScheduleMapPlaceholder message={copy.noLocationHint} /> : null}
        {rootPath && location && !mapPath ? (
          <ScheduleMapPlaceholder message={formatTemplate(copy.unknownLocationTemplate, { location })} />
        ) : null}
        {rootPath && location && mapPath && mapState.status === 'loading' ? (
          <ScheduleMapPlaceholder message={copy.loadingStatus} busy />
        ) : null}
        {rootPath && location && mapPath && mapState.status === 'error' ? (
          <ScheduleMapPlaceholder message={formatTemplate(copy.loadFailedTemplate, { message: mapState.errorMessage ?? '' })} />
        ) : null}
        {mapDocument && path ? (
          <MapViewport
            key={mapDocument.relativePath || mapDocument.sourcePath}
            ref={viewportRef}
            locale={locale}
            mapDocument={mapDocument}
            visibleLayerIds={visibleLayerIds}
            visibleObjectGroupIds={visibleObjectGroupIds}
            theme={theme}
            accentColor={accentColor}
            showGrid
            showStatsChips={false}
            contextMenuEnabled={false}
            focusWorldPoint={focusWorldPoint}
            scaleMapOverlayWithViewport
            mapOverlay={
              <SchedulePathOverlay
                path={path}
                document={mapDocument}
                selectedSegmentIndex={selectedIndex}
                sprite={spriteState}
                copy={copy}
              />
            }
            onTileClick={pickable && location ? (tileX, tileY) => onPickTile(location, tileX, tileY) : undefined}
          />
        ) : null}
      </div>

      <footer className="schedule-map-panel-footer">
        <p className="schedule-map-panel-hint">{pickable ? copy.pickHint : copy.selectSegmentHint}</p>
        <p className="schedule-map-panel-hint">{copy.schematicHint}</p>
        {spriteState.status === 'error' ? (
          <p className="schedule-map-panel-note">
            {formatTemplate(copy.spriteUnavailableTemplate, { message: spriteState.errorMessage ?? '' })}
          </p>
        ) : null}
        <ScheduleMapLegend copy={copy} />
      </footer>
    </section>
  )
}
