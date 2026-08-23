/**
 * @file App command routing: the app shell's root handler for typed cross-layer commands.
 */
import type { AppCommand, SettingsWindowTarget } from '@shared/contracts'

/** Dependencies for createAppCommandHandler. */
export type AppCommandHandlerDependencies = {
  openSettings: (target: SettingsWindowTarget) => void
  reloadCompatPlugins: () => void
}

/** App command handler instance type. */
export type AppCommandHandler = ReturnType<typeof createAppCommandHandler>

/** Creates the root app command handler; registered on the app command dispatcher singleton by the app shell. */
export function createAppCommandHandler({ openSettings, reloadCompatPlugins }: AppCommandHandlerDependencies) {
  return {
    handleCommand: (command: AppCommand) => {
      if (command.type === 'navigation/open-settings') {
        openSettings(command.target)
        return
      }
      if (command.type === 'plugins/reload-compat') {
        reloadCompatPlugins()
      }
    },
  }
}
