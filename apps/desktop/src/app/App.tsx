import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { GeneratedProjectPlatformProvider } from '@app/providers/GeneratedProjectPlatformProvider'

export default function App() {
  return (
    <PlatformProvider>
      <GeneratedProjectPlatformProvider>
        <AppShell />
      </GeneratedProjectPlatformProvider>
    </PlatformProvider>
  )
}
