import { buildStudioDeskModel } from '@features/cp-maker'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { WorkbenchHomePage } from '../WorkbenchHomePage'

/** Hosts the managed project's overview and authoring entry points. */
export default function ProjectDashboardModuleRuntime() {
  const project = useWorkbenchProject()
  const environment = useWorkbenchEnvironment()
  const studioDeskModel = buildStudioDeskModel({
    activeDraft: project.activeDraft,
    drafts: project.drafts,
    patchCountByWorkspace: project.patchCountByWorkspace,
    dirtyPatchIds: project.dirtyPatchIds,
    isDirty: project.isDirty,
  })

  return (
    <WorkbenchHomePage
      presentation="project"
      hasActiveProject={Boolean(project.activeDraft)}
      projectDirty={project.isDirty}
      gameDirectoryReady={Boolean(environment.directoryInfo)}
      studioDeskModel={studioDeskModel}
      taskSummary={{
        exportCount: studioDeskModel.gallery.projects.filter((entry) => entry.statuses.includes('export')).length,
        conflictCount: studioDeskModel.stats.conflictCount,
        directoryStatus: environment.directoryStatus,
      }}
      onProjectModuleOpen={environment.onOpenModule}
      onProjectPropertiesOpen={environment.onOpenProjectProperties}
      onProjectCreateOpen={environment.onOpenCreateProject}
      onExportProject={environment.onExportProject}
      onSaveProject={project.saveDraft}
      onGameDirectoryAction={environment.onOpenGameDirectory}
      onCloseProject={environment.onCloseProject}
    />
  )
}
