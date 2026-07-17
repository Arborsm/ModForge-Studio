import { useCallback, useEffect, useMemo, useRef } from 'react'
import { TranslationWorkflow } from '@features/translation-editor'
import { ModBrowserPanel, ModWorkspaceDecisionDialogs, useModCatalog, useModTranslationWorkspace } from '../../workspaces/mod'
import { WorkbenchLayoutHost } from '../../ui/WorkbenchLayoutHost'
import { useWorkbenchRuntimeInputs } from '../../ui/module-runtimes/runtimeInputs'
import { openLocalizationCenter } from '../model/localizationNavigation'
import { requestAppSettings } from '@shared/lib/app-settings-events'

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
    () =>
      catalog.activeProjectPath
        ? [
            {
              id: 'mod-translation/workflow',
              title: catalog.activeProject?.name ?? '',
              subtitle: translation.statusMessage,
              minWidth: 900,
              minHeight: 520,
              area: 'center' as const,
              hideDockHeader: true,
              content: (
                <TranslationWorkflow
                  project={
                    translation.detail ? { name: translation.detail.summary.name, rootPath: translation.detail.summary.absolutePath } : null
                  }
                  i18nFiles={translation.files}
                  sourceLocale={translation.sourceLocale}
                  targetLocale={translation.targetLocale}
                  query={translation.query}
                  statusFilter={translation.statusFilter}
                  canPersist={translation.canPersist}
                  gameDirectory={environment.directoryInfo?.rootPath ?? null}
                  localizationContext={
                    translation.detail
                      ? {
                          projectIdentity: {
                            kind: 'installed-mod',
                            stableId: translation.detail.summary.uniqueId ?? null,
                            fallbackPath: translation.detail.summary.absolutePath,
                          },
                          displayName: translation.detail.summary.name,
                          sourceNamespace: 'i18n',
                        }
                      : null
                  }
                  onSourceLocaleChange={translation.setSourceLocale}
                  onTargetLocaleChange={translation.setTargetLocale}
                  onQueryChange={translation.setQuery}
                  onStatusFilterChange={translation.setStatusFilter}
                  onI18nFilesChange={translation.setFiles}
                  onSave={async () => {
                    await translation.save()
                  }}
                  onReload={() => void translation.requestUnsavedDecision(translation.reload)}
                  onOpenLocalizationCenter={(scopeId) => void openLocalizationCenter(scopeId, environment.onOpenModule, 'overview')}
                  onOpenAiSettings={() => requestAppSettings({ category: 'ai', aiTab: 'semantic' })}
                  onChangeProject={() => void translation.requestUnsavedDecision(() => catalog.setActiveProjectPath(null))}
                />
              ),
            },
          ]
        : [
            {
              id: 'mod-translation/projects',
              title: '',
              subtitle: catalog.statusMessage,
              minWidth: 720,
              minHeight: 520,
              area: 'center' as const,
              hideDockHeader: true,
              content: (
                <ModBrowserPanel
                  projects={catalog.projects}
                  filteredProjects={catalog.filteredProjects}
                  activeProjectPath={catalog.activeProjectPath}
                  modFilter={catalog.query}
                  contentPatcherOnly={false}
                  compatibleOnly={false}
                  i18nOnly={catalog.i18nOnly}
                  mode="i18n"
                  onFilterChange={catalog.setQuery}
                  onContentPatcherOnlyChange={() => undefined}
                  onCompatibleOnlyChange={() => undefined}
                  onI18nOnlyChange={catalog.setI18nOnly}
                  onSelectProject={(path) => void translation.requestUnsavedDecision(() => catalog.setActiveProjectPath(path))}
                  onRefreshProjects={() =>
                    void translation.requestUnsavedDecision(async () => {
                      await catalog.refresh()
                    })
                  }
                  onOpenFolder={() => void catalog.openProjectDirectory()}
                  onImportProject={() => void catalog.openProjectArchive()}
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
      />
    </>
  )
}
