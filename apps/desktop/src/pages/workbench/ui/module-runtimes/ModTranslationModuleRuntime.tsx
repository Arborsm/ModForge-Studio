import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TranslationEditor } from '@features/translation-editor'
import { ModBrowserPanel, ModWorkspaceDecisionDialogs, useModCatalog, useModTranslationWorkspace } from '../../workspaces/mod'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'

export default function ModTranslationModuleRuntime() {
  const { environment, moduleState } = useWorkbenchRuntimeInputs()
  const catalog = useModCatalog({ directoryInfo: environment.directoryInfo, mode: 'translation' })
  const translation = useModTranslationWorkspace(catalog.activeProjectPath)
  const requestDecisionRef = useRef(translation.requestUnsavedDecision)
  requestDecisionRef.current = translation.requestUnsavedDecision
  const requestUnsavedChangeDecision = useCallback((action: () => void | Promise<void>) => requestDecisionRef.current(action), [])
  useEffect(() => {
    moduleState.onUnsavedGuardChange({
      hasUnsavedChanges: translation.dirty,
      hasPendingUnsavedDecision: Boolean(translation.pendingDecision),
      requestUnsavedChangeDecision,
    })
    return () => moduleState.onUnsavedGuardChange(null)
  }, [moduleState.onUnsavedGuardChange, requestUnsavedChangeDecision, translation.dirty, translation.pendingDecision])
  const panels = useMemo(
    () => [
      {
        id: 'mod-translation/projects',
        title: catalog.activeProject?.name ?? '',
        subtitle: catalog.statusMessage,
        minWidth: 320,
        minHeight: 320,
        defaultDock: 'left-top' as const,
        content: (
          <ModBrowserPanel
            projects={catalog.projects}
            filteredProjects={catalog.filteredProjects}
            activeProjectPath={catalog.activeProjectPath}
            modFilter={catalog.query}
            contentPatcherOnly={false}
            compatibleOnly={false}
            i18nOnly
            mode="i18n"
            onFilterChange={catalog.setQuery}
            onContentPatcherOnlyChange={() => undefined}
            onCompatibleOnlyChange={() => undefined}
            onI18nOnlyChange={() => undefined}
            onSelectProject={(path) => void translation.requestUnsavedDecision(() => catalog.setActiveProjectPath(path))}
            onRefreshProjects={() =>
              void translation.requestUnsavedDecision(async () => {
                await catalog.refresh()
              })
            }
          />
        ),
      },
      {
        id: 'mod-translation/workspace',
        title: catalog.activeProject?.name ?? '',
        subtitle: translation.statusMessage,
        minWidth: 900,
        minHeight: 520,
        defaultDock: 'center' as const,
        hideDockHeader: true,
        content: (
          <TranslationEditor
            project={
              translation.detail ? { name: translation.detail.summary.name, rootPath: translation.detail.summary.absolutePath } : null
            }
            i18nFiles={translation.files}
            sourceLocale={translation.sourceLocale}
            targetLocale={translation.targetLocale}
            query={translation.query}
            statusFilter={translation.statusFilter}
            canPersist={translation.canPersist}
            onSourceLocaleChange={translation.setSourceLocale}
            onTargetLocaleChange={translation.setTargetLocale}
            onQueryChange={translation.setQuery}
            onStatusFilterChange={translation.setStatusFilter}
            onI18nFilesChange={translation.setFiles}
            onSave={() => void translation.save()}
            onReload={() => void translation.requestUnsavedDecision(translation.reload)}
          />
        ),
      },
    ],
    [catalog, translation],
  )
  return (
    <>
      <ModWorkspaceDecisionDialogs
        pendingUnsavedChangeDecision={translation.pendingDecision}
        onConfirmUnsavedSaveAndContinue={() => void translation.confirmSaveAndContinue()}
        onConfirmUnsavedDiscardAndContinue={() => void translation.confirmDiscardAndContinue()}
        onCancelUnsavedChangeDecision={translation.cancelDecision}
      />
      <WorkbenchLayoutHost
        workspaceLayoutRef={moduleState.layoutRef}
        workspaceLayoutStorageKey={moduleState.persistenceKey}
        workspaceLayouts={moduleState.layouts}
        workspacePanels={panels}
        onPersistStateChange={moduleState.onPersistStateChange}
        onLayoutMetaChange={moduleState.onLayoutMetaChange}
      />
    </>
  )
}
