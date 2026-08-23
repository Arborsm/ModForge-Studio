import { useEffect, useMemo, useRef } from 'react'
import { useEditorCopy } from '@locales/provider'
import { appEvent } from '@platform/observability'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'

function pathListKey(paths: readonly string[]) {
  return paths.join('\u0000')
}

/** Maintains the recent game-directory list in the appearance state. */
export function useWorkbenchRecentDirectories(appUiStateReady: boolean, activeRootPath: string | null) {
  const copy = useEditorCopy().studioDesk
  const storedDirectories = getAppUiStateSnapshot().appearance.recentGameDirectories ?? []
  const persistedKeyRef = useRef<string | null>(null)
  const recentDirectories = useMemo(
    () => (activeRootPath ? [activeRootPath, ...storedDirectories.filter((path) => path !== activeRootPath)] : storedDirectories),
    [activeRootPath, storedDirectories],
  )

  useEffect(() => {
    if (!appUiStateReady) return
    const nextKey = pathListKey(recentDirectories)
    const persisted = getAppUiStateSnapshot().appearance.recentGameDirectories ?? []
    if (pathListKey(persisted) === nextKey || persistedKeyRef.current === nextKey) {
      persistedKeyRef.current = nextKey
      return
    }

    persistedKeyRef.current = nextKey
    void applyAppUiStatePatch({ appearance: { recentGameDirectories: recentDirectories } }).catch((error) => {
      appEvent('error', copy.recentDirectoriesSaveFailed)
        .error(error)
        .context({ source: 'workbench-recent-directories', operation: 'save' })
        .emit({ notify: false })
    })
  }, [appUiStateReady, copy.recentDirectoriesSaveFailed, recentDirectories])
}
