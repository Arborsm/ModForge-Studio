import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { LauncherPlatformProvider } from '@app/providers/LauncherPlatformProvider'

export default function App() {
  return (
    <PlatformProvider>
      <LauncherPlatformProvider>
        <AppShell />
      </LauncherPlatformProvider>
    </PlatformProvider>
  )
}
