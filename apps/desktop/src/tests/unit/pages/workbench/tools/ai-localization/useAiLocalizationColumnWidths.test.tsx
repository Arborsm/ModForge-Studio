import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  ResizableColumnHeader,
  useAiLocalizationColumnWidths,
} from '@pages/workbench/tools/ai-localization/model/useAiLocalizationColumnWidths'
import { getAppUiStateSnapshot } from '@shared/lib/app-state'

function Fixture() {
  const columns = useAiLocalizationColumnWidths('test-table', { source: 180 })
  return (
    <table>
      <thead>
        <tr>
          <ResizableColumnHeader
            column="source"
            width={columns.widths.source}
            resizeLabel="Resize source column"
            setWidth={columns.setWidth}
          >
            Source
          </ResizableColumnHeader>
        </tr>
      </thead>
    </table>
  )
}

describe('AI localization column widths', () => {
  afterEach(() => vi.useRealTimers())

  it('supports keyboard resizing and persists the width', async () => {
    vi.useFakeTimers()
    render(<Fixture />)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize source column' }), { key: 'ArrowRight' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(550)
    })
    expect(getAppUiStateSnapshot().workspace.modules['ai-localization/columns/test-table']?.value).toEqual({ source: 192 })
  })
})
