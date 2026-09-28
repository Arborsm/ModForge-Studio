import { describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES,
  normalizeMapEditorPalettePreferences,
  type MapEditorPalettePreferences,
} from '@shared/lib/app-state'
import { MAP_EDITOR_PALETTE_PREFERENCES_KEY } from '@shared/lib/app-state/preferencesStore'

function palettePreferences(overrides: Partial<MapEditorPalettePreferences> = {}): MapEditorPalettePreferences {
  return {
    ...DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES,
    ...overrides,
  }
}

describe('normalizeMapEditorPalettePreferences', () => {
  it('keeps the persisted palette slice storage key unchanged', () => {
    expect(MAP_EDITOR_PALETTE_PREFERENCES_KEY).toBe('map-editor/palette')
  })

  it('clamps zoom into the allowed range', () => {
    expect(normalizeMapEditorPalettePreferences({ zoom: 0.1 }).zoom).toBe(0.5)
    expect(normalizeMapEditorPalettePreferences({ zoom: 10 }).zoom).toBe(4)
    expect(normalizeMapEditorPalettePreferences({ zoom: 2 }).zoom).toBe(2)
    expect(normalizeMapEditorPalettePreferences({ zoom: 'wide' }).zoom).toBe(DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.zoom)
  })

  it('keeps the persisted fields intact', () => {
    const normalized = normalizeMapEditorPalettePreferences(
      palettePreferences({ zoom: 2, perTilesetSelections: { town: { startIndex: 5, width: 1, height: 1 } } }),
    )
    expect(normalized.zoom).toBe(2)
    expect(normalized.perTilesetSelections).toEqual({ town: { startIndex: 5, width: 1, height: 1 } })
  })
})
