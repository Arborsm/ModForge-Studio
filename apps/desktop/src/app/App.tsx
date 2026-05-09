import AppShell from '@app/app-shell/AppShell'
import { LauncherPublicHtmlVerificationApp } from '@app/launcher-public-html-verification/LauncherPublicHtmlVerificationApp'
import { PlatformProvider } from '@app/providers/PlatformProvider'
import { CpMakerPlatformProvider } from '@app/providers/CpMakerPlatformProvider'
import { LauncherPlatformProvider } from '@app/providers/LauncherPlatformProvider'

function getCurrentWebviewLabel() {
  if (typeof window === 'undefined') {
    return null
  }

  const tauriInternals = (window as typeof window & {
    __TAURI_INTERNALS__?: {
      metadata?: {
        currentWebview?: {
          label?: string
        }
      }
    }
  }).__TAURI_INTERNALS__

  return tauriInternals?.metadata?.currentWebview?.label ?? null
}

export default function App() {
  const currentWebviewLabel = getCurrentWebviewLabel()
  const surface =
    currentWebviewLabel === 'launcher-public-html-toolbar' ? (
      <LauncherPublicHtmlVerificationApp />
    ) : (
      <AppShell />
    )

  return (
    <PlatformProvider>
      <CpMakerPlatformProvider>
        <LauncherPlatformProvider>
          {surface}
        </LauncherPlatformProvider>
      </CpMakerPlatformProvider>
    </PlatformProvider>
  )
}
