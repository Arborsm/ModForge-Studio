import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cx } from '@shared/lib/helper'

/** A rectangle in source-image pixels. */
export type SheetRegion = {
  x: number
  y: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function snapDown(value: number, snap: number): number {
  return Math.floor(value / snap) * snap
}

function snapUp(value: number, snap: number): number {
  return Math.ceil(value / snap) * snap
}

/**
 * Converts a client-space drag into a source-pixel region: corners are ordered,
 * snapped to the grid when `snap` is set, and clamped to the image bounds.
 * `clientPerSource` is client pixels per source pixel (display scale > 1 when
 * the image renders larger than natural size).
 */
export function normalizeDragRect(
  start: { x: number; y: number },
  current: { x: number; y: number },
  clientPerSource: number,
  bounds: { width: number; height: number },
  snap?: number,
): SheetRegion {
  const toSource = (point: { x: number; y: number }) => ({
    x: clamp(point.x / clientPerSource, 0, bounds.width),
    y: clamp(point.y / clientPerSource, 0, bounds.height),
  })
  const a = toSource(start)
  const b = toSource(current)
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const right = Math.max(a.x, b.x)
  const bottom = Math.max(a.y, b.y)

  if (snap !== undefined && snap > 0) {
    const x = snapDown(left, snap)
    const y = snapDown(top, snap)
    return {
      x,
      y,
      width: Math.max(snap, snapUp(right, snap) - x),
      height: Math.max(snap, snapUp(bottom, snap) - y),
    }
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  }
}

/** The single grid cell containing one source-pixel point, or null when outside. */
export function cellRegionAt(
  point: { x: number; y: number },
  cellSize: number,
  bounds: { width: number; height: number },
): SheetRegion | null {
  if (cellSize <= 0 || point.x < 0 || point.y < 0 || point.x >= bounds.width || point.y >= bounds.height) {
    return null
  }
  return {
    x: snapDown(point.x, cellSize),
    y: snapDown(point.y, cellSize),
    width: Math.min(cellSize, bounds.width - snapDown(point.x, cellSize)),
    height: Math.min(cellSize, bounds.height - snapDown(point.y, cellSize)),
  }
}

/** Grid index of a cell region (`SpriteIndex`-style, row-major). */
export function cellIndexFor(region: SheetRegion, cellSize: number, imageWidth: number): number {
  const columns = Math.floor(imageWidth / cellSize)
  return Math.floor(region.y / cellSize) * columns + Math.floor(region.x / cellSize)
}

/** Grid region for a row-major cell index (inverse of `cellIndexFor`). */
export function regionForCellIndex(index: number, cellSize: number, imageWidth: number, imageHeight: number): SheetRegion | null {
  const columns = Math.floor(imageWidth / cellSize)
  if (columns <= 0 || index < 0) {
    return null
  }
  const region = {
    x: (index % columns) * cellSize,
    y: Math.floor(index / columns) * cellSize,
    width: cellSize,
    height: cellSize,
  }
  return region.y + cellSize <= imageHeight ? region : null
}

type SheetRegionPickerProps = {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  /** Current selection in source pixels, or null. */
  value: SheetRegion | null
  onChange: (region: SheetRegion) => void
  /** Snap grid size in source pixels (e.g. 16 for tiles); freehand when omitted. */
  snap?: number
  /** Click-to-pick single cells instead of dragging rectangles. */
  cellPick?: boolean
  className?: string
}

/**
 * Rubber-band region selection over a sprite sheet. The stage scales the image
 * to the container width and maps pointer coordinates back to source pixels;
 * the selection renders as a percentage overlay so no resize bookkeeping is
 * needed. Coordinates still arrive in source pixels, ready for `FromArea` /
 * `ToArea` / `SpriteIndex` semantics.
 */
export function SheetRegionPicker({
  imageUrl,
  imageWidth,
  imageHeight,
  value,
  onChange,
  snap,
  cellPick = false,
  className,
}: SheetRegionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<SheetRegion | null>(null)

  function toClientPoint(event: ReactPointerEvent): { x: number; y: number } {
    const bounds = containerRef.current!.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }

  function clientPerSource(): number {
    const container = containerRef.current
    if (!container || imageWidth <= 0) return 1
    return container.clientWidth / imageWidth
  }

  function handlePointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    containerRef.current?.setPointerCapture(event.pointerId)
    const point = toClientPoint(event)
    if (cellPick && snap !== undefined && snap > 0) {
      const sourcePoint = { x: point.x / clientPerSource(), y: point.y / clientPerSource() }
      const cell = cellRegionAt(sourcePoint, snap, { width: imageWidth, height: imageHeight })
      setDraft(cell)
      if (cell) {
        onChange(cell)
      }
      return
    }
    dragStartRef.current = point
    setDraft(normalizeDragRect(point, point, clientPerSource(), { width: imageWidth, height: imageHeight }, snap))
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (draft === null || cellPick) return
    if ((event.buttons & 1) === 0) return
    setDraft((current) => {
      const start = dragStartRef.current
      if (current === null || start === null) return current
      const point = toClientPoint(event)
      return normalizeDragRect(start, point, clientPerSource(), { width: imageWidth, height: imageHeight }, snap)
    })
  }

  function handlePointerUp() {
    if (draft !== null && !cellPick) {
      onChange(draft)
    }
    dragStartRef.current = null
    setDraft(null)
  }

  const shown = draft ?? value
  const rectStyle = (region: SheetRegion) => ({
    left: `${(region.x / imageWidth) * 100}%`,
    top: `${(region.y / imageHeight) * 100}%`,
    width: `${(region.width / imageWidth) * 100}%`,
    height: `${(region.height / imageHeight) * 100}%`,
  })
  const gridSize = snap !== undefined && snap > 0 ? `${(snap / imageWidth) * 100}% ${(snap / imageHeight) * 100}%` : undefined

  return (
    <div
      ref={containerRef}
      className={cx('relative w-full touch-none overflow-hidden rounded-md border border-(--border-color) bg-(--bg-app)', className)}
      style={{ cursor: cellPick ? 'pointer' : 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img src={imageUrl} alt="" draggable={false} className="block w-full select-none" style={{ imageRendering: 'pixelated' }} />
      {gridSize !== undefined ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--border-color) 1px, transparent 1px), linear-gradient(to bottom, var(--border-color) 1px, transparent 1px)',
            backgroundSize: gridSize,
          }}
        />
      ) : null}
      {shown !== null ? (
        <div
          className="pointer-events-none absolute border-2 border-(--accent) bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
          style={rectStyle(shown)}
        />
      ) : null}
    </div>
  )
}
