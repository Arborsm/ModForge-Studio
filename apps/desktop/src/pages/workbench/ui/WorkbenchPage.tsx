import { lazy, Suspense } from 'react'
import type { AppEvent, PendingWorkbenchCommandIntent, WorkbenchViewRegistration } from '@shared/contracts'
import type { LocaleCode, ThemeMode } from '@locales/editor-shell'
import type { SettingsWindowCategory } from '@shared/contracts'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'

const WorkbenchExperience = lazy(() => import('./WorkbenchExperience'))

type WorkbenchPageProps = {
  pendingWorkbenchIntent: PendingWorkbenchCommandIntent | null
  onClearPendingIntent: () => void
  active: boolean
  appUiStateReady: boolean
  theme: ThemeMode
  locale: LocaleCode
  accentColor: string
  debugEnabled: boolean
  desktopHost: boolean
  onToggleTheme: () => void
  onSwitchToLauncher: () => void
  onOpenSettings: (category?: SettingsWindowCategory) => void
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  onWorkbenchEvent: (event: AppEvent) => void
  getWorkbenchViewRegistration: (viewId: string) => WorkbenchViewRegistration | null
}

export function WorkbenchPage(props: WorkbenchPageProps) {
  return (
    <Suspense fallback={<LoadingMotionFallback className="workbench-lazy-fallback" />}>
      <WorkbenchExperience {...props} />
    </Suspense>
  )
}
