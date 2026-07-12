import type { LocaleCode, ThemeMode, WorkspaceMode } from '@locales/api'
import type { ResourcePreloadState, WorkspaceStatus } from '@entities/map'
import type { AppEvent, PendingWorkbenchCommandIntent, SettingsWindowCategory, WorkbenchViewRegistration } from '@shared/contracts'
import type { WorkbenchShellLocation } from '../model/useWorkbenchShellHistory'

type PersistedWorkbenchLocation = Omit<WorkbenchShellLocation, 'workspaceMode'> & { workspaceMode: string }

export const RESOURCE_PRELOAD_NOTIFICATION_ID = 'app-resource-preload'
export const EMPTY_RESOURCE_PRELOAD_STATE: ResourcePreloadState = {
  active: false,
  message: '',
  completed: 0,
  total: 0,
  currentLabel: '',
}
export const EMPTY_WORKSPACE_STATUS: WorkspaceStatus = {
  tone: 'idle',
  message: '',
}

export function arePathListsEqual(left: readonly string[], right: readonly string[]) {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function getPathListKey(paths: readonly string[]) {
  return paths.join('\u0000')
}

export function resolveInitialWorkbenchLocation(
  persistedLocation: PersistedWorkbenchLocation | null | undefined,
  workbenchViews: readonly WorkbenchViewRegistration[],
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null,
): WorkbenchShellLocation {
  const workspaceMode = ['map', 'events', 'characters', 'buildings', 'items', 'mod-browser', 'mod-i18n'].includes(
    persistedLocation?.workspaceMode ?? '',
  )
    ? (persistedLocation!.workspaceMode as WorkspaceMode)
    : 'map'
  const workspaceRegistration = workbenchViews.find(
    (view) => view.activation.kind === 'workspace' && view.activation.workspaceMode === workspaceMode,
  )
  const registeredWorkbenchViewId =
    persistedLocation?.registeredWorkbenchViewId && getWorkbenchViewRegistration(persistedLocation.registeredWorkbenchViewId)
      ? persistedLocation.registeredWorkbenchViewId
      : null

  return {
    workbenchRoute: persistedLocation?.workbenchRoute ?? 'home',
    workspaceMode,
    workspaceViewMode:
      workspaceRegistration?.activation.kind === 'workspace' && workspaceRegistration.activation.presentation === 'browser'
        ? 'preview'
        : (persistedLocation?.workspaceViewMode ?? 'preview'),
    registeredWorkbenchViewId,
  }
}

type IdleDeadlineLike = {
  didTimeout: boolean
  timeRemaining: () => number
}

export type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

export type WorkbenchExperienceProps = {
  pendingWorkbenchIntent: PendingWorkbenchCommandIntent | null
  onClearPendingIntent: () => void
  active: boolean
  appUiStateReady: boolean
  theme: ThemeMode
  locale: LocaleCode
  accentColor: string
  desktopHost: boolean
  onToggleTheme: () => void
  onSwitchToLauncher: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => boolean | Promise<boolean>
  onWindowCloseRequestChange?: (handler: (() => boolean | Promise<boolean>) | null) => void
  onHomeRouteActiveChange?: (active: boolean) => void
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null
  workbenchViews?: readonly WorkbenchViewRegistration[]
  workbenchActivationKey?: number
}
