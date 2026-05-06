import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'

type PanZoomViewportSize = {
  width: number
  height: number
}

type PanZoomViewportPoint = {
  x: number
  y: number
}

type PanZoomViewportAnchor = {
  viewportWidth: number
  viewportHeight: number
  x: number
  y: number
}

type DragState = {
  offsetX: number
  offsetY: number
  pointerId: number
  startX: number
  startY: number
  target: HTMLElement
}

type UsePanZoomViewportOptions = {
  contentHeight: number
  contentWidth: number
  fitPadding?: number
  onZoomChange?: (zoom: number, mode: 'fit' | 'manual') => void
}

export type PanZoomViewportSurfaceProps = {
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onWheel: (event: ReactWheelEvent<HTMLElement>) => void
  tabIndex: number
}

export const PAN_ZOOM_MIN_ZOOM = 0.08
export const PAN_ZOOM_MAX_ZOOM = 8
export const PAN_ZOOM_TOOLBAR_ZOOM_FACTOR = 1.12
export const PAN_ZOOM_WHEEL_INTENSITY = 0.0007

function toViewportSize(node: HTMLElement | null): PanZoomViewportSize {
  if (!node) {
    return { width: 0, height: 0 }
  }

  return {
    width: node.clientWidth,
    height: node.clientHeight,
  }
}

function getAnchorFromTarget(target: HTMLElement, clientX: number, clientY: number): PanZoomViewportAnchor {
  const rect = target.getBoundingClientRect()
  return {
    viewportWidth: rect.width,
    viewportHeight: rect.height,
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

export function clampPanZoomZoom(value: number) {
  return Math.min(PAN_ZOOM_MAX_ZOOM, Math.max(PAN_ZOOM_MIN_ZOOM, value))
}

export function usePanZoomViewport({
  contentHeight,
  contentWidth,
  fitPadding = 56,
  onZoomChange,
}: UsePanZoomViewportOptions) {
  const dragStateRef = useRef<DragState | null>(null)
  const measuredViewportRef = useRef<HTMLElement | null>(null)
  const offsetRef = useRef<PanZoomViewportPoint>({ x: 0, y: 0 })
  const resizeListenerRef = useRef<(() => void) | null>(null)
  const wheelAnchorRef = useRef<PanZoomViewportAnchor | null>(null)
  const wheelFrameRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const zoomModeRef = useRef<'fit' | 'manual'>('fit')
  const zoomRef = useRef(1)
  const [dragging, setDragging] = useState(false)
  const [manualZoom, setManualZoom] = useState(1)
  const [offset, setOffset] = useState<PanZoomViewportPoint>({ x: 0, y: 0 })
  const [viewportSize, setViewportSize] = useState<PanZoomViewportSize>({ width: 0, height: 0 })
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit')

  const fitZoom = useMemo(() => {
    if (!contentWidth || !contentHeight || !viewportSize.width || !viewportSize.height) {
      return 1
    }

    const availableWidth = Math.max(96, viewportSize.width - fitPadding * 2)
    const availableHeight = Math.max(96, viewportSize.height - fitPadding * 2)
    return clampPanZoomZoom(Math.min(availableWidth / contentWidth, availableHeight / contentHeight))
  }, [contentHeight, contentWidth, fitPadding, viewportSize.height, viewportSize.width])

  const zoom = zoomMode === 'fit' ? fitZoom : manualZoom

  const syncViewportSize = useCallback((node: HTMLElement | null) => {
    setViewportSize((current) => {
      const next = toViewportSize(node)
      if (current.width === next.width && current.height === next.height) {
        return current
      }
      return next
    })
  }, [])

  const measureRef = useCallback(
    (node: HTMLElement | null) => {
      if (resizeListenerRef.current) {
        resizeListenerRef.current()
        resizeListenerRef.current = null
      }

      measuredViewportRef.current = node
      syncViewportSize(node)

      if (!node) {
        return
      }

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          syncViewportSize(node)
        })
        observer.observe(node)
        resizeListenerRef.current = () => observer.disconnect()
        return
      }

      const handleResize = () => syncViewportSize(node)
      window.addEventListener('resize', handleResize)
      resizeListenerRef.current = () => window.removeEventListener('resize', handleResize)
    },
    [syncViewportSize],
  )

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    zoomModeRef.current = zoomMode
  }, [zoomMode])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    onZoomChange?.(zoom, zoomMode)
  }, [onZoomChange, zoom, zoomMode])

  useEffect(() => {
    return () => {
      resizeListenerRef.current?.()
      if (wheelFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelFrameRef.current)
      }
    }
  }, [])

  const getCenteredBase = useCallback(
    (targetZoom: number, size: PanZoomViewportSize) => ({
      left: (size.width - contentWidth * targetZoom) / 2,
      top: (size.height - contentHeight * targetZoom) / 2,
    }),
    [contentHeight, contentWidth],
  )

  const ensureManualMode = useCallback(() => {
    if (zoomModeRef.current !== 'fit') {
      return
    }

    setManualZoom(zoomRef.current)
    setZoomMode('manual')
  }, [])

  const centerView = useCallback(() => {
    setOffset({ x: 0, y: 0 })
  }, [])

  const resetPan = centerView

  const zoomTo = useCallback(
    (nextZoom: number, anchor?: PanZoomViewportAnchor) => {
      const resolvedZoom = clampPanZoomZoom(nextZoom)
      const anchorViewport = anchor
        ? {
            width: anchor.viewportWidth,
            height: anchor.viewportHeight,
          }
        : viewportSize

      const currentZoom = zoomRef.current
      const currentBase = getCenteredBase(currentZoom, anchorViewport)
      const nextBase = getCenteredBase(resolvedZoom, anchorViewport)
      const anchorX = anchor?.x ?? anchorViewport.width / 2
      const anchorY = anchor?.y ?? anchorViewport.height / 2
      const nextOffset =
        anchorViewport.width > 0 && anchorViewport.height > 0 && currentZoom > 0
          ? {
              x: anchorX - nextBase.left - ((anchorX - currentBase.left - offsetRef.current.x) / currentZoom) * resolvedZoom,
              y: anchorY - nextBase.top - ((anchorY - currentBase.top - offsetRef.current.y) / currentZoom) * resolvedZoom,
            }
          : offsetRef.current

      setZoomMode('manual')
      setManualZoom(resolvedZoom)
      setOffset(nextOffset)
    },
    [getCenteredBase, viewportSize],
  )

  const zoomIn = useCallback(() => {
    zoomTo(zoomRef.current * PAN_ZOOM_TOOLBAR_ZOOM_FACTOR)
  }, [zoomTo])

  const zoomOut = useCallback(() => {
    zoomTo(zoomRef.current / PAN_ZOOM_TOOLBAR_ZOOM_FACTOR)
  }, [zoomTo])

  const setOneToOne = useCallback(() => {
    zoomTo(1)
  }, [zoomTo])

  const fitToScreen = useCallback(() => {
    setOffset({ x: 0, y: 0 })
    setZoomMode('fit')
  }, [])

  const panBy = useCallback(
    (x: number, y: number) => {
      ensureManualMode()
      setOffset({
        x: offsetRef.current.x + x,
        y: offsetRef.current.y + y,
      })
    },
    [ensureManualMode],
  )

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.deltaY === 0) {
        return
      }

      const deltaScale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.currentTarget.clientHeight
            : 1

      wheelDeltaRef.current += event.deltaY * deltaScale
      wheelAnchorRef.current = getAnchorFromTarget(event.currentTarget, event.clientX, event.clientY)

      if (wheelFrameRef.current !== null) {
        return
      }

      wheelFrameRef.current = window.requestAnimationFrame(() => {
        wheelFrameRef.current = null
        const delta = wheelDeltaRef.current
        const anchor = wheelAnchorRef.current
        wheelDeltaRef.current = 0
        wheelAnchorRef.current = null

        if (delta === 0) {
          return
        }

        zoomTo(zoomRef.current * Math.exp(-delta * PAN_ZOOM_WHEEL_INTENSITY), anchor ?? undefined)
      })
    },
    [zoomTo],
  )

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.button !== 1) {
      return
    }

    const target = event.currentTarget
    target.focus()
    target.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target,
    }
    setDragging(true)
    event.preventDefault()
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      ensureManualMode()
      setOffset({
        x: dragState.offsetX + event.clientX - dragState.startX,
        y: dragState.offsetY + event.clientY - dragState.startY,
      })
    },
    [ensureManualMode],
  )

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (dragState.target.hasPointerCapture(event.pointerId)) {
      dragState.target.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
    setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      const panStep = event.shiftKey ? 96 : 32
      switch (event.key) {
        case '+':
        case '=':
          event.preventDefault()
          zoomIn()
          break
        case '-':
        case '_':
          event.preventDefault()
          zoomOut()
          break
        case '0':
          event.preventDefault()
          fitToScreen()
          break
        case '1':
          event.preventDefault()
          setOneToOne()
          break
        case 'c':
        case 'C':
          event.preventDefault()
          centerView()
          break
        case 'ArrowLeft':
          event.preventDefault()
          panBy(panStep, 0)
          break
        case 'ArrowRight':
          event.preventDefault()
          panBy(-panStep, 0)
          break
        case 'ArrowUp':
          event.preventDefault()
          panBy(0, panStep)
          break
        case 'ArrowDown':
          event.preventDefault()
          panBy(0, -panStep)
          break
        default:
          break
      }
    },
    [centerView, fitToScreen, panBy, setOneToOne, zoomIn, zoomOut],
  )

  const base = getCenteredBase(zoom, viewportSize)
  const contentStyle = useMemo<CSSProperties>(
    () => ({
      height: `${Math.max(0, contentHeight * zoom)}px`,
      transform: `translate(${base.left + offset.x}px, ${base.top + offset.y}px)`,
      transformOrigin: 'top left',
      width: `${Math.max(0, contentWidth * zoom)}px`,
    }),
    [base.left, base.top, contentHeight, contentWidth, offset.x, offset.y, zoom],
  )

  return {
    centerView,
    contentStyle,
    fitToScreen,
    isDragging: dragging,
    measureRef,
    resetPan,
    setOneToOne,
    surfaceProps: {
      onKeyDown,
      onPointerCancel: releasePointer,
      onPointerDown,
      onPointerMove,
      onPointerUp: releasePointer,
      onWheel,
      tabIndex: 0,
    } satisfies PanZoomViewportSurfaceProps,
    zoom,
    zoomIn,
    zoomLabel: `${Math.round(zoom * 100)}%`,
    zoomOut,
  }
}
