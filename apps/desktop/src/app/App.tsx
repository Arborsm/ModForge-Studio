import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { CpMakerPlatformProvider } from '@app/providers/CpMakerPlatformProvider'
import { LauncherPlatformProvider } from '@app/providers/LauncherPlatformProvider'

export default function App() {
  return (
    <PlatformProvider>
      <CpMakerPlatformProvider>
        <LauncherPlatformProvider>
          <AppShell />
        </LauncherPlatformProvider>
      </CpMakerPlatformProvider>
    </PlatformProvider>
  )
}
