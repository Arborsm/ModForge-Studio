/**
 * @file App event bus factory: provides publish/subscribe-style cross-component event communication.
 */
import type { AppEvent, AppEventBus } from '@shared/contracts'

/** Creates an app event bus instance. */
export function createAppEventBus(): AppEventBus {
  const listeners = new Set<(event: AppEvent) => void>()

  return {
    emit(event) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
