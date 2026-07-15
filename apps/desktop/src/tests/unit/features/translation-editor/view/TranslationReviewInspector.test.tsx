import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { TranslationReviewInspector } from '@features/translation-editor/view/TranslationReviewInspector'
import { LocaleProvider } from '@locales/provider'
import { renderWithLocale } from '@test/renderWithLocale'

const baseProps = {
  result: null,
  selectedId: null,
  checked: new Set<string>(),
  onSelect: vi.fn(),
  onChecked: vi.fn(),
  onUpdate: vi.fn(async () => undefined),
  running: false,
  error: null,
  onReviewCurrent: vi.fn(),
  onClose: vi.fn(),
}

describe('TranslationReviewInspector', () => {
  it('distinguishes not-run, running, passed, and failed states', () => {
    const onReviewCurrent = vi.fn()
    const view = renderWithLocale(<TranslationReviewInspector {...baseProps} onReviewCurrent={onReviewCurrent} />)
    fireEvent.click(screen.getByRole('button', { name: 'Review current item' }))
    expect(onReviewCurrent).toHaveBeenCalledTimes(1)

    view.rerender(
      <LocaleProvider locale="en-US">
        <TranslationReviewInspector {...baseProps} running />
      </LocaleProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Review is running...')

    view.rerender(
      <LocaleProvider locale="en-US">
        <TranslationReviewInspector
          {...baseProps}
          result={{
            usageRecordState: 'unavailable',
            run: {
              id: 'run',
              scopeId: 'scope',
              sourceLocale: 'en-US',
              targetLocale: 'zh-CN',
              engine: 'local',
              status: 'completed',
              createdAtMs: 0,
              summary: {
                checked: 1,
                passed: 1,
                total: 0,
                open: 0,
                ignored: 0,
                accepted: 0,
                stale: 0,
                minor: 0,
                major: 0,
                critical: 0,
                warnings: 0,
              },
            },
            issues: [],
          }}
        />
      </LocaleProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('No issues found.')

    view.rerender(
      <LocaleProvider locale="en-US">
        <TranslationReviewInspector {...baseProps} error="Review could not be completed." />
      </LocaleProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Review could not be completed.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
