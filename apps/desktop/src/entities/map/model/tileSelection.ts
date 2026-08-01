/** Inclusive tile rectangle selected on a map viewport. */
export type MapTileRect = {
  x: number
  y: number
  width: number
  height: number
}

type MapTilePoint = {
  x: number
  y: number
}

/**
 * Normalizes two tile corners into a positive rectangle inside the map bounds.
 * Both corners are inclusive, matching how a drag across tiles reads visually.
 */
export function createMapTileRect(start: MapTilePoint, end: MapTilePoint, bounds: { width: number; height: number }): MapTileRect {
  const maxX = Math.max(0, Math.floor(bounds.width) - 1)
  const maxY = Math.max(0, Math.floor(bounds.height) - 1)
  const clampX = (value: number) => Math.min(maxX, Math.max(0, Math.floor(value)))
  const clampY = (value: number) => Math.min(maxY, Math.max(0, Math.floor(value)))
  const startX = clampX(start.x)
  const startY = clampY(start.y)
  const endX = clampX(end.x)
  const endY = clampY(end.y)
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)

  return {
    x,
    y,
    width: Math.abs(endX - startX) + 1,
    height: Math.abs(endY - startY) + 1,
  }
}
