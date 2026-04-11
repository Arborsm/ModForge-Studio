import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsWindow from './SettingsWindow'
import { ACCENT_PRESETS } from '../lib/app/constants'
import { getSettingsMenuCopy } from '../lib/editor-shell'

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
        view: 'View',
        interaction: 'Interaction',
        launcher: 'Launcher',
        debug: 'Debug',
      },
      categoryDescriptions: {
        appearance: 'Theme, accent color, and overall visual style.',
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
      launcherContent: (
        <div>
          <span>Game Path</span>
          <button type="button">Save Launcher Settings</button>
        </div>
      ),
      onSelectAccent: vi.fn(),
      onResetAccent: vi.fn(),
      onSelectLocale: vi.fn(),
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

  it('renders launcher settings content in the launcher category', () => {
    renderWindow()

    fireEvent.click(screen.getByRole('button', { name: /^Launcher/ }))

    expect(screen.getByText('Game Path')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save Launcher Settings' })).toBeTruthy()
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

  it('uses a larger settings dialog layout', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/features/settings-window.css'), 'utf8')

    expect(stylesheet).toContain('width: min(920px, calc(100vw - 56px));')
    expect(stylesheet).toContain('height: min(820px, calc(100vh - 56px));')
  })

  it('locks the settings body height and only scrolls the right content column', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/features/settings-window.css'), 'utf8')

    expect(stylesheet).toMatch(/\.settings-window-body\s*\{\s*min-height:\s*0;\s*overflow:\s*hidden;/)
    expect(stylesheet).toMatch(/\.settings-window-content\s*\{\s*min-height:\s*0;\s*display:\s*grid;\s*overflow:\s*auto;/)
  })

  it('styles the settings nav as a lightweight sidebar instead of bordered cards', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/features/settings-window.css'), 'utf8')

    expect(stylesheet).toContain('.settings-window-nav-item::before')
    expect(stylesheet).toContain('border: 0;')
    expect(stylesheet).toContain('box-shadow: inset 3px 0 0 var(--accent);')
  })
})
