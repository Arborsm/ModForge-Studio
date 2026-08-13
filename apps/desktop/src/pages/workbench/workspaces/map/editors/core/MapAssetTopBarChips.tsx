import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { ChevronDown, Home, Music, TreePine } from 'lucide-react'
import {
  AMBIENT_LIGHT_PROPERTY_KEY,
  AMBIENT_NIGHT_LIGHT_PROPERTY_KEY,
  INDOOR_LIGHTMAP_DAY,
  INDOOR_LIGHTMAP_NIGHT,
  MUSIC_PROPERTY_KEY,
  asMapPropertyString,
  buildGameClockStepperValues,
  formatGameClockValue,
  isGameClockNextDay,
  parseLightingColorTriplet,
  parseMapAmbientLightProperty,
  parseMapMusicProperty,
  serializeLightingColorTriplet,
  serializeMapMusicProperty,
  type LightingColor,
  type MapMusicProperty,
  type MapPropertyValue,
} from '@entities/map'
import { GAME_MUSIC_COMMON_CUES } from '@entities/map'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

export type MapAssetTopBarChipsProps = {
  properties: Record<string, MapPropertyValue>
  onChange: (nextProperties: Record<string, MapPropertyValue>, mergeKey?: string | null, label?: string) => void
  /** Whether the map is an outdoor location; gates the ambient chip. */
  isOutdoor: boolean
  /** Toggles the `Outdoors` property (presence = outdoor). */
  onToggleOutdoor: () => void
}

const GAME_CLOCK_STEPPER_VALUES = buildGameClockStepperValues()

function hexChannel(hex: string, index: number) {
  return Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16) || 0
}

/** Converts a lighting color to the `#rrggbb` value accepted by `<input type="color">`. */
function lightingColorToHex(color: LightingColor) {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

/** A clock-value select option: label with a next-day suffix past midnight. */
function clockOptionLabel(value: number, nextDaySuffix: string) {
  return `${formatGameClockValue(value)}${isGameClockNextDay(value) ? nextDaySuffix : ''}`
}

type MusicDraft =
  | { mode: 'default' }
  | { mode: 'muted' }
  | { mode: 'cue'; cue: string }
  | { mode: 'span'; cue: string; start: number; end: number }

/** Maps a parsed Music property onto the popover's edit state. */
function musicDraftFromProperty(parsed: MapMusicProperty): MusicDraft {
  if (parsed.kind === 'none') return { mode: 'default' }
  if (parsed.kind === 'cue' && parsed.cue.trim().toLowerCase() === 'none') return { mode: 'muted' }
  if (parsed.kind === 'span') return { mode: 'span', cue: parsed.cue, start: parsed.start, end: parsed.end }
  return { mode: 'cue', cue: parsed.cue }
}

/** Serializes the popover state into a raw Music value; null means "don't write yet". */
function musicDraftToRaw(draft: MusicDraft): string | null {
  if (draft.mode === 'default') return ''
  if (draft.mode === 'muted') return 'none'
  const cue = draft.cue.trim()
  if (!cue) return null
  if (draft.mode === 'span') return serializeMapMusicProperty({ kind: 'span', cue, start: draft.start, end: draft.end })
  return serializeMapMusicProperty({ kind: 'cue', cue })
}

/**
 * Closes a popover when the pointer goes down outside its group element. The
 * chip group owns the trigger + popover, so clicks inside stay open.
 */
function usePopoverDismiss(open: boolean, setOpen: (open: boolean) => void, groupRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null
      if (target && !groupRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, setOpen, groupRef])
}

/** Shared chrome for a top-bar chip with its popover. */
function ChipGroup({
  open,
  setOpen,
  children,
  className,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  className?: string
  children: ReactNode
}) {
  const groupRef = useRef<HTMLDivElement | null>(null)
  usePopoverDismiss(open, setOpen, groupRef)
  return (
    <div ref={groupRef} className={cx('map-asset-topbar-chip-group', className)}>
      {children}
    </div>
  )
}

function MusicChip({
  properties,
  onChange,
}: {
  properties: Record<string, MapPropertyValue>
  onChange: MapAssetTopBarChipsProps['onChange']
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.topBar
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<MusicDraft>({ mode: 'default' })
  const rawMusic = asMapPropertyString(properties[MUSIC_PROPERTY_KEY])
  const parsed = parseMapMusicProperty(rawMusic)

  // Re-sync the edit state whenever the popover opens or the property changes.
  useEffect(() => {
    if (open) setDraft(musicDraftFromProperty(parseMapMusicProperty(rawMusic)))
  }, [open, rawMusic])

  function apply(nextDraft: MusicDraft) {
    setDraft(nextDraft)
    const raw = musicDraftToRaw(nextDraft)
    if (raw == null) return
    const next = { ...properties }
    if (raw === '') delete next[MUSIC_PROPERTY_KEY]
    else next[MUSIC_PROPERTY_KEY] = raw
    onChange(next, `map-property:${MUSIC_PROPERTY_KEY}`, assetCopy.editMusic)
  }

  const chipLabel = (() => {
    if (parsed.kind === 'none') return copy.musicChipDefault
    if (parsed.kind === 'cue' && parsed.cue.trim().toLowerCase() === 'none') return copy.musicChipMuted
    if (parsed.kind === 'span') {
      const toLabel = parsed.end === 0 ? copy.musicRangeUnlimited : clockOptionLabel(parsed.end, copy.musicNextDay)
      return copy.musicChipSpan(parsed.cue, clockOptionLabel(parsed.start, copy.musicNextDay), toLabel)
    }
    return parsed.cue
  })()

  const selectedCue = draft.mode === 'cue' || draft.mode === 'span' ? draft.cue : null

  return (
    <ChipGroup open={open} setOpen={setOpen}>
      <button
        type="button"
        className={cx('map-asset-topbar-chip', open && 'is-open')}
        aria-label={copy.musicChip}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Music className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{chipLabel}</span>
        <ChevronDown className="caret h-3 w-3" aria-hidden="true" />
      </button>
      {open ? (
        <div className="map-asset-topbar-pop" role="dialog" aria-label={copy.musicChip}>
          <div className="map-asset-topbar-pop-field">
            <span>{copy.musicChip}</span>
            <div className="map-asset-topbar-pop-radio" role="group">
              <button
                type="button"
                className={cx(draft.mode === 'default' && 'is-on')}
                aria-pressed={draft.mode === 'default'}
                onClick={() => apply({ mode: 'default' })}
              >
                {copy.musicDefault}
              </button>
              <button
                type="button"
                className={cx(draft.mode === 'muted' && 'is-on')}
                aria-pressed={draft.mode === 'muted'}
                onClick={() => apply({ mode: 'muted' })}
              >
                {copy.musicMuted}
              </button>
            </div>
            <div className="map-asset-topbar-pop-group">{copy.musicTrackGroup}</div>
            <div className="map-asset-topbar-pop-options" role="listbox" aria-label={copy.musicTrackGroup}>
              {GAME_MUSIC_COMMON_CUES.map((cue) => (
                <button
                  key={cue}
                  type="button"
                  role="option"
                  className={cx('map-asset-topbar-pop-option', selectedCue === cue && 'is-on')}
                  aria-selected={selectedCue === cue}
                  onClick={() =>
                    apply(draft.mode === 'span' ? { mode: 'span', cue, start: draft.start, end: draft.end } : { mode: 'cue', cue })
                  }
                >
                  <span>{cue}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="map-asset-topbar-pop-field">
            <span>{copy.musicRangeLabel}</span>
            <div className="map-asset-topbar-pop-radio" role="group">
              <button
                type="button"
                className={cx(draft.mode !== 'span' && 'is-on')}
                aria-pressed={draft.mode !== 'span'}
                onClick={() => {
                  if (draft.mode === 'span') apply(draft.cue ? { mode: 'cue', cue: draft.cue } : { mode: 'default' })
                }}
              >
                {copy.musicRangeAll}
              </button>
              <button
                type="button"
                className={cx(draft.mode === 'span' && 'is-on')}
                aria-pressed={draft.mode === 'span'}
                onClick={() => {
                  if (draft.mode === 'span') return
                  const cue = draft.mode === 'cue' ? draft.cue : ''
                  apply({ mode: 'span', cue, start: 1800, end: 2400 })
                }}
              >
                {copy.musicRangeSpan}
              </button>
            </div>
            {draft.mode === 'span' ? (
              <div className="map-asset-topbar-pop-time">
                <span>{copy.musicRangeFrom}</span>
                <select
                  value={draft.start}
                  aria-label={copy.musicRangeFrom}
                  onChange={(event) => apply({ ...draft, start: Number(event.target.value) })}
                >
                  {GAME_CLOCK_STEPPER_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {clockOptionLabel(value, copy.musicNextDay)}
                    </option>
                  ))}
                </select>
                <span>{copy.musicRangeTo}</span>
                <select
                  value={draft.end}
                  aria-label={copy.musicRangeTo}
                  onChange={(event) => apply({ ...draft, end: Number(event.target.value) })}
                >
                  <option value={0}>{copy.musicRangeUnlimited}</option>
                  {GAME_CLOCK_STEPPER_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {clockOptionLabel(value, copy.musicNextDay)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <details className="map-asset-topbar-pop-adv">
            <summary>{copy.musicCustomToggle}</summary>
            <input
              value={selectedCue ?? ''}
              placeholder={copy.musicCustomPlaceholder}
              aria-label={copy.musicCustomToggle}
              onChange={(event) => {
                const cue = event.target.value
                if (draft.mode === 'span') apply({ mode: 'span', cue, start: draft.start, end: draft.end })
                else apply(cue ? { mode: 'cue', cue } : { mode: 'default' })
              }}
            />
          </details>
        </div>
      ) : null}
    </ChipGroup>
  )
}

function AmbientChip({
  properties,
  onChange,
  disabled,
}: {
  properties: Record<string, MapPropertyValue>
  onChange: MapAssetTopBarChipsProps['onChange']
  disabled: boolean
}) {
  const assetCopy = useMapAuthoringCopy().assetEditor
  const copy = assetCopy.topBar
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const day = parseMapAmbientLightProperty(properties)
  const night = parseLightingColorTriplet(asMapPropertyString(properties[AMBIENT_NIGHT_LIGHT_PROPERTY_KEY]))

  function write(key: string, color: LightingColor | null) {
    const next = { ...properties }
    if (color == null) delete next[key]
    else next[key] = serializeLightingColorTriplet(color)
    onChange(next, `map-property:${key}`, assetCopy.editAmbientLight)
  }

  const dayColor = day.kind === 'color' && day.color ? day.color : null
  const chipColor = dayColor ?? INDOOR_LIGHTMAP_DAY
  const chipLabel = dayColor ? copy.ambientChipValue(dayColor.r, dayColor.g, dayColor.b) : copy.ambientChipDefault
  const chipStyle: CSSProperties = { background: `rgb(${chipColor.r} ${chipColor.g} ${chipColor.b})` }

  function colorRow({
    label,
    current,
    defaultValue,
    onWrite,
  }: {
    label: string
    current: LightingColor | null
    defaultValue: LightingColor
    onWrite: (color: LightingColor | null) => void
  }) {
    return (
      <div className="map-asset-topbar-pop-field">
        <span>{label}</span>
        <div className="map-asset-topbar-pop-colors">
          <button
            type="button"
            className={cx('map-asset-topbar-swatch', current == null && 'is-on')}
            style={{ background: `rgb(${defaultValue.r} ${defaultValue.g} ${defaultValue.b})` }}
            aria-pressed={current == null}
            title={copy.ambientDefaultSwatch}
            aria-label={copy.ambientDefaultSwatch}
            onClick={() => onWrite(null)}
          />
          <label
            className={cx('map-asset-topbar-swatch', 'is-custom', current != null && 'is-on')}
            style={current ? { background: `rgb(${current.r} ${current.g} ${current.b})` } : undefined}
            title={copy.ambientCustom}
          >
            <span aria-hidden="true">＋</span>
            <input
              type="color"
              value={lightingColorToHex(current ?? defaultValue)}
              aria-label={copy.ambientCustom}
              onChange={(event) => {
                const hex = event.target.value.replace(/^#/u, '')
                onWrite({ r: hexChannel(hex, 0), g: hexChannel(hex, 1), b: hexChannel(hex, 2) })
              }}
            />
          </label>
        </div>
      </div>
    )
  }

  return (
    <ChipGroup open={open} setOpen={setOpen}>
      <button
        type="button"
        className={cx('map-asset-topbar-chip', open && 'is-open')}
        aria-label={copy.ambientChip}
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? copy.ambientOutdoorHint : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="map-asset-topbar-chip-swatch" style={chipStyle} aria-hidden="true" />
        <span>{chipLabel}</span>
        <ChevronDown className="caret h-3 w-3" aria-hidden="true" />
      </button>
      {open ? (
        <div className="map-asset-topbar-pop" role="dialog" aria-label={copy.ambientChip}>
          {colorRow({
            label: copy.ambientDay,
            current: dayColor,
            defaultValue: INDOOR_LIGHTMAP_DAY,
            onWrite: (color) => write(AMBIENT_LIGHT_PROPERTY_KEY, color),
          })}
          {colorRow({
            label: copy.ambientNight,
            current: night,
            defaultValue: INDOOR_LIGHTMAP_NIGHT,
            onWrite: (color) => write(AMBIENT_NIGHT_LIGHT_PROPERTY_KEY, color),
          })}
          <p className="map-asset-topbar-pop-hint">{copy.ambientHint}</p>
        </div>
      ) : null}
    </ChipGroup>
  )
}

/**
 * Top-bar chips that replaced the music/environment inspector card: the music
 * popover (game default / muted / real cue list + play-time range + custom
 * cue), the indoor/outdoor toggle (writes the `Outdoors` property), and the
 * ambient light popover (day/night tints; disabled outdoors because the game
 * ignores ambient light there). Every write goes through `onChange` with a
 * stable merge key so bursts merge into one history step.
 */
export function MapAssetTopBarChips({ properties, onChange, isOutdoor, onToggleOutdoor }: MapAssetTopBarChipsProps) {
  const copy = useMapAuthoringCopy().assetEditor.topBar
  return (
    <div className="map-asset-topbar-chips">
      <MusicChip properties={properties} onChange={onChange} />
      <button
        type="button"
        className="map-asset-topbar-chip"
        title={copy.envChipTitle}
        aria-label={copy.envChipTitle}
        aria-pressed={isOutdoor}
        onClick={onToggleOutdoor}
      >
        {isOutdoor ? <TreePine className="h-3.5 w-3.5" aria-hidden="true" /> : <Home className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{isOutdoor ? copy.envChipOutdoor : copy.envChipIndoor}</span>
      </button>
      <AmbientChip properties={properties} onChange={onChange} disabled={isOutdoor} />
    </div>
  )
}
