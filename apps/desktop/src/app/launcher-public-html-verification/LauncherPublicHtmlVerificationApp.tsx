import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ExternalLink, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react'
import {
  clearLauncherPublicHtmlVerificationSession,
  closeLauncherPublicHtmlVerification,
  loadAppUiState,
  loadLauncherPublicHtmlVerificationState,
  refreshLauncherPublicHtmlVerification,
  saveLauncherSettings,
  listenToLauncherPublicHtmlVerificationState,
  type LauncherPublicHtmlVerificationSnapshot,
} from '@platform/desktop'
import { editorCopy } from '@locales/editor-shell'

const DEFAULT_VERIFICATION_URL = 'https://www.nexusmods.com/stardewvalley'
type LocaleCode = 'zh-CN' | 'en-US'

function resolveLocale(value: string | null | undefined): LocaleCode {
  return value === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function useVerificationLocale() {
  const [locale, setLocale] = useState<LocaleCode>('en-US')

  useEffect(() => {
    let disposed = false

    void loadAppUiState()
      .then((state) => {
        if (!disposed) {
          setLocale(resolveLocale(state.appearance.locale))
        }
      })
      .catch(() => {
        if (!disposed && typeof navigator !== 'undefined') {
          setLocale(navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US')
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  return locale
}

function VerificationToolbarButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button type="button" className="control-button h-9" onClick={onClick}>
      {icon}
      {label}
    </button>
  )
}

export function LauncherPublicHtmlVerificationApp() {
  const locale = useVerificationLocale()
  const copy = useMemo(() => editorCopy[locale], [locale])
  const [state, setState] = useState<LauncherPublicHtmlVerificationSnapshot>({
    state: 'idle',
    targetUrl: null,
    reason: null,
    disablePublicHtmlRoute: false,
    lastVerifiedAtMs: null,
    message: null,
  })

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    void loadLauncherPublicHtmlVerificationState()
      .then((snapshot) => {
        if (!disposed) {
          setState(snapshot)
        }
      })
      .catch(() => {})

    void listenToLauncherPublicHtmlVerificationState((snapshot) => {
      if (!disposed) {
        setState(snapshot)
      }
    })
      .then((stopListening) => {
        if (disposed) {
          stopListening()
          return
        }
        unlisten = stopListening
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const targetUrl = state.targetUrl ?? DEFAULT_VERIFICATION_URL
  const message =
    state.state === 'opening' || state.state === 'waitingForUser'
      ? copy.launcher.settings.verificationHint
      : state.message ?? copy.launcher.cloudflareChallenge.detail

  return (
    <div className="flex h-screen w-screen flex-col bg-(--bg-app) text-(--text-primary)">
      <header className="flex items-start justify-between gap-4 border-b border-(--line-subtle) px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="settings-window-control-icon" aria-hidden="true">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <p className="settings-window-section-title">{copy.launcher.settings.verificationTitle}</p>
          </div>
          <p className="settings-window-section-copy">{message}</p>
        </div>

        <button
          type="button"
          className="workspace-panel-action h-8 w-8 shrink-0"
          title={copy.launcher.actions.closeDialog}
          onClick={() => void closeLauncherPublicHtmlVerification()}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <section className="settings-window-control-card min-h-0">
          <p className="settings-window-section-title">{copy.launcher.settings.verificationTitle}</p>
          <p className="settings-window-section-copy break-all">{targetUrl}</p>
          <p className="mt-2 text-xs text-(--text-tertiary)">
            {state.disablePublicHtmlRoute
              ? copy.launcher.cloudflareChallenge.disablePublicHtmlEnabledLabel
              : copy.launcher.cloudflareChallenge.disablePublicHtmlDisabledLabel}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <VerificationToolbarButton
            label={copy.launcher.actions.refresh}
            onClick={() => void refreshLauncherPublicHtmlVerification()}
            icon={<RefreshCw className="h-4 w-4" />}
          />
          <VerificationToolbarButton
            label={copy.launcher.settings.clearVerificationSessionAction}
            onClick={() => void clearLauncherPublicHtmlVerificationSession()}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </div>

        <button
          type="button"
          className="control-button h-10"
          onClick={() => void saveLauncherSettings({ disablePublicHtmlRoute: !state.disablePublicHtmlRoute })}
        >
          <ExternalLink className="h-4 w-4" />
          {copy.launcher.cloudflareChallenge.disablePublicHtmlLabel}
        </button>
      </main>
    </div>
  )
}
