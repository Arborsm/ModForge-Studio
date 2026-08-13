import type { MapPropertyValue } from './mapTypes'

/**
 * Per-cell property keys the grid-rule overlay mode paints. Stardew semantics:
 * the presence of a key (with value "T") toggles the rule on that cell.
 *
 * - `Passable` — blocks all characters (the name reads as "not passable").
 * - `NPCBarrier` — blocks NPCs only; a read-only instance property the game
 *   only consumes at runtime (presence is truth, not a xTile definition key).
 * - `Water` — water tile: fishing requires `Water` with an empty Buildings
 *   cell; vanilla maps declare it at the tileset definition level (presence
 *   is truth).
 * - `Diggable` — can be dug/planted.
 *
 * `Passable` and `NPCBarrier` are mutually exclusive (single-select passability);
 * `Water`/`Diggable` are independent toggles that combine freely.
 * `WaterSource` (greenhouse watering) and `NoFishing` are specialized keys
 * this overlay never generates.
 */
export const CELL_OVERLAY_PROPERTY_KEYS = ['Passable', 'NPCBarrier', 'Water', 'Diggable'] as const

/** A paint rule selectable in the overlay rule bar. `walkable` erases the rules. */
export type CellOverlayRule = 'walkable' | 'block' | 'npc' | 'water' | 'dig'

/** The five paint rules in bar order (walkable = erase first, then the four toggles). */
export const CELL_OVERLAY_RULES: readonly CellOverlayRule[] = ['walkable', 'block', 'npc', 'water', 'dig']

/**
 * Canvas fill hues for the four colored rules — the documented non-theme
 * decorative palette exception (see `tokens.css` `--cell-overlay-*`). These are
 * fixed hues that must stay readable over any map tile in both themes, so the
 * canvas drawing mirrors the token values instead of reading CSS custom
 * properties. Alphas are raised so the hue reads through the tile art, and the
 * per-cell stroke (CELL_OVERLAY_STROKE_COLORS) outlines every rule cell in its
 * own color for an at-a-glance read even at low zoom.
 */
export const CELL_OVERLAY_COLORS: Record<Exclude<CellOverlayRule, 'walkable'>, string> = {
  block: 'rgba(207, 63, 77, 0.5)',
  npc: 'rgba(224, 122, 14, 0.52)',
  water: 'rgba(63, 111, 224, 0.52)',
  dig: 'rgba(62, 164, 76, 0.5)',
}

/** Solid per-rule stroke drawn inside each overlay cell so adjacent rules stay distinct. */
export const CELL_OVERLAY_STROKE_COLORS: Record<Exclude<CellOverlayRule, 'walkable'>, string> = {
  block: 'rgba(207, 63, 77, 0.95)',
  npc: 'rgba(224, 122, 14, 0.95)',
  water: 'rgba(63, 111, 224, 0.95)',
  dig: 'rgba(62, 164, 76, 0.95)',
}

/**
 * Derives the display rule of a cell from its property keys. `NPCBarrier`
 * beats `Passable` (matching the legacy single-select passability), then water
 * beats diggable, so a cell carrying several rules renders as its dominant one.
 * Returns null when the cell has none of the overlay keys.
 */
export function cellOverlayRule(properties: Readonly<Record<string, unknown>>): CellOverlayRule | null {
  if ('NPCBarrier' in properties) return 'npc'
  if ('Passable' in properties) return 'block'
  if ('Water' in properties) return 'water'
  if ('Diggable' in properties) return 'dig'
  return null
}

/**
 * Applies one paint to a cell's property record:
 *
 * - `block` sets `Passable` and removes `NPCBarrier` (keeps water/diggable);
 * - `npc` sets `NPCBarrier` and removes `Passable` (keeps water/diggable);
 * - `water` sets `Water` (keeps passability and diggable);
 * - `dig` sets `Diggable` (keeps passability and water);
 * - `walkable` removes every overlay key, erasing the cell's rules.
 *
 * Non-overlay custom keys are always preserved.
 */
export function applyCellOverlayRule(
  properties: Readonly<Record<string, MapPropertyValue>>,
  rule: CellOverlayRule,
): Record<string, MapPropertyValue> {
  const result: Record<string, MapPropertyValue> = { ...properties }
  if (rule === 'walkable') {
    for (const key of CELL_OVERLAY_PROPERTY_KEYS) delete result[key]
    return result
  }
  if (rule === 'block') {
    delete result.NPCBarrier
    result.Passable = 'T'
    return result
  }
  if (rule === 'npc') {
    delete result.Passable
    result.NPCBarrier = 'T'
    return result
  }
  if (rule === 'water') {
    result.Water = 'T'
    return result
  }
  result.Diggable = 'T'
  return result
}

/**
 * Paints one rule onto a batch of cells of one layer. Immutable: returns a new
 * cell-property map where painted cells carry the merged property record and
 * cells left with zero properties are removed (matching `setMapAssetCellProperties`).
 * Out-of-bounds or non-integer points are skipped.
 */
export function paintCellOverlayCells(
  cellProperties: Readonly<Record<number, Record<string, MapPropertyValue>>>,
  width: number,
  height: number,
  points: readonly { x: number; y: number }[],
  rule: CellOverlayRule,
): Record<number, Record<string, MapPropertyValue>> {
  const next: Record<number, Record<string, MapPropertyValue>> = { ...cellProperties }
  for (const point of points) {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) {
      continue
    }
    const index = point.y * width + point.x
    const painted = applyCellOverlayRule(next[index] ?? {}, rule)
    if (Object.keys(painted).length === 0) delete next[index]
    else next[index] = painted
  }
  return next
}

/**
 * Projects a layer's cell properties onto the overlay view model: cell index →
 * display rule, skipping cells without any overlay key. Used to seed the canvas
 * coloring (plus the in-flight drag preview on top).
 */
export function deriveCellOverlayCells(
  cellProperties: Readonly<Record<number, Record<string, MapPropertyValue>>>,
): Record<number, CellOverlayRule> {
  const cells: Record<number, CellOverlayRule> = {}
  for (const [indexKey, properties] of Object.entries(cellProperties)) {
    const rule = cellOverlayRule(properties)
    if (rule) cells[Number(indexKey)] = rule
  }
  return cells
}
