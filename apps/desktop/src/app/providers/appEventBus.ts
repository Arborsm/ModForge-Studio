import type { AppEvent, AppEventBus } from '@shared/contracts'

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
