import { fireEvent, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithLocale } from '../test/renderWithLocale'
import InitializationOverlay from './InitializationOverlay'

describe('InitializationOverlay', () => {
  function renderOverlay(overrides?: Partial<ComponentProps<typeof InitializationOverlay>>) {
    const onSelectDirectory = vi.fn()
    const props: ComponentProps<typeof InitializationOverlay> = {
      desktopHost: true,
      gameDirectory: 'C:/Games/Stardew Valley',
      detectedDirectories: ['C:/Games/Stardew Valley'],
      onGameDirectoryChange: vi.fn(),
      onSelectDirectory,
      onChooseDirectory: vi.fn(),
      onScanAndOpenTown: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    }

    const view = renderWithLocale(<InitializationOverlay {...props} />)
    return { ...view, props }
  }

  it('renders initialization feature shell classes', () => {
    const { container, props } = renderOverlay()

    expect(container.querySelector('.initialization-overlay-backdrop')).toBeInTheDocument()
    expect(container.querySelector('.initialization-overlay-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /C:\/Games\/Stardew Valley/i }))
    expect(props.onSelectDirectory).toHaveBeenCalledWith('C:/Games/Stardew Valley')
  })
})
