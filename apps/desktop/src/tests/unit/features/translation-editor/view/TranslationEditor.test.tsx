import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { getTranslationEditorCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale'
import { TranslationEditor } from '@features/translation-editor/view/TranslationEditor'
import type { ContentPatcherI18nFile, ModProjectDetail } from '@entities/mod/api'
import { AiProvider } from '@entities/ai'
import { LocalizationProvider } from '@entities/localization'
import type {
  AiPort,
  AiTranslateBatchRequest,
  AiTranslateBatchResult,
  LocalizationPort,
  MachineTranslationSettingsSnapshot,
} from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'

const copy = getTranslationEditorCopy('en-US')
const settleHydration = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

afterEach(() => {
  vi.clearAllMocks()
  act(() => clearNotifications())
})

function buildI18nFile(locale: string, entries: Record<string, string> = {}): ContentPatcherI18nFile {
  const rawJson = `${JSON.stringify(entries, null, 2)}\n`
  return {
    locale,
    path: `E:\\\\Mods\\\\SampleMod\\\\i18n\\\\${locale}.json`,
    relativePath: `i18n/${locale}.json`,
    rawJson,
    entryCount: Object.keys(entries).length,
  }
}

function buildProjectDetail(files: ContentPatcherI18nFile[]): ModProjectDetail {
  return {
    pluginKind: 'content-patcher',
    summary: {
      id: 'sample-mod',
      name: 'Sample Mod',
      author: 'Author',
      version: '1.0.0',
      description: null,
      uniqueId: 'Author.SampleMod',
      contentPackFor: 'Pathoschild.ContentPatcher',
      folderName: 'SampleMod',
      absolutePath: 'E:\\\\Mods\\\\SampleMod',
      manifestPath: 'E:\\\\Mods\\\\SampleMod\\\\manifest.json',
      contentPath: 'E:\\\\Mods\\\\SampleMod\\\\content.json',
      pluginKind: 'content-patcher',
      status: 'ready',
      missingRequiredDependencies: [],
      hasI18n: true,
      i18nEntryCount: files.reduce((sum, file) => sum + file.entryCount, 0),
    },
    diagnostics: [],
    contentPatcher: null,
    i18nFiles: files,
  }
}

function createAiPort(overrides: Partial<AiPort> = {}): AiPort {
  return {
    loadSettings: vi.fn(async () => ({
      version: 1,
      defaultProfileId: 'profile',
      profiles: [
        {
          id: 'profile',
          name: 'Test',
          presetId: 'openai',
          protocol: 'openai-responses',
          baseUrl: 'https://api.openai.com/v1',
          model: 'test',
          credentialEnvironment: null,
          keyConfigured: true,
          resolvedCredentialSource: 'keychain',
        },
      ],
      presets: [],
    })),
    saveSettings: vi.fn(),
    listModels: vi.fn(),
    testProfile: vi.fn(),
    translateBatch: vi.fn(async (request: AiTranslateBatchRequest) => ({
      jobId: request.jobId,
      profileId: 'profile',
      model: 'test',
      usageRecordState: 'recorded',
      knowledgeTrace: { officialMatches: 0, globalGlossaryMatches: 0, projectGlossaryMatches: 0, translationMemoryMatches: 0 },
      knowledgeRevision: 'disabled',
      items: request.items.map((item) => ({
        id: item.id,
        translatedText: `AI:${item.text}`,
        detectedLanguage: 'en',
        skippedSameLanguage: false,
      })),
    })),
    cancelJob: vi.fn(async () => undefined),
    listenToProgress: vi.fn(async () => () => undefined),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(),
    getCacheStats: vi.fn(),
    clearCache: vi.fn(),
    ...overrides,
  } as AiPort
}

function createLocalizationPort(overrides: Partial<LocalizationPort> = {}): LocalizationPort {
  return {
    loadDefaultEngine: vi.fn(async () => ({ kind: 'generative-ai', profileId: 'profile' })),
    loadMachineTranslationSettings: vi.fn(async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] })),
    translateBatch: vi.fn(),
    cancelJob: vi.fn(async () => undefined),
    resolveScope: vi.fn(async () => ({
      scope: {
        id: 'scope',
        kind: 'project',
        name: 'Project',
        revision: 0,
        createdAtMs: 0,
        updatedAtMs: 0,
        lastUsedAtMs: 0,
        bindingKind: 'installed-mod',
        bindingValue: 'Example.Mod',
      },
      settings: {
        scopeId: 'scope',
        defaultEngineKind: null,
        defaultEngineProfileId: null,
        reviewProfileId: null,
        knowledgePolicy: { enabled: false, useOfficialCorpus: true, useGlobalKnowledge: true, useProjectKnowledge: true },
        autoReview: false,
      },
    })),
    recordConfirmed: vi.fn(async () => 1),
    ...overrides,
  } as unknown as LocalizationPort
}

function renderWorkspace(
  props: Partial<Parameters<typeof TranslationEditor>[0]> = {},
  ai = createAiPort(),
  localization = createLocalizationPort({
    translateBatch: async (request) => {
      const result = await ai.translateBatch({
        jobId: request.jobId,
        profileId: request.engine.profileId,
        sourceLocale: request.sourceLocale ?? undefined,
        targetLocale: request.targetLocale,
        items: request.items,
        usageContext: request.usageContext
          ? { pageSource: 'workbench-translation', operation: request.usageContext.operation, scopeId: request.usageContext.scopeId }
          : undefined,
        knowledgePolicy: request.knowledgePolicy,
      })
      return { ...result, engine: request.engine, model: result.model, validationIssues: [] }
    },
    cancelJob: ai.cancelJob,
  }),
) {
  const i18nFiles = props.i18nFiles ?? [buildI18nFile('default', { greeting: 'Hello' }), buildI18nFile('zh', { greeting: '你好' })]
  const projectDetail = buildProjectDetail(i18nFiles)
  const project = props.project ?? { name: projectDetail.summary.name, rootPath: projectDetail.summary.absolutePath }

  const defaults = {
    project,
    i18nFiles,
    sourceLocale: 'default',
    targetLocale: 'zh',
    query: '',
    statusFilter: 'all' as const,
    canPersist: true,
    localizationContext: null,
    onSourceLocaleChange: vi.fn(),
    onTargetLocaleChange: vi.fn(),
    onQueryChange: vi.fn(),
    onStatusFilterChange: vi.fn(),
    onI18nFilesChange: vi.fn(),
    onSave: vi.fn(async () => undefined),
  }

  renderWithLocale(
    <NotificationProvider>
      <AiProvider port={ai}>
        <LocalizationProvider port={localization}>
          <TranslationEditor {...defaults} {...props} i18nFiles={i18nFiles} project={project} />
        </LocalizationProvider>
      </AiProvider>
    </NotificationProvider>,
  )

  return { ...defaults, i18nFiles, projectDetail, ai, localization }
}

describe('TranslationEditor', () => {
  it('learns confirmed translations only after the project save succeeds', async () => {
    const onSave = vi.fn(async () => undefined)
    const recordConfirmed = vi.fn(async () => 1)
    const baseLocalization = createLocalizationPort()
    const resolveScope = vi.fn((request: Parameters<LocalizationPort['resolveScope']>[0]) => baseLocalization.resolveScope(request))
    const localization = { ...baseLocalization, recordConfirmed, resolveScope } as LocalizationPort
    renderWorkspace(
      {
        onSave,
        localizationContext: {
          projectIdentity: { kind: 'installed-mod', stableId: 'Example.Mod', fallbackPath: 'C:/Mods/Example' },
          displayName: 'Example',
          sourceNamespace: 'i18n',
        },
      },
      createAiPort(),
      localization,
    )
    await settleHydration()
    expect(resolveScope).toHaveBeenCalledWith(expect.objectContaining({ bindingKind: 'installed-mod', bindingValue: 'Example.Mod' }))
    fireEvent.click(screen.getByRole('button', { name: copy.saveTranslations }))
    await waitFor(() => expect(recordConfirmed).toHaveBeenCalledTimes(1))
    expect(onSave.mock.invocationCallOrder[0]).toBeLessThan(recordConfirmed.mock.invocationCallOrder[0])
  })
  it('switches target language to an existing file', async () => {
    const i18nFiles = [
      buildI18nFile('default', { greeting: 'Hello' }),
      buildI18nFile('zh', { greeting: '你好' }),
      buildI18nFile('fr', { greeting: 'Bonjour' }),
    ]
    const { onTargetLocaleChange } = renderWorkspace({ i18nFiles, targetLocale: 'zh' })
    await settleHydration()

    fireEvent.click(screen.getByRole('button', { name: /Target: Chinese/ }))
    fireEvent.click(screen.getByRole('option', { name: /French/ }))

    expect(onTargetLocaleChange).toHaveBeenCalledTimes(1)
    expect(onTargetLocaleChange).toHaveBeenCalledWith('fr')
  })

  it('creates a missing target language file when selected', async () => {
    const { onTargetLocaleChange, onI18nFilesChange, i18nFiles } = renderWorkspace()
    await settleHydration()

    fireEvent.click(screen.getByRole('button', { name: /Target: Chinese/ }))
    fireEvent.click(screen.getByRole('option', { name: /English/ }))

    expect(onTargetLocaleChange).toHaveBeenCalledTimes(1)
    expect(onTargetLocaleChange).toHaveBeenCalledWith('en')

    expect(onI18nFilesChange).toHaveBeenCalledTimes(1)
    const nextFiles = onI18nFilesChange.mock.calls[0][0] as ContentPatcherI18nFile[]
    expect(nextFiles).toHaveLength(i18nFiles.length + 1)
    expect(nextFiles.some((file) => file.locale === 'en')).toBe(true)
  })

  it('switches source language to another existing file', async () => {
    const { onSourceLocaleChange } = renderWorkspace({ targetLocale: 'en' })
    await settleHydration()

    fireEvent.click(screen.getByRole('button', { name: /Source: Default/ }))
    fireEvent.click(screen.getByRole('option', { name: /Chinese/ }))

    expect(onSourceLocaleChange).toHaveBeenCalledTimes(1)
    expect(onSourceLocaleChange).toHaveBeenCalledWith('zh')
  })

  it('shows a filter-specific empty message when a status pill has no matches', async () => {
    renderWorkspace({ statusFilter: 'missing' })
    await settleHydration()

    expect(screen.queryAllByText(copy.noMatchingEntries).length).toBeGreaterThan(0)
    expect(screen.queryByText(copy.noI18n)).toBeNull()
  })

  it('shows the no-i18n-files message only when the project truly has no entries', async () => {
    const detail = buildProjectDetail([])
    renderWorkspace({ i18nFiles: [], project: { name: detail.summary.name, rootPath: detail.summary.absolutePath } })
    await settleHydration()

    expect(screen.queryAllByText(copy.noI18n).length).toBeGreaterThan(0)
    expect(screen.queryByText(copy.noMatchingEntries)).toBeNull()
  })

  it('fills only missing entries into the unsaved draft', async () => {
    const i18nFiles = [buildI18nFile('default', { greeting: 'Hello', farewell: 'Goodbye' }), buildI18nFile('zh', { greeting: '你好' })]
    const { onI18nFilesChange, onSave } = renderWorkspace({ i18nFiles })
    await settleHydration()
    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateMissing }))
    await waitFor(() => expect(onI18nFilesChange).toHaveBeenCalledTimes(1))
    const next = (onI18nFilesChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as ContentPatcherI18nFile[]
    expect(JSON.parse(next.find((file) => file.locale === 'zh')?.rawJson ?? '{}')).toEqual({ greeting: '你好', farewell: 'AI:Goodbye' })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('requires confirmation before translating all entries', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const ai = createAiPort()
    renderWorkspace({}, ai)
    await settleHydration()
    fireEvent.click(screen.getByText(copy.aiTranslate))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateAll }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(confirm).toHaveBeenCalledWith(copy.aiTranslateAllConfirm)
    expect(ai.translateBatch).not.toHaveBeenCalled()
  })

  it('keeps successful draft results and reports the exact failed entry', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const i18nFiles = [
      buildI18nFile('default', { farewell: 'Goodbye', greeting: 'Hello' }),
      buildI18nFile('zh', { farewell: '再见', greeting: '你好' }),
    ]
    const ai = createAiPort({
      translateBatch: vi.fn(async (request: AiTranslateBatchRequest) => {
        if (request.items.some((item) => item.id === 'farewell')) throw new Error('provider rejected farewell')
        return {
          jobId: request.jobId,
          profileId: 'profile',
          model: 'test',
          usageRecordState: 'recorded' as const,
          knowledgeTrace: { officialMatches: 0, globalGlossaryMatches: 0, projectGlossaryMatches: 0, translationMemoryMatches: 0 },
          knowledgeRevision: 'disabled',
          items: request.items.map((item) => ({
            id: item.id,
            translatedText: `AI:${item.text}`,
            detectedLanguage: 'en',
            skippedSameLanguage: false,
          })),
        }
      }),
    })
    const { onI18nFilesChange, onSave } = renderWorkspace({ i18nFiles }, ai)
    await settleHydration()

    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateAll }))

    await waitFor(() => expect(onI18nFilesChange).toHaveBeenCalledTimes(1))
    const next = (onI18nFilesChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as ContentPatcherI18nFile[]
    expect(JSON.parse(next.find((file) => file.locale === 'zh')?.rawJson ?? '{}')).toEqual({ farewell: '再见', greeting: 'AI:Hello' })
    expect(screen.getAllByText('farewell').length).toBeGreaterThan(1)
    expect(screen.getByText((content) => content.includes(copy.aiPartialFailed(1)))).toBeTruthy()
    expect(await screen.findByText('Some translations failed')).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not publish an error notification when the user cancels translation', async () => {
    let rejectTranslation: ((cause: Error) => void) | undefined
    const ai = createAiPort({
      translateBatch: vi.fn(
        (): Promise<AiTranslateBatchResult> =>
          new Promise((_, reject) => {
            rejectTranslation = reject
          }),
      ),
    })
    renderWorkspace({}, ai)
    await settleHydration()

    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateCurrent }))
    fireEvent.click(await screen.findByRole('button', { name: copy.aiCancel }))
    rejectTranslation?.(new Error('AI_ERROR::cancelled::AI translation was cancelled.'))

    await waitFor(() => expect(screen.queryByText('AI translation failed')).toBeNull())
    expect(ai.cancelJob).toHaveBeenCalled()
  })

  it('offers a per-task review option and mobile region switcher', async () => {
    const onOpenLocalizationCenter = vi.fn()
    renderWorkspace({ onOpenLocalizationCenter })
    await settleHydration()
    expect(screen.getByRole('button', { name: copy.mobileEntries })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.mobileTranslation })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: copy.review }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText(copy.aiTranslate))
    expect(screen.getByRole('checkbox', { name: copy.reviewAfterTranslation })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: copy.manageLocalizationKnowledge }))
    expect(onOpenLocalizationCenter).toHaveBeenCalledTimes(1)
  })

  it('routes a temporary machine engine and corpus override through the unified localization request', async () => {
    const saveScopeSettings = vi.fn()
    const translateBatch: LocalizationPort['translateBatch'] = vi.fn(
      async (request: Parameters<LocalizationPort['translateBatch']>[0]) => ({
        jobId: request.jobId,
        engine: request.engine,
        model: null,
        validationIssues: [],
        usageRecordState: 'recorded',
        knowledgeTrace: { officialMatches: 0, globalGlossaryMatches: 0, projectGlossaryMatches: 0, translationMemoryMatches: 0 },
        knowledgeRevision: 'disabled',
        items: request.items.map((item) => ({
          id: item.id,
          translatedText: `MT:${item.text}`,
          detectedLanguage: null,
          skippedSameLanguage: false,
        })),
      }),
    )
    const machineSettings: MachineTranslationSettingsSnapshot = {
      version: 1,
      defaultProfileId: null,
      profiles: [
        {
          id: 'deepl-profile',
          name: 'DeepL Project',
          presetId: 'deepl-free',
          protocol: 'deepl',
          baseUrl: 'https://api-free.deepl.com',
          region: null,
          enabled: true,
          defaultSourceLocale: 'en-US',
          defaultTargetLocale: 'zh-CN',
          credentialEnvironments: {},
          credentialSources: {},
        },
      ],
      presets: [
        {
          id: 'deepl-free',
          name: 'DeepL Free',
          protocol: 'deepl',
          baseUrl: 'https://api-free.deepl.com',
          credentialFields: ['apiKey'],
          capability: {
            languagesDynamic: true,
            maxItemCharacters: 1000,
            maxBatchCharacters: 5000,
            supportsHtml: true,
            supportsGlossary: false,
            usageCapability: 'provider-reported',
            authentication: 'header',
          },
        },
      ],
    }
    const localization = createLocalizationPort({
      translateBatch,
      saveScopeSettings,
      loadMachineTranslationSettings: vi.fn(async () => machineSettings),
    })
    renderWorkspace({}, createAiPort(), localization)
    await settleHydration()
    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.change(screen.getByLabelText(copy.translationEngine), { target: { value: 'machine-translation:deepl-profile' } })
    expect(screen.getByText(copy.machineTranslationKnowledgeNotice)).toBeTruthy()
    fireEvent.click(screen.getByLabelText(copy.aiKnowledgeDisabled))
    fireEvent.click(screen.getByLabelText(copy.aiOfficialCorpus))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateCurrent }))
    await waitFor(() => expect(translateBatch).toHaveBeenCalledTimes(1))
    expect(translateBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: { kind: 'machine-translation', profileId: 'deepl-profile' },
        knowledgePolicy: expect.objectContaining({ enabled: true, useOfficialCorpus: false }),
      }),
    )
    expect(saveScopeSettings).not.toHaveBeenCalled()
  })
})
