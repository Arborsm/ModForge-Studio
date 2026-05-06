import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'

export default function App() {
  return (
    <PlatformProvider>
      <AppShell />
    </PlatformProvider>
  )
}
