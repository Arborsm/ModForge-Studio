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

function createOptions(count: number): EventResourceOption[] {
  return Array.from({ length: count }, (_, index) => {
    const itemNumber = index + 1
    return {
      id: `item:${itemNumber}`,
      value: itemNumber === 1 ? '(O)24' : `(O)${itemNumber}`,
      label: `Resource ${itemNumber}`,
      kind: 'item',
      category: '原版资源',
      subtitle: '原版资源',
    }
  })
}

function renderPicker(onSelect = vi.fn(), selectionMode: 'immediate' | 'confirm' = 'immediate', options: EventResourceOption[] = OPTIONS) {
  renderWithLocale(
    <EventResourcePicker
      value="(O)24"
      label="物品资源浏览器"
      placeholder="搜索物品"
      options={options}
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

  test('shows 9 resources per page by default', () => {
    renderPicker(vi.fn(), 'immediate', createOptions(820))
    const dialog = screen.getByRole('dialog', { name: '物品资源浏览器' })

    expect(within(dialog).getByText('第 1-9 条，共 820 条')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '每页: 9 个' })).toBeTruthy()
    expect(dialog.querySelectorAll('.resource-picker__item-card')).toHaveLength(9)
    expect(within(dialog).getByText('第 1 / 92 页')).toBeTruthy()
  })

  test('changes resource page size from the footer control', () => {
    renderPicker(vi.fn(), 'immediate', createOptions(820))
    const dialog = screen.getByRole('dialog', { name: '物品资源浏览器' })

    fireEvent.click(within(dialog).getByRole('button', { name: '每页: 9 个' }))
    const pageSizeOption = screen.getByRole('option', { name: '18 个' })
    fireEvent.mouseDown(pageSizeOption)
    fireEvent.click(pageSizeOption)

    expect(screen.getByRole('dialog', { name: '物品资源浏览器' })).toBeTruthy()
    expect(within(dialog).getByText('第 1-18 条，共 820 条')).toBeTruthy()
    expect(dialog.querySelectorAll('.resource-picker__item-card')).toHaveLength(18)
    expect(within(dialog).getByText('第 1 / 46 页')).toBeTruthy()
  })

  test('only closes from explicit actions instead of outside pointer down', () => {
    renderPicker(vi.fn(), 'immediate', createOptions(30))

    fireEvent.mouseDown(document.body)

    expect(screen.getByRole('dialog', { name: '物品资源浏览器' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(screen.queryByRole('dialog', { name: '物品资源浏览器' })).toBeNull()
  })

  test('does not render an ellipsis for a single-page pagination gap', () => {
    renderPicker(vi.fn(), 'immediate', createOptions(820))
    const dialog = screen.getByRole('dialog', { name: '物品资源浏览器' })

    fireEvent.click(within(dialog).getByRole('button', { name: '4' }))

    const pagination = within(dialog).getByRole('navigation', { name: '第 4 / 92 页' })
    const paginationText = pagination.textContent ?? ''
    expect(paginationText).not.toMatch(/1\.\.\.3/u)
    expect(paginationText).toContain('12345')
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
