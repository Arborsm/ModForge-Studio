import { useEffect, useState } from 'react'
import { scheduleDeferred } from '@shared/lib/react'

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

/** Defers expensive browser modules until the shell has painted or the idle deadline expires. */
export function useDeferredWorkbenchModule(moduleId: string | null) {
  const [readyModuleId, setReadyModuleId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let cancelReset = () => {}
    let cancelRevealFrame = () => {}
    let cancelRevealTimeout = () => {}
    let idleId = 0

    const scheduleModule = (nextModuleId: string | null) => {
      cancelReset = scheduleDeferred(() => {
        if (!cancelled) setReadyModuleId(nextModuleId)
      }, 'frame')
    }

    if (moduleId !== 'map-browser' && moduleId !== 'character-browser') {
      scheduleModule(moduleId)
      return () => {
        cancelled = true
        cancelReset()
      }
    }

    scheduleModule(null)
    const reveal = () => {
      if (!cancelled) setReadyModuleId(moduleId)
    }
    const idleWindow = window as IdleWindow
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleId = idleWindow.requestIdleCallback(reveal, { timeout: 300 })
    } else {
      cancelRevealFrame = scheduleDeferred(() => {
        cancelRevealTimeout = scheduleDeferred(reveal, 'timeout')
      }, 'frame')
    }

    return () => {
      cancelled = true
      if (idleId && typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleId)
      cancelReset()
      cancelRevealFrame()
      cancelRevealTimeout()
    }
  }, [moduleId])

  return readyModuleId
}
