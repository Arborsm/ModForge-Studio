/**
 * @file Self-implemented pull-to-refresh for launcher pages on the Android
 * host: pointer events on the page scroll container plus a ring indicator.
 * No native overscroll refresh exists in the WebView, so the gesture is
 * detected manually from the scroll container's pointer events.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Pull distance (px) at which releasing triggers the refresh. */
export const MOBILE_PULL_TO_REFRESH_THRESHOLD_PX = 64
/** Pull distance (px) beyond which the indicator stops growing. */
export const MOBILE_PULL_TO_REFRESH_MAX_PX = 110

type UsePullToRefreshOptions = {
  /** Element hosting the scrollable container; resolved lazily per event so late-mounted containers still work. */
  hostRef: RefObject<HTMLElement | null>
  /** Selector for the scrollable element inside the host. */
  scrollSelector: string
  onRefresh: () => void
  disabled?: boolean
}

export type MobilePullToRefreshState = {
  /** Finger down and dragging down from the top of the scroll container. */
  pulling: boolean
  /** Refresh triggered; waiting for the refresh callback to settle. */
  refreshing: boolean
  /** Current pull distance in px (0 while idle). */
  pullDistance: number
  /** Pull distance crossed the release threshold. */
  readyToRelease: boolean
}

const IDLE_STATE: MobilePullToRefreshState = {
  pulling: false,
  refreshing: false,
  pullDistance: 0,
  readyToRelease: false,
}

/** Tracks the pull-to-refresh gesture on the host's scroll container. */
export function usePullToRefresh({
  hostRef,
  scrollSelector,
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions): MobilePullToRefreshState {
  const [state, setState] = useState<MobilePullToRefreshState>(IDLE_STATE)
  const stateRef = useRef(state)
  stateRef.current = state
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (disabled) {
      setState(IDLE_STATE)
      return
    }

    const host = hostRef.current
    if (!host) {
      return
    }

    let startY = 0
    let tracking = false

    const resolveScrollElement = () => host.querySelector<HTMLElement>(scrollSelector)

    const handlePointerDown = (event: PointerEvent) => {
      if (stateRef.current.refreshing) {
        return
      }
      const scrollElement = resolveScrollElement()
      if (!scrollElement || scrollElement.scrollTop > 0) {
        return
      }
      startY = event.clientY
      tracking = true
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!tracking) {
        return
      }
      const scrollElement = resolveScrollElement()
      if (!scrollElement) {
        tracking = false
        return
      }

      const distance = Math.max(0, Math.min(event.clientY - startY, MOBILE_PULL_TO_REFRESH_MAX_PX))
      if (distance <= 0) {
        if (scrollElement.scrollTop > 0) {
          tracking = false
          setState(IDLE_STATE)
        }
        return
      }

      // The drag belongs to the refresh gesture, not to scrolling.
      event.preventDefault()
      scrollElement.style.transform = `translateY(${Math.round(distance * 0.5)}px)`
      setState({
        pulling: true,
        refreshing: false,
        pullDistance: distance,
        readyToRelease: distance >= MOBILE_PULL_TO_REFRESH_THRESHOLD_PX,
      })
    }

    const finishPull = () => {
      if (!tracking) {
        return
      }
      tracking = false
      const scrollElement = resolveScrollElement()
      if (scrollElement) {
        scrollElement.style.transform = ''
      }

      if (stateRef.current.readyToRelease) {
        setState({ pulling: false, refreshing: true, pullDistance: 0, readyToRelease: false })
        try {
          void Promise.resolve(onRefreshRef.current())
            .catch(() => undefined)
            .finally(() => {
              const current = resolveScrollElement()
              if (current) {
                current.style.transform = ''
              }
              setState(IDLE_STATE)
            })
        } catch {
          setState(IDLE_STATE)
        }
        return
      }

      setState(IDLE_STATE)
    }

    host.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', finishPull)
    window.addEventListener('pointercancel', finishPull)
    return () => {
      host.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishPull)
      window.removeEventListener('pointercancel', finishPull)
      const scrollElement = resolveScrollElement()
      if (scrollElement) {
        scrollElement.style.transform = ''
      }
    }
  }, [disabled, hostRef, scrollSelector])

  return state
}
