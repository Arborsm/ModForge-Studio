import { lazy, Suspense } from 'react'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchViewRegistration } from '@shared/contracts'
import type { LocaleCode, ThemeMode } from '@locales/api'
import type { SettingsWindowCategory } from '@shared/contracts'
import { WorkbenchShellSkeleton } from '@shared/ui/WorkbenchShellSkeleton'

const WorkbenchExperience = lazy(() => import('./WorkbenchExperience'))

type WorkbenchPageProps = {
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

export function WorkbenchPage(props: WorkbenchPageProps) {
  return (
    <Suspense fallback={<WorkbenchShellSkeleton />}>
      <WorkbenchExperience {...props} />
    </Suspense>
  )
}
