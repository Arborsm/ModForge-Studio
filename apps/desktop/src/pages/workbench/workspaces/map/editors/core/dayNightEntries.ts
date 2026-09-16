import { findTilesetForGid, gidAtCell, parseRawGroups, serializeRawGroups, stripTileGidFlags, type MapDocument } from '@entities/map'

/** One `DayTiles`/`NightTiles` group: a single cell swapping to one tile index. */
export type DayNightGroup = { layer: string; x: number; y: number; tileIndex: number }

export type DayNightGroups = { groups: DayNightGroup[]; leftover: string[] }

/** Parses a `DayTiles`/`NightTiles` property: groups of `layer x y tileIndex`. */
export function parseDayNightGroups(raw: string): DayNightGroups {
  return parseRawGroups(raw, 4, (tokens) => {
    const layer = (tokens[0] ?? '').trim()
    const x = Number.parseInt(tokens[1] ?? '', 10)
    const y = Number.parseInt(tokens[2] ?? '', 10)
    const tileIndex = Number.parseInt(tokens[3] ?? '', 10)
    if (!layer || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tileIndex)) {
      return null
    }
    return { layer, x, y, tileIndex }
  })
}

export function serializeDayNightGroups(groups: readonly DayNightGroup[], leftover: readonly string[]) {
  return serializeRawGroups(
    groups.map((group) => [group.layer, group.x, group.y, group.tileIndex].join(' ')),
    leftover,
  )
}

/**
 * Applies night-tile swaps onto the document for the lighting preview: every
 * covered cell's gid becomes its night tile on the same tileset that owns the
 * cell's day tile, so the canvas shows what the game renders after dark. Pure;
 * returns the input document when nothing can be swapped.
 */
export function applyDayNightPreviewSwap(document: MapDocument, groups: readonly DayNightGroup[]): MapDocument {
  if (groups.length === 0) return document
  const swapsByLayer = new Map<string, DayNightGroup[]>()
  for (const group of groups) {
    const list = swapsByLayer.get(group.layer)
    if (list) list.push(group)
    else swapsByLayer.set(group.layer, [group])
  }
  let swapped = false
  const layers = document.layers.map((layer) => {
    const swaps = swapsByLayer.get(layer.name)
    if (!swaps) return layer
    const gids = Uint32Array.from(layer.gids)
    for (const swap of swaps) {
      const cellIndex = swap.y * layer.width + swap.x
      const gid = gids[cellIndex] ?? 0
      if (gid === 0) continue
      const tileset = findTilesetForGid(document.tilesets, stripTileGidFlags(gid))
      if (!tileset || swap.tileIndex < 0 || swap.tileIndex >= tileset.tileCount) continue
      gids[cellIndex] = tileset.firstGid + swap.tileIndex
      swapped = true
    }
    return { ...layer, gids }
  })
  return swapped ? { ...document, layers } : document
}

/** One merged day/night swap cell: both tile sides may be null when only one side is authored. */
export type DayNightEntry = { layer: string; x: number; y: number; dayTile: number | null; nightTile: number | null }

function dayNightKey(entry: { layer: string; x: number; y: number }) {
  return `${entry.layer} ${entry.x},${entry.y}`
}

/** Pairs DayTiles and NightTiles groups by (layer, x, y) so one card shows both sides of a swap. */
export function mergeDayNight(day: readonly DayNightGroup[], night: readonly DayNightGroup[]): DayNightEntry[] {
  const entries = new Map<string, DayNightEntry>()
  for (const group of day) {
    entries.set(dayNightKey(group), { layer: group.layer, x: group.x, y: group.y, dayTile: group.tileIndex, nightTile: null })
  }
  for (const group of night) {
    const key = dayNightKey(group)
    const existing = entries.get(key)
    if (existing) existing.nightTile = group.tileIndex
    else entries.set(key, { layer: group.layer, x: group.x, y: group.y, dayTile: null, nightTile: group.tileIndex })
  }
  return [...entries.values()]
}

/** One display cell inside a merged day/night region, with both tile sides. */
export type DayNightDisplayCell = { x: number; y: number; dayTile: number | null; nightTile: number | null }

/**
 * One display-level day/night region: a contiguous rectangle of cells merged
 * for the card list. `cells` lists every covered cell in reading order (y
 * then x) with per-cell tile values; `x`/`y`/`width`/`height` describe the
 * bounding rectangle, which is fully covered by construction.
 */
export type DayNightDisplayRect = {
  layer: string
  x: number
  y: number
  width: number
  height: number
  cells: DayNightDisplayCell[]
}

function dayNightCellKey(x: number, y: number) {
  return `${x},${y}`
}

/**
 * Collapses day/night swap cells into display regions, per layer, in two
 * passes:
 *
 * 1. **Offset pass** — cells whose night tiles (or day tiles for day-only
 *    entries) follow sheet-contiguous offsets from the anchor, i.e. the
 *    pattern the studio dialog writes for a rectangle pick, merge into one
 *    region. The other side is unconstrained (day tiles are captured from the
 *    map as-is). Single-cell anchors fall through to the equality pass so
 *    identical pairs can still merge there.
 * 2. **Equality pass** — leftover cells sharing the exact same day/night pair
 *    merge into contiguous rectangles (hand-authored repeats).
 *
 * `resolveColumns` returns the sheet columns of the tileset owning an
 * entry's tiles; null marks the entry unresolvable (the offset pass skips
 * it). Regions are returned sorted by (layer, y, x) with stable reading
 * order.
 */
export function groupDayNightDisplayRects(
  entries: readonly DayNightEntry[],
  resolveColumns: (entry: DayNightEntry) => number | null,
): DayNightDisplayRect[] {
  const rects: DayNightDisplayRect[] = []
  const byLayer = new Map<string, DayNightEntry[]>()
  for (const entry of entries) {
    const list = byLayer.get(entry.layer)
    if (list) list.push(entry)
    else byLayer.set(entry.layer, [entry])
  }

  for (const [layer, layerEntries] of byLayer) {
    const remaining = new Map<string, DayNightEntry>()
    for (const entry of layerEntries) remaining.set(dayNightCellKey(entry.x, entry.y), entry)
    // Anchors scan in reading order so the merge is deterministic.
    const anchors = [...layerEntries].sort((left, right) => left.y - right.y || left.x - right.x)

    // Pass 1: sheet-contiguous offset regions.
    for (const anchor of anchors) {
      if (!remaining.has(dayNightCellKey(anchor.x, anchor.y))) continue
      const columns = resolveColumns(anchor)
      if (columns == null || columns <= 0) continue
      // The side that must follow offsets: night when present, else day.
      const origin = anchor.nightTile ?? anchor.dayTile
      if (origin == null) continue
      const anchorCol = origin % columns
      const matches = (x: number, y: number) => {
        const candidate = remaining.get(dayNightCellKey(x, y))
        if (!candidate) return false
        const dx = x - anchor.x
        const dy = y - anchor.y
        if (anchorCol + dx >= columns) return false
        const expected = origin + dy * columns + dx
        return (anchor.nightTile != null ? candidate.nightTile : candidate.dayTile) === expected
      }
      let width = 1
      while (matches(anchor.x + width, anchor.y)) width += 1
      let height = 1
      rows: while (true) {
        const row = anchor.y + height
        for (let x = anchor.x; x < anchor.x + width; x += 1) {
          if (!matches(x, row)) break rows
        }
        height += 1
      }
      if (width === 1 && height === 1) continue
      const cells: DayNightDisplayCell[] = []
      for (let y = anchor.y; y < anchor.y + height; y += 1) {
        for (let x = anchor.x; x < anchor.x + width; x += 1) {
          const covered = remaining.get(dayNightCellKey(x, y))
          if (!covered) continue
          remaining.delete(dayNightCellKey(x, y))
          cells.push({ x, y, dayTile: covered.dayTile, nightTile: covered.nightTile })
        }
      }
      rects.push({ layer, x: anchor.x, y: anchor.y, width, height, cells })
    }

    // Pass 2: exact-pair equality rectangles.
    const groups = new Map<string, { dayTile: number | null; nightTile: number | null; points: { x: number; y: number }[] }>()
    for (const entry of remaining.values()) {
      const key = `${entry.dayTile ?? 'n'} ${entry.nightTile ?? 'n'}`
      let group = groups.get(key)
      if (!group) {
        group = { dayTile: entry.dayTile, nightTile: entry.nightTile, points: [] }
        groups.set(key, group)
      }
      group.points.push({ x: entry.x, y: entry.y })
    }
    for (const group of groups.values()) {
      const left = new Map(group.points.map((point) => [dayNightCellKey(point.x, point.y), point]))
      for (const point of group.points) {
        if (!left.has(dayNightCellKey(point.x, point.y))) continue
        let width = 1
        while (left.has(dayNightCellKey(point.x + width, point.y))) width += 1
        let height = 1
        rows: while (true) {
          const row = point.y + height
          for (let x = point.x; x < point.x + width; x += 1) {
            if (!left.has(dayNightCellKey(x, row))) break rows
          }
          height += 1
        }
        const cells: DayNightDisplayCell[] = []
        for (let y = point.y; y < point.y + height; y += 1) {
          for (let x = point.x; x < point.x + width; x += 1) {
            left.delete(dayNightCellKey(x, y))
            cells.push({ x, y, dayTile: group.dayTile, nightTile: group.nightTile })
          }
        }
        rects.push({ layer, x: point.x, y: point.y, width, height, cells })
      }
    }
  }

  rects.sort((left, right) => (left.layer < right.layer ? -1 : left.layer > right.layer ? 1 : 0) || left.y - right.y || left.x - right.x)
  return rects
}

/**
 * Builds the `resolveColumns` callback for display grouping: the entry's day
 * tile resolves its tileset from the layer's gid (falling back to the first
 * tileset that can hold the index); night-only entries resolve from the night
 * index directly. Night tiles are authored on the day tile's sheet, so one
 * tileset's columns describe both sides.
 */
export function dayNightColumnsResolver(document: MapDocument) {
  return (entry: DayNightEntry): number | null => {
    const tileIndex = entry.dayTile ?? entry.nightTile
    if (tileIndex == null) return null
    const gid = gidAtCell(document, entry.layer, entry.x, entry.y)
    const owning = gid !== 0 ? findTilesetForGid(document.tilesets, gid) : null
    if (owning && entry.dayTile != null && entry.dayTile >= 0 && entry.dayTile < owning.tileCount) return owning.columns
    return (document.tilesets.find((tileset) => tileIndex >= 0 && tileIndex < tileset.tileCount) ?? null)?.columns ?? null
  }
}

/** One cell captured from a picked rect: its current tile on the layer in tileset-local form. */
export type DayNightCellCapture = { x: number; y: number; tilesetName: string; dayTile: number }

/** Result of scanning a picked rectangle on one layer for a day/night swap. */
export type DayNightRectCapture = {
  /** Non-empty cells in reading order (y then x). */
  cells: DayNightCellCapture[]
  /** Cells inside the rect holding no tile on the layer; they are skipped on commit. */
  emptyCellCount: number
  /** True when captured cells resolve to more than one tileset (a single-sheet night region can't cover them). */
  mixedTilesets: boolean
}

/**
 * Scans `rect` on `layerName` and captures every non-empty cell with its
 * tileset-local tile index. Empty cells (and cells whose gid resolves to no
 * tileset) are counted but not captured. `mixedTilesets` flags rectangles
 * spanning multiple tilesets so callers can refuse a single-sheet night pick.
 */
export function collectDayNightRectCells(
  document: MapDocument,
  layerName: string,
  rect: { x: number; y: number; width: number; height: number },
): DayNightRectCapture {
  const cells: DayNightCellCapture[] = []
  let emptyCellCount = 0
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const gid = gidAtCell(document, layerName, x, y)
      const tileset = gid !== 0 ? findTilesetForGid(document.tilesets, gid) : null
      if (!tileset) {
        emptyCellCount += 1
        continue
      }
      cells.push({ x, y, tilesetName: tileset.name, dayTile: gid - tileset.firstGid })
    }
  }
  const mixedTilesets = new Set(cells.map((cell) => cell.tilesetName)).size > 1
  return { cells, emptyCellCount, mixedTilesets }
}
