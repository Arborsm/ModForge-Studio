import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import SettingsWindow from './SettingsWindow'
import { ACCENT_PRESETS } from '../lib/app/constants'
import { getSettingsMenuCopy } from '../lib/editor-shell'

const copy = getSettingsMenuCopy('en-US')

describe('SettingsWindow', () => {
  function renderWindow(overrides?: Partial<ComponentProps<typeof SettingsWindow>>) {
    const props: ComponentProps<typeof SettingsWindow> = {
      open: true,
      title: copy.title,
      categories: copy.categories,
      categoryDescriptions: copy.categoryDescriptions,
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
      futureLabel: copy.futureLabel,
      futureDescription: copy.futureDescription,
      accentOptions: ACCENT_PRESETS,
      activeAccentId: ACCENT_PRESETS[0].id,
      windowModeLabel: 'Window mode',
      borderlessFullscreenLabel: 'Borderless fullscreen',
      borderlessFullscreenDescription: 'Switch the undecorated window into an immersive fullscreen workspace.',
      enableBorderlessFullscreenLabel: 'Enter borderless fullscreen',
      disableBorderlessFullscreenLabel: 'Exit borderless fullscreen',
      borderlessFullscreenEnabled: false,
      onSelectAccent: vi.fn(),
      onResetAccent: vi.fn(),
      onSelectLocale: vi.fn(),
      onToggleBorderlessFullscreen: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    }

    const view = render(<SettingsWindow {...props} />)
    return { props, ...view }
  }

  it('shows a borderless fullscreen toggle in the view category', () => {
    const { container } = renderWindow()

    expect(container.querySelector('.settings-window-backdrop')).toBeInTheDocument()
    expect(container.querySelector('.settings-window-panel')).toBeInTheDocument()
    expect(container.querySelector('.settings-window-sidebar')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${copy.categories.view}`) }))

    expect(screen.getByRole('button', { name: 'Enter borderless fullscreen' })).toBeInTheDocument()
  })

  it('shows locale options in appearance and only selects a non-active locale', () => {
    const onSelectLocale = vi.fn()
    renderWindow({ onSelectLocale })

    expect(screen.getByText(copy.languageLabel)).toBeInTheDocument()
    expect(screen.getByText(copy.languageDescription)).toBeInTheDocument()
    const localeGroup = screen.getByRole('radiogroup', { name: copy.languageLabel })
    expect(localeGroup).toBeInTheDocument()

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOption).toHaveAttribute('aria-checked', 'true')
    expect(chineseOption).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(englishOption)
    expect(onSelectLocale).not.toHaveBeenCalled()

    fireEvent.click(chineseOption)
    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
  })

  it('supports arrow-key locale navigation with roving focus semantics', () => {
    const onSelectLocale = vi.fn()
    renderWindow({ onSelectLocale })

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOption).toHaveAttribute('tabindex', '0')
    expect(chineseOption).toHaveAttribute('tabindex', '-1')

    ;(englishOption as HTMLElement).focus()
    fireEvent.keyDown(englishOption, { key: 'ArrowRight' })

    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
    expect(chineseOption).toHaveFocus()
  })

  it('supports Home and End locale navigation keys', () => {
    const onSelectLocale = vi.fn()
    const { rerender, props } = renderWindow({ onSelectLocale, activeLocale: 'en-US' })

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    ;(englishOption as HTMLElement).focus()
    fireEvent.keyDown(englishOption, { key: 'Home' })

    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
    expect(chineseOption).toHaveFocus()

    rerender(<SettingsWindow {...props} activeLocale="zh-CN" />)

    const chineseOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })
    const englishOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })

    ;(chineseOptionUpdated as HTMLElement).focus()
    fireEvent.keyDown(chineseOptionUpdated, { key: 'End' })

    expect(onSelectLocale).toHaveBeenNthCalledWith(2, 'en-US')
    expect(englishOptionUpdated).toHaveFocus()
  })

  it('supports reverse-direction arrow keys with wraparound navigation', () => {
    const onSelectLocale = vi.fn()
    const { rerender, props } = renderWindow({ onSelectLocale, activeLocale: 'zh-CN' })

    const englishOption = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOption = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    ;(chineseOption as HTMLElement).focus()
    fireEvent.keyDown(chineseOption, { key: 'ArrowLeft' })

    expect(onSelectLocale).toHaveBeenCalledWith('en-US')
    expect(englishOption).toHaveFocus()

    rerender(<SettingsWindow {...props} activeLocale="en-US" />)

    const englishOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOptionUpdated).toHaveFocus()

    fireEvent.keyDown(englishOptionUpdated, { key: 'ArrowUp' })

    expect(onSelectLocale).toHaveBeenCalledTimes(2)
    expect(onSelectLocale).toHaveBeenNthCalledWith(2, 'zh-CN')
    expect(chineseOptionUpdated).toHaveFocus()
  })

  it('updates aria-checked and roving tabindex after parent activeLocale rerender', () => {
    const onSelectLocale = vi.fn()
    const { rerender, props } = renderWindow({ onSelectLocale, activeLocale: 'en-US' })

    const englishOptionInitial = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOptionInitial = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOptionInitial).toHaveAttribute('aria-checked', 'true')
    expect(chineseOptionInitial).toHaveAttribute('aria-checked', 'false')
    expect(englishOptionInitial).toHaveAttribute('tabindex', '0')
    expect(chineseOptionInitial).toHaveAttribute('tabindex', '-1')

    rerender(<SettingsWindow {...props} activeLocale="zh-CN" />)

    const englishOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['en-US'] })
    const chineseOptionUpdated = screen.getByRole('radio', { name: copy.localeLabels['zh-CN'] })

    expect(englishOptionUpdated).toHaveAttribute('aria-checked', 'false')
    expect(chineseOptionUpdated).toHaveAttribute('aria-checked', 'true')
    expect(englishOptionUpdated).toHaveAttribute('tabindex', '-1')
    expect(chineseOptionUpdated).toHaveAttribute('tabindex', '0')
  })
})
