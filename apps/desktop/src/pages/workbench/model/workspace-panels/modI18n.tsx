import { ModI18nWorkspace } from '../../workspaces/mod-i18n'
import { ModBrowserPanel } from '../../workspaces/mod'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import type { WorkspacePanelConfig } from '@shared/contracts'
import type { BuildWorkspacePanelsOptions } from './types'

export function buildModI18nWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const {
    copy,
    modI18nCopy,
    modProjects,
    filteredModProjects,
    activeProjectPath,
    modFilter,
    contentPatcherOnly,
    compatibleOnly,
    onModFilterChange,
    onContentPatcherOnlyChange,
    onCompatibleOnlyChange,
    onSelectModProject,
    onImportModProject,
    onRefreshModProjects,
    activeModProjectDetail,
    modI18nFiles,
    modI18nSourceLocale,
    modI18nTargetLocale,
    modI18nQuery,
    modI18nStatusFilter,
    modCanPersist,
    onModI18nSourceLocaleChange,
    onModI18nTargetLocaleChange,
    onModI18nQueryChange,
    onModI18nStatusFilterChange,
    onModI18nFilesChange,
    onSaveModProject,
  } = options

  return [
    {
      id: 'mod-i18n-projects',
      title: modI18nCopy.projectLabel,
      subtitle: modI18nCopy.workspaceSubtitle,
      minWidth: 320,
      minHeight: 320,
      dockMinHeight: 240,
      defaultDock: 'left-top',
      defaultDockHeight: 760,
      content: (
        <LoadingMotionReveal itemId="workbench-mod-i18n-projects" index={0} className="h-full min-h-0">
          <ModBrowserPanel
            projects={modProjects}
            filteredProjects={filteredModProjects}
            activeProjectPath={activeProjectPath}
            modFilter={modFilter}
            contentPatcherOnly={contentPatcherOnly}
            compatibleOnly={compatibleOnly}
            onFilterChange={onModFilterChange}
            onContentPatcherOnlyChange={onContentPatcherOnlyChange}
            onCompatibleOnlyChange={onCompatibleOnlyChange}
            onSelectProject={onSelectModProject}
            onImportProject={onImportModProject}
            onRefreshProjects={onRefreshModProjects}
          />
        </LoadingMotionReveal>
      ),
    },
    {
      id: 'mod-i18n-workspace',
      title: modI18nCopy.workspaceLabel,
      subtitle: activeModProjectDetail?.summary.name ?? copy.common.none,
      hideDockHeader: true,
      shellClassName: 'workspace-panel-shell-flat',
      minWidth: 720,
      minHeight: 520,
      defaultDock: 'center',
      defaultDockHeight: 760,
      content: (
        <LoadingMotionReveal itemId="workbench-mod-i18n-workspace" index={0} className="h-full min-h-0">
          <ModI18nWorkspace
            copy={modI18nCopy}
            projectDetail={activeModProjectDetail}
            i18nFiles={modI18nFiles}
            sourceLocale={modI18nSourceLocale}
            targetLocale={modI18nTargetLocale}
            query={modI18nQuery}
            statusFilter={modI18nStatusFilter}
            canPersist={modCanPersist}
            onSourceLocaleChange={onModI18nSourceLocaleChange}
            onTargetLocaleChange={onModI18nTargetLocaleChange}
            onQueryChange={onModI18nQueryChange}
            onStatusFilterChange={onModI18nStatusFilterChange}
            onI18nFilesChange={onModI18nFilesChange}
            onSave={onSaveModProject}
          />
        </LoadingMotionReveal>
      ),
    },
  ]
}
