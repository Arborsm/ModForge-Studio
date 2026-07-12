import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { getModI18nWorkspaceCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale'
import { ModI18nWorkspace } from '@pages/workbench/workspaces/mod-i18n/view/ModI18nWorkspace'
import type { ContentPatcherI18nFile, ModProjectDetail } from '@entities/mod/api'

const copy = getModI18nWorkspaceCopy('en-US')

afterEach(() => {
  vi.clearAllMocks()
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
    capabilities: ['edit', 'save'],
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

function renderWorkspace(props: Partial<Parameters<typeof ModI18nWorkspace>[0]> = {}) {
  const i18nFiles = props.i18nFiles ?? [buildI18nFile('default', { greeting: 'Hello' }), buildI18nFile('zh', { greeting: '你好' })]
  const projectDetail = props.projectDetail ?? buildProjectDetail(i18nFiles)

  const defaults = {
    copy,
    projectDetail,
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

  renderWithLocale(<ModI18nWorkspace {...defaults} {...props} i18nFiles={i18nFiles} projectDetail={projectDetail} />)

  return { ...defaults, i18nFiles, projectDetail }
}

describe('ModI18nWorkspace', () => {
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
    renderWorkspace({ i18nFiles: [], projectDetail: buildProjectDetail([]) })

    expect(screen.queryAllByText(copy.noI18n).length).toBeGreaterThan(0)
    expect(screen.queryByText(copy.noMatchingEntries)).toBeNull()
  })
})
