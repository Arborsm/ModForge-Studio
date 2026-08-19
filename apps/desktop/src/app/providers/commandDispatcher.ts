/**
 * @file Command dispatcher factory: delegates dispatch to a specified handler function.
 */
import type { AppCommand, CommandDispatcher } from '@shared/contracts'

/** Creates a command dispatcher that delegates dispatch calls to the provided handler. */
export function createCommandDispatcher(handler: (command: AppCommand) => void | Promise<void>): CommandDispatcher {
  return {
    dispatch(command) {
      return handler(command)
    },
  }
}
