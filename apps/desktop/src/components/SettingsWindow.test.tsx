import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsWindow from './SettingsWindow'
import { ACCENT_PRESETS } from '../lib/app/constants'
import { getSettingsMenuCopy } from '../lib/editor-shell'

const copy = getSettingsMenuCopy('en-US')

describe('SettingsWindow', () => {
  it('shows a borderless fullscreen toggle in the view category', () => {
    render(
      <SettingsWindow
        open
        title={copy.title}
        categories={copy.categories}
        categoryDescriptions={copy.categoryDescriptions}
        accentLabel={copy.accentLabel}
        resetAccentLabel={copy.resetAccentLabel}
        accentDescription={copy.accentDescription}
        futureLabel={copy.futureLabel}
        futureDescription={copy.futureDescription}
        accentOptions={ACCENT_PRESETS}
        activeAccentId={ACCENT_PRESETS[0].id}
        windowModeLabel="Window mode"
        borderlessFullscreenLabel="Borderless fullscreen"
        borderlessFullscreenDescription="Switch the undecorated window into an immersive fullscreen workspace."
        enableBorderlessFullscreenLabel="Enter borderless fullscreen"
        disableBorderlessFullscreenLabel="Exit borderless fullscreen"
        borderlessFullscreenEnabled={false}
        onSelectAccent={vi.fn()}
        onResetAccent={vi.fn()}
        onToggleBorderlessFullscreen={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${copy.categories.view}`) }))

    expect(screen.getByRole('button', { name: 'Enter borderless fullscreen' })).toBeInTheDocument()
  })
})
