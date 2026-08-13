/** Maximum number of recently used palette selections kept in preferences. */
export const PALETTE_RECENT_LIMIT = 8

/** A rectangular stamp selection inside one tileset, expressed in tileset tile coordinates. */
export type PaletteTilesetSelection = {
  startIndex: number
  width: number
  height: number
}

/** A tileset selection remembered as a recent use; carries the tileset it came from. */
export type PaletteRecentSelection = PaletteTilesetSelection & {
  tilesetName: string
}

/**
 * Persisted map-editor palette preferences. All palette-wide user preferences
 * live in this single slice: open state, zoom, per-tileset remembered
 * selections, and the recent-use queue. Stored under `workspace.modules['map-editor/palette']`.
 */
export type MapEditorPalettePreferences = {
  paletteOpen: boolean
  zoom: number
  perTilesetSelections: Record<string, PaletteTilesetSelection>
  recents: PaletteRecentSelection[]
}

export const DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES: MapEditorPalettePreferences = {
  paletteOpen: true,
  zoom: 1,
  perTilesetSelections: {},
  recents: [],
}

const PALETTE_ZOOM_MIN = 0.5
const PALETTE_ZOOM_MAX = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTilesetSelection(value: unknown): PaletteTilesetSelection | null {
  if (!isRecord(value)) {
    return null
  }

  const startIndex = value.startIndex
  const width = value.width
  const height = value.height
  if (
    typeof startIndex !== 'number' ||
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    typeof width !== 'number' ||
    !Number.isInteger(width) ||
    width < 1 ||
    typeof height !== 'number' ||
    !Number.isInteger(height) ||
    height < 1
  ) {
    return null
  }

  return { startIndex, width, height }
}

/** Validates and normalizes persisted palette preferences, dropping malformed entries. */
export function normalizeMapEditorPalettePreferences(value: unknown): MapEditorPalettePreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES }
  }

  const perTilesetSelections: Record<string, PaletteTilesetSelection> = {}
  if (isRecord(value.perTilesetSelections)) {
    for (const [tilesetName, selection] of Object.entries(value.perTilesetSelections)) {
      const normalized = normalizeTilesetSelection(selection)
      if (tilesetName.trim() && normalized) {
        perTilesetSelections[tilesetName] = normalized
      }
    }
  }

  const recents: PaletteRecentSelection[] = Array.isArray(value.recents)
    ? value.recents
        .map((entry) => {
          if (!isRecord(entry) || typeof entry.tilesetName !== 'string' || !entry.tilesetName.trim()) {
            return null
          }
          const selection = normalizeTilesetSelection(entry)
          return selection ? { tilesetName: entry.tilesetName, ...selection } : null
        })
        .filter((entry): entry is PaletteRecentSelection => entry !== null)
        .slice(0, PALETTE_RECENT_LIMIT)
    : []

  const zoom = typeof value.zoom === 'number' && Number.isFinite(value.zoom) ? value.zoom : DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.zoom

  return {
    paletteOpen: typeof value.paletteOpen === 'boolean' ? value.paletteOpen : DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.paletteOpen,
    zoom: Math.min(PALETTE_ZOOM_MAX, Math.max(PALETTE_ZOOM_MIN, zoom)),
    perTilesetSelections,
    recents,
  }
}
