import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { getTranslationEditorCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale'
import { TranslationEditor } from '@features/translation-editor/view/TranslationEditor'
import type { ContentPatcherI18nFile, ModProjectDetail } from '@entities/mod/api'
import { AiProvider } from '@entities/ai'
import type { AiPort, AiTranslateBatchRequest, AiTranslateBatchResult } from '@shared/contracts'
import { clearNotifications, NotificationProvider } from '@shared/ui/notifications'

const copy = getTranslationEditorCopy('en-US')

afterEach(() => {
  vi.clearAllMocks()
  clearNotifications()
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

function renderWorkspace(props: Partial<Parameters<typeof TranslationEditor>[0]> = {}, ai = createAiPort()) {
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
    onSourceLocaleChange: vi.fn(),
    onTargetLocaleChange: vi.fn(),
    onQueryChange: vi.fn(),
    onStatusFilterChange: vi.fn(),
    onI18nFilesChange: vi.fn(),
    onSave: vi.fn(),
  }

  renderWithLocale(
    <NotificationProvider>
      <AiProvider port={ai}>
        <TranslationEditor {...defaults} {...props} i18nFiles={i18nFiles} project={project} />
      </AiProvider>
    </NotificationProvider>,
  )

  return { ...defaults, i18nFiles, projectDetail, ai }
}

describe('TranslationEditor', () => {
  it('switches target language to an existing file', () => {
    const i18nFiles = [
      buildI18nFile('default', { greeting: 'Hello' }),
      buildI18nFile('zh', { greeting: '你好' }),
      buildI18nFile('fr', { greeting: 'Bonjour' }),
    ]
    const { onTargetLocaleChange } = renderWorkspace({ i18nFiles, targetLocale: 'zh' })

    fireEvent.click(screen.getByRole('button', { name: /Target: Chinese/ }))
    fireEvent.click(screen.getByRole('option', { name: /French/ }))

    expect(onTargetLocaleChange).toHaveBeenCalledTimes(1)
    expect(onTargetLocaleChange).toHaveBeenCalledWith('fr')
  })

  it('creates a missing target language file when selected', () => {
    const { onTargetLocaleChange, onI18nFilesChange, i18nFiles } = renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: /Target: Chinese/ }))
    fireEvent.click(screen.getByRole('option', { name: /English/ }))

    expect(onTargetLocaleChange).toHaveBeenCalledTimes(1)
    expect(onTargetLocaleChange).toHaveBeenCalledWith('en')

    expect(onI18nFilesChange).toHaveBeenCalledTimes(1)
    const nextFiles = onI18nFilesChange.mock.calls[0][0] as ContentPatcherI18nFile[]
    expect(nextFiles).toHaveLength(i18nFiles.length + 1)
    expect(nextFiles.some((file) => file.locale === 'en')).toBe(true)
  })

  it('switches source language to another existing file', () => {
    const { onSourceLocaleChange } = renderWorkspace({ targetLocale: 'en' })

    fireEvent.click(screen.getByRole('button', { name: /Source: Default/ }))
    fireEvent.click(screen.getByRole('option', { name: /Chinese/ }))

    expect(onSourceLocaleChange).toHaveBeenCalledTimes(1)
    expect(onSourceLocaleChange).toHaveBeenCalledWith('zh')
  })

  it('shows a filter-specific empty message when a status pill has no matches', () => {
    renderWorkspace({ statusFilter: 'missing' })

    expect(screen.queryAllByText(copy.noMatchingEntries).length).toBeGreaterThan(0)
    expect(screen.queryByText(copy.noI18n)).toBeNull()
  })

  it('shows the no-i18n-files message only when the project truly has no entries', () => {
    const detail = buildProjectDetail([])
    renderWorkspace({ i18nFiles: [], project: { name: detail.summary.name, rootPath: detail.summary.absolutePath } })

    expect(screen.queryAllByText(copy.noI18n).length).toBeGreaterThan(0)
    expect(screen.queryByText(copy.noMatchingEntries)).toBeNull()
  })

  it('fills only missing entries into the unsaved draft', async () => {
    const i18nFiles = [buildI18nFile('default', { greeting: 'Hello', farewell: 'Goodbye' }), buildI18nFile('zh', { greeting: '你好' })]
    const { onI18nFilesChange, onSave } = renderWorkspace({ i18nFiles })
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
    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateAll }))
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

    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateAll }))

    await waitFor(() => expect(onI18nFilesChange).toHaveBeenCalledTimes(1))
    const next = (onI18nFilesChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as ContentPatcherI18nFile[]
    expect(JSON.parse(next.find((file) => file.locale === 'zh')?.rawJson ?? '{}')).toEqual({ farewell: '再见', greeting: 'AI:Hello' })
    expect(screen.getAllByText('farewell').length).toBeGreaterThan(1)
    expect(screen.getByText(copy.aiPartialFailed(1))).toBeTruthy()
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

    fireEvent.click(screen.getByText(copy.aiTranslate))
    fireEvent.click(screen.getByRole('button', { name: copy.aiTranslateCurrent }))
    fireEvent.click(await screen.findByRole('button', { name: copy.aiCancel }))
    rejectTranslation?.(new Error('AI_ERROR::cancelled::AI translation was cancelled.'))

    await waitFor(() => expect(screen.queryByText('AI translation failed')).toBeNull())
    expect(ai.cancelJob).toHaveBeenCalled()
  })
})
