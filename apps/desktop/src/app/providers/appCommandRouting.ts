import type { AppCommand, PendingWorkbenchCommandIntent } from '@shared/contracts'
import type { AppMode } from '@locales/api'

let nextIntentId = 0

export type AppCommandHandlerDependencies = {
  setAppMode: (mode: AppMode) => void
  onPendingIntent: (intent: PendingWorkbenchCommandIntent | null) => void
}

export type AppCommandHandler = ReturnType<typeof createAppCommandHandler>

export function createAppCommandHandler({ setAppMode, onPendingIntent }: AppCommandHandlerDependencies) {
  let currentPendingIntent: PendingWorkbenchCommandIntent | null = null

  return {
    handleCommand: (command: AppCommand) => {
      if (command.type === 'navigation/open-workbench-module' || command.type === 'workbench/open-asset') {
        nextIntentId += 1
        currentPendingIntent = {
          id: `intent-${nextIntentId}-${Date.now()}`,
          command,
        }
        onPendingIntent(currentPendingIntent)
        setAppMode('workbench')
        return
      }

      // navigation/open-page, unknown: no-op
    },

    clearPendingIntent: () => {
      currentPendingIntent = null
      onPendingIntent(null)
    },

    getCurrentPendingIntent: (): PendingWorkbenchCommandIntent | null => {
      return currentPendingIntent
    },
  }
}
