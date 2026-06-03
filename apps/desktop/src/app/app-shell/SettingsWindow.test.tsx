import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsWindow from './SettingsWindow'
import { ACCENT_PRESETS } from '@app/app-shell/constants'
import { getSettingsMenuCopy } from '@locales/editor-shell'

const copy = getSettingsMenuCopy('en-US')

describe('SettingsWindow', () => {
  afterEach(() => {
    cleanup()
  })

  function renderWindow(overrides?: Partial<ComponentProps<typeof SettingsWindow>>) {
    const props: ComponentProps<typeof SettingsWindow> = {
      open: true,
      title: copy.title,
      categories: {
        appearance: 'Appearance',
        loading: 'Loading',
        view: 'View',
        interaction: 'Interaction',
        launcher: 'Launcher',
        debug: 'Debug',
      },
      categoryDescriptions: {
        appearance: 'Theme, accent color, and overall visual style.',
        loading: 'Page loading animation style and intensity.',
        view: 'Map display, canvas, and information presentation.',
        interaction: 'Notification sounds and future interaction feedback.',
        launcher: 'Game paths, downloads, and Nexus integration.',
        debug: 'Diagnostics, overlays, notifications, and logs.',
      },
      accentLabel: copy.accentLabel,
      resetAccentLabel: copy.resetAccentLabel,
      accentDescription: copy.accentDescription,
      languageLabel: copy.languageLabel,
      languageDescription: copy.languageDescription,
      localeOptions: [
        { id: 'zh-CN', label: copy.localeLabels['zh-CN'] },
        { id: 'en-US', label: copy.localeLabels['en-US'] },
      ],
      activeLocale: 'en-US',
      accentOptions: ACCENT_PRESETS,
      activeAccentId: ACCENT_PRESETS[0].id,
      windowModeLabel: 'Window mode',
      windowBorderToneLabel: copy.windowBorderToneLabel,
      windowBorderToneDescription: copy.windowBorderToneDescription,
      windowBorderToneOptions: Object.entries(copy.windowBorderToneOptions).map(([id, label]) => ({
        id: id as keyof typeof copy.windowBorderToneOptions,
        label,
      })),
      activeWindowBorderTone: 'accent',
      windowBorderWeightLabel: copy.windowBorderWeightLabel,
      windowBorderWeightDescription: copy.windowBorderWeightDescription,
      windowBorderWeightOptions: Object.entries(copy.windowBorderWeightOptions).map(([id, label]) => ({
        id: id as keyof typeof copy.windowBorderWeightOptions,
        label,
      })),
      activeWindowBorderWeight: 'standard',
      borderlessFullscreenLabel: 'Borderless fullscreen',
      borderlessFullscreenDescription: 'Switch the undecorated window into an immersive fullscreen workspace.',
      enableBorderlessFullscreenLabel: 'Enter borderless fullscreen',
      disableBorderlessFullscreenLabel: 'Exit borderless fullscreen',
      borderlessFullscreenEnabled: false,
      debugModeLabel: 'Debug tools',
      debugModeDescription: 'Show developer diagnostics and emit debug logs.',
      enableDebugModeLabel: 'Enable debug tools',
      disableDebugModeLabel: 'Disable debug tools',
      debugModeEnabled: false,
      notificationSoundLabel: 'Notification sounds',
      notificationSoundDescription: 'Play a short sound when a new global notification appears.',
      enableNotificationSoundLabel: 'Enable notification sounds',
      disableNotificationSoundLabel: 'Disable notification sounds',
      notificationSoundEnabled: true,
      loadingMotionStyleLabel: 'Loading Animation Style',
      loadingMotionStyleDescription: 'Choose the entrance animation style.',
      loadingMotionIntensityLabel: 'Animation Intensity',
      loadingMotionIntensityDescription: 'Adjust how pronounced the animation feels.',
      loadingMotionSpeedLabel: 'Animation Speed',
      loadingMotionSpeedDescription: 'Choose how quickly loading animation timing plays.',
      loadingMotionCustomSpeedLabel: 'Fine / extreme speed',
      loadingMotionCustomSpeedDescription: 'Use a slider for precise or dramatic timing.',
      loadingMotionCustomSpeedToggleLabel: 'Fine / extreme',
      loadingMotionPresetSpeedToggleLabel: 'Preset speeds',
      loadingMotionSpeedValueLabel: (value: number) => `${value.toFixed(2)}x`,
      activeLoadingStyleId: 'softFadeIn',
      activeLoadingIntensityId: 'standard',
      activeLoadingSpeedMode: 'preset',
      activeLoadingSpeedId: 'standard',
      activeLoadingSpeedMultiplier: 1,
      onSelectLoadingStyle: vi.fn(),
      onSelectLoadingIntensity: vi.fn(),
      onSelectLoadingSpeed: vi.fn(),
      onSelectCustomLoadingSpeed: vi.fn(),
      loadingStyleOptions: [
        { id: 'bounceIn', label: 'Bounce In' },
        { id: 'layeredFadeIn', label: 'Layered Fade' },
        { id: 'slideInPush', label: 'Slide In' },
        { id: 'softFadeIn', label: 'Soft Fade' },
        { id: 'quietSimplify', label: 'Quiet' },
      ],
      loadingIntensityOptions: [
        { id: 'light', label: 'Light' },
        { id: 'standard', label: 'Standard' },
        { id: 'strong', label: 'Strong' },
      ],
      loadingSpeedOptions: [
        { id: 'slow', label: 'Slow' },
        { id: 'standard', label: 'Standard' },
        { id: 'fast', label: 'Fast' },
      ],
      onSelectAccent: vi.fn(),
      onResetAccent: vi.fn(),
      onSelectLocale: vi.fn(),
      onSelectWindowBorderTone: vi.fn(),
      onSelectWindowBorderWeight: vi.fn(),
      onToggleBorderlessFullscreen: vi.fn(),
      onToggleNotificationSound: vi.fn(),
      onToggleDebugMode: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    }

    const view = render(<SettingsWindow {...props} />)
    return { props, ...view }
  }

  it('shows a borderless fullscreen toggle in the view category', () => {
    const { container } = renderWindow()

    expect(container.querySelector('.settings-window-backdrop')).toBeTruthy()
    expect(container.querySelector('.settings-window-panel')).toBeTruthy()
    expect(container.querySelector('.settings-window-sidebar')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${copy.categories.view}`) }))

    const toggle = screen.getByRole('switch', { name: 'Borderless fullscreen' })

    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('selects window border color and weight independently from the view category', () => {
    const onSelectWindowBorderTone = vi.fn()
    const onSelectWindowBorderWeight = vi.fn()
    renderWindow({
      activeWindowBorderTone: 'neutral',
      activeWindowBorderWeight: 'thin',
      onSelectWindowBorderTone,
      onSelectWindowBorderWeight,
    })

    fireEvent.click(screen.getByRole('button', { name: /^View/ }))

    const toneGroup = screen.getByRole('radiogroup', { name: copy.windowBorderToneLabel })
    const weightGroup = screen.getByRole('radiogroup', { name: copy.windowBorderWeightLabel })
    expect(toneGroup).toBeTruthy()
    expect(weightGroup).toBeTruthy()
    expect(screen.getByRole('radio', { name: copy.windowBorderToneOptions.neutral }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: copy.windowBorderWeightOptions.thin }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: copy.windowBorderToneOptions.accent }))
    fireEvent.click(screen.getByRole('radio', { name: copy.windowBorderWeightOptions.none }))
    expect(onSelectWindowBorderTone).toHaveBeenCalledWith('accent')
    expect(onSelectWindowBorderWeight).toHaveBeenCalledWith('none')
  })

  it('shows the debug toggle in the advanced category and calls the toggle handler', () => {
    const onToggleDebugMode = vi.fn()
    renderWindow({ onToggleDebugMode })

    fireEvent.click(screen.getByRole('button', { name: /^Debug/ }))

    const toggle = screen.getByRole('switch', { name: 'Debug tools' })
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)
    expect(onToggleDebugMode).toHaveBeenCalledTimes(1)
  })

  it('shows the notification sound toggle in the interaction category and calls the toggle handler', () => {
    const onToggleNotificationSound = vi.fn()
    renderWindow({ onToggleNotificationSound })

    fireEvent.click(screen.getByRole('button', { name: /^Interaction/ }))

    const toggle = screen.getByRole('switch', { name: 'Notification sounds' })
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    expect(onToggleNotificationSound).toHaveBeenCalledTimes(1)
  })

  it('keeps launcher settings out of the global settings window', () => {
    renderWindow()

    expect(screen.queryByRole('button', { name: /^Launcher/ })).toBeNull()
    expect(screen.queryByText('Game Path')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save Launcher Settings' })).toBeNull()
  })

  it('shows locale options in appearance and only selects a non-active locale', () => {
    const onSelectLocale = vi.fn()
    renderWindow({ onSelectLocale })

    expect(screen.getByText(copy.languageLabel)).toBeTruthy()
    expect(screen.getByText(copy.languageDescription)).toBeTruthy()
    const localeGroup = screen.getByRole('radiogroup', { name: copy.languageLabel })
    expect(localeGroup).toBeTruthy()

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOption.getAttribute('aria-checked')).toBe('true')
    expect(chineseOption.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(englishOption)
    expect(onSelectLocale).not.toHaveBeenCalled()

    fireEvent.click(chineseOption)
    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
  })

  it('renders a live loading motion preview for the selected style and intensity', () => {
    const { container } = renderWindow({
      activeLoadingStyleId: 'bounceIn',
      activeLoadingIntensityId: 'strong',
      activeLoadingSpeedId: 'fast',
      activeLoadingSpeedMultiplier: 0.68,
    })

    expect(container.querySelector('.settings-loading-preview')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Loading/ }))

    const preview = container.querySelector('.settings-loading-preview [data-loading-style]')
    expect(preview).toBeTruthy()
    expect(preview?.getAttribute('data-loading-style')).toBe('bounceIn')
    expect(preview?.getAttribute('data-loading-intensity')).toBe('strong')
    expect(preview?.getAttribute('data-loading-speed')).toBe('fast')
    expect(container.querySelectorAll('.settings-loading-preview .loading-motion-layer')).toHaveLength(3)
  })

  it('offers preset loading speed buttons by default', () => {
    const onSelectLoadingSpeed = vi.fn()
    renderWindow({ onSelectLoadingSpeed })

    fireEvent.click(screen.getByRole('button', { name: /^Loading/ }))

    expect(screen.getByText('Animation Speed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fast' }))
    expect(onSelectLoadingSpeed).toHaveBeenCalledWith('fast')
    expect(screen.queryByRole('slider', { name: 'Fine / extreme speed' })).toBeNull()
  })

  it('switches to a fine and extreme speed slider', () => {
    const onSelectCustomLoadingSpeed = vi.fn()
    renderWindow({
      activeLoadingSpeedMode: 'custom',
      activeLoadingSpeedMultiplier: 2.35,
      onSelectCustomLoadingSpeed,
    })

    fireEvent.click(screen.getByRole('button', { name: /^Loading/ }))

    const slider = screen.getByRole('slider', { name: 'Fine / extreme speed' })
    expect(slider).toBeTruthy()
    expect(slider.getAttribute('min')).toBe('0.25')
    expect(slider.getAttribute('max')).toBe('3')
    expect(screen.getByText('2.35x')).toBeTruthy()

    fireEvent.change(slider, { target: { value: '2.6' } })
    expect(onSelectCustomLoadingSpeed).toHaveBeenCalledWith(2.6)
  })

  it('does not show apply or cancel actions in the loading category', () => {
    renderWindow()

    fireEvent.click(screen.getByRole('button', { name: /^Loading/ }))

    expect(screen.queryByRole('button', { name: /Apply/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Cancel/i })).toBeNull()
  })

  it('keeps loading motion controls out of appearance settings', () => {
    const { container } = renderWindow()

    expect(screen.getByText(copy.accentLabel)).toBeTruthy()
    expect(screen.queryByText('Loading Animation Style')).toBeNull()
    expect(container.querySelector('.settings-loading-preview')).toBeNull()
  })

  it('does not render placeholder settings sections in appearance or view', () => {
    renderWindow()

    expect(screen.queryByText(copy.futureLabel)).toBeNull()
    expect(screen.queryByText(copy.futureDescription)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${copy.categories.view}`) }))

    expect(screen.queryByText(copy.futureLabel)).toBeNull()
    expect(screen.queryByText(copy.futureDescription)).toBeNull()
  })

  it('supports arrow-key locale navigation with roving focus semantics', () => {
    const onSelectLocale = vi.fn()
    renderWindow({ onSelectLocale })

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOption.getAttribute('tabindex')).toBe('0')
    expect(chineseOption.getAttribute('tabindex')).toBe('-1')
    ;(englishOption as HTMLElement).focus()
    fireEvent.keyDown(englishOption, { key: 'ArrowRight' })

    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
    expect(document.activeElement).toBe(chineseOption)
  })

  it('supports Home and End locale navigation keys', () => {
    const onSelectLocale = vi.fn()
    const { rerender, props } = renderWindow({ onSelectLocale, activeLocale: 'en-US' })

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    ;(englishOption as HTMLElement).focus()
    fireEvent.keyDown(englishOption, { key: 'Home' })

    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
    expect(document.activeElement).toBe(chineseOption)

    rerender(<SettingsWindow {...props} activeLocale="zh-CN" />)

    const chineseOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })
    const englishOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })

    ;(chineseOptionUpdated as HTMLElement).focus()
    fireEvent.keyDown(chineseOptionUpdated, { key: 'End' })

    expect(onSelectLocale).toHaveBeenNthCalledWith(2, 'en-US')
    expect(document.activeElement).toBe(englishOptionUpdated)
  })

  it('supports reverse-direction arrow keys with wraparound navigation', () => {
    const onSelectLocale = vi.fn()
    const { rerender, props } = renderWindow({ onSelectLocale, activeLocale: 'zh-CN' })

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    ;(chineseOption as HTMLElement).focus()
    fireEvent.keyDown(chineseOption, { key: 'ArrowLeft' })

    expect(onSelectLocale).toHaveBeenCalledWith('en-US')
    expect(document.activeElement).toBe(englishOption)

    rerender(<SettingsWindow {...props} activeLocale="en-US" />)

    const englishOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(document.activeElement).toBe(englishOptionUpdated)

    fireEvent.keyDown(englishOptionUpdated, { key: 'ArrowUp' })

    expect(onSelectLocale).toHaveBeenCalledTimes(2)
    expect(onSelectLocale).toHaveBeenNthCalledWith(2, 'zh-CN')
    expect(document.activeElement).toBe(chineseOptionUpdated)
  })

  it('updates aria-checked and roving tabindex after parent activeLocale rerender', () => {
    const onSelectLocale = vi.fn()
    const { rerender, props } = renderWindow({ onSelectLocale, activeLocale: 'en-US' })

    const englishOptionInitial = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOptionInitial = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOptionInitial.getAttribute('aria-checked')).toBe('true')
    expect(chineseOptionInitial.getAttribute('aria-checked')).toBe('false')
    expect(englishOptionInitial.getAttribute('tabindex')).toBe('0')
    expect(chineseOptionInitial.getAttribute('tabindex')).toBe('-1')

    rerender(<SettingsWindow {...props} activeLocale="zh-CN" />)

    const englishOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOptionUpdated.getAttribute('aria-checked')).toBe('false')
    expect(chineseOptionUpdated.getAttribute('aria-checked')).toBe('true')
    expect(englishOptionUpdated.getAttribute('tabindex')).toBe('-1')
    expect(chineseOptionUpdated.getAttribute('tabindex')).toBe('0')
  })
})
