import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { LauncherPlatformProvider } from '@app/providers/LauncherPlatformProvider'
import { AiPlatformProvider } from '@app/providers/AiPlatformProvider'

export default function App() {
  return (
    <PlatformProvider>
      <AiPlatformProvider>
        <LauncherPlatformProvider>
          <AppShell />
        </LauncherPlatformProvider>
      </AiPlatformProvider>
    </PlatformProvider>
  )
}
