import {
  PALETTE_FAVORITE_LIMIT,
  PALETTE_RECENT_LIMIT,
  type PaletteRecentSelection,
  type PaletteTilesetSelection,
} from '@shared/lib/app-state'

/** A rectangular drag selection over tileset tile coordinates. */
export type TilesetSelectionRect = {
  startColumn: number
  startRow: number
  endColumn: number
  endRow: number
}

/** A normalized selection rectangle; `right`/`bottom` are inclusive. */
export type NormalizedSelectionRect = {
  left: number
  top: number
  right: number
  bottom: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Reorders a drag rect so the start corner is always the top-left one. */
export function normalizeSelectionRect(rect: TilesetSelectionRect): NormalizedSelectionRect {
  return {
    left: Math.min(rect.startColumn, rect.endColumn),
    top: Math.min(rect.startRow, rect.endRow),
    right: Math.max(rect.startColumn, rect.endColumn),
    bottom: Math.max(rect.startRow, rect.endRow),
  }
}

/** Converts a tileset-space selection into a drag rect whose corners are already normalized. */
export function selectionRectForSelection(
  selection: Pick<PaletteTilesetSelection, 'startIndex' | 'width' | 'height'>,
  columns: number,
): TilesetSelectionRect {
  const startColumn = selection.startIndex % columns
  const startRow = Math.floor(selection.startIndex / columns)
  return {
    startColumn,
    startRow,
    endColumn: startColumn + selection.width - 1,
    endRow: startRow + selection.height - 1,
  }
}

/** Converts a normalized rectangle into a bounded tileset stamp selection. */
export function tilesetSelectionFromRect(rect: TilesetSelectionRect, columns: number, tileCount: number): PaletteTilesetSelection {
  const normalized = normalizeSelectionRect(rect)
  const maximumBottom = Math.max(0, Math.floor(Math.max(0, tileCount - 1) / columns))
  return {
    startIndex: normalized.top * columns + normalized.left,
    width: normalized.right - normalized.left + 1,
    height: Math.min(normalized.bottom, maximumBottom) - normalized.top + 1,
  }
}

/** Maps a pointer position to a tileset cell for the proportional sheet image layout. */
export function cellFromSheetPointer(options: {
  x: number
  y: number
  originX: number
  originY: number
  width: number
  height: number
  columns: number
  rows: number
}) {
  const column = Math.floor(((options.x - options.originX) / options.width) * options.columns)
  const row = Math.floor(((options.y - options.originY) / options.height) * options.rows)
  return {
    column: clamp(column, 0, Math.max(0, options.columns - 1)),
    row: clamp(row, 0, Math.max(0, options.rows - 1)),
  }
}

/** Pushes a recent selection to the front of the queue, de-duplicating and capping it. */
export function pushRecentSelection(
  recents: readonly PaletteRecentSelection[],
  entry: PaletteRecentSelection,
  limit = PALETTE_RECENT_LIMIT,
): PaletteRecentSelection[] {
  const next = [entry]
  for (const recent of recents) {
    if (next.length >= limit) break
    const isDuplicate =
      recent.tilesetName === entry.tilesetName &&
      recent.startIndex === entry.startIndex &&
      recent.width === entry.width &&
      recent.height === entry.height
    if (!isDuplicate) {
      next.push(recent)
    }
  }
  return next
}

/** Removes a recent selection entry by identity (tileset + selection rect). */
export function removeRecentSelection(recents: readonly PaletteRecentSelection[], entry: PaletteRecentSelection): PaletteRecentSelection[] {
  return recents.filter(
    (recent) =>
      !(
        recent.tilesetName === entry.tilesetName &&
        recent.startIndex === entry.startIndex &&
        recent.width === entry.width &&
        recent.height === entry.height
      ),
  )
}

/** Merges a selection into the per-tileset remembered-selection map. */
export function rememberTilesetSelection(
  remembered: Readonly<Record<string, PaletteTilesetSelection>>,
  tilesetName: string,
  selection: PaletteTilesetSelection,
): Record<string, PaletteTilesetSelection> {
  return { ...remembered, [tilesetName]: selection }
}

/** Checks whether an entry exists in a list by identity (tileset + selection rect). */
function entryIdentityMatch(a: PaletteRecentSelection, b: PaletteRecentSelection): boolean {
  return a.tilesetName === b.tilesetName && a.startIndex === b.startIndex && a.width === b.width && a.height === b.height
}

/** Adds a favorite entry if not already present, capping at PALETTE_FAVORITE_LIMIT. */
export function pushFavoriteSelection(
  favorites: readonly PaletteRecentSelection[],
  entry: PaletteRecentSelection,
  limit = PALETTE_FAVORITE_LIMIT,
): PaletteRecentSelection[] {
  if (favorites.some((fav) => entryIdentityMatch(fav, entry))) return [...favorites]
  return [entry, ...favorites].slice(0, limit)
}

/** Removes a favorite entry by identity. */
export function removeFavoriteSelection(
  favorites: readonly PaletteRecentSelection[],
  entry: PaletteRecentSelection,
): PaletteRecentSelection[] {
  return favorites.filter((fav) => !entryIdentityMatch(fav, entry))
}

/** Returns true if the entry is in the favorites list. */
export function isFavoriteSelection(favorites: readonly PaletteRecentSelection[], entry: PaletteRecentSelection): boolean {
  return favorites.some((fav) => entryIdentityMatch(fav, entry))
}

/** Merges imported favorites into existing ones, de-duplicating and capping. */
export function mergeFavoriteSelections(
  existing: readonly PaletteRecentSelection[],
  imported: readonly PaletteRecentSelection[],
  limit = PALETTE_FAVORITE_LIMIT,
): PaletteRecentSelection[] {
  const result = [...existing]
  for (const entry of imported) {
    if (result.some((fav) => entryIdentityMatch(fav, entry))) continue
    result.push(entry)
    if (result.length >= limit) break
  }
  return result.slice(0, limit)
}
