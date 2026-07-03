import { useMemo } from 'react'
import type { WorkspaceMode } from '@locales'
import type { WorkspaceStatus } from '@shared/contracts'
import { deriveWorkspaceStatus, getRecentGameDirectories, getResourcePreloadProgress } from './workbenchLogic'

export function useWorkbenchStatus({
  workspaceMode,
  directoryInfoPresent,
  workspaceStatus,
  eventCount,
  eventStatusMessage,
  characterCount,
  characterStatusMessage,
  buildingBrowserCount,
  buildingStatusMessage,
  itemCount,
  itemStatusMessage,
  modDiagnostics,
  modHasUnsavedChanges,
  modProjectsCount,
  activeModProjectDetail,
  modStatusMessage,
  resourcePreloadState,
  storedRecentGameDirectories,
  currentRootPath,
}: {
  workspaceMode: WorkspaceMode
  directoryInfoPresent: boolean
  workspaceStatus: WorkspaceStatus
  eventCount: number
  eventStatusMessage: string
  characterCount: number
  characterStatusMessage: string
  buildingBrowserCount: number
  buildingStatusMessage: string
  itemCount: number
  itemStatusMessage: string
  modDiagnostics: Array<{ severity: 'info' | 'warning' | 'error' }>
  modHasUnsavedChanges: boolean
  modProjectsCount: number
  activeModProjectDetail: object | null
  modStatusMessage: string
  resourcePreloadState: { active: boolean; message: string; completed: number; total: number; currentLabel: string }
  storedRecentGameDirectories: string[]
  currentRootPath: string | null | undefined
}) {
  const currentWorkspaceStatus = useMemo(
    () =>
      deriveWorkspaceStatus({
        workspaceMode,
        directoryInfoPresent,
        workspaceStatus,
        eventCount,
        eventStatusMessage,
        characterCount,
        characterStatusMessage,
        buildingBrowserCount,
        buildingStatusMessage,
        itemCount,
        itemStatusMessage,
        modDiagnostics,
        modHasUnsavedChanges,
        modProjectsCount,
        activeModProjectDetail,
        modStatusMessage,
      }),
    [
      activeModProjectDetail,
      buildingBrowserCount,
      buildingStatusMessage,
      characterCount,
      characterStatusMessage,
      directoryInfoPresent,
      eventCount,
      eventStatusMessage,
      itemCount,
      itemStatusMessage,
      modDiagnostics,
      modHasUnsavedChanges,
      modProjectsCount,
      modStatusMessage,
      workspaceMode,
      workspaceStatus,
    ],
  )

  const recentGameDirectories = useMemo(
    () => getRecentGameDirectories(currentRootPath, storedRecentGameDirectories),
    [currentRootPath, storedRecentGameDirectories],
  )

  const resourcePreloadProgress = useMemo(() => getResourcePreloadProgress(resourcePreloadState), [resourcePreloadState])

  return {
    currentWorkspaceStatus,
    recentGameDirectories,
    resourcePreloadProgress,
  }
}
