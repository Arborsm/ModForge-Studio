import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/react'
import { QuitDialog } from './QuitDialog'

vi.mock('@locales/provider', () => ({
  useSettingsMenuCopy: () => ({
    closeDialogLabel: 'Close dialog',
    cancelActionLabel: 'Cancel',
    quitDialogTitle: 'Quit ModForge Studio',
    quitDialogMessage: 'How would you like to close the window?',
    quitDialogDescription: 'Choose to quit or minimize to tray.',
    rememberCloseChoiceLabel: 'Remember my choice',
    quitActionLabel: 'Quit application',
    minimizeToTrayActionLabel: 'Minimize to tray',
  }),
}))

describe('QuitDialog', () => {
  it('renders quit and minimize-to-tray actions', () => {
    render(
      <QuitDialog
        open
        onClose={vi.fn()}
        onQuit={vi.fn()}
        onMinimizeToTray={vi.fn()}
        rememberChoice={false}
        onRememberChoiceChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Quit ModForge Studio' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quit application' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Minimize to tray' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Remember my choice' })).toBeTruthy()
  })

  it('calls onQuit when quit action is clicked', () => {
    const onQuit = vi.fn()
    render(
      <QuitDialog
        open
        onClose={vi.fn()}
        onQuit={onQuit}
        onMinimizeToTray={vi.fn()}
        rememberChoice={false}
        onRememberChoiceChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Quit application' }))
    expect(onQuit).toHaveBeenCalledTimes(1)
  })

  it('calls onMinimizeToTray when minimize action is clicked', () => {
    const onMinimizeToTray = vi.fn()
    render(
      <QuitDialog
        open
        onClose={vi.fn()}
        onQuit={vi.fn()}
        onMinimizeToTray={onMinimizeToTray}
        rememberChoice={false}
        onRememberChoiceChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Minimize to tray' }))
    expect(onMinimizeToTray).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <QuitDialog
        open
        onClose={onClose}
        onQuit={vi.fn()}
        onMinimizeToTray={vi.fn()}
        rememberChoice={false}
        onRememberChoiceChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('toggles remember choice checkbox', () => {
    const onRememberChoiceChange = vi.fn()
    render(
      <QuitDialog
        open
        onClose={vi.fn()}
        onQuit={vi.fn()}
        onMinimizeToTray={vi.fn()}
        rememberChoice={false}
        onRememberChoiceChange={onRememberChoiceChange}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember my choice' }))
    expect(onRememberChoiceChange).toHaveBeenCalledWith(true)
  })
})
