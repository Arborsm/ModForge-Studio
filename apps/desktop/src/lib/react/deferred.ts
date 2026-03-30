export type DeferredCancel = () => void
export type DeferredStrategy = 'timeout' | 'frame'

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

export function deferToTimeout(callback: () => void, delay = 0): DeferredCancel {
  const timeoutId = window.setTimeout(callback, delay)
  return () => window.clearTimeout(timeoutId)
}

export function scheduleDeferred(callback: () => void, strategy: DeferredStrategy = 'timeout'): DeferredCancel {
  return strategy === 'frame' ? deferToAnimationFrame(callback) : deferToTimeout(callback)
}
