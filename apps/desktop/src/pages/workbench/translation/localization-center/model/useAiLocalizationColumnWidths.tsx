import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useAiLocalizationPersistentState } from './localizationPageState'

type ColumnWidths = Record<string, number>

const isColumnWidths = (value: unknown): value is ColumnWidths =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value as Record<string, unknown>).every((width) => typeof width === 'number' && Number.isFinite(width))

/** Persists user-resized dense table columns in the AI localization workspace state. */
export function useAiLocalizationColumnWidths(tableId: string, defaults: ColumnWidths) {
  const [stored, setStored] = useAiLocalizationPersistentState(`columns/${tableId}`, defaults, isColumnWidths)
  const widths = { ...defaults, ...stored }
  const setWidth = (column: string, width: number) =>
    setStored((current) => ({ ...current, [column]: Math.max(72, Math.min(720, Math.round(width))) }))
  return { widths, setWidth }
}

export function ColumnResizeHandle({
  column,
  width,
  label,
  setWidth,
}: {
  column: string
  width: number
  label: string
  setWidth: (column: string, width: number) => void
}) {
  const widthRef = useRef(width)
  widthRef.current = width
  const begin = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    const move = (moveEvent: PointerEvent) => setWidth(column, startWidth + moveEvent.clientX - startX)
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
  }
  return (
    <span
      className="ai-localization-column-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={begin}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        setWidth(column, widthRef.current + (event.key === 'ArrowRight' ? 12 : -12))
      }}
    />
  )
}

export function ResizableColumnHeader({
  column,
  width,
  resizeLabel,
  setWidth,
  children,
}: {
  column: string
  width: number
  resizeLabel: string
  setWidth: (column: string, width: number) => void
  children: ReactNode
}) {
  return (
    <th style={{ width }}>
      {children}
      <ColumnResizeHandle column={column} width={width} label={resizeLabel} setWidth={setWidth} />
    </th>
  )
}
