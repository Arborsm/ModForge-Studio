import { lazy, Suspense } from 'react'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchViewRegistration } from '@shared/contracts'
import type { LocaleCode, ThemeMode } from '@locales/editor-shell'
import type { SettingsWindowCategory } from '@shared/contracts'
import { WorkbenchShellSkeleton } from '@app/app-shell/WorkbenchShellSkeleton'

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
  onCloseWindow: () => void
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null
  workbenchActivationKey?: number
}

export function WorkbenchPage(props: WorkbenchPageProps) {
  return (
    <Suspense fallback={<WorkbenchShellSkeleton />}>
      <WorkbenchExperience {...props} />
    </Suspense>
  )
}
