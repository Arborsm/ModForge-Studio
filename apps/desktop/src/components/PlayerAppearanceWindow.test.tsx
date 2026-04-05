import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultPlayerAppearanceProfile } from '../lib/app/playerAppearance'
import PlayerAppearanceWindow from './PlayerAppearanceWindow'

describe('PlayerAppearanceWindow', () => {
  function renderWindow(overrides?: Partial<ComponentProps<typeof PlayerAppearanceWindow>>) {
    const profile = createDefaultPlayerAppearanceProfile('Test Player')
    const props: ComponentProps<typeof PlayerAppearanceWindow> = {
      open: true,
      locale: 'en-US',
      rootPath: null,
      profiles: [profile],
      activeProfileId: profile.id,
      onSelectProfile: vi.fn(),
      onCreateProfile: vi.fn(),
      onDuplicateProfile: vi.fn(),
      onDeleteProfile: vi.fn(),
      onImportProfile: vi.fn(),
      onChangeProfile: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    }

    return render(<PlayerAppearanceWindow {...props} />)
  }

  it('renders feature shell classes for the appearance overlay', () => {
    const { container } = renderWindow()

    expect(screen.getAllByText(/Player Appearance/i).length).toBeGreaterThan(0)
    expect(container.querySelector('.appearance-window-backdrop')).toBeInTheDocument()
    expect(container.querySelector('.appearance-window-panel')).toBeInTheDocument()
    expect(container.querySelector('.player-appearance-label')).toBeInTheDocument()
    expect(container.querySelector('.player-appearance-input')).toBeInTheDocument()
    expect(container.querySelector('.player-appearance-note')).toBeInTheDocument()
  })
})
