import { useState } from 'react'
import type { ContentPatcherI18nFile } from '@entities/mod/api'
import { defaultTargetLocaleForAppLocale, TranslationWorkflow, type TranslationStatusFilter } from '@features/translation-editor'
import { useLocale } from '@locales/provider'
import { useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { useWorkbenchEnvironment } from '../../model/workbenchModuleContexts'
import { openLocalizationCenter } from '../model/localizationNavigation'
import { requestAppSettings } from '@shared/lib/app-settings-events'

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
  const appLocale = useLocale()
  const [sourceLocale, setSourceLocale] = useState('default')
  const [targetLocale, setTargetLocale] = useState(() => defaultTargetLocaleForAppLocale(appLocale))
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
    <TranslationWorkflow
      project={activeDraft ? { name: activeDraft.projectMetadata.projectName, rootPath: activeDraft.draftStorageKey } : null}
      i18nFiles={files}
      sourceLocale={sourceLocale}
      targetLocale={targetLocale}
      query={query}
      statusFilter={statusFilter}
      canPersist={Boolean(activeDraft)}
      gameDirectory={environment.directoryInfo?.rootPath ?? null}
      localizationContext={
        activeDraft
          ? {
              projectIdentity: {
                kind: 'cp-maker',
                stableId: activeDraft.projectMetadata.projectUniqueId || null,
                fallbackPath: activeDraft.draftStorageKey,
              },
              displayName: activeDraft.projectMetadata.projectName,
              sourceNamespace: 'i18n',
            }
          : null
      }
      onSourceLocaleChange={setSourceLocale}
      onTargetLocaleChange={setTargetLocale}
      onQueryChange={setQuery}
      onStatusFilterChange={setStatusFilter}
      onI18nFilesChange={(next) => project.setI18nFiles(next.map(({ locale, rawJson }) => ({ locale, rawJson })))}
      onSave={async () => {
        await project.saveDraft()
      }}
      onReload={environment.onReloadProject}
      onOpenLocalizationCenter={(scopeId) => void openLocalizationCenter(scopeId, environment.onOpenModule, 'overview')}
      onOpenAiSettings={() => requestAppSettings({ category: 'ai', aiTab: 'semantic' })}
    />
  )
}
