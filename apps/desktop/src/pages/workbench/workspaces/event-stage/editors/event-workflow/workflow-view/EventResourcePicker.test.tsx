import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { renderWithLocale } from '@test/renderWithLocale'
import { EventResourcePicker, type EventResourceOption } from './EventResourcePicker'

const OPTIONS: EventResourceOption[] = [
  {
    id: 'item:parsnip',
    value: '(O)24',
    label: 'Parsnip (O)24',
    kind: 'item',
    category: '原版资源',
    subtitle: '原版资源',
  },
  {
    id: 'item:emerald',
    value: '(O)60',
    label: 'Emerald (O)60',
    kind: 'item',
    category: '原版资源',
    subtitle: '原版资源',
  },
]

function renderPicker(onSelect = vi.fn(), selectionMode: 'immediate' | 'confirm' = 'immediate') {
  renderWithLocale(
    <EventResourcePicker
      value="(O)24"
      label="物品资源浏览器"
      placeholder="搜索物品"
      options={OPTIONS}
      selectionMode={selectionMode}
      onSelect={onSelect}
    />,
    'zh-CN',
  )
  fireEvent.click(screen.getByRole('button', { name: '物品资源浏览器: (O)24' }))
  return onSelect
}

describe('EventResourcePicker', () => {
  test('keeps existing immediate selection behavior by default', () => {
    const onSelect = renderPicker()
    const dialog = screen.getByRole('dialog', { name: '物品资源浏览器' })

    fireEvent.click(within(dialog).getByRole('button', { name: /^Emerald \(O\)60/u }))

    expect(onSelect).toHaveBeenCalledWith('(O)60')
    expect(screen.queryByRole('dialog', { name: '物品资源浏览器' })).toBeNull()
  })

  test('submits the latest draft value when confirm mode is enabled', () => {
    const onSelect = renderPicker(vi.fn(), 'confirm')
    const dialog = screen.getByRole('dialog', { name: '物品资源浏览器' })

    fireEvent.click(within(dialog).getByRole('button', { name: /^Emerald \(O\)60/u }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(within(dialog).getByText('已选择: Emerald (O)60')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: '确认选择' }))

    expect(onSelect).toHaveBeenCalledWith('(O)60')
    expect(screen.queryByRole('dialog', { name: '物品资源浏览器' })).toBeNull()
  })
})
