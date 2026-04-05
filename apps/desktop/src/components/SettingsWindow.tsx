import { Maximize2, Palette, Settings2, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { cx } from '../lib/cx'
import type { LocaleCode } from '../lib/editor-shell'

type AccentOption = {
  id: string
  label: string
  color: string
}

type LocaleOption = {
  id: LocaleCode
  label: string
}

type SettingsWindowProps = {
  open: boolean
  title: string
  categories: {
    appearance: string
    view: string
    interaction: string
    advanced: string
  }
  categoryDescriptions: {
    appearance: string
    view: string
    interaction: string
    advanced: string
  }
  accentLabel: string
  resetAccentLabel: string
  accentDescription: string
  languageLabel: string
  languageDescription: string
  localeOptions: LocaleOption[]
  activeLocale: LocaleCode
  windowModeLabel: string
  borderlessFullscreenLabel: string
  borderlessFullscreenDescription: string
  enableBorderlessFullscreenLabel: string
  disableBorderlessFullscreenLabel: string
  borderlessFullscreenEnabled: boolean
  futureLabel: string
  futureDescription: string
  accentOptions: AccentOption[]
  activeAccentId: string
  onSelectAccent: (id: string) => void
  onResetAccent: () => void
  onSelectLocale: (locale: LocaleCode) => void
  onToggleBorderlessFullscreen: () => void
  onClose: () => void
}

export default function SettingsWindow({
  open,
  title,
  categories,
  categoryDescriptions,
  accentLabel,
  resetAccentLabel,
  accentDescription,
  languageLabel,
  languageDescription,
  localeOptions,
  activeLocale,
  windowModeLabel,
  borderlessFullscreenLabel,
  borderlessFullscreenDescription,
  enableBorderlessFullscreenLabel,
  disableBorderlessFullscreenLabel,
  borderlessFullscreenEnabled,
  futureLabel,
  futureDescription,
  accentOptions,
  activeAccentId,
  onSelectAccent,
  onResetAccent,
  onSelectLocale,
  onToggleBorderlessFullscreen,
  onClose,
}: SettingsWindowProps) {
  const [activeCategory, setActiveCategory] = useState<'appearance' | 'view' | 'interaction' | 'advanced'>('appearance')
  const languageTitleId = useId()
  const languageDescriptionId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <div className="settings-window-backdrop" onClick={onClose}>
      <section className="settings-window-panel" onClick={(event) => event.stopPropagation()}>
        <header className="settings-window-header">
          <div className="min-w-0">
            <p className="settings-window-eyebrow">
              <Settings2 className="h-3.5 w-3.5" />
              <span>{title}</span>
            </p>
            <p className="settings-window-title">{title}</p>
          </div>

          <button type="button" className="workspace-panel-action h-8 w-8" onClick={onClose} title="Close settings">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="settings-window-body">
          <aside className="settings-window-sidebar">
            {(['appearance', 'view', 'interaction', 'advanced'] as const).map((categoryId) => (
              <button
                key={categoryId}
                type="button"
                className={cx(
                  'settings-window-nav-item',
                  activeCategory === categoryId && 'settings-window-nav-item-active',
                )}
                onClick={() => setActiveCategory(categoryId)}
              >
                <span className="settings-window-nav-title">{categories[categoryId]}</span>
                <span className="settings-window-nav-copy">{categoryDescriptions[categoryId]}</span>
              </button>
            ))}
          </aside>

          <div className="settings-window-content">
            {activeCategory === 'appearance' ? (
              <section className="settings-window-section">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-[var(--accent)]" />
                      <p className="settings-window-section-title">{accentLabel}</p>
                    </div>
                    <p className="settings-window-section-copy">{accentDescription}</p>
                  </div>
                  <button type="button" className="control-button h-8 shrink-0" onClick={onResetAccent}>
                    {resetAccentLabel}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {accentOptions.map((option) => {
                    const active = option.id === activeAccentId

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cx('settings-accent-card', active && 'settings-accent-card-active')}
                        onClick={() => onSelectAccent(option.id)}
                      >
                        <span className="settings-accent-swatch" style={{ backgroundColor: option.color }} />
                        <span className="truncate text-sm font-medium">{option.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="settings-window-language">
                  <p id={languageTitleId} className="settings-window-section-title">
                    {languageLabel}
                  </p>
                  <p id={languageDescriptionId} className="settings-window-section-copy">
                    {languageDescription}
                  </p>
                  <div
                    className="settings-locale-list"
                    role="radiogroup"
                    aria-labelledby={languageTitleId}
                    aria-describedby={languageDescriptionId}
                  >
                    {localeOptions.map((option) => {
                      const active = option.id === activeLocale

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cx('settings-locale-option', active && 'settings-locale-option-active')}
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            if (!active) {
                              onSelectLocale(option.id)
                            }
                          }}
                        >
                          <span className="settings-locale-label">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            {activeCategory !== 'appearance' ? (
              <section className="settings-window-section">
                {activeCategory === 'view' ? (
                  <>
                    <p className="settings-window-section-title">{windowModeLabel}</p>
                    <p className="settings-window-section-copy mt-2">{categoryDescriptions[activeCategory]}</p>
                    <div className="settings-window-control-card">
                      <div className="settings-window-control-meta">
                        <span className="settings-window-control-icon" aria-hidden="true">
                          <Maximize2 className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="settings-window-section-title">{borderlessFullscreenLabel}</p>
                          <p className="settings-window-section-copy mt-2">{borderlessFullscreenDescription}</p>
                        </div>
                      </div>
                      <button type="button" className="control-button" onClick={onToggleBorderlessFullscreen}>
                        {borderlessFullscreenEnabled ? disableBorderlessFullscreenLabel : enableBorderlessFullscreenLabel}
                      </button>
                    </div>
                    <div className="settings-window-placeholder">
                      <p className="settings-window-placeholder-title">{futureLabel}</p>
                      <p className="settings-window-placeholder-copy">{futureDescription}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="settings-window-section-title">{categories[activeCategory]}</p>
                    <p className="settings-window-section-copy mt-2">{categoryDescriptions[activeCategory]}</p>
                    <div className="settings-window-placeholder">
                      <p className="settings-window-placeholder-title">{futureLabel}</p>
                      <p className="settings-window-placeholder-copy">{futureDescription}</p>
                    </div>
                  </>
                )}
              </section>
            ) : (
              <section className="settings-window-section">
                <p className="settings-window-section-title">{futureLabel}</p>
                <p className="settings-window-section-copy mt-2">{futureDescription}</p>
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
