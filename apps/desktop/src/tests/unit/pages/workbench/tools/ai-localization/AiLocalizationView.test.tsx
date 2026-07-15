import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import copy from '@locales/dictionaries/en-US/workbench/ai-localization'
import { AiLocalizationView } from '@pages/workbench/tools/ai-localization/ui/AiLocalizationView'
import { renderWithLocale } from '@test/renderWithLocale'

vi.mock('@pages/workbench/tools/ai-localization/ui/OfficialCorpusView', () => ({
  OfficialCorpusView: () => <div>official-content</div>,
}))
vi.mock('@pages/workbench/tools/ai-localization/ui/KnowledgeCenterView', () => ({
  KnowledgeCenterView: () => <div>knowledge-content</div>,
}))
vi.mock('@pages/workbench/tools/ai-localization/ui/QualityHistoryView', () => ({
  QualityHistoryView: () => <div>quality-content</div>,
}))
vi.mock('@pages/workbench/tools/ai-localization/ui/ProjectUsageView', () => ({
  ProjectUsageView: () => <div>usage-content</div>,
}))

describe('AiLocalizationView', () => {
  it('supports keyboard tabs, mobile regions, and Escape focus restoration for details', () => {
    const { container } = renderWithLocale(<AiLocalizationView />)
    const center = container.querySelector('.ai-localization-center')
    expect(center?.getAttribute('data-mobile-region')).toBe('content')

    const official = screen.getByRole('tab', { name: copy.officialTab })
    fireEvent.keyDown(official, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: copy.glossaryTab }).getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByRole('tab', { name: copy.scopeRegion }))
    expect(center?.getAttribute('data-mobile-region')).toBe('scope')

    const details = screen.getByRole('button', { name: copy.openDetails })
    fireEvent.click(details)
    expect(center?.getAttribute('data-details-open')).toBe('true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(center?.hasAttribute('data-details-open')).toBe(false)
    expect(document.activeElement).toBe(details)
  })
})
