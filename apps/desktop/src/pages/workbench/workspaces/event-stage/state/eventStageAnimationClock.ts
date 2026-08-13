import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * External animation clock for the event stage preview.
 *
 * The workspace playback loop publishes a fresh `performance.now()` every rAF
 * frame. Per-frame consumers (actor sprites, stage effects, fade/flash
 * overlays) subscribe through `useEventStageAnimationEffect()` and mutate DOM
 * styles directly, so 60fps updates never enter the React render path.
 */

type AnimationClockListener = (nowMs: number) => void

let currentNowMs = performance.now()
const listeners = new Set<AnimationClockListener>()

export function getEventStageAnimationNow() {
  return currentNowMs
}

export function publishEventStageAnimationNow(nowMs: number) {
  if (nowMs === currentNowMs) {
    return
  }
  currentNowMs = nowMs
  for (const listener of listeners) {
    listener(currentNowMs)
  }
}

function subscribeEventStageAnimationNow(listener: AnimationClockListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Runs `callback` immediately on mount (layout phase, so the first paint is
 * already positioned) and on every published animation frame. The callback
 * should mutate the DOM directly; it must not set React state.
 */
export function useEventStageAnimationEffect(callback: (nowMs: number) => void) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })
  useLayoutEffect(() => {
    callbackRef.current(getEventStageAnimationNow())
    return subscribeEventStageAnimationNow((nowMs) => callbackRef.current(nowMs))
  }, [])
}
