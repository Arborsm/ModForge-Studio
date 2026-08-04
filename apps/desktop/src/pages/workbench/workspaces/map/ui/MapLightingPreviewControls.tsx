import { MoonStar, Sun, Sunset } from 'lucide-react'
import type { GameSeason, MapLightingPreviewMode } from '@entities/map'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

const MODES: Array<{ id: MapLightingPreviewMode; icon: typeof Sun; label: 'lightingDay' | 'lightingDusk' | 'lightingNight' }> = [
  { id: 'day', icon: Sun, label: 'lightingDay' },
  { id: 'dusk', icon: Sunset, label: 'lightingDusk' },
  { id: 'night', icon: MoonStar, label: 'lightingNight' },
]

const SEASONS: Array<{ id: GameSeason; label: 'seasonSpring' | 'seasonSummer' | 'seasonFall' | 'seasonWinter' }> = [
  { id: 'spring', label: 'seasonSpring' },
  { id: 'summer', label: 'seasonSummer' },
  { id: 'fall', label: 'seasonFall' },
  { id: 'winter', label: 'seasonWinter' },
]

/**
 * Day/dusk/night + season picker for the map lighting preview. Renders two
 * floating-toolbar groups; the caller wraps them in its own
 * `.workspace-viewport-toolbar` container and feeds the selection into
 * `deriveMapDocumentLighting`.
 */
export function MapLightingPreviewControls({
  mode,
  season,
  disabled = false,
  onModeChange,
  onSeasonChange,
}: {
  mode: MapLightingPreviewMode
  season: GameSeason
  disabled?: boolean
  onModeChange: (mode: MapLightingPreviewMode) => void
  onSeasonChange: (season: GameSeason) => void
}) {
  const copy = useEditorCopy().center

  return (
    <>
      <div className="workspace-viewport-toolbar-group" role="group" aria-label={copy.lightingPreview}>
        {MODES.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            className={cx('workspace-viewport-toolbar-icon-button', mode === id && 'workspace-viewport-toolbar-button-active')}
            onClick={() => onModeChange(id)}
            title={copy[label]}
            aria-label={copy[label]}
            aria-pressed={mode === id}
            disabled={disabled}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="workspace-viewport-toolbar-group" role="group" aria-label={copy.lightingSeason}>
        {SEASONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cx('workspace-viewport-toolbar-button', season === id && 'workspace-viewport-toolbar-button-active')}
            onClick={() => onSeasonChange(id)}
            aria-pressed={season === id}
            disabled={disabled}
          >
            {copy[label]}
          </button>
        ))}
      </div>
    </>
  )
}
