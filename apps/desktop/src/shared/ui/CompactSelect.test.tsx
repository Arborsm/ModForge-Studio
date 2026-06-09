import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompactSelect } from '@shared/ui/CompactSelect'

describe('CompactSelect', () => {
  it('opens an app-styled listbox and commits an option', () => {
    const onChange = vi.fn()

    render(
      <CompactSelect
        ariaLabel="每页"
        value={9}
        onChange={onChange}
        options={[
          { value: 9, label: '9 个' },
          { value: 18, label: '18 个' },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '每页: 9 个' }))

    expect(screen.getByRole('listbox', { name: '每页' })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: '18 个' }))

    expect(onChange).toHaveBeenCalledWith(18)
    expect(screen.queryByRole('listbox', { name: '每页' })).toBeNull()
  })
})
