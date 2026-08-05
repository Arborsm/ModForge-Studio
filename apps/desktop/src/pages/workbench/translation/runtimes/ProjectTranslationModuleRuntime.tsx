import { useState } from 'react'
import { Languages } from 'lucide-react'
import type { ContentPatcherI18nFile } from '@entities/mod/api'
import { buildI18nExtraction } from '@features/cp-maker'
import { defaultTargetLocaleForAppLocale, TranslationWorkflow, type TranslationStatusFilter } from '@features/translation-editor'
import { useLocale, useTranslationEditorCopy } from '@locales/provider'
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
  const copy = useTranslationEditorCopy()
  const [sourceLocale, setSourceLocale] = useState('default')
  const [targetLocale, setTargetLocale] = useState(() => defaultTargetLocaleForAppLocale(appLocale))
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TranslationStatusFilter>('all')
  const [bootstrapping, setBootstrapping] = useState(false)
  const activeDraft = project.activeDraft
  const files: ContentPatcherI18nFile[] = project.i18nFiles.map((file) => ({
    ...file,
    path: `${activeDraft?.draftStorageKey ?? ''}/i18n/${file.locale}.json`,
    relativePath: `i18n/${file.locale}.json`,
    entryCount: countEntries(file.rawJson),
  }))

  // Bootstrap: a fresh draft has no i18n files at all, so the workflow can
  // never start. Offer to extract the authored text into `default.json`.
  if (activeDraft && project.i18nFiles.length === 0) {
    const extraction = buildI18nExtraction(activeDraft)
    async function handleBootstrap() {
      setBootstrapping(true)
      try {
        for (const [patchId, editorState] of extraction.editorStates) {
          project.updatePatch(patchId, { editorState })
        }
        project.upsertI18nEntries('default', extraction.entries)
        if (extraction.rewrittenCount === 0) {
          project.upsertI18nEntries('default', {})
        }
        await project.saveDraft()
      } finally {
        setBootstrapping(false)
      }
    }
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-6">
        <div className="border-border-subtle bg-surface-panel w-full max-w-lg rounded-lg border p-6">
          <Languages className="text-accent h-6 w-6" />
          <h1 className="text-text-primary mt-2 text-base font-medium">{copy.bootstrapTitle}</h1>
          <p className="text-text-secondary mt-2 text-sm">{copy.bootstrapDescription}</p>
          <p className="text-text-secondary mt-3 text-sm">
            {extraction.rewrittenCount > 0 ? copy.bootstrapFound(extraction.rewrittenCount) : copy.bootstrapEmpty}
          </p>
          <button
            type="button"
            className="control-button control-button-primary mt-4"
            disabled={bootstrapping}
            onClick={() => void handleBootstrap()}
          >
            {bootstrapping ? copy.bootstrapRunning : copy.bootstrapAction}
          </button>
        </div>
      </div>
    )
  }

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
