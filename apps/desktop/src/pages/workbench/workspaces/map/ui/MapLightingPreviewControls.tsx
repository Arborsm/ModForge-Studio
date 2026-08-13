import { useEffect, useState } from 'react'
import { ChevronDown, MoonStar, Snowflake, Sun, Sunset, type LucideIcon } from 'lucide-react'
import {
  getLightingPreviewDuskVariant,
  type GameSeason,
  type MapLightingPreviewDuskVariant,
  type MapLightingPreviewMode,
} from '@entities/map'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

const DUSK_OPTIONS: Array<{
  variant: MapLightingPreviewDuskVariant
  season: GameSeason
  icon: LucideIcon
  label: 'lightingDusk' | 'lightingDuskWinter'
  sub: 'lightingDuskSub' | 'lightingDuskWinterSub'
}> = [
  { variant: 'dusk', season: 'spring', icon: Sunset, label: 'lightingDusk', sub: 'lightingDuskSub' },
  { variant: 'duskWinter', season: 'winter', icon: Snowflake, label: 'lightingDuskWinter', sub: 'lightingDuskWinterSub' },
]

/**
 * Floating lighting preview pill anchored top-right over the map canvas. The
 * season × time-of-day grid is reduced to three segments (day / dusk▾ / night);
 * the dusk caret opens a mini menu carrying the winter dusk variant (warm
 * 245,225,170 vs the other seasons' 255,255,0). The pill is always enabled:
 * outdoor maps preview the game's day/night cycle, indoor maps the ambient
 * light day→night interpolation. Dusk only makes sense outdoors, so it is
 * disabled indoors and auto-falls back to day when the map stops being
 * outdoor. It only affects the canvas preview — map data is never touched.
 */
export function MapLightingPreviewControls({
  mode,
  season,
  outdoors,
  disabled = false,
  onModeChange,
  onSeasonChange,
}: {
  mode: MapLightingPreviewMode
  season: GameSeason
  /** Whether the map is an outdoor location; gates the dusk segment. */
  outdoors: boolean
  /** Disables the whole pill (e.g. while no map document is loaded). */
  disabled?: boolean
  onModeChange: (mode: MapLightingPreviewMode) => void
  onSeasonChange: (season: GameSeason) => void
}) {
  const copy = useEditorCopy().center
  const [duskMenuOpen, setDuskMenuOpen] = useState(false)
  const duskVariant = getLightingPreviewDuskVariant(mode, season)
  const duskDisabled = disabled || !outdoors

  // The dusk sky tint only matters outdoors; switching an indoor map that had
  // dusk selected falls back to day automatically.
  useEffect(() => {
    if (mode === 'dusk' && !outdoors) {
      onModeChange('day')
    }
  }, [mode, outdoors, onModeChange])

  // Close the dusk mini menu when clicking anywhere outside the pill.
  useEffect(() => {
    if (!duskMenuOpen) {
      return undefined
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null
      if (target && !target.closest('.map-lighting-preview-pill')) {
        setDuskMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [duskMenuOpen])

  const activeDuskOption = DUSK_OPTIONS.find((option) => option.variant === duskVariant) ?? DUSK_OPTIONS[0]!

  return (
    <div className="map-lighting-preview-pill" role="toolbar" aria-label={copy.lightingPreview} title={copy.lightingPreviewHint}>
      <button
        type="button"
        className={cx('seg-btn', mode === 'day' && 'is-on')}
        aria-pressed={mode === 'day'}
        title={copy.lightingDay}
        disabled={disabled}
        onClick={() => onModeChange('day')}
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
        {copy.lightingDay}
      </button>
      <span className="seg-wrap">
        <button
          type="button"
          className={cx('seg-btn', mode === 'dusk' && 'is-on')}
          aria-pressed={mode === 'dusk'}
          aria-haspopup="menu"
          aria-expanded={duskMenuOpen}
          title={duskDisabled ? copy.lightingDuskIndoorHint : undefined}
          disabled={duskDisabled}
          onClick={() => setDuskMenuOpen((open) => !open)}
        >
          <activeDuskOption.icon className="h-3.5 w-3.5" aria-hidden="true" />
          {mode === 'dusk' ? copy[activeDuskOption.label] : copy.lightingDusk}
          <ChevronDown className="caret h-3 w-3" aria-hidden="true" />
        </button>
        <div className="dusk-mini" role="menu" hidden={!duskMenuOpen}>
          {DUSK_OPTIONS.map((option) => (
            <button
              key={option.variant}
              type="button"
              className={cx('dusk-opt', duskVariant === option.variant && 'is-on')}
              role="menuitem"
              aria-pressed={duskVariant === option.variant}
              onClick={() => {
                onSeasonChange(option.season)
                onModeChange('dusk')
                setDuskMenuOpen(false)
              }}
            >
              <span>
                <option.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {copy[option.label]}
              </span>
              <small>{copy[option.sub]}</small>
            </button>
          ))}
        </div>
      </span>
      <button
        type="button"
        className={cx('seg-btn', mode === 'night' && 'is-on')}
        aria-pressed={mode === 'night'}
        title={copy.lightingNight}
        disabled={disabled}
        onClick={() => onModeChange('night')}
      >
        <MoonStar className="h-3.5 w-3.5" aria-hidden="true" />
        {copy.lightingNight}
      </button>
    </div>
  )
}
