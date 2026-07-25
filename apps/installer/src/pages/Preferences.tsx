import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../components/Checkbox'
import { APP_LOADING_MOTION_STYLE_IDS, APP_STARTUP_MODES, APP_THEME_PREVIEWS, APP_WINDOW_CLOSE_BEHAVIORS } from '../data/appPreferences'
import type { AppPreferences } from '../types/installer'

interface PreferencesProps {
  preferences: AppPreferences
  setPreferences: React.Dispatch<React.SetStateAction<AppPreferences>>
  /** Called when the user explicitly changes the close-behavior radio. */
  onCloseBehaviorSelected: () => void
  isInstalling: boolean
  /** Error from the last persist attempt (shown inline, blocks navigation). */
  persistError: string | null
  onPersistPreferences: () => Promise<boolean>
  onBack: () => void
  onInstall: () => Promise<void>
}

function RadioOption({
  selected,
  label,
  description,
  badge,
  onSelect,
}: {
  selected: boolean
  label: string
  description?: string
  badge?: string
  onSelect: () => void
}) {
  return (
    <button type="button" className={`pref-radio ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <span className="pref-radio-dot" aria-hidden="true" />
      <span className="pref-radio-text">
        <span className="pref-radio-label">
          {label}
          {badge ? <span className="pref-badge">{badge}</span> : null}
        </span>
        {description ? <span className="pref-radio-desc">{description}</span> : null}
      </span>
    </button>
  )
}

export function Preferences({
  preferences,
  setPreferences,
  onCloseBehaviorSelected,
  isInstalling,
  persistError,
  onPersistPreferences,
  onBack,
  onInstall,
}: PreferencesProps) {
  const { t } = useTranslation()
  const [isPersisting, setIsPersisting] = useState(false)
  const busy = isInstalling || isPersisting
  const defaultBadge = t('preferences.defaultBadge')

  const persistThen = async (action: () => void | Promise<void>) => {
    if (busy) return
    setIsPersisting(true)
    try {
      const persisted = await onPersistPreferences()
      if (persisted) {
        await action()
      }
    } finally {
      setIsPersisting(false)
    }
  }

  const handleBack = () => {
    void persistThen(onBack)
  }

  const handleInstall = () => {
    void persistThen(onInstall)
  }

  return (
    <div className="page-shell">
      <div className="page-scroll">
        <div className="page-container page-container--center" style={{ maxWidth: 560 }}>
          <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('preferences.subtitle')}</div>

          <div className="pref-section">
            <div className="section-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="13.5" cy="6.5" r="0.5" />
                <circle cx="17.5" cy="10.5" r="0.5" />
                <circle cx="8.5" cy="7.5" r="0.5" />
                <circle cx="6.5" cy="12.5" r="0.5" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.25-.29-.43-.68-.43-1.12 0-.93.75-1.68 1.69-1.68h2.03C19.4 16.38 22 13.78 22 10.87 21.95 5.9 17.5 2 12 2z" />
              </svg>
              {t('preferences.themeLabel')}
            </div>
            <div className="pref-theme-grid stagger-children">
              {APP_THEME_PREVIEWS.map((theme) => {
                const selected = preferences.themeId === theme.id
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`pref-theme-card ${selected ? 'is-selected' : ''}`}
                    onClick={() => setPreferences((prev) => ({ ...prev, themeId: theme.id }))}
                  >
                    <span className="pref-theme-preview" style={{ background: theme.surfaceApp }}>
                      <span className="pref-theme-preview-panel" style={{ background: theme.surfacePanel }} />
                      <span className="pref-theme-preview-accent" style={{ background: theme.accent }} />
                    </span>
                    <span className="pref-theme-name">
                      {t(`preferences.themes.${theme.id}`)}
                      {theme.isDefault ? <span className="pref-badge">{defaultBadge}</span> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pref-section">
            <div className="section-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {t('preferences.motionLabel')}
            </div>
            <div className="pref-radio-group stagger-children">
              {APP_LOADING_MOTION_STYLE_IDS.map((styleId) => (
                <RadioOption
                  key={styleId}
                  selected={preferences.loadingMotionStyleId === styleId}
                  label={t(`preferences.motionStyles.${styleId}`)}
                  badge={styleId === 'softFadeIn' ? defaultBadge : undefined}
                  onSelect={() => setPreferences((prev) => ({ ...prev, loadingMotionStyleId: styleId }))}
                />
              ))}
            </div>
          </div>

          <div className="pref-section">
            <div className="section-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {t('preferences.behaviorLabel')}
            </div>

            <div className="pref-field-group">
              <div className="pref-field-label">{t('preferences.closeBehaviorLabel')}</div>
              <div className="pref-radio-group">
                {APP_WINDOW_CLOSE_BEHAVIORS.map((behavior) => (
                  <RadioOption
                    key={behavior}
                    selected={preferences.windowCloseBehavior === behavior}
                    label={t(`preferences.closeBehaviors.${behavior}.label`)}
                    description={t(`preferences.closeBehaviors.${behavior}.description`)}
                    badge={behavior === 'quit' ? defaultBadge : undefined}
                    onSelect={() => {
                      setPreferences((prev) => ({ ...prev, windowCloseBehavior: behavior }))
                      onCloseBehaviorSelected()
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="pref-field-group">
              <Checkbox
                checked={preferences.notificationSoundEnabled}
                onChange={(checked) => setPreferences((prev) => ({ ...prev, notificationSoundEnabled: checked }))}
                label={t('preferences.notificationSound')}
              />
            </div>

            <div className="pref-field-group">
              <div className="pref-field-label">{t('preferences.appModeLabel')}</div>
              <div className="pref-radio-group">
                {APP_STARTUP_MODES.map((mode) => (
                  <RadioOption
                    key={mode}
                    selected={preferences.appMode === mode}
                    label={t(`preferences.appModes.${mode}`)}
                    badge={mode === 'launcher' ? defaultBadge : undefined}
                    onSelect={() => setPreferences((prev) => ({ ...prev, appMode: mode }))}
                  />
                ))}
              </div>
            </div>
          </div>

          {persistError ? <div className="uninstall-error">{persistError}</div> : null}
        </div>
      </div>

      <div className="page-footer page-footer--split">
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={handleBack}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t('preferences.back')}
        </button>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={handleInstall}>
          {isInstalling ? t('options.installing') : isPersisting ? t('preferences.saving') : t('options.install')}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
