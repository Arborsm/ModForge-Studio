/**
 * Trailing-edge throttle that coalesces high-frequency translation stream
 * deltas (each content delta can complete several items) into a bounded number
 * of commits. At most one commit fires per `intervalMs` window, and a final
 * trailing commit runs after the last schedule so no completed item is lost.
 * The throttle itself is pure timer plumbing — the commit closure decides what
 * to render and can no-op when the owning job has settled.
 */

export type StreamCommitThrottle = {
  /** Requests a commit; schedules a trailing commit if none is pending. */
  schedule: () => void
  /** Stops any pending timer. Safe to call on unmount; commits never fire after. */
  dispose: () => void
}

export function createStreamCommitThrottle(commit: () => void, intervalMs = 80): StreamCommitThrottle {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false

  const fire = () => {
    timer = null
    commit()
    // Deltas kept arriving while the previous commit was in flight: run one
    // more trailing commit after the window so the latest items still render.
    if (pending) {
      pending = false
      timer = setTimeout(fire, intervalMs)
    }
  }

  return {
    schedule() {
      if (timer !== null) {
        pending = true
        return
      }
      timer = setTimeout(fire, intervalMs)
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = false
    },
  }
}
