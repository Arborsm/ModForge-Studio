/** @file Typed app commands: the request channel for cross-layer flows that cannot call their target directly (e.g. pages -> app shell). */
import type { SettingsWindowTarget } from './types/settings'

/** Command to open the settings surface at a specific target. */
export type SettingsCommand = {
  type: 'navigation/open-settings'
  target: SettingsWindowTarget
}

/** Command to hot-reload compat plugins; results are observed via the compat plugin store. */
export type PluginCommand = {
  type: 'plugins/reload-compat'
}

/** Union of all typed commands dispatched through the app command dispatcher. */
export type AppCommand = SettingsCommand | PluginCommand

/** Sink for typed app commands; the app shell registers the root handler, any FSD layer can dispatch. */
export interface CommandDispatcher {
  dispatch: (command: AppCommand) => void | Promise<void>
}
