import { describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES,
  OBJECT_PANEL_DEFAULT_HEIGHT,
  OBJECT_PANEL_MAX_HEIGHT,
  OBJECT_PANEL_MIN_HEIGHT,
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

describe('normalizeMapEditorPalettePreferences object panel migration', () => {
  it('defaults to a closed panel at the default height with no favorites', () => {
    expect(DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.objectPanelOpen).toBe(false)
    expect(DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.objectPanelHeight).toBe(OBJECT_PANEL_DEFAULT_HEIGHT)
    expect(DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.favoriteObjects).toEqual([])
  })

  it('keeps the persisted palette slice storage key unchanged', () => {
    expect(MAP_EDITOR_PALETTE_PREFERENCES_KEY).toBe('map-editor/palette')
  })

  it('migrates the legacy paletteOpen boolean to objectPanelOpen', () => {
    expect(normalizeMapEditorPalettePreferences({ paletteOpen: true }).objectPanelOpen).toBe(true)
    expect(normalizeMapEditorPalettePreferences({ paletteOpen: false }).objectPanelOpen).toBe(false)
  })

  it('migrates the intermediate leftTab field to objectPanelOpen', () => {
    expect(normalizeMapEditorPalettePreferences({ leftTab: 'objects' }).objectPanelOpen).toBe(true)
    expect(normalizeMapEditorPalettePreferences({ leftTab: 'layers' }).objectPanelOpen).toBe(false)
  })

  it('prefers an explicit objectPanelOpen over legacy fields', () => {
    expect(normalizeMapEditorPalettePreferences({ objectPanelOpen: false, leftTab: 'objects', paletteOpen: true }).objectPanelOpen).toBe(
      false,
    )
    expect(normalizeMapEditorPalettePreferences({ objectPanelOpen: true, paletteOpen: false }).objectPanelOpen).toBe(true)
  })

  it('keeps the legacy paletteOpen readable after normalization', () => {
    expect(normalizeMapEditorPalettePreferences({ paletteOpen: false }).paletteOpen).toBe(false)
  })

  it('clamps the panel height into the allowed range and rounds it', () => {
    expect(normalizeMapEditorPalettePreferences({ objectPanelHeight: 20 }).objectPanelHeight).toBe(OBJECT_PANEL_MIN_HEIGHT)
    expect(normalizeMapEditorPalettePreferences({ objectPanelHeight: 5000 }).objectPanelHeight).toBe(OBJECT_PANEL_MAX_HEIGHT)
    expect(normalizeMapEditorPalettePreferences({ objectPanelHeight: 260.6 }).objectPanelHeight).toBe(261)
    expect(normalizeMapEditorPalettePreferences({ objectPanelHeight: 'tall' }).objectPanelHeight).toBe(OBJECT_PANEL_DEFAULT_HEIGHT)
  })

  it('normalizes favorites: drops non-strings, dedupes, keeps order', () => {
    const normalized = normalizeMapEditorPalettePreferences({
      favoriteObjects: ['a', 1, '', 'b', 'a', null, 'c'],
    })
    expect(normalized.favoriteObjects).toEqual(['a', 'b', 'c'])
    expect(normalizeMapEditorPalettePreferences({ favoriteObjects: 'a' }).favoriteObjects).toEqual([])
  })

  it('keeps the other persisted fields intact', () => {
    const normalized = normalizeMapEditorPalettePreferences(
      palettePreferences({ objectPanelOpen: true, zoom: 2, perTilesetSelections: { town: { startIndex: 5, width: 1, height: 1 } } }),
    )
    expect(normalized.objectPanelOpen).toBe(true)
    expect(normalized.zoom).toBe(2)
    expect(normalized.perTilesetSelections).toEqual({ town: { startIndex: 5, width: 1, height: 1 } })
  })
})
