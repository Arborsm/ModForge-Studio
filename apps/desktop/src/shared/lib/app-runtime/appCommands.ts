/** @file App command dispatcher singleton: any FSD layer can dispatch typed commands; the app shell registers the root handler on mount. */
import type { AppCommand, CommandDispatcher } from '@shared/contracts'

type AppCommandHandler = (command: AppCommand) => void | Promise<void>

let currentHandler: AppCommandHandler | null = null

/**
 * Registers the root app command handler and returns an unregister function.
 * Called once by the app shell; commands dispatched before registration (early
 * render, unit tests) are dropped, so tests register their own stub handler.
 */
export function registerAppCommandHandler(handler: AppCommandHandler): () => void {
  currentHandler = handler
  return () => {
    if (currentHandler === handler) {
      currentHandler = null
    }
  }
}

/** App-level command dispatcher singleton. Fire-and-forget; observe results through the owning stores. */
export const appCommands: CommandDispatcher = {
  dispatch: (command) => currentHandler?.(command),
}
