import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { GeneratedProjectPlatformProvider } from '@app/providers/GeneratedProjectPlatformProvider'
import { LauncherPlatformProvider } from '@app/providers/LauncherPlatformProvider'

export default function App() {
  return (
    <PlatformProvider>
      <GeneratedProjectPlatformProvider>
        <LauncherPlatformProvider>
          <AppShell />
        </LauncherPlatformProvider>
      </GeneratedProjectPlatformProvider>
    </PlatformProvider>
  )
}
