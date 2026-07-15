import { useEffect } from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { getSettingsMenuCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale'

vi.mock('@app/app-shell/settings/AiSettingsPanel', () => ({
  AiSettingsPanel: ({
    onDirtyChange,
    requestLeave,
  }: {
    onDirtyChange?: (dirty: boolean) => void
    requestLeave: (action: () => void) => void
  }) => {
    useEffect(() => {
      onDirtyChange?.(true)
      return () => onDirtyChange?.(false)
    }, [onDirtyChange])

    return (
      <div>
        <p>Mock AI settings</p>
        <button type="button" onClick={() => requestLeave(() => undefined)}>
          Mock internal leave
        </button>
      </div>
    )
  },
}))

import SettingsWindow from '@app/app-shell/SettingsWindow'

describe('SettingsWindow leave confirmation', () => {
  it('does not re-arm close when leave-without-saving click bubbles to the settings backdrop', () => {
    const copy = getSettingsMenuCopy('en-US')
    const onClose = vi.fn()
    const onActiveCategoryChange = vi.fn()

    renderWithLocale(<SettingsWindow open activeCategory="ai" onActiveCategoryChange={onActiveCategoryChange} onClose={onClose} />)

    // Dirty AI → switch category prompts leave confirmation.
    fireEvent.click(screen.getByRole('tab', { name: copy.categories.appearance }))
    const leaveDialog = screen.getByRole('dialog', { name: copy.unsavedChangesTitle })
    expect(leaveDialog).toBeTruthy()

    // Simulate the historical bug path: after confirm, a bubbled backdrop click
    // would call requestClose again. Guards must swallow that re-entry.
    fireEvent.click(within(leaveDialog).getByRole('button', { name: copy.leaveWithoutSaving }))
    fireEvent.click(document.querySelector('.settings-window-backdrop')!)

    expect(onActiveCategoryChange).toHaveBeenCalledWith('appearance')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: copy.unsavedChangesTitle })).toBeNull()
  })

  it('closes settings once when leave-without-saving confirms a close request', () => {
    const copy = getSettingsMenuCopy('en-US')
    const onClose = vi.fn()

    renderWithLocale(<SettingsWindow open activeCategory="ai" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: copy.closeDialogLabel }))
    const leaveDialog = screen.getByRole('dialog', { name: copy.unsavedChangesTitle })

    fireEvent.click(within(leaveDialog).getByRole('button', { name: copy.leaveWithoutSaving }))
    // Same-click / follow-up backdrop press must not open another prompt.
    fireEvent.click(document.querySelector('.settings-window-backdrop')!)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: copy.unsavedChangesTitle })).toBeNull()
  })

  it('keeps editing when cancel is chosen and ignores backdrop re-entry for that click', () => {
    const copy = getSettingsMenuCopy('en-US')
    const onClose = vi.fn()

    renderWithLocale(<SettingsWindow open activeCategory="ai" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: copy.closeDialogLabel }))
    const leaveDialog = screen.getByRole('dialog', { name: copy.unsavedChangesTitle })
    const continueEditing = within(leaveDialog)
      .getAllByRole('button', { name: copy.continueEditing })
      .find((button) => button.hasAttribute('data-autofocus'))
    expect(continueEditing).toBeTruthy()
    fireEvent.click(continueEditing!)
    fireEvent.click(document.querySelector('.settings-window-backdrop')!)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: copy.unsavedChangesTitle })).toBeNull()
    expect(screen.getByText('Mock AI settings')).toBeTruthy()
  })

  it('resets leave state when the settings window is closed by the parent', () => {
    const copy = getSettingsMenuCopy('en-US')
    const onClose = vi.fn()
    const view = renderWithLocale(<SettingsWindow open activeCategory="ai" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: copy.closeDialogLabel }))
    expect(screen.getByRole('dialog', { name: copy.unsavedChangesTitle })).toBeTruthy()

    view.rerender(<SettingsWindow open={false} activeCategory="ai" onClose={onClose} />)
    expect(screen.queryByRole('dialog', { name: copy.unsavedChangesTitle })).toBeNull()

    view.rerender(<SettingsWindow open activeCategory="ai" onClose={onClose} />)
    expect(screen.queryByRole('dialog', { name: copy.unsavedChangesTitle })).toBeNull()
  })
})
