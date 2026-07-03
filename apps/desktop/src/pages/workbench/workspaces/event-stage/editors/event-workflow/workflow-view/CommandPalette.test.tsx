import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { getEditorCopy } from '@locales/api'
import { CommandPalette } from './CommandPalette'

function renderPalette(locale: 'zh-CN' | 'en-US') {
  return render(
    <CommandPalette open locale={locale} copy={getEditorCopy(locale).eventStage.workflow} onClose={vi.fn()} onSelect={vi.fn()} />,
  )
}

describe('CommandPalette locale copy', () => {
  it('renders command labels from the active locale bundle', () => {
    renderPalette('zh-CN')

    const speakCommand = screen.getByText('speak').closest('button')
    expect(speakCommand).toBeTruthy()
    expect(within(speakCommand as HTMLElement).getAllByText('对话').length).toBeGreaterThan(0)
    expect(screen.queryByText('Speak')).toBeNull()
  })

  it('searches command labels in the active locale', () => {
    renderPalette('en-US')

    fireEvent.change(screen.getByPlaceholderText('Search commands or browse by category...'), {
      target: { value: 'Speak' },
    })

    const results = screen.getByText('Speak').closest('button')
    expect(results).toBeTruthy()
    expect(within(results as HTMLElement).getByText('speak')).toBeTruthy()
    expect(screen.queryByText('Emote')).toBeNull()
  })
})
