/**
 * @file App root component: composes platform providers and mounts AppShell.
 */
import AppShell from '@app/app-shell/AppShell'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { LauncherPlatformProvider } from '@app/providers/LauncherPlatformProvider'
import { AiPlatformProvider } from '@app/providers/AiPlatformProvider'
import { LocalizationPlatformProvider } from '@app/providers/LocalizationPlatformProvider'

/**
 * App root component: nests platform providers in dependency order and renders AppShell.
 */
export default function App() {
  return (
    <PlatformProvider>
      <AiPlatformProvider>
        <LocalizationPlatformProvider>
          <LauncherPlatformProvider>
            <AppShell />
          </LauncherPlatformProvider>
        </LocalizationPlatformProvider>
      </AiPlatformProvider>
    </PlatformProvider>
  )
}
