import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../components/Checkbox'

interface FinishProps {
  installPath: string
  launchAfterInstall: boolean
  onToggleLaunchAfterInstall: (value: boolean) => void
  onLaunch: () => Promise<void>
  onClose: () => void
}

export function Finish({ installPath, launchAfterInstall, onToggleLaunchAfterInstall, onLaunch, onClose }: FinishProps) {
  const { t } = useTranslation()
  const [isFinishing, setIsFinishing] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)

  const handleFinish = async () => {
    if (isFinishing) return
    setIsFinishing(true)
    setLaunchError(null)
    try {
      if (launchAfterInstall) {
        await onLaunch()
      }
      onClose()
    } catch (err: unknown) {
      const raw = typeof err === 'string' ? err : (err as Error)?.message
      setLaunchError(raw && String(raw).trim() ? String(raw) : t('finish.launchFailed'))
      setIsFinishing(false)
    }
  }

  return (
    <div className="page-shell">
      <div className="page-scroll">
        <div className="page-container page-container--center" style={{ maxWidth: 420, alignItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              background: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
              color: 'var(--color-success)',
              animation: 'successBounce 500ms ease forwards',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 6L9 17L4 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="26"
                strokeDashoffset="26"
                style={{ animation: 'drawCheck 450ms ease 260ms forwards' }}
              />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>{t('finish.subtitle')}</p>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              marginBottom: 18,
              fontFamily: 'var(--font-mono)',
              wordBreak: 'break-all',
              opacity: 0.8,
            }}
          >
            {t('finish.installLocation', { path: installPath })}
          </p>

          <div style={{ alignSelf: 'center', marginBottom: 8 }}>
            <Checkbox checked={launchAfterInstall} onChange={onToggleLaunchAfterInstall} label={t('finish.launchAfterInstall')} />
          </div>

          {launchError && (
            <div
              style={{
                color: 'var(--color-error)',
                marginBottom: 12,
                fontSize: 12,
                width: '100%',
              }}
            >
              {launchError}
            </div>
          )}
        </div>
      </div>

      <div className="page-footer page-footer--center">
        <button className="btn btn-ghost" onClick={onClose} disabled={isFinishing}>
          {t('finish.close')}
        </button>
        <button
          className="btn btn-success"
          onClick={() => {
            void handleFinish()
          }}
          disabled={isFinishing}
          style={{ minWidth: 120, justifyContent: 'center' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('finish.finish')}
        </button>
      </div>
    </div>
  )
}
