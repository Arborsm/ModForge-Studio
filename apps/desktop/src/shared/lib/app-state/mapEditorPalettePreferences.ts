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

/** 地图编辑器底部对象面板的默认高度（px）。 */
export const OBJECT_PANEL_DEFAULT_HEIGHT = 240
/** 底部对象面板高度允许范围（px）。 */
export const OBJECT_PANEL_MIN_HEIGHT = 160
export const OBJECT_PANEL_MAX_HEIGHT = 480

/** 收藏对象 id 的持久化上限。 */
export const FAVORITE_OBJECTS_LIMIT = 200

/** 底部对象面板的子 tab：分类对象或整张 sheet 图。 */
export type MapEditorObjectPanelTab = 'objects' | 'sheet'

/**
 * Persisted map-editor palette preferences. All palette-wide user preferences
 * live in this single slice: bottom object panel open state and size, panel
 * tab, favorites, zoom, per-tileset remembered selections, and the recent-use
 * queue. Stored under `workspace.modules['map-editor/palette']`.
 */
export type MapEditorPalettePreferences = {
  /**
   * 底部对象面板是否展开；旧版持久化的 paletteOpen 布尔与 leftTab 字段会在
   * normalize 时迁移成此字段（'objects'/true→true）。
   */
  objectPanelOpen: boolean
  /** 底部对象面板高度（px），拖顶边调整。 */
  objectPanelHeight: number
  /** 收藏的对象 id 列表（对象库星标）。 */
  favoriteObjects: string[]
  /** 旧版"面板打开"布尔：仅保留读取兼容，不再是事实源。 */
  paletteOpen: boolean
  zoom: number
  perTilesetSelections: Record<string, PaletteTilesetSelection>
  recents: PaletteRecentSelection[]
}

export const DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES: MapEditorPalettePreferences = {
  objectPanelOpen: false,
  objectPanelHeight: OBJECT_PANEL_DEFAULT_HEIGHT,
  favoriteObjects: [],
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

  // objectPanelOpen 是事实源；旧存储用遗留的 paletteOpen 布尔或 leftTab
  // 字段迁移，都缺失或非法则回退默认值。paletteOpen 本身仍保留读取兼容。
  const objectPanelOpen =
    typeof value.objectPanelOpen === 'boolean'
      ? value.objectPanelOpen
      : value.leftTab === 'objects'
        ? true
        : value.leftTab === 'layers'
          ? false
          : typeof value.paletteOpen === 'boolean'
            ? value.paletteOpen
            : DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.objectPanelOpen

  const objectPanelHeight =
    typeof value.objectPanelHeight === 'number' && Number.isFinite(value.objectPanelHeight)
      ? Math.min(OBJECT_PANEL_MAX_HEIGHT, Math.max(OBJECT_PANEL_MIN_HEIGHT, Math.round(value.objectPanelHeight)))
      : DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.objectPanelHeight

  const favoriteObjects = Array.isArray(value.favoriteObjects)
    ? [...new Set(value.favoriteObjects.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== ''))].slice(
        0,
        FAVORITE_OBJECTS_LIMIT,
      )
    : []

  return {
    objectPanelOpen,
    objectPanelHeight,
    favoriteObjects,
    paletteOpen: typeof value.paletteOpen === 'boolean' ? value.paletteOpen : DEFAULT_MAP_EDITOR_PALETTE_PREFERENCES.paletteOpen,
    zoom: Math.min(PALETTE_ZOOM_MAX, Math.max(PALETTE_ZOOM_MIN, zoom)),
    perTilesetSelections,
    recents,
  }
}
