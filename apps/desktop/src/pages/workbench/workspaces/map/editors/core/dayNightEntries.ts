import { parseRawGroups, serializeRawGroups } from '@entities/map'

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

/** One merged day/night swap cell: both tile sides may be null when only one side is authored. */
export type DayNightEntry = { layer: string; x: number; y: number; dayTile: number | null; nightTile: number | null }

function dayNightKey(entry: { layer: string; x: number; y: number }) {
  return `${entry.layer}\u0000${entry.x},${entry.y}`
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

/**
 * One display-level day/night block: a contiguous rectangle of cells that all
 * share the same layer and tile pair. `cells` lists every covered cell in
 * reading order (y then x); `x`/`y`/`width`/`height` describe the bounding
 * rectangle, which is fully covered by construction.
 */
export type DayNightRect = {
  layer: string
  x: number
  y: number
  width: number
  height: number
  dayTile: number | null
  nightTile: number | null
  cells: { x: number; y: number }[]
}

function rectGroupKey(entry: DayNightEntry) {
  const day = entry.dayTile == null ? 'n' : String(entry.dayTile)
  const night = entry.nightTile == null ? 'n' : String(entry.nightTile)
  return `${entry.layer}\u0000${day}\u0000${night}`
}

/**
 * Collapses day/night swap cells into contiguous rectangles for display.
 * Cells are grouped by (layer, dayTile, nightTile) — an asymmetric swap whose
 * day or night side is missing is its own group, never merged across tile
 * values. Within a group, a greedy rect cover consumes the cell set: the
 * topmost-leftmost remaining cell anchors a rectangle that extends right along
 * its own row for the longest contiguous run, then extends down row by row as
 * long as every cell of the full x range is present; the covered cells are
 * removed and the next anchor picked until the set is empty. Rectangles are
 * returned sorted by (layer, y, x) with a stable reading order.
 */
export function groupDayNightRects(entries: readonly DayNightEntry[]): DayNightRect[] {
  const groups = new Map<
    string,
    { layer: string; dayTile: number | null; nightTile: number | null; cells: Set<string>; points: { x: number; y: number }[] }
  >()
  for (const entry of entries) {
    const key = rectGroupKey(entry)
    let group = groups.get(key)
    if (!group) {
      group = { layer: entry.layer, dayTile: entry.dayTile, nightTile: entry.nightTile, cells: new Set(), points: [] }
      groups.set(key, group)
    }
    const cellKey = `${entry.x},${entry.y}`
    if (!group.cells.has(cellKey)) {
      group.cells.add(cellKey)
      group.points.push({ x: entry.x, y: entry.y })
    }
  }

  const rects: DayNightRect[] = []
  for (const group of groups.values()) {
    const remaining = new Set(group.cells)
    while (remaining.size > 0) {
      // Anchor: the topmost (then leftmost) remaining cell.
      let anchor: { x: number; y: number } | null = null
      for (const point of group.points) {
        if (!remaining.has(`${point.x},${point.y}`)) continue
        if (!anchor || point.y < anchor.y || (point.y === anchor.y && point.x < anchor.x)) anchor = point
      }
      if (!anchor) break

      let width = 1
      while (remaining.has(`${anchor.x + width},${anchor.y}`)) width += 1

      let height = 1
      rows: while (true) {
        const row = anchor.y + height
        for (let x = anchor.x; x < anchor.x + width; x += 1) {
          if (!remaining.has(`${x},${row}`)) break rows
        }
        height += 1
      }

      const covered: { x: number; y: number }[] = []
      for (let y = anchor.y; y < anchor.y + height; y += 1) {
        for (let x = anchor.x; x < anchor.x + width; x += 1) {
          remaining.delete(`${x},${y}`)
          covered.push({ x, y })
        }
      }
      rects.push({
        layer: group.layer,
        x: anchor.x,
        y: anchor.y,
        width,
        height,
        dayTile: group.dayTile,
        nightTile: group.nightTile,
        cells: covered,
      })
    }
  }

  rects.sort((left, right) => (left.layer < right.layer ? -1 : left.layer > right.layer ? 1 : 0) || left.y - right.y || left.x - right.x)
  return rects
}
