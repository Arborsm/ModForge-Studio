import { AlertTriangle, Settings2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { LOADING_MOTION_INTENSITY_IDS, LOADING_MOTION_SPEED_IDS, LOADING_MOTION_STYLE_IDS } from '@shared/lib/loading-motion'
import { cx } from '@shared/lib/helper'
import { LoadingMotionFallback } from '@shared/ui/loading-motion'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { DEFAULT_THEME_ID, THEME_PRESETS } from '@shared/lib/theme/presets'
import type { LocaleCode } from '@locales/api'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiSettingsTab, SettingsWindowCategory, WindowBorderTone, WindowBorderWeight, WindowCloseBehavior } from '@shared/contracts'
import type { LoadingMotionIntensityId, LoadingMotionSpeedId, LoadingMotionStyleId } from '@shared/lib/loading-motion'

let aiSettingsPanelPromise: ReturnType<typeof importAiSettingsPanel> | null = null

function importAiSettingsPanel() {
  return import('./settings/AiSettingsPanel').then((module) => ({ default: module.AiSettingsPanel }))
}

function preloadAiSettingsPanel() {
  aiSettingsPanelPromise ??= importAiSettingsPanel()
  return aiSettingsPanelPromise
}

const AiSettingsPanel = lazy(preloadAiSettingsPanel)
const SettingsGuidesSection = lazy(() =>
  import('./settings/SettingsGuidesSection').then((module) => ({ default: module.SettingsGuidesSection })),
)

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
  initialAiTab?: AiSettingsTab
  onActiveCategoryChange?: (category: SettingsWindowCategory) => void
  onClose: () => void
}

const SETTINGS_CATEGORIES: SettingsWindowCategory[] = ['appearance', 'loading', 'view', 'interaction', 'ai', 'debug']

/** Display order matches prototype theme grid (warm-paper first). */
const THEME_DISPLAY_ORDER = [
  'warm-paper',
  'neutral-tool',
  'slate-blue',
  'forest',
  'twilight',
  'stardew-wood',
  'crimson',
  'blossom',
] as const

function SettingsCompactSwitch({
  checked,
  enabledLabel,
  disabledLabel,
  labelledBy,
  describedBy,
  onToggle,
}: {
  checked: boolean
  enabledLabel: string
  disabledLabel: string
  labelledBy?: string
  describedBy?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={cx('settings-switch', checked && 'is-on')}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      title={checked ? disabledLabel : enabledLabel}
      onClick={onToggle}
    >
      <span className="settings-switch-copy">{checked ? enabledLabel : disabledLabel}</span>
      <span className="settings-switch-track" aria-hidden="true">
        <span className="settings-switch-thumb" />
      </span>
    </button>
  )
}

export default function SettingsWindow({
  open,
  activeCategory: controlledActiveCategory,
  initialAiTab,
  onActiveCategoryChange,
  onClose,
}: SettingsWindowProps) {
  const settingsCopy = useSettingsMenuCopy()
  const activeLocale = usePreferencesStore((state) => state.locale)
  const activeThemeId = usePreferencesStore((state) => state.themeId)
  const activeWindowBorderTone = usePreferencesStore((state) => state.windowBorderTone)
  const activeWindowBorderWeight = usePreferencesStore((state) => state.windowBorderWeight)
  const activeWindowCloseBehavior = usePreferencesStore((state) => state.windowCloseBehavior)
  const rememberCloseChoice = usePreferencesStore((state) => state.rememberCloseChoice)
  const borderlessFullscreenEnabled = usePreferencesStore((state) => state.windowIsFullscreen)
  const debugModeEnabled = usePreferencesStore((state) => state.debugEnabled)
  const notificationSoundEnabled = usePreferencesStore((state) => state.notificationSoundEnabled)
  const loadingMotionPreference = usePreferencesStore((state) => state.loadingMotionPreference)
  const onSelectTheme = usePreferencesStore((state) => state.setThemeId)
  const onSelectLocale = usePreferencesStore((state) => state.setLocale)
  const onSelectWindowBorderTone = usePreferencesStore((state) => state.setWindowBorderTone)
  const onSelectWindowBorderWeight = usePreferencesStore((state) => state.setWindowBorderWeight)
  const onSelectWindowCloseBehavior = usePreferencesStore((state) => state.setWindowCloseBehavior)
  const setRememberCloseChoice = usePreferencesStore((state) => state.setRememberCloseChoice)
  const onToggleBorderlessFullscreen = usePreferencesStore((state) => state.toggleFullscreen)
  const setDebugModeEnabled = usePreferencesStore((state) => state.setDebugEnabled)
  const setNotificationSoundEnabled = usePreferencesStore((state) => state.setNotificationSoundEnabled)
  const setLoadingMotionPreference = usePreferencesStore((state) => state.setLoadingMotionPreference)
  const [uncontrolledActiveCategory, setUncontrolledActiveCategory] = useState<SettingsWindowCategory>('appearance')
  const [aiDirty, setAiDirty] = useState(false)
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false)
  const pendingLeaveRef = useRef<(() => void) | null>(null)
  /** True while confirmLeave runs so the same click cannot re-arm leave/close. */
  const confirmingLeaveRef = useRef(false)
  const leaveConfirmationOpenRef = useRef(false)
  const aiDirtyRef = useRef(false)
  const leaveDialogTitleId = useId()
  const languageTitleId = useId()
  const languageDescriptionId = useId()
  const borderlessFullscreenTitleId = useId()
  const rememberCloseChoiceTitleId = useId()
  const notificationSoundTitleId = useId()
  const debugModeTitleId = useId()
  const title = settingsCopy.title
  const categories = settingsCopy.categories
  const categoryDescriptions = settingsCopy.categoryDescriptions
  const themeLabel = settingsCopy.themeLabel
  const resetThemeLabel = settingsCopy.resetThemeLabel
  const groups = settingsCopy.groups
  const currentSelectionLabel = settingsCopy.currentSelectionLabel
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
  const windowBorderToneOptions = (Object.entries(settingsCopy.windowBorderToneOptions) as Array<[WindowBorderTone, string]>).map(
    ([id, label]) => ({ id, label }),
  )
  const windowBorderWeightOptions = (Object.entries(settingsCopy.windowBorderWeightOptions) as Array<[WindowBorderWeight, string]>).map(
    ([id, label]) => ({ id, label }),
  )
  const closeBehaviorOptions = (Object.entries(settingsCopy.closeBehaviorOptions) as Array<[WindowCloseBehavior, string]>).map(
    ([id, label]) => ({ id, label }),
  )
  const enabledStateLabel = settingsCopy.enabledStateLabel
  const disabledStateLabel = settingsCopy.disabledStateLabel
  const presetById = new Map(THEME_PRESETS.map((preset) => [preset.id, preset]))
  const themeOptions: ThemeOption[] = THEME_DISPLAY_ORDER.flatMap((id) => {
    const preset = presetById.get(id)
    if (!preset) return []
    return [
      {
        id: preset.id,
        label: settingsCopy.themeLabels[preset.id] ?? preset.label,
        accent: preset.accent,
        preview: preset.preview,
      },
    ]
  })
  const onResetTheme = () => onSelectTheme(DEFAULT_THEME_ID)
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
  const categoryRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeLocaleIndex = localeOptions.findIndex((option) => option.id === activeLocale)
  const focusableLocaleIndex = activeLocaleIndex === -1 ? 0 : activeLocaleIndex
  const activeCategory = controlledActiveCategory ?? uncontrolledActiveCategory
  const effectiveLoadingSpeedMultiplier =
    typeof activeLoadingSpeedMultiplier === 'number' && Number.isFinite(activeLoadingSpeedMultiplier) ? activeLoadingSpeedMultiplier : 1
  const customSpeedExpanded = activeLoadingSpeedMode === 'custom'
  const activeBorderToneLabel =
    windowBorderToneOptions.find((option) => option.id === activeWindowBorderTone)?.label ?? activeWindowBorderTone
  const activeBorderWeightLabel =
    windowBorderWeightOptions.find((option) => option.id === activeWindowBorderWeight)?.label ?? activeWindowBorderWeight
  const activeCloseBehaviorLabel =
    closeBehaviorOptions.find((option) => option.id === activeWindowCloseBehavior)?.label ?? activeWindowCloseBehavior

  leaveConfirmationOpenRef.current = leaveConfirmationOpen
  aiDirtyRef.current = aiDirty

  const handleCategoryChange = (category: SettingsWindowCategory) => {
    if (category === activeCategory) return
    requestLeave(() => {
      if (controlledActiveCategory === undefined) setUncontrolledActiveCategory(category)
      onActiveCategoryChange?.(category)
    })
  }

  const requestLeave = (action: () => void) => {
    // Same-click re-entry after "leave without saving" (portal bubble → backdrop
    // close, focus restore, etc.) must not open another prompt or replace pending.
    if (confirmingLeaveRef.current) {
      return
    }
    if (!aiDirtyRef.current) {
      action()
      return
    }
    pendingLeaveRef.current = action
    setLeaveConfirmationOpen(true)
  }

  const beginLeaveInteractionGuard = () => {
    // Keep the guard through the rest of this click's React bubble (portal
    // events still climb the React tree after the button handler returns).
    confirmingLeaveRef.current = true
    queueMicrotask(() => {
      confirmingLeaveRef.current = false
    })
  }

  const requestClose = () => {
    // While the unsaved prompt is open, backdrop/X must not re-arm close as a
    // second pending action (that made "leave without saving" appear stuck, then
    // close settings on the next confirm).
    if (leaveConfirmationOpenRef.current || confirmingLeaveRef.current) {
      return
    }
    requestLeave(onClose)
  }
  const cancelLeave = () => {
    pendingLeaveRef.current = null
    leaveConfirmationOpenRef.current = false
    setLeaveConfirmationOpen(false)
    beginLeaveInteractionGuard()
  }
  const confirmLeave = () => {
    const action = pendingLeaveRef.current
    pendingLeaveRef.current = null
    leaveConfirmationOpenRef.current = false
    setLeaveConfirmationOpen(false)
    // Swallow same-turn re-entry (portal bubble → backdrop requestClose) so the
    // leave dialog cannot re-arm mid-confirm. Do not force-clear aiDirty here:
    // child panels still mounted after an in-AI tab switch must keep reporting.
    beginLeaveInteractionGuard()
    action?.()
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

  const handleCategoryKeyDown = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % SETTINGS_CATEGORIES.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + SETTINGS_CATEGORIES.length) % SETTINGS_CATEGORIES.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = SETTINGS_CATEGORIES.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const category = SETTINGS_CATEGORIES[nextIndex]
    if (!category) return
    handleCategoryChange(category)
    categoryRefs.current[nextIndex]?.focus()
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Leave dialog owns Escape while open (Dialog capture + cancelLeave).
      if (leaveConfirmationOpenRef.current) return
      requestClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open || !aiDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [aiDirty, open])

  useEffect(() => {
    if (open) return
    pendingLeaveRef.current = null
    confirmingLeaveRef.current = false
    leaveConfirmationOpenRef.current = false
    aiDirtyRef.current = false
    setLeaveConfirmationOpen(false)
    setAiDirty(false)
  }, [open])

  if (!open) {
    return null
  }

  // Leave Dialog must NOT be a React child of the settings backdrop: portal events
  // still bubble through the React tree, so a "leave without saving" click would
  // also hit backdrop onClick={requestClose} and re-arm a close on the next confirm.
  return (
    <>
      <div className="settings-window-backdrop" onClick={requestClose}>
        <section
          className="settings-window-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-window-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="settings-window-header">
            <div className="settings-window-header-brand">
              <span className="settings-window-header-icon" aria-hidden="true">
                <Settings2 />
              </span>
              <h1 className="settings-window-title" id="settings-window-title">
                {title}
              </h1>
            </div>

            <nav className="settings-window-category-tabs" role="tablist" aria-label={title}>
              {SETTINGS_CATEGORIES.map((categoryId, index) => (
                <button
                  key={categoryId}
                  ref={(node) => {
                    categoryRefs.current[index] = node
                  }}
                  type="button"
                  role="tab"
                  id={`settings-category-${categoryId}`}
                  aria-selected={activeCategory === categoryId}
                  aria-controls="settings-category-panel"
                  tabIndex={activeCategory === categoryId ? 0 : -1}
                  className={cx('settings-window-category-tab', activeCategory === categoryId && 'is-active')}
                  title={categoryDescriptions[categoryId]}
                  onClick={() => handleCategoryChange(categoryId)}
                  onMouseEnter={() => {
                    if (categoryId === 'ai') void preloadAiSettingsPanel()
                  }}
                  onFocus={() => {
                    if (categoryId === 'ai') void preloadAiSettingsPanel()
                  }}
                  onKeyDown={(event) => handleCategoryKeyDown(index, event)}
                >
                  {categories[categoryId]}
                </button>
              ))}
            </nav>

            <button
              type="button"
              className="settings-window-close"
              onClick={requestClose}
              title={settingsCopy.closeDialogLabel}
              aria-label={settingsCopy.closeDialogLabel}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="settings-window-body">
            <div className="settings-window-body-inner">
              <div
                className="settings-window-content"
                role="tabpanel"
                id="settings-category-panel"
                aria-labelledby={`settings-category-${activeCategory}`}
              >
                {activeCategory === 'ai' ? (
                  <Suspense fallback={<LoadingMotionFallback />}>
                    <AiSettingsPanel initialTab={initialAiTab} onDirtyChange={setAiDirty} requestLeave={requestLeave} />
                  </Suspense>
                ) : null}

                {activeCategory === 'appearance' ? (
                  <div className="settings-window-pane">
                    <div className="settings-window-pane-scroll">
                      <header className="settings-window-page-head">
                        <div>
                          <h2>{categories.appearance}</h2>
                          <p>{categoryDescriptions.appearance}</p>
                        </div>
                      </header>

                      <section className="settings-window-group">
                        <div className="settings-window-group-label">
                          {themeLabel}
                          <button type="button" className="settings-window-btn settings-window-group-action" onClick={onResetTheme}>
                            {resetThemeLabel}
                          </button>
                        </div>
                        <div className="settings-window-theme-grid">
                          {themeOptions.map((option) => {
                            const active = option.id === activeThemeId
                            return (
                              <button
                                key={option.id}
                                type="button"
                                className={cx('settings-window-theme-tile', active && 'is-active')}
                                onClick={() => onSelectTheme(option.id)}
                              >
                                <span
                                  className="settings-window-theme-preview"
                                  style={
                                    {
                                      backgroundColor: option.preview.surface,
                                      '--tile-accent': option.accent,
                                      '--tile-panel': option.preview.panel,
                                    } as CSSProperties
                                  }
                                >
                                  <span className="settings-window-theme-preview-panel" style={{ backgroundColor: option.preview.panel }} />
                                </span>
                                <span className="settings-window-theme-name">{option.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </section>

                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{settingsCopy.languageLabel}</p>
                        <div className="settings-window-list">
                          <div className="settings-window-row is-stack">
                            <div className="settings-window-row-meta">
                              <p id={languageTitleId} className="settings-window-row-title">
                                {settingsCopy.interfaceLanguageLabel}
                              </p>
                              <p id={languageDescriptionId} className="settings-window-row-desc">
                                {settingsCopy.interfaceLanguageDescription}
                              </p>
                            </div>
                            <div
                              className="settings-window-locale-row"
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
                                    className={cx('settings-window-locale-chip', active && 'is-active')}
                                    role="radio"
                                    aria-checked={active}
                                    tabIndex={index === focusableLocaleIndex ? 0 : -1}
                                    onKeyDown={(event) => handleLocaleKeyDown(index, event)}
                                    onClick={() => {
                                      if (!active) onSelectLocale(option.id)
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}

                {activeCategory === 'loading' ? (
                  <div className="settings-window-pane">
                    <div className="settings-window-pane-scroll">
                      <header className="settings-window-page-head">
                        <div>
                          <h2>{categories.loading}</h2>
                          <p>{categoryDescriptions.loading}</p>
                        </div>
                      </header>

                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{groups.preview}</p>
                        <div className="settings-window-preview-stage" aria-label={settingsCopy.loadingMotionPreviewLabel}>
                          <LoadingMotionFallback
                            styleId={activeLoadingStyleId}
                            intensityId={activeLoadingIntensityId}
                            speedMode={activeLoadingSpeedMode}
                            speedId={activeLoadingSpeedId}
                            speedMultiplier={activeLoadingSpeedMultiplier}
                            className="settings-loading-preview-stage"
                          />
                        </div>
                      </section>

                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{groups.parameters}</p>
                        <div className="settings-window-list">
                          <div className="settings-window-row is-stack">
                            <div className="settings-window-row-meta">
                              <p className="settings-window-row-title">{settingsCopy.loadingMotionStyleLabel}</p>
                              <p className="settings-window-row-desc">{settingsCopy.loadingMotionStyleDescription}</p>
                            </div>
                            <div className="settings-window-pill-wrap">
                              {loadingStyleOptions.map((option) => {
                                const active = option.id === activeLoadingStyleId
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={cx('settings-window-pill', active && 'is-active')}
                                    onClick={() => onSelectLoadingStyle(option.id)}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p className="settings-window-row-title">{settingsCopy.loadingMotionIntensityLabel}</p>
                              <p className="settings-window-row-desc">{settingsCopy.loadingMotionIntensityDescription}</p>
                            </div>
                            <div className="settings-window-seg" role="radiogroup" aria-label={settingsCopy.loadingMotionIntensityLabel}>
                              {loadingIntensityOptions.map((option) => {
                                const active = option.id === activeLoadingIntensityId
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={cx('settings-window-seg-opt', active && 'is-active')}
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => onSelectLoadingIntensity(option.id)}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div
                            className={cx(
                              'settings-window-row-group',
                              customSpeedExpanded && 'is-expanded',
                              customSpeedExpanded && 'is-custom',
                            )}
                          >
                            <div className="settings-window-row">
                              <div className="settings-window-row-meta">
                                <p className="settings-window-row-title">{settingsCopy.loadingMotionSpeedLabel}</p>
                                <p className="settings-window-row-desc">{settingsCopy.loadingMotionSpeedDescription}</p>
                              </div>
                              <div className="settings-window-actions">
                                <div className="settings-window-seg" role="radiogroup" aria-label={settingsCopy.loadingMotionSpeedLabel}>
                                  {loadingSpeedOptions.map((option) => {
                                    const active = !customSpeedExpanded && option.id === activeLoadingSpeedId
                                    return (
                                      <button
                                        key={option.id}
                                        type="button"
                                        className={cx('settings-window-seg-opt', active && 'is-active')}
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => onSelectLoadingSpeed(option.id)}
                                      >
                                        {option.label}
                                      </button>
                                    )
                                  })}
                                </div>
                                <button
                                  type="button"
                                  className="settings-window-btn"
                                  aria-expanded={customSpeedExpanded}
                                  onClick={() => {
                                    if (customSpeedExpanded) {
                                      onSelectLoadingSpeed(activeLoadingSpeedId)
                                      return
                                    }
                                    onSelectCustomLoadingSpeed(effectiveLoadingSpeedMultiplier)
                                  }}
                                >
                                  {customSpeedExpanded
                                    ? settingsCopy.loadingMotionPresetSpeedToggleLabel
                                    : settingsCopy.loadingMotionCustomSpeedToggleLabel}
                                </button>
                              </div>
                            </div>
                            {customSpeedExpanded ? (
                              <div className="settings-window-row-sub">
                                <div className="settings-window-row-meta">
                                  <p className="settings-window-row-sub-title">{settingsCopy.loadingMotionCustomSpeedLabel}</p>
                                  <p className="settings-window-row-sub-desc">{settingsCopy.loadingMotionCustomSpeedDescription}</p>
                                </div>
                                <div className="settings-window-slider">
                                  <input
                                    type="range"
                                    min={0.25}
                                    max={3}
                                    step={0.05}
                                    value={effectiveLoadingSpeedMultiplier}
                                    aria-label={settingsCopy.loadingMotionCustomSpeedLabel}
                                    onChange={(event) => onSelectCustomLoadingSpeed(Number(event.target.value))}
                                  />
                                  <output>{settingsCopy.loadingMotionSpeedValueLabel(effectiveLoadingSpeedMultiplier)}</output>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}

                {activeCategory === 'view' ? (
                  <div className="settings-window-pane">
                    <div className="settings-window-pane-scroll">
                      <header className="settings-window-page-head">
                        <div>
                          <h2>{categories.view}</h2>
                          <p>{categoryDescriptions.view}</p>
                        </div>
                      </header>

                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{groups.window}</p>
                        <div className="settings-window-list">
                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p className="settings-window-row-title">{settingsCopy.windowBorderToneLabel}</p>
                              <p className="settings-window-row-desc">{settingsCopy.windowBorderToneDescription}</p>
                              <p className="settings-window-row-value">{currentSelectionLabel(activeBorderToneLabel)}</p>
                            </div>
                            <div className="settings-window-seg" role="radiogroup" aria-label={settingsCopy.windowBorderToneLabel}>
                              {windowBorderToneOptions.map((option) => {
                                const active = option.id === activeWindowBorderTone
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={cx('settings-window-seg-opt', active && 'is-active')}
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => {
                                      if (!active) onSelectWindowBorderTone(option.id)
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p className="settings-window-row-title">{settingsCopy.windowBorderWeightLabel}</p>
                              <p className="settings-window-row-desc">{settingsCopy.windowBorderWeightDescription}</p>
                              <p className="settings-window-row-value">{currentSelectionLabel(activeBorderWeightLabel)}</p>
                            </div>
                            <div className="settings-window-seg" role="radiogroup" aria-label={settingsCopy.windowBorderWeightLabel}>
                              {windowBorderWeightOptions.map((option) => {
                                const active = option.id === activeWindowBorderWeight
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={cx('settings-window-seg-opt', active && 'is-active')}
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => {
                                      if (!active) onSelectWindowBorderWeight(option.id)
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p id={borderlessFullscreenTitleId} className="settings-window-row-title">
                                {settingsCopy.borderlessFullscreenLabel}
                              </p>
                              <p className="settings-window-row-desc">{settingsCopy.borderlessFullscreenDescription}</p>
                            </div>
                            <SettingsCompactSwitch
                              checked={borderlessFullscreenEnabled}
                              enabledLabel={enabledStateLabel}
                              disabledLabel={disabledStateLabel}
                              labelledBy={borderlessFullscreenTitleId}
                              onToggle={() => void onToggleBorderlessFullscreen()}
                            />
                          </div>
                        </div>
                      </section>

                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{groups.close}</p>
                        <div className="settings-window-list">
                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p className="settings-window-row-title">{settingsCopy.closeBehaviorLabel}</p>
                              <p className="settings-window-row-desc">{settingsCopy.closeBehaviorDescription}</p>
                              <p className="settings-window-row-value">{currentSelectionLabel(activeCloseBehaviorLabel)}</p>
                            </div>
                            <div className="settings-window-seg" role="radiogroup" aria-label={settingsCopy.closeBehaviorLabel}>
                              {closeBehaviorOptions.map((option) => {
                                const active = option.id === activeWindowCloseBehavior
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={cx('settings-window-seg-opt', active && 'is-active')}
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => {
                                      if (!active) onSelectWindowCloseBehavior(option.id)
                                    }}
                                  >
                                    {option.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p id={rememberCloseChoiceTitleId} className="settings-window-row-title">
                                {settingsCopy.rememberCloseChoiceLabel}
                              </p>
                            </div>
                            <SettingsCompactSwitch
                              checked={rememberCloseChoice}
                              enabledLabel={enabledStateLabel}
                              disabledLabel={disabledStateLabel}
                              labelledBy={rememberCloseChoiceTitleId}
                              onToggle={() => setRememberCloseChoice(!rememberCloseChoice)}
                            />
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}

                {activeCategory === 'interaction' ? (
                  <div className="settings-window-pane">
                    <div className="settings-window-pane-scroll">
                      <header className="settings-window-page-head">
                        <div>
                          <h2>{categories.interaction}</h2>
                          <p>{categoryDescriptions.interaction}</p>
                        </div>
                      </header>
                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{groups.notification}</p>
                        <div className="settings-window-list">
                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p id={notificationSoundTitleId} className="settings-window-row-title">
                                {settingsCopy.notificationSoundLabel}
                              </p>
                              <p className="settings-window-row-desc">{settingsCopy.notificationSoundDescription}</p>
                            </div>
                            <SettingsCompactSwitch
                              checked={notificationSoundEnabled}
                              enabledLabel={enabledStateLabel}
                              disabledLabel={disabledStateLabel}
                              labelledBy={notificationSoundTitleId}
                              onToggle={() => setNotificationSoundEnabled(!notificationSoundEnabled)}
                            />
                          </div>
                        </div>
                      </section>
                      <Suspense fallback={<LoadingMotionFallback />}>
                        <SettingsGuidesSection />
                      </Suspense>
                    </div>
                  </div>
                ) : null}

                {activeCategory === 'debug' ? (
                  <div className="settings-window-pane">
                    <div className="settings-window-pane-scroll">
                      <header className="settings-window-page-head">
                        <div>
                          <h2>{categories.debug}</h2>
                          <p>{categoryDescriptions.debug}</p>
                        </div>
                      </header>
                      <section className="settings-window-group">
                        <p className="settings-window-group-label">{groups.developer}</p>
                        <div className="settings-window-list">
                          <div className="settings-window-row">
                            <div className="settings-window-row-meta">
                              <p id={debugModeTitleId} className="settings-window-row-title">
                                {settingsCopy.debugModeLabel}
                              </p>
                              <p className="settings-window-row-desc">{settingsCopy.debugModeDescription}</p>
                            </div>
                            <SettingsCompactSwitch
                              checked={debugModeEnabled}
                              enabledLabel={enabledStateLabel}
                              disabledLabel={disabledStateLabel}
                              labelledBy={debugModeTitleId}
                              onToggle={() => setDebugModeEnabled(!debugModeEnabled)}
                            />
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
      <Dialog
        open={leaveConfirmationOpen}
        onClose={cancelLeave}
        labelledBy={leaveDialogTitleId}
        describedBy={`${leaveDialogTitleId}-description`}
        closeOnBackdrop={false}
        stack
        size="sm"
      >
        <DialogHeader
          id={leaveDialogTitleId}
          title={settingsCopy.unsavedChangesTitle}
          subtitle={settingsCopy.unsavedChangesDescription}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warning"
          onClose={cancelLeave}
          closeLabel={settingsCopy.continueEditing}
        />
        <DialogBody>
          <p id={`${leaveDialogTitleId}-description`} className="settings-window-unsaved-detail">
            {settingsCopy.unsavedChangesDetail}
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogAction
            data-autofocus
            onClick={(event) => {
              event.stopPropagation()
              cancelLeave()
            }}
          >
            {settingsCopy.continueEditing}
          </DialogAction>
          <DialogAction
            tone="warning"
            onClick={(event) => {
              // Stop portal→React-tree bubble so settings backdrop cannot re-arm close.
              event.stopPropagation()
              confirmLeave()
            }}
          >
            {settingsCopy.leaveWithoutSaving}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </>
  )
}
