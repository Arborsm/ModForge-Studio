import type { AppCommand, CommandDispatcher } from '@shared/contracts'

export function createCommandDispatcher(
  handler: (command: AppCommand) => void | Promise<void>,
): CommandDispatcher {
  return {
    dispatch(command) {
      return handler(command)
    },
  }
}
