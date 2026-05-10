import AppShell from '@app/app-shell/AppShell'
import { PublicHtmlVerificationControlsSurface } from '@app/webview-surfaces/PublicHtmlVerificationControlsSurface'
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
    currentWebviewLabel === 'public-html-verification-controls' ? (
      <PublicHtmlVerificationControlsSurface />
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
