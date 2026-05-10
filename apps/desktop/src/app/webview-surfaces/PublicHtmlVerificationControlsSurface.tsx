import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Link2, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import {
  checkLauncherPublicHtmlVerification,
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
  primary = false,
  disabled = false,
}: {
  label: string
  onClick: () => void
  icon: ReactNode
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`control-button h-9 ${primary ? 'control-button-primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  )
}

export function PublicHtmlVerificationControlsSurface() {
  const locale = useVerificationLocale()
  const copy = useMemo(() => editorCopy[locale], [locale])
  const [checking, setChecking] = useState(false)
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
    state.message?.trim() ||
    (state.state === 'opening' || state.state === 'waitingForUser'
      ? copy.launcher.settings.verificationHint
      : copy.launcher.cloudflareChallenge.detail)
  const statusLabel = state.disablePublicHtmlRoute
    ? copy.launcher.cloudflareChallenge.disablePublicHtmlEnabledLabel
    : state.state === 'verified'
      ? copy.launcher.cloudflareChallenge.sessionReadyLabel
      : copy.launcher.cloudflareChallenge.sessionWaitingLabel
  const statusToneClass =
    state.disablePublicHtmlRoute
      ? ' public-html-verification-status-disabled'
      : state.state === 'verified'
        ? ' public-html-verification-status-ready'
        : ''
  const checkLabel = checking
    ? copy.launcher.settings.checkingVerificationStatusAction
    : copy.launcher.settings.checkVerificationStatusAction

  return (
    <div className="public-html-verification-window">
      <main className="public-html-verification-main" aria-hidden="true" />

      <aside className="public-html-verification-panel">
        <header className="public-html-verification-panel-header">
          <div className="public-html-verification-panel-copy">
            <div className="mb-2 flex items-center gap-2">
              <span className="public-html-verification-icon" aria-hidden="true">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="public-html-verification-title">{copy.launcher.settings.verificationTitle}</p>
            </div>
            <p className="public-html-verification-copy">{message}</p>
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

        <div className={`public-html-verification-status${statusToneClass}`}>
          <span className="public-html-verification-status-dot" aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>

        <p className="public-html-verification-copy">{copy.launcher.cloudflareChallenge.cleanBrowserDescription}</p>

        <section className="public-html-verification-panel-section">
          <p className="settings-window-section-title">{copy.launcher.cloudflareChallenge.routeStatusLabel}</p>
          <div className="public-html-verification-url">
            <Link2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            {targetUrl}
          </div>
        </section>

        <section className="public-html-verification-panel-section">
          <div className="public-html-verification-button-grid">
            <VerificationToolbarButton
              label={checkLabel}
              onClick={() => {
                if (checking) {
                  return
                }

                setChecking(true)
                void checkLauncherPublicHtmlVerification()
                  .then((snapshot) => {
                    setState(snapshot)
                  })
                  .finally(() => {
                    setChecking(false)
                  })
              }}
              icon={<CheckCircle2 className="h-4 w-4" />}
              primary
              disabled={checking}
            />
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
        </section>

        <button
          type="button"
          className={`settings-switch public-html-verification-switch ${state.disablePublicHtmlRoute ? 'settings-switch-active' : ''}`}
          role="switch"
          aria-checked={state.disablePublicHtmlRoute}
          onClick={() => void saveLauncherSettings({ disablePublicHtmlRoute: !state.disablePublicHtmlRoute })}
        >
          <span className="settings-switch-copy">{copy.launcher.cloudflareChallenge.disablePublicHtmlLabel}</span>
          <span className="settings-switch-track" aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </button>
      </aside>
    </div>
  )
}
