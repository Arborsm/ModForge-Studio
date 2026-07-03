import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { localeBundles } from '@locales'
import { EventGameStateQueryBuilderModal } from './EventGameStateQueryBuilderModal'

const hubCopy = localeBundles['zh-CN'].editor.studioDesk.eventPatchHub

describe('EventGameStateQueryBuilderModal', () => {
  test('renders GameStateQuery choices as event-condition style visual cards', () => {
    const onApply = vi.fn()
    render(
      <EventGameStateQueryBuilderModal
        copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
        hubCopy={hubCopy}
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    )

    const timeCard = screen
      .getAllByText('检查当前时间是否位于 600 到 2600 的 26 小时时钟范围内。')
      .map((node) => node.closest('.condition-catalog-option'))
      .find(Boolean)
    expect(timeCard).toBeTruthy()
    expect(document.body.querySelector('.game-state-query-definition-list')).toBeNull()
    expect(document.body.querySelector('.game-state-query-editor-card')).toBeNull()

    fireEvent.click(within(timeCard as HTMLElement).getByRole('button', { name: '加入条件' }))
    fireEvent.click(screen.getByRole('button', { name: '加入查询' }))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'TIME 1900 2300',
      }),
    )
  })

  test('keeps the upper catalog scoped and leaves ANY grouping in the dock', () => {
    render(
      <EventGameStateQueryBuilderModal
        copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
        hubCopy={hubCopy}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '世界' })).toHaveClass('active')
    expect(screen.queryByText('任一条件')).toBeNull()
    expect(screen.queryByRole('button', { name: '逻辑' })).toBeNull()
    expect(screen.getByText('ANY 分支池')).toBeTruthy()
  })

  test('mounts preview and confirm actions outside the modal like event conditions', () => {
    render(
      <EventGameStateQueryBuilderModal
        copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
        hubCopy={hubCopy}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const previewDock = document.body.querySelector('.condition-builder-preview-dock.game-state-query-preview-dock')
    expect(previewDock).toBeTruthy()
    expect(previewDock?.closest('.game-state-query-modal')).toBeNull()
    expect(previewDock?.querySelector('.condition-builder-previews')).toBeTruthy()
    expect(within(previewDock as HTMLElement).getByRole('button', { name: '加入查询' })).toBeTruthy()
    expect(within(previewDock as HTMLElement).getByText('代码预览')).toBeTruthy()
  })

  test('mounts logic chain controls outside the modal above the preview dock', () => {
    render(
      <EventGameStateQueryBuilderModal
        copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
        hubCopy={hubCopy}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const chainDock = document.body.querySelector('.condition-builder-chain-dock.game-state-query-chain-dock')
    expect(chainDock).toBeTruthy()
    expect(chainDock?.closest('.game-state-query-modal')).toBeNull()
    expect(within(chainDock as HTMLElement).getByText('主逻辑链')).toBeTruthy()
    expect(within(chainDock as HTMLElement).getByText('ANY 分支池')).toBeTruthy()
  })

  test('uses translated condition chips and hides empty-field placeholder text', () => {
    render(
      <EventGameStateQueryBuilderModal
        copy={hubCopy.conditionBuilder.gameStateQueryBuilder}
        hubCopy={hubCopy}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByText('这个 Query 不需要额外字段，直接加入即可')).toBeNull()

    const timeCard = screen
      .getAllByText('检查当前时间是否位于 600 到 2600 的 26 小时时钟范围内。')
      .map((node) => node.closest('.condition-catalog-option'))
      .find(Boolean)
    fireEvent.click(within(timeCard as HTMLElement).getByRole('button', { name: '加入条件' }))

    const chainDock = document.body.querySelector('.condition-builder-chain-dock.game-state-query-chain-dock')
    expect(chainDock?.querySelector('.condition-chip')).toBeTruthy()
    expect(within(chainDock as HTMLElement).getByText('19:00 - 23:00')).toBeTruthy()
    expect(within(chainDock as HTMLElement).queryByText('TIME 1900 2300')).toBeNull()
  })
})
