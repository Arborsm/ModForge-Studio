import type { AppCommand, PendingWorkbenchCommandIntent } from '@shared/contracts'
import type { AppMode } from '@locales/editor-shell'

let nextIntentId = 0

export type AppCommandHandlerDependencies = {
  setAppMode: (mode: AppMode) => void
  onPendingIntent: (intent: PendingWorkbenchCommandIntent | null) => void
}

export type AppCommandHandler = ReturnType<typeof createAppCommandHandler>

export function createAppCommandHandler({
  setAppMode,
  onPendingIntent,
}: AppCommandHandlerDependencies) {
  let currentPendingIntent: PendingWorkbenchCommandIntent | null = null

  return {
    handleCommand(command: AppCommand) {
      if (command.type === 'navigation/open-workbench-view' || command.type === 'workbench/open-asset') {
        // Preserve open-asset intent: don't overwrite with a view-only intent
        if (
          currentPendingIntent?.command.type === 'workbench/open-asset' &&
          command.type === 'navigation/open-workbench-view'
        ) {
          return
        }

        nextIntentId += 1
        currentPendingIntent = {
          id: `intent-${nextIntentId}-${Date.now()}`,
          command,
        }
        onPendingIntent(currentPendingIntent)
        setAppMode('workbench')
        return
      }

      // navigation/open-page, workbench/focus-panel, unknown: no-op
    },

    clearPendingIntent() {
      currentPendingIntent = null
      onPendingIntent(null)
    },

    getCurrentPendingIntent(): PendingWorkbenchCommandIntent | null {
      return currentPendingIntent
    },
  }
}
