import { Bug, Maximize2, Palette, Settings2, Volume2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
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

export type SettingsWindowCategory = 'appearance' | 'view' | 'interaction' | 'launcher' | 'debug'

type SettingsWindowProps = {
  open: boolean
  title: string
  categories: {
    appearance: string
    view: string
    interaction: string
    launcher: string
    debug: string
  }
  categoryDescriptions: {
    appearance: string
    view: string
    interaction: string
    launcher: string
    debug: string
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
  debugModeLabel: string
  debugModeDescription: string
  enableDebugModeLabel: string
  disableDebugModeLabel: string
  debugModeEnabled: boolean
  notificationSoundLabel: string
  notificationSoundDescription: string
  enableNotificationSoundLabel: string
  disableNotificationSoundLabel: string
  notificationSoundEnabled: boolean
  launcherContent?: ReactNode
  activeCategory?: SettingsWindowCategory
  accentOptions: AccentOption[]
  activeAccentId: string
  onSelectAccent: (id: string) => void
  onResetAccent: () => void
  onSelectLocale: (locale: LocaleCode) => void
  onToggleBorderlessFullscreen: () => void
  onToggleNotificationSound: () => void
  onToggleDebugMode: () => void
  onActiveCategoryChange?: (category: SettingsWindowCategory) => void
  onClose: () => void
}

function SettingsBooleanSwitch({
  icon,
  label,
  description,
  checked,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  icon: ReactNode
  label: string
  description: string
  checked: boolean
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div className="settings-window-control-card">
      <div className="settings-window-control-meta">
        <span className="settings-window-control-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <p id={titleId} className="settings-window-section-title">
            {label}
          </p>
          <p id={descriptionId} className="settings-window-section-copy mt-2">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        className={cx('settings-switch', checked && 'settings-switch-active')}
        role="switch"
        aria-checked={checked}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        title={checked ? disabledLabel : enabledLabel}
        onClick={onToggle}
      >
        <span className="settings-switch-copy">{checked ? disabledLabel : enabledLabel}</span>
        <span className="settings-switch-track" aria-hidden="true">
          <span className="settings-switch-thumb" />
        </span>
      </button>
    </div>
  )
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
  debugModeLabel,
  debugModeDescription,
  enableDebugModeLabel,
  disableDebugModeLabel,
  debugModeEnabled,
  notificationSoundLabel,
  notificationSoundDescription,
  enableNotificationSoundLabel,
  disableNotificationSoundLabel,
  notificationSoundEnabled,
  launcherContent,
  activeCategory: controlledActiveCategory,
  accentOptions,
  activeAccentId,
  onSelectAccent,
  onResetAccent,
  onSelectLocale,
  onToggleBorderlessFullscreen,
  onToggleNotificationSound,
  onToggleDebugMode,
  onActiveCategoryChange,
  onClose,
}: SettingsWindowProps) {
  const [uncontrolledActiveCategory, setUncontrolledActiveCategory] = useState<SettingsWindowCategory>('appearance')
  const languageTitleId = useId()
  const languageDescriptionId = useId()
  const localeOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeLocaleIndex = localeOptions.findIndex((option) => option.id === activeLocale)
  const focusableLocaleIndex = activeLocaleIndex === -1 ? 0 : activeLocaleIndex
  const activeCategory = controlledActiveCategory ?? uncontrolledActiveCategory

  const handleCategoryChange = (category: SettingsWindowCategory) => {
    if (controlledActiveCategory === undefined) {
      setUncontrolledActiveCategory(category)
    }

    onActiveCategoryChange?.(category)
  }

  const handleLocaleKeyDown = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!localeOptions.length) {
      return
    }

    let nextIndex = index

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = (index + 1) % localeOptions.length
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex = (index - 1 + localeOptions.length) % localeOptions.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = localeOptions.length - 1
        break
      default:
        return
    }

    event.preventDefault()

    const nextOption = localeOptions[nextIndex]
    if (!nextOption) {
      return
    }

    if (nextOption.id !== activeLocale) {
      onSelectLocale(nextOption.id)
    }

    localeOptionRefs.current[nextIndex]?.focus()
  }

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
            {(['appearance', 'view', 'interaction', 'launcher', 'debug'] as const).map((categoryId) => (
              <button
                key={categoryId}
                type="button"
                className={cx(
                  'settings-window-nav-item',
                  activeCategory === categoryId && 'settings-window-nav-item-active',
                )}
                onClick={() => handleCategoryChange(categoryId)}
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
                    {localeOptions.map((option, index) => {
                      const active = option.id === activeLocale

                      return (
                        <button
                          key={option.id}
                          type="button"
                          ref={(node) => {
                            localeOptionRefs.current[index] = node
                          }}
                          className={cx('settings-locale-option', active && 'settings-locale-option-active')}
                          role="radio"
                          aria-checked={active}
                          tabIndex={index === focusableLocaleIndex ? 0 : -1}
                          onKeyDown={(event) => handleLocaleKeyDown(index, event)}
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

            {activeCategory === 'view' ? (
              <section className="settings-window-section">
                <p className="settings-window-section-title">{windowModeLabel}</p>
                <p className="settings-window-section-copy mt-2">{categoryDescriptions.view}</p>
                <SettingsBooleanSwitch
                  icon={<Maximize2 className="h-4 w-4" />}
                  label={borderlessFullscreenLabel}
                  description={borderlessFullscreenDescription}
                  checked={borderlessFullscreenEnabled}
                  enabledLabel={enableBorderlessFullscreenLabel}
                  disabledLabel={disableBorderlessFullscreenLabel}
                  onToggle={onToggleBorderlessFullscreen}
                />
              </section>
            ) : null}

            {activeCategory === 'launcher' ? (
              <section className="settings-window-section">
                <p className="settings-window-section-title">{categories.launcher}</p>
                <p className="settings-window-section-copy mt-2">{categoryDescriptions.launcher}</p>
                <div className="mt-4">{launcherContent}</div>
              </section>
            ) : null}

            {activeCategory === 'interaction' ? (
              <section className="settings-window-section">
                <p className="settings-window-section-title">{categories.interaction}</p>
                <p className="settings-window-section-copy mt-2">{categoryDescriptions.interaction}</p>
                <div className="mt-4">
                  <SettingsBooleanSwitch
                    icon={<Volume2 className="h-4 w-4" />}
                    label={notificationSoundLabel}
                    description={notificationSoundDescription}
                    checked={notificationSoundEnabled}
                    enabledLabel={enableNotificationSoundLabel}
                    disabledLabel={disableNotificationSoundLabel}
                    onToggle={onToggleNotificationSound}
                  />
                </div>
              </section>
            ) : null}

            {activeCategory === 'debug' ? (
              <section className="settings-window-section">
                <p className="settings-window-section-title">{categories.debug}</p>
                <p className="settings-window-section-copy mt-2">{categoryDescriptions.debug}</p>
                <div className="mt-4">
                  <SettingsBooleanSwitch
                    icon={<Bug className="h-4 w-4" />}
                    label={debugModeLabel}
                    description={debugModeDescription}
                    checked={debugModeEnabled}
                    enabledLabel={enableDebugModeLabel}
                    disabledLabel={disableDebugModeLabel}
                    onToggle={onToggleDebugMode}
                  />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
