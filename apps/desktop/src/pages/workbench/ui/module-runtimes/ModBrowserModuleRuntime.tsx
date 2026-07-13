import { useMemo } from 'react'
import { ModBrowserPanel, ModDiagnosticsPanel, useModCatalog, useModProjectInspection } from '../../workspaces/mod'
import { WorkbenchLayoutHost } from '../WorkbenchLayoutHost'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'

export default function ModBrowserModuleRuntime() {
  const { environment, moduleState } = useWorkbenchRuntimeInputs()
  const catalog = useModCatalog({ directoryInfo: environment.directoryInfo, mode: 'browse' })
  const inspection = useModProjectInspection(catalog.activeProjectPath, catalog.externalProject)
  const panels = useMemo(
    () => [
      {
        id: 'mod-browser/projects',
        title: catalog.activeProject?.name ?? '',
        subtitle: catalog.statusMessage,
        minWidth: 320,
        minHeight: 320,
        area: 'left' as const,
        content: (
          <ModBrowserPanel
            projects={catalog.projects}
            filteredProjects={catalog.filteredProjects}
            activeProjectPath={catalog.activeProjectPath}
            modFilter={catalog.query}
            contentPatcherOnly={catalog.contentPatcherOnly}
            compatibleOnly={catalog.compatibleOnly}
            i18nOnly={catalog.i18nOnly}
            onFilterChange={catalog.setQuery}
            onContentPatcherOnlyChange={catalog.setContentPatcherOnly}
            onCompatibleOnlyChange={catalog.setCompatibleOnly}
            onI18nOnlyChange={catalog.setI18nOnly}
            onSelectProject={catalog.setActiveProjectPath}
            onOpenFolder={() => void catalog.openProjectDirectory()}
            onOpenArchive={() => void catalog.openProjectArchive()}
            onRefreshProjects={() => void catalog.refresh()}
          />
        ),
      },
      {
        id: 'mod-browser/inspection',
        title: inspection.detail?.summary.name ?? '',
        subtitle: inspection.error ?? '',
        minWidth: 640,
        minHeight: 420,
        area: 'center' as const,
        content: (
          <ModDiagnosticsPanel
            activeProject={inspection.detail}
            diagnostics={inspection.diagnostics}
            statusMessage={inspection.error ?? catalog.statusMessage}
            contentSummary={{
              includeCount: inspection.contentSummary?.includeCount ?? 0,
              dynamicTokenCount: inspection.contentSummary?.dynamicTokenCount ?? 0,
              configKeys: inspection.contentSummary?.configKeys ?? [],
            }}
          />
        ),
      },
    ],
    [catalog, environment.onImportModProject, inspection],
  )
  return (
    <WorkbenchLayoutHost
      workspaceLayoutRef={moduleState.layoutRef}
      workspaceLayoutStorageKey={moduleState.persistenceKey}
      workspaceLayouts={moduleState.layouts}
      workspacePanels={panels}
      onPersistStateChange={moduleState.onPersistStateChange}
    />
  )
}
