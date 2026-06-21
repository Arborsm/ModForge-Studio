import { Bug, Maximize2, Palette, Settings2, Square, Volume2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { LOADING_MOTION_INTENSITY_IDS, LOADING_MOTION_SPEED_IDS, LOADING_MOTION_STYLE_IDS } from '@shared/lib/loading-motion'
import { cx } from '@shared/lib/helper'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { THEME_PRESETS } from '@shared/lib/theme/presets'
import type { LocaleCode } from '@locales/api'
import { useSettingsMenuCopy } from '@locales/provider'
import type { SettingsWindowCategory, WindowBorderTone, WindowBorderWeight } from '@shared/contracts'
import type { LoadingMotionIntensityId, LoadingMotionSpeedId, LoadingMotionStyleId } from '@shared/lib/loading-motion'

type ThemeOption = {
  id: string
  label: string
  accent: string
  preview: {
    surface: string
    panel: string
    text: string
  }
}

type LocaleOption = {
  id: LocaleCode
  label: string
}

type SettingsWindowProps = {
  open: boolean
  activeCategory?: SettingsWindowCategory
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
  activeCategory: controlledActiveCategory,
  onActiveCategoryChange,
  onClose,
}: SettingsWindowProps) {
  const settingsCopy = useSettingsMenuCopy()
  const activeLocale = usePreferencesStore((state) => state.locale)
  const activeThemeId = usePreferencesStore((state) => state.themeId)
  const activeWindowBorderTone = usePreferencesStore((state) => state.windowBorderTone)
  const activeWindowBorderWeight = usePreferencesStore((state) => state.windowBorderWeight)
  const borderlessFullscreenEnabled = usePreferencesStore((state) => state.windowIsFullscreen)
  const debugModeEnabled = usePreferencesStore((state) => state.debugEnabled)
  const notificationSoundEnabled = usePreferencesStore((state) => state.notificationSoundEnabled)
  const loadingMotionPreference = usePreferencesStore((state) => state.loadingMotionPreference)
  const onSelectTheme = usePreferencesStore((state) => state.setThemeId)
  const onSelectLocale = usePreferencesStore((state) => state.setLocale)
  const onSelectWindowBorderTone = usePreferencesStore((state) => state.setWindowBorderTone)
  const onSelectWindowBorderWeight = usePreferencesStore((state) => state.setWindowBorderWeight)
  const onToggleBorderlessFullscreen = usePreferencesStore((state) => state.toggleFullscreen)
  const setDebugModeEnabled = usePreferencesStore((state) => state.setDebugEnabled)
  const setNotificationSoundEnabled = usePreferencesStore((state) => state.setNotificationSoundEnabled)
  const setLoadingMotionPreference = usePreferencesStore((state) => state.setLoadingMotionPreference)
  const [uncontrolledActiveCategory, setUncontrolledActiveCategory] = useState<SettingsWindowCategory>('appearance')
  const languageTitleId = useId()
  const languageDescriptionId = useId()
  const title = settingsCopy.title
  const categories = settingsCopy.categories
  const categoryDescriptions = settingsCopy.categoryDescriptions
  const themeLabel = settingsCopy.themeLabel
  const resetThemeLabel = settingsCopy.resetThemeLabel
  const themeDescription = settingsCopy.themeDescription
  const languageLabel = settingsCopy.languageLabel
  const languageDescription = settingsCopy.languageDescription
  const localeOptions: LocaleOption[] =
    activeLocale === 'en-US'
      ? [
          { id: 'en-US', label: settingsCopy.localeLabels['en-US'] },
          { id: 'zh-CN', label: settingsCopy.localeLabels['zh-CN'] },
        ]
      : [
          { id: 'zh-CN', label: settingsCopy.localeLabels['zh-CN'] },
          { id: 'en-US', label: settingsCopy.localeLabels['en-US'] },
        ]
  const windowModeLabel = settingsCopy.windowModeLabel
  const windowBorderToneLabel = settingsCopy.windowBorderToneLabel
  const windowBorderToneDescription = settingsCopy.windowBorderToneDescription
  const windowBorderToneOptions = (Object.entries(settingsCopy.windowBorderToneOptions) as Array<[WindowBorderTone, string]>).map(
    ([id, label]) => ({ id, label }),
  )
  const windowBorderWeightLabel = settingsCopy.windowBorderWeightLabel
  const windowBorderWeightDescription = settingsCopy.windowBorderWeightDescription
  const windowBorderWeightOptions = (Object.entries(settingsCopy.windowBorderWeightOptions) as Array<[WindowBorderWeight, string]>).map(
    ([id, label]) => ({ id, label }),
  )
  const borderlessFullscreenLabel = settingsCopy.borderlessFullscreenLabel
  const borderlessFullscreenDescription = settingsCopy.borderlessFullscreenDescription
  const enableBorderlessFullscreenLabel = settingsCopy.enableBorderlessFullscreenLabel
  const disableBorderlessFullscreenLabel = settingsCopy.disableBorderlessFullscreenLabel
  const debugModeLabel = settingsCopy.debugModeLabel
  const debugModeDescription = settingsCopy.debugModeDescription
  const enableDebugModeLabel = settingsCopy.enableDebugModeLabel
  const disableDebugModeLabel = settingsCopy.disableDebugModeLabel
  const notificationSoundLabel = settingsCopy.notificationSoundLabel
  const notificationSoundDescription = settingsCopy.notificationSoundDescription
  const enableNotificationSoundLabel = settingsCopy.enableNotificationSoundLabel
  const disableNotificationSoundLabel = settingsCopy.disableNotificationSoundLabel
  const themeOptions: ThemeOption[] = THEME_PRESETS.map((preset) => ({
    id: preset.id,
    label: settingsCopy.themeLabels[preset.id] ?? preset.label,
    accent: preset.accent,
    preview: preset.preview,
  }))
  const onResetTheme = () => onSelectTheme(THEME_PRESETS[0].id)
  const loadingMotionStyleLabel = settingsCopy.loadingMotionStyleLabel
  const loadingMotionStyleDescription = settingsCopy.loadingMotionStyleDescription
  const loadingMotionIntensityLabel = settingsCopy.loadingMotionIntensityLabel
  const loadingMotionIntensityDescription = settingsCopy.loadingMotionIntensityDescription
  const loadingMotionSpeedLabel = settingsCopy.loadingMotionSpeedLabel
  const loadingMotionSpeedDescription = settingsCopy.loadingMotionSpeedDescription
  const loadingMotionCustomSpeedLabel = settingsCopy.loadingMotionCustomSpeedLabel
  const loadingMotionCustomSpeedDescription = settingsCopy.loadingMotionCustomSpeedDescription
  const loadingMotionCustomSpeedToggleLabel = settingsCopy.loadingMotionCustomSpeedToggleLabel
  const loadingMotionPresetSpeedToggleLabel = settingsCopy.loadingMotionPresetSpeedToggleLabel
  const loadingMotionSpeedValueLabel = settingsCopy.loadingMotionSpeedValueLabel
  const activeLoadingStyleId = loadingMotionPreference.styleId
  const activeLoadingIntensityId = loadingMotionPreference.intensityId
  const activeLoadingSpeedMode = loadingMotionPreference.speedMode
  const activeLoadingSpeedId = loadingMotionPreference.speedId
  const activeLoadingSpeedMultiplier = loadingMotionPreference.speedMultiplier
  const loadingStyleOptions: Array<{ id: LoadingMotionStyleId; label: string }> = LOADING_MOTION_STYLE_IDS.map((id) => ({
    id,
    label: settingsCopy.loadingMotionStyleLabels[id],
  }))
  const loadingIntensityOptions: Array<{ id: LoadingMotionIntensityId; label: string }> = LOADING_MOTION_INTENSITY_IDS.map((id) => ({
    id,
    label: settingsCopy.loadingMotionIntensityLabels[id],
  }))
  const loadingSpeedOptions: Array<{ id: LoadingMotionSpeedId; label: string }> = LOADING_MOTION_SPEED_IDS.map((id) => ({
    id,
    label: settingsCopy.loadingMotionSpeedLabels[id],
  }))
  const onSelectLoadingStyle = (styleId: LoadingMotionStyleId) => {
    setLoadingMotionPreference({ ...loadingMotionPreference, styleId })
  }
  const onSelectLoadingIntensity = (intensityId: LoadingMotionIntensityId) => {
    setLoadingMotionPreference({ ...loadingMotionPreference, intensityId })
  }
  const onSelectLoadingSpeed = (speedId: LoadingMotionSpeedId) => {
    setLoadingMotionPreference({ ...loadingMotionPreference, speedMode: 'preset', speedId })
  }
  const onSelectCustomLoadingSpeed = (speedMultiplier: number) => {
    setLoadingMotionPreference({ ...loadingMotionPreference, speedMode: 'custom', speedMultiplier })
  }
  const localeOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeLocaleIndex = localeOptions.findIndex((option) => option.id === activeLocale)
  const focusableLocaleIndex = activeLocaleIndex === -1 ? 0 : activeLocaleIndex
  const activeCategory = controlledActiveCategory ?? uncontrolledActiveCategory
  const effectiveLoadingSpeedMultiplier =
    typeof activeLoadingSpeedMultiplier === 'number' && Number.isFinite(activeLoadingSpeedMultiplier) ? activeLoadingSpeedMultiplier : 1

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
                className={cx('settings-window-nav-item', activeCategory === categoryId && 'settings-window-nav-item-active')}
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
                      <Palette className="h-4 w-4 text-(--accent)" />
                      <p className="settings-window-section-title">{themeLabel}</p>
                    </div>
                    <p className="settings-window-section-copy">{themeDescription}</p>
                  </div>
                  <button type="button" className="control-button h-8 shrink-0" onClick={onResetTheme}>
                    {resetThemeLabel}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {themeOptions.map((option) => {
                    const active = option.id === activeThemeId

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cx('settings-theme-card', active && 'settings-theme-card-active')}
                        onClick={() => onSelectTheme(option.id)}
                      >
                        <span className="settings-theme-swatch" style={{ backgroundColor: option.preview.surface }}>
                          <span className="settings-theme-swatch-panel" style={{ backgroundColor: option.preview.panel }} />
                          <span className="settings-theme-swatch-accent" style={{ backgroundColor: option.accent }} />
                          <span className="settings-theme-swatch-text" style={{ backgroundColor: option.preview.text }} />
                        </span>
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
                <div className="mt-3 flex flex-wrap gap-2">
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
                  <div className="mt-3 flex flex-wrap gap-2">
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
                      {activeLoadingSpeedMode === 'preset' ? loadingMotionCustomSpeedToggleLabel : loadingMotionPresetSpeedToggleLabel}
                    </button>
                  </div>

                  {activeLoadingSpeedMode === 'preset' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                <div className="settings-window-control-card">
                  <div className="settings-window-control-meta">
                    <span className="settings-window-control-icon" aria-hidden="true">
                      <Square className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="settings-window-section-title">{windowBorderToneLabel}</p>
                      <p className="settings-window-section-copy mt-2">{windowBorderToneDescription}</p>
                    </div>
                  </div>
                  <div className="settings-window-option-grid" role="radiogroup" aria-label={windowBorderToneLabel}>
                    {windowBorderToneOptions.map((option) => {
                      const active = option.id === activeWindowBorderTone
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cx('settings-window-option-button', active && 'settings-window-option-button-active')}
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            if (!active) {
                              onSelectWindowBorderTone(option.id)
                            }
                          }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="settings-window-control-card">
                  <div className="settings-window-control-meta">
                    <span className="settings-window-control-icon" aria-hidden="true">
                      <Square className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="settings-window-section-title">{windowBorderWeightLabel}</p>
                      <p className="settings-window-section-copy mt-2">{windowBorderWeightDescription}</p>
                    </div>
                  </div>
                  <div className="settings-window-option-grid" role="radiogroup" aria-label={windowBorderWeightLabel}>
                    {windowBorderWeightOptions.map((option) => {
                      const active = option.id === activeWindowBorderWeight
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cx('settings-window-option-button', active && 'settings-window-option-button-active')}
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            if (!active) {
                              onSelectWindowBorderWeight(option.id)
                            }
                          }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <SettingsBooleanSwitch
                  icon={<Maximize2 className="h-4 w-4" />}
                  label={borderlessFullscreenLabel}
                  description={borderlessFullscreenDescription}
                  checked={borderlessFullscreenEnabled}
                  enabledLabel={enableBorderlessFullscreenLabel}
                  disabledLabel={disableBorderlessFullscreenLabel}
                  onToggle={() => void onToggleBorderlessFullscreen()}
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
                    onToggle={() => setNotificationSoundEnabled(!notificationSoundEnabled)}
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
                    onToggle={() => setDebugModeEnabled(!debugModeEnabled)}
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
