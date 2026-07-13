import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  canGoWorkbenchShellBack,
  canGoWorkbenchShellForward,
  createWorkbenchShellHistory,
  getWorkbenchShellHistoryLocation,
  goWorkbenchShellBack,
  goWorkbenchShellForward,
  pushWorkbenchShellHistory,
  resetWorkbenchShellHistory,
  type WorkbenchShellHistoryState,
  type WorkbenchShellLocation,
} from './workbenchShellHistory'

export type { WorkbenchShellLocation }

type UseWorkbenchShellHistoryOptions = {
  /** Root container used for mouse side-button listeners. */
  rootRef: RefObject<HTMLElement | null>
  enabled: boolean
  location: WorkbenchShellLocation
  /**
   * Guard and apply a restored location, then call commit exactly once when the
   * transition is accepted. A cancelled transition must not call commit.
   */
  onRestoreLocation: (location: WorkbenchShellLocation, commit: () => void) => void
}

/**
 * Browser-style shell history for the workbench.
 * push() is for intentional user navigation only; restore paths go through back/forward/reset.
 */
export function useWorkbenchShellHistory({ rootRef, enabled, location, onRestoreLocation }: UseWorkbenchShellHistoryOptions) {
  const [history, setHistory] = useState<WorkbenchShellHistoryState>(() => createWorkbenchShellHistory(location))
  const historyRef = useRef(history)
  historyRef.current = history
  const restoringRef = useRef(false)
  const onRestoreLocationRef = useRef(onRestoreLocation)
  onRestoreLocationRef.current = onRestoreLocation

  const push = useCallback((location: WorkbenchShellLocation) => {
    if (restoringRef.current) {
      return
    }
    setHistory((current) => {
      const next = pushWorkbenchShellHistory(current, location)
      historyRef.current = next
      return next
    })
  }, [])

  const pushCurrent = useCallback(() => {
    push(location)
  }, [location, push])

  const goBack = useCallback(() => {
    const current = historyRef.current
    if (!canGoWorkbenchShellBack(current)) {
      return
    }
    const next = goWorkbenchShellBack(current)
    onRestoreLocationRef.current(getWorkbenchShellHistoryLocation(next), () => {
      restoringRef.current = true
      historyRef.current = next
      setHistory(next)
      queueMicrotask(() => {
        restoringRef.current = false
      })
    })
  }, [])

  const goForward = useCallback(() => {
    const current = historyRef.current
    if (!canGoWorkbenchShellForward(current)) {
      return
    }
    const next = goWorkbenchShellForward(current)
    onRestoreLocationRef.current(getWorkbenchShellHistoryLocation(next), () => {
      restoringRef.current = true
      historyRef.current = next
      setHistory(next)
      queueMicrotask(() => {
        restoringRef.current = false
      })
    })
  }, [])

  /**
   * Project switch / close: clear the stack and seed a new root.
   * Does not call onRestoreLocation — caller already applied the new product state.
   */
  const resetTo = useCallback((location: WorkbenchShellLocation) => {
    restoringRef.current = true
    const next = resetWorkbenchShellHistory(location)
    historyRef.current = next
    setHistory(next)
    queueMicrotask(() => {
      restoringRef.current = false
    })
  }, [])

  const resetToAndPush = useCallback((root: WorkbenchShellLocation, location: WorkbenchShellLocation) => {
    const next = pushWorkbenchShellHistory(resetWorkbenchShellHistory(root), location)
    historyRef.current = next
    setHistory(next)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const root = rootRef.current
    if (!root) {
      return
    }

    const handlePointerUp = (event: PointerEvent | MouseEvent) => {
      // Mouse back / forward side buttons.
      if (event.button === 3) {
        event.preventDefault()
        goBack()
        return
      }
      if (event.button === 4) {
        event.preventDefault()
        goForward()
      }
    }

    const eventName = typeof PointerEvent === 'undefined' ? 'mouseup' : 'pointerup'
    root.addEventListener(eventName, handlePointerUp)
    return () => {
      root.removeEventListener(eventName, handlePointerUp)
    }
  }, [enabled, goBack, goForward, rootRef])

  return {
    push,
    pushCurrent,
    goBack,
    goForward,
    resetTo,
    resetToAndPush,
    canGoBack: canGoWorkbenchShellBack(history),
    canGoForward: canGoWorkbenchShellForward(history),
    location: getWorkbenchShellHistoryLocation(history),
  }
}
