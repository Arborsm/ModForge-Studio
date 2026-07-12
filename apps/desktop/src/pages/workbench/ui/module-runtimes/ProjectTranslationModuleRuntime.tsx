import { useState } from 'react'
import type { ContentPatcherI18nFile } from '@entities/mod/api'
import { TranslationEditor, type TranslationStatusFilter } from '@features/translation-editor'
import { useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { useWorkbenchEnvironment } from '../../model/workbenchModuleContexts'

function countEntries(rawJson: string) {
  try {
    const value = JSON.parse(rawJson) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
  } catch {
    return 0
  }
}

export default function ProjectTranslationModuleRuntime() {
  const project = useWorkbenchProject()
  const environment = useWorkbenchEnvironment()
  const [sourceLocale, setSourceLocale] = useState('default')
  const [targetLocale, setTargetLocale] = useState('zh-CN')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TranslationStatusFilter>('all')
  const activeDraft = project.activeDraft
  const files: ContentPatcherI18nFile[] = project.i18nFiles.map((file) => ({
    ...file,
    path: `${activeDraft?.draftStorageKey ?? ''}/i18n/${file.locale}.json`,
    relativePath: `i18n/${file.locale}.json`,
    entryCount: countEntries(file.rawJson),
  }))
  return (
    <TranslationEditor
      project={activeDraft ? { name: activeDraft.projectMetadata.projectName, rootPath: activeDraft.draftStorageKey } : null}
      i18nFiles={files}
      sourceLocale={sourceLocale}
      targetLocale={targetLocale}
      query={query}
      statusFilter={statusFilter}
      canPersist={Boolean(activeDraft)}
      onSourceLocaleChange={setSourceLocale}
      onTargetLocaleChange={setTargetLocale}
      onQueryChange={setQuery}
      onStatusFilterChange={setStatusFilter}
      onI18nFilesChange={(next) => project.setI18nFiles(next.map(({ locale, rawJson }) => ({ locale, rawJson })))}
      onSave={() => void project.saveDraft()}
      onReload={environment.onReloadProject}
    />
  )
}
