import { Bug, Maximize2, Palette, Settings2, Volume2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { cx } from '@shared/lib/cx'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import type { LocaleCode } from '@locales/editor-shell'
import type { SettingsWindowCategory } from '@shared/contracts'
import type {
  LoadingMotionIntensityId,
  LoadingMotionSpeedId,
  LoadingMotionSpeedMode,
  LoadingMotionStyleId,
} from '@shared/contracts/types/loadingMotion'

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
    loading: string
    view: string
    interaction: string
    launcher: string
    debug: string
  }
  categoryDescriptions: {
    appearance: string
    loading: string
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
  activeCategory?: SettingsWindowCategory
  accentOptions: AccentOption[]
  activeAccentId: string
  onSelectAccent: (id: string) => void
  onResetAccent: () => void
  onSelectLocale: (locale: LocaleCode) => void
  onToggleBorderlessFullscreen: () => void
  onToggleNotificationSound: () => void
  onToggleDebugMode: () => void
  loadingMotionStyleLabel: string
  loadingMotionStyleDescription: string
  loadingMotionIntensityLabel: string
  loadingMotionIntensityDescription: string
  loadingMotionSpeedLabel: string
  loadingMotionSpeedDescription: string
  loadingMotionCustomSpeedLabel: string
  loadingMotionCustomSpeedDescription: string
  loadingMotionCustomSpeedToggleLabel: string
  loadingMotionPresetSpeedToggleLabel: string
  loadingMotionSpeedValueLabel: (value: number) => string
  activeLoadingStyleId: LoadingMotionStyleId
  activeLoadingIntensityId: LoadingMotionIntensityId
  activeLoadingSpeedMode: LoadingMotionSpeedMode
  activeLoadingSpeedId: LoadingMotionSpeedId
  activeLoadingSpeedMultiplier: number
  onSelectLoadingStyle: (styleId: LoadingMotionStyleId) => void
  onSelectLoadingIntensity: (intensityId: LoadingMotionIntensityId) => void
  onSelectLoadingSpeed: (speedId: LoadingMotionSpeedId) => void
  onSelectCustomLoadingSpeed: (speedMultiplier: number) => void
  loadingStyleOptions: Array<{ id: LoadingMotionStyleId; label: string }>
  loadingIntensityOptions: Array<{ id: LoadingMotionIntensityId; label: string }>
  loadingSpeedOptions: Array<{ id: LoadingMotionSpeedId; label: string }>
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
  activeCategory: controlledActiveCategory,
  accentOptions,
  activeAccentId,
  onSelectAccent,
  onResetAccent,
  onSelectLocale,
  onToggleBorderlessFullscreen,
  onToggleNotificationSound,
  onToggleDebugMode,
  loadingMotionStyleLabel,
  loadingMotionStyleDescription,
  loadingMotionIntensityLabel,
  loadingMotionIntensityDescription,
  loadingMotionSpeedLabel,
  loadingMotionSpeedDescription,
  loadingMotionCustomSpeedLabel,
  loadingMotionCustomSpeedDescription,
  loadingMotionCustomSpeedToggleLabel,
  loadingMotionPresetSpeedToggleLabel,
  loadingMotionSpeedValueLabel,
  activeLoadingStyleId,
  activeLoadingIntensityId,
  activeLoadingSpeedMode,
  activeLoadingSpeedId,
  activeLoadingSpeedMultiplier,
  onSelectLoadingStyle,
  onSelectLoadingIntensity,
  onSelectLoadingSpeed,
  onSelectCustomLoadingSpeed,
  loadingStyleOptions,
  loadingIntensityOptions,
  loadingSpeedOptions,
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
  const effectiveLoadingSpeedMultiplier =
    typeof activeLoadingSpeedMultiplier === 'number' && Number.isFinite(activeLoadingSpeedMultiplier)
      ? activeLoadingSpeedMultiplier
      : 1

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

    let nextIndex: number

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
            {(['appearance', 'loading', 'view', 'interaction', 'debug'] as const).map((categoryId) => (
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

            {activeCategory === 'loading' ? (
              <section className="settings-window-section">
                <div className="settings-loading-preview">
                  <LoadingMotionFallback
                    styleId={activeLoadingStyleId}
                    intensityId={activeLoadingIntensityId}
                    speedMode={activeLoadingSpeedMode}
                    speedId={activeLoadingSpeedId}
                    speedMultiplier={activeLoadingSpeedMultiplier}
                    className="settings-loading-preview-stage"
                  />
                </div>

                <p className="settings-window-section-title">{loadingMotionStyleLabel}</p>
                <p className="settings-window-section-copy mt-1">{loadingMotionStyleDescription}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {loadingStyleOptions.map((option) => {
                    const active = option.id === activeLoadingStyleId
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cx('settings-switch', active && 'settings-switch-active')}
                        onClick={() => onSelectLoadingStyle(option.id)}
                      >
                        <span className="settings-switch-copy">{option.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-6">
                  <p className="settings-window-section-title">{loadingMotionIntensityLabel}</p>
                  <p className="settings-window-section-copy mt-1">{loadingMotionIntensityDescription}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {loadingIntensityOptions.map((option) => {
                      const active = option.id === activeLoadingIntensityId
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cx('settings-switch', active && 'settings-switch-active')}
                          onClick={() => onSelectLoadingIntensity(option.id)}
                        >
                          <span className="settings-switch-copy">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="settings-window-section-title">{loadingMotionSpeedLabel}</p>
                      <p className="settings-window-section-copy mt-1">{loadingMotionSpeedDescription}</p>
                    </div>
                    <button
                      type="button"
                      className="control-button h-8 shrink-0"
                      onClick={() => {
                        if (activeLoadingSpeedMode === 'preset') {
                          onSelectCustomLoadingSpeed(effectiveLoadingSpeedMultiplier)
                          return
                        }

                        onSelectLoadingSpeed(activeLoadingSpeedId)
                      }}
                    >
                      {activeLoadingSpeedMode === 'preset'
                        ? loadingMotionCustomSpeedToggleLabel
                        : loadingMotionPresetSpeedToggleLabel}
                    </button>
                  </div>

                  {activeLoadingSpeedMode === 'preset' ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {loadingSpeedOptions.map((option) => {
                        const active = option.id === activeLoadingSpeedId
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={cx('settings-switch', active && 'settings-switch-active')}
                            onClick={() => onSelectLoadingSpeed(option.id)}
                          >
                            <span className="settings-switch-copy">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="settings-loading-speed-slider mt-3">
                      <div className="settings-loading-speed-slider-meta">
                        <span className="settings-window-section-copy">{loadingMotionCustomSpeedDescription}</span>
                        <span className="settings-loading-speed-slider-value">
                          {loadingMotionSpeedValueLabel(effectiveLoadingSpeedMultiplier)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.25}
                        max={3}
                        step={0.05}
                        value={effectiveLoadingSpeedMultiplier}
                        aria-label={loadingMotionCustomSpeedLabel}
                        onChange={(event) => onSelectCustomLoadingSpeed(Number(event.target.value))}
                      />
                    </div>
                  )}
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
