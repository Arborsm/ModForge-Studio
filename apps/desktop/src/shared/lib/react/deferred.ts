/** Cancels deferred work when it has not run yet. */
export type DeferredCancel = () => void
/** Supported scheduling strategies for low-priority UI work. */
export type DeferredStrategy = 'timeout' | 'frame'

/** Defers a callback to the next animation frame, falling back to setTimeout outside the browser. */
export function deferToAnimationFrame(callback: () => void): DeferredCancel {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    const timeoutId = setTimeout(callback, 0)
    return () => clearTimeout(timeoutId)
  }

  let cancelled = false
  const frameId = window.requestAnimationFrame(() => {
    if (!cancelled) {
      callback()
    }
  })

  return () => {
    cancelled = true
    window.cancelAnimationFrame(frameId)
  }
}

/** Defers a callback using setTimeout and returns a cancellation callback. */
export function deferToTimeout(callback: () => void, delay = 0): DeferredCancel {
  const timeoutId = window.setTimeout(callback, delay)
  return () => window.clearTimeout(timeoutId)
}

/** Schedules deferred work using either timeout or animation-frame strategy. */
export function scheduleDeferred(callback: () => void, strategy: DeferredStrategy = 'timeout'): DeferredCancel {
  return strategy === 'frame' ? deferToAnimationFrame(callback) : deferToTimeout(callback)
}
