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

    render(<SettingsWindow {...props} />)
    return props
  }

  it('shows a borderless fullscreen toggle in the view category', () => {
    renderWindow()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${copy.categories.view}`) }))

    expect(screen.getByRole('button', { name: 'Enter borderless fullscreen' })).toBeInTheDocument()
  })

  it('shows locale options in appearance and only selects a non-active locale', () => {
    const onSelectLocale = vi.fn()
    renderWindow({ onSelectLocale })

    expect(screen.getByText(copy.languageLabel)).toBeInTheDocument()
    expect(screen.getByText(copy.languageDescription)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: copy.localeLabels['en-US'] }))
    expect(onSelectLocale).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: copy.localeLabels['zh-CN'] }))
    expect(onSelectLocale).toHaveBeenCalledWith('zh-CN')
  })
})
