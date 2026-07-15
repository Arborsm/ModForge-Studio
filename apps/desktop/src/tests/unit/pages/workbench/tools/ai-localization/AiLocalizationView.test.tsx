import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import copy from '@locales/dictionaries/en-US/workbench/ai-localization'
import { AiLocalizationView } from '@pages/workbench/tools/ai-localization/ui/AiLocalizationView'
import { renderWithLocale } from '@test/renderWithLocale'

vi.mock('@entities/localization', () => ({
  useLocalization: () => ({
    listScopes: vi.fn(async () => ({
      records: [
        {
          id: 'global',
          kind: 'global',
          name: 'Global knowledge',
          revision: 0,
          createdAtMs: 0,
          updatedAtMs: 0,
          lastUsedAtMs: 0,
          bindingKind: null,
          bindingValue: null,
        },
      ],
      total: 1,
    })),
    listGlossary: vi.fn(async () => ({ records: [], total: 0 })),
    searchMemory: vi.fn(async () => ({ records: [], total: 0 })),
    listReviewRuns: vi.fn(async () => ({ records: [], total: 0 })),
    loadScope: vi.fn(async () => ({
      scope: { id: 'global' },
      settings: {
        scopeId: 'global',
        defaultEngineKind: null,
        defaultEngineProfileId: null,
        reviewProfileId: null,
        knowledgePolicy: { enabled: true, useOfficialCorpus: true, useGlobalKnowledge: true, useProjectKnowledge: true },
        autoReview: false,
        qaConfig: { checkEmpty: true, checkLanguageMix: true, checkWhitespace: true, checkLineBreaks: true, checkLength: true },
      },
    })),
    loadMachineTranslationSettings: vi.fn(async () => ({ profiles: [] })),
    chooseKnowledgeImport: vi.fn(async () => null),
    chooseKnowledgeExport: vi.fn(async () => null),
  }),
}))
vi.mock('@entities/ai', () => ({
  useAi: () => ({ loadSettings: vi.fn(async () => ({ profiles: [] })) }),
}))

vi.mock('@pages/workbench/tools/ai-localization/ui/OfficialCorpusView', () => ({
  OfficialCorpusView: () => <div>official-content</div>,
}))
vi.mock('@pages/workbench/tools/ai-localization/ui/KnowledgeCenterView', () => ({
  KnowledgeCenterView: () => <div>knowledge-content</div>,
}))
vi.mock('@pages/workbench/tools/ai-localization/ui/QualityHistoryView', () => ({
  QualityHistoryView: () => <div>quality-content</div>,
}))
describe('AiLocalizationView', () => {
  it('organizes four function tabs and routes knowledge sub-tabs without exposing project usage', async () => {
    const { container } = renderWithLocale(<AiLocalizationView />)
    const center = container.querySelector('.ai-localization-center')
    expect(center?.getAttribute('data-mobile-region')).toBe('content')

    // 四个职能 tab：总览 / 知识库 / 官方语料 / 质量
    const overview = screen.getByRole('tab', { name: copy.overviewTab })
    expect(screen.getByRole('tab', { name: copy.knowledgeTab })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: copy.officialTab })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: copy.qualityTab })).toBeInTheDocument()
    expect((await screen.findAllByText(copy.globalScope)).length).toBeGreaterThan(0)
    expect(await screen.findByText(copy.defaultEngine)).toBeInTheDocument()

    // 语言对切换
    const sourceLocale = screen.getByRole('button', { name: /Source locale:/i })
    fireEvent.click(sourceLocale)
    fireEvent.click(screen.getByRole('option', { name: 'ja-JP' }))
    expect(screen.getByRole('button', { name: 'Source locale: ja-JP' })).toBeInTheDocument()

    // 键盘在职能 tab 间移动：总览 → 知识库
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: copy.knowledgeTab }).getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('tab', { name: 'Project usage' })).not.toBeInTheDocument()

    // 知识库内部分段器：术语 / 翻译记忆 / 风格
    expect(await screen.findByRole('tab', { name: copy.glossaryTab })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: copy.memoryTab }))
    expect(screen.getByRole('tab', { name: copy.memoryTab }).getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByRole('tab', { name: copy.scopeRegion }))
    expect(center?.getAttribute('data-mobile-region')).toBe('scope')
  })
})
