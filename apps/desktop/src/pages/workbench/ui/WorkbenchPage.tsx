import { lazy, Suspense } from 'react'
import type { AppEvent, WorkbenchViewRegistration } from '@shared/contracts'
import type { LocaleCode, ThemeMode } from '@locales/editor-shell'
import type { SettingsWindowCategory } from '@shared/contracts'

const WorkbenchExperience = lazy(() => import('./WorkbenchExperience'))

type WorkbenchPageProps = {
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
    <Suspense fallback={null}>
      <WorkbenchExperience {...props} />
    </Suspense>
  )
}
