import {
  ArrowRight,
  Building2,
  CalendarClock,
  FileText,
  FolderOpen,
  GitMerge,
  Languages,
  Mail,
  Map,
  MessagesSquare,
  Package,
  Plus,
  Save,
  Settings,
  TriangleAlert,
  Upload,
  Users,
} from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskGalleryProject, StudioDeskModel, WorkspaceId } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'
import type { WorkspaceStatus } from '@entities/map'

type WorkbenchHomeTaskSummary = {
  exportCount: number
  errorCount: number
  warningCount: number
  directoryStatus: WorkspaceStatus
}

type WorkbenchHomePageProps = {
  presentation: 'home' | 'project'
  hasActiveProject: boolean
  projectDirty: boolean
  gameDirectoryReady: boolean
  studioDeskModel: StudioDeskModel
  taskSummary: WorkbenchHomeTaskSummary
  onProjectModuleOpen: (moduleId: string) => void
  onProjectCreateOpen?: () => void
  onProjectImport?: () => void | Promise<void>
  onProjectSelect?: (draftStorageKey: string) => void | Promise<void>
  onProjectDelete?: (draftStorageKey: string) => void | Promise<void>
  onProjectPropertiesOpen: () => void
  onExportProject: () => void
  onSaveProject: () => void | Promise<boolean>
  onGameDirectoryAction: () => void
  onCloseProject?: () => void
}

type ContentCountMode = 'map' | 'events' | 'characters' | 'buildings' | 'items'

function isContentWorkspaceId(value: string): value is ContentCountMode {
  return value === 'map' || value === 'events' || value === 'characters' || value === 'buildings' || value === 'items'
}

const CONTENT_MODES: ContentCountMode[] = ['map', 'events', 'characters', 'buildings', 'items']
const AUTHORING_MODULE_BY_WORKSPACE: Record<WorkspaceId, string> = {
  mods: 'project-content',
  map: 'map-authoring',
  events: 'event-authoring',
  characters: 'character-authoring',
  buildings: 'building-authoring',
  items: 'item-authoring',
  dialogue: 'dialogue-editor',
  schedules: 'schedule-editor',
  mail: 'mail-editor',
}

const PROJECT_MODULES = [
  { id: 'project-content', icon: FileText },
  { id: 'map-authoring', icon: Map },
  { id: 'event-authoring', icon: GitMerge },
  { id: 'character-authoring', icon: Users },
  { id: 'dialogue-editor', icon: MessagesSquare },
  { id: 'schedule-editor', icon: CalendarClock },
  { id: 'mail-editor', icon: Mail },
  { id: 'building-authoring', icon: Building2 },
  { id: 'item-authoring', icon: Package },
  { id: 'project-translation', icon: Languages },
  { id: 'project-settings', icon: Settings },
] as const

function getCurrentProject(model: StudioDeskModel) {
  return model.gallery.projects.find((project) => project.isCurrent) ?? null
}

function isProjectEmpty(model: StudioDeskModel) {
  if (!model.hasActiveDraft) {
    return true
  }

  const patchTotal = model.workspaceEntrypoints.reduce((sum, entry) => sum + entry.patchCount, 0)
  const statsTotal = model.stats.mapCount + model.stats.eventCount + model.stats.assetCount
  return patchTotal === 0 && statsTotal === 0 && model.recentInspirations.length === 0
}

function formatRelativeTime(
  timestamp: number | null,
  emptyLabel: string,
  editedCopy: ReturnType<typeof useEditorCopy>['studioDesk']['edited'],
) {
  if (!timestamp) {
    return emptyLabel
  }

  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) {
    return editedCopy.justNow
  }
  if (deltaMs < 3_600_000) {
    return editedCopy.minutesAgo(Math.max(1, Math.round(deltaMs / 60_000)))
  }
  if (deltaMs < 86_400_000) {
    return editedCopy.hoursAgo(Math.max(1, Math.round(deltaMs / 3_600_000)))
  }
  return editedCopy.recently
}

function getContentCount(model: StudioDeskModel, mode: ContentCountMode) {
  if (mode === 'map') {
    return model.stats.mapCount || model.workspaceEntrypoints.find((entry) => entry.workspaceId === 'map')?.patchCount || 0
  }
  if (mode === 'events') {
    return model.stats.eventCount || model.workspaceEntrypoints.find((entry) => entry.workspaceId === 'events')?.patchCount || 0
  }
  if (mode === 'characters') {
    return model.worldBible.actors.length || model.workspaceEntrypoints.find((entry) => entry.workspaceId === 'characters')?.patchCount || 0
  }
  if (mode === 'buildings') {
    return model.workspaceEntrypoints.find((entry) => entry.workspaceId === 'buildings')?.patchCount || 0
  }
  return (
    model.worldBible.items.length ||
    model.workspaceEntrypoints.find((entry) => entry.workspaceId === 'items')?.patchCount ||
    model.stats.assetCount ||
    0
  )
}

export function WorkbenchHomePage({
  presentation,
  hasActiveProject,
  projectDirty,
  gameDirectoryReady,
  studioDeskModel,
  taskSummary,
  onProjectModuleOpen,
  onProjectCreateOpen,
  onProjectImport,
  onProjectSelect,
  onProjectDelete,
  onProjectPropertiesOpen,
  onExportProject,
  onSaveProject,
  onGameDirectoryAction,
  onCloseProject,
}: WorkbenchHomePageProps) {
  const copy = useEditorCopy()
  const navCopy = copy.workbenchNavigation
  const currentProject = getCurrentProject(studioDeskModel)
  const pageLabel = presentation === 'project' ? navCopy.shellProjectHome : navCopy.title
  const projectEmpty = isProjectEmpty(studioDeskModel)
  const homeContent: 'home' | 'empty' | 'rich' =
    presentation === 'home' ? 'home' : !hasActiveProject || !currentProject ? 'home' : projectEmpty ? 'empty' : 'rich'
  const directoryStatus = taskSummary.directoryStatus

  const continueInspiration = studioDeskModel.recentInspirations[0] ?? null
  const continueModule = continueInspiration
    ? AUTHORING_MODULE_BY_WORKSPACE[continueInspiration.workspaceId]
    : AUTHORING_MODULE_BY_WORKSPACE.map
  const continueMode =
    continueInspiration && isContentWorkspaceId(continueInspiration.workspaceId) ? continueInspiration.workspaceId : undefined
  const continueLabel =
    continueMode && continueMode in navCopy.rootModeLabels ? navCopy.rootModeLabels[continueMode] : navCopy.rootModeLabels.map

  const contentCounts = useMemo(
    () =>
      CONTENT_MODES.map((mode) => ({
        mode,
        count: getContentCount(studioDeskModel, mode),
        label: navCopy.rootModeLabels[mode],
      })),
    [navCopy.rootModeLabels, studioDeskModel],
  )

  const recentProjects = studioDeskModel.gallery.projects.slice(0, 8)
  const recentListRef = useRef<HTMLDivElement | null>(null)

  function openProject(project: StudioDeskGalleryProject) {
    void onProjectSelect?.(project.draftStorageKey)
  }

  return (
    <section
      className="workbench-shell-home"
      aria-label={pageLabel}
      data-content={homeContent}
      data-guide-surface={presentation === 'home' ? 'workbench.home' : undefined}
    >
      <div className="workbench-shell-home-inner">
        {!gameDirectoryReady ? (
          <div className="workbench-shell-home-banner" role="status">
            <span className="workbench-shell-home-banner-icon" aria-hidden="true">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <div className="workbench-shell-home-banner-copy">
              <strong>{navCopy.gameDirectoryMissingTitle}</strong>
            </div>
            <button type="button" className="control-button control-button-primary" onClick={onGameDirectoryAction}>
              {navCopy.gameDirectoryAction}
            </button>
          </div>
        ) : null}

        {homeContent === 'rich' && currentProject ? (
          <>
            <header className="workbench-shell-home-hd">
              <div>
                <h1>{currentProject.title || studioDeskModel.projectName || navCopy.noCurrentProjectTitle}</h1>
                <p className="workbench-shell-home-hd-sub">
                  {studioDeskModel.projectVersion ? navCopy.shellVersionValue(studioDeskModel.projectVersion) : navCopy.shellMissingValue}
                  {navCopy.shellMetaSeparator}
                  <span className="mono">{studioDeskModel.projectUniqueId || currentProject.uniqueId || navCopy.shellMissingValue}</span>
                </p>
              </div>
              <div className="workbench-shell-home-hd-actions">
                <span className={cx('workbench-shell-home-save-state', projectDirty && 'is-dirty')} role="status">
                  {projectDirty ? copy.studioDesk.eventPatchHub.unsavedLabel : copy.studioDesk.eventPatchHub.savedLabel}
                </span>
                <button
                  type="button"
                  className="control-button control-button-primary"
                  disabled={!projectDirty}
                  onClick={() => void onSaveProject()}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {copy.studioDesk.toolbar.save}
                </button>
                <button type="button" className="control-button" onClick={onExportProject}>
                  {navCopy.shellExportAction}
                </button>
                <button type="button" className="control-button" onClick={onProjectPropertiesOpen}>
                  {navCopy.shellProjectSettingsAction}
                </button>
                <button type="button" className="control-button control-button-ghost" onClick={onProjectCreateOpen}>
                  {navCopy.shellNewEllipsis}
                </button>
              </div>
            </header>

            <div className="workbench-shell-home-body">
              <div className="workbench-shell-home-main">
                <section className="workbench-shell-home-sec" aria-label={navCopy.shellContinueWork}>
                  <div className="workbench-shell-home-continue">
                    <div className="workbench-shell-home-continue-copy">
                      <div className="workbench-shell-home-continue-kicker">{navCopy.shellContinueWork}</div>
                      <div className="workbench-shell-home-continue-title">{continueInspiration?.title ?? navCopy.shellContinueEmpty}</div>
                      <div className="workbench-shell-home-continue-meta">
                        {continueInspiration
                          ? navCopy.shellActivityMeta(
                              continueLabel,
                              formatRelativeTime(continueInspiration.updatedAt, navCopy.shellMissingValue, copy.studioDesk.edited),
                            )
                          : navCopy.shellContinueEmpty}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="control-button control-button-primary"
                      disabled={!continueInspiration && !hasActiveProject}
                      onClick={() => onProjectModuleOpen(continueModule)}
                    >
                      {navCopy.shellContinueEdit}
                    </button>
                  </div>
                </section>

                <section className="workbench-shell-home-sec" aria-label={navCopy.shellContentOverview}>
                  <p className="workbench-shell-home-sec-label">{navCopy.shellContentOverview}</p>
                  <div className="workbench-shell-home-count-row">
                    {contentCounts.map(({ mode, count, label }) => (
                      <button
                        key={mode}
                        type="button"
                        className="workbench-shell-home-count-cell"
                        aria-label={label}
                        onClick={() => onProjectModuleOpen(AUTHORING_MODULE_BY_WORKSPACE[mode])}
                      >
                        <span className="workbench-shell-home-count-n">{count}</span>
                        <span className="workbench-shell-home-count-l">{label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="workbench-shell-home-sec workbench-shell-home-sec-grow" aria-label={navCopy.shellRecentActivity}>
                  <p className="workbench-shell-home-sec-label">{navCopy.shellRecentActivity}</p>
                  <div className="workbench-shell-home-act-list">
                    {studioDeskModel.recentInspirations.length ? (
                      studioDeskModel.recentInspirations.slice(0, 8).map((item) => (
                        <button
                          key={item.patchId}
                          type="button"
                          className="workbench-shell-home-act-row"
                          onClick={() => onProjectModuleOpen(AUTHORING_MODULE_BY_WORKSPACE[item.workspaceId])}
                        >
                          <span className="when">
                            {formatRelativeTime(item.updatedAt, navCopy.shellMissingValue, copy.studioDesk.edited)}
                          </span>
                          <span className="what">
                            <em>{item.title}</em>
                          </span>
                          <span className="where">
                            {isContentWorkspaceId(item.workspaceId) ? navCopy.rootModeLabels[item.workspaceId] : item.workspaceId}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="workbench-shell-home-empty-inline">{navCopy.shellActivityEmpty}</div>
                    )}
                  </div>
                </section>

                <section className="workbench-shell-home-sec" aria-label={navCopy.shellProjectWorkspaces}>
                  <p className="workbench-shell-home-sec-label">{navCopy.shellProjectWorkspaces}</p>
                  <div className="workbench-shell-home-module-grid">
                    {PROJECT_MODULES.map(({ id, icon: Icon }) => (
                      <button key={id} type="button" onClick={() => onProjectModuleOpen(id)}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{navCopy.moduleLabels[id]}</span>
                        <ArrowRight className="chev h-4 w-4" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="workbench-shell-home-side">
                <section className="workbench-shell-home-sec" aria-label={navCopy.shellAttention}>
                  <p className="workbench-shell-home-sec-label">{navCopy.shellAttention}</p>
                  <div className="workbench-shell-home-attn-list">
                    <button
                      type="button"
                      className={cx('workbench-shell-home-attn-row', taskSummary.exportCount > 0 && 'is-warn')}
                      onClick={onExportProject}
                    >
                      <span className="t">{navCopy.pendingExportMetric}</span>
                      <span className="n">{taskSummary.exportCount}</span>
                    </button>
                    <div className={cx('workbench-shell-home-attn-row', taskSummary.errorCount > 0 && 'is-warn')} role="status">
                      <span className="t">{navCopy.errorMetric}</span>
                      <span className="n">{taskSummary.errorCount}</span>
                    </div>
                    <div className="workbench-shell-home-attn-row" role="status">
                      <span className="t">{navCopy.warningMetric}</span>
                      <span className="n">{taskSummary.warningCount}</span>
                    </div>
                    <button
                      type="button"
                      className={cx('workbench-shell-home-attn-row', directoryStatus.tone === 'ready' && 'is-ok')}
                      onClick={onGameDirectoryAction}
                    >
                      <span className="t">{navCopy.gameDirectoryTaskTitle}</span>
                      <span className="n">{directoryStatus.tone === 'ready' ? navCopy.shellDirectoryReady : directoryStatus.tone}</span>
                    </button>
                  </div>
                </section>

                <section className="workbench-shell-home-sec" aria-label={navCopy.shellProjectSection}>
                  <p className="workbench-shell-home-sec-label">{navCopy.shellProjectSection}</p>
                  <div className="workbench-shell-home-proj-panel">
                    <dl className="workbench-shell-home-pc-grid">
                      <dt>{navCopy.shellProjectUniqueId}</dt>
                      <dd className="mono">{studioDeskModel.projectUniqueId || currentProject.uniqueId || navCopy.shellMissingValue}</dd>
                      <dt>{navCopy.shellProjectVersion}</dt>
                      <dd>
                        {studioDeskModel.projectVersion
                          ? navCopy.shellVersionValue(studioDeskModel.projectVersion)
                          : navCopy.shellMissingValue}
                      </dd>
                    </dl>
                    <div className="workbench-shell-home-pc-ops">
                      <button type="button" className="control-button" onClick={onProjectPropertiesOpen}>
                        {navCopy.shellProjectSettingsAction}
                      </button>
                      {onCloseProject ? (
                        <button type="button" className="control-button control-button-ghost" onClick={onCloseProject}>
                          {navCopy.shellCloseProject}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}

        {homeContent === 'empty' && currentProject ? (
          <div className="workbench-shell-home-empty-world">
            <div className="workbench-shell-home-empty-inner">
              <h2>{currentProject.title || studioDeskModel.projectName}</h2>
              <div className="workbench-shell-home-pc-ops is-center">
                <button type="button" className="control-button" onClick={onProjectPropertiesOpen}>
                  {navCopy.shellProjectSettingsAction}
                </button>
                {onCloseProject ? (
                  <button type="button" className="control-button control-button-ghost" onClick={onCloseProject}>
                    {navCopy.shellCloseProject}
                  </button>
                ) : null}
              </div>
              <div className="workbench-shell-home-empty-block">
                <p className="workbench-shell-home-sec-label is-center">{navCopy.shellCreateFirst}</p>
                <div className="workbench-shell-home-create-list">
                  {PROJECT_MODULES.map(({ id, icon: Icon }) => {
                    const title = navCopy.moduleLabels[id]
                    return (
                      <button key={id} type="button" onClick={() => onProjectModuleOpen(id)}>
                        <span className="ic" aria-hidden="true">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="tx">{title}</span>
                        <ArrowRight className="chev h-4 w-4" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {homeContent === 'home' ? (
          <div className="workbench-shell-home-none">
            <header className="workbench-shell-home-library-hd">
              <h1>{navCopy.home}</h1>
              <p>{navCopy.shellHomeHint}</p>
            </header>
            {currentProject ? (
              <section className="workbench-shell-home-current" aria-label={navCopy.shellProjectHome}>
                <div>
                  <p className="workbench-shell-home-sec-label">{navCopy.shellProjectHome}</p>
                  <strong>{currentProject.title}</strong>
                  <span className="mono">{currentProject.uniqueId || navCopy.shellProjectMenuEmptyId}</span>
                </div>
                <button
                  type="button"
                  className="control-button control-button-primary"
                  onClick={() => onProjectModuleOpen('project-dashboard')}
                >
                  {navCopy.shellOpenProjectHome}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </section>
            ) : null}
            <div
              className="workbench-shell-home-launch"
              role="group"
              aria-label={navCopy.shellProjectManagement}
              data-guide="workbench-modules"
            >
              <button type="button" className="workbench-shell-home-launch-btn is-primary" onClick={onProjectCreateOpen}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {navCopy.newProjectAction}
              </button>
              <button
                type="button"
                className="workbench-shell-home-launch-btn"
                onClick={() => {
                  recentListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                {navCopy.shellOpenProjectAction}
              </button>
              <button type="button" className="workbench-shell-home-launch-btn" onClick={() => void onProjectImport?.()}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {navCopy.importProjectAction}
              </button>
            </div>

            <p className="workbench-shell-home-sec-label">{navCopy.shellRecentProjects}</p>
            <div className="workbench-shell-home-proj-list" ref={recentListRef} aria-label={navCopy.shellRecentProjects}>
              {recentProjects.length ? (
                recentProjects.map((project) => (
                  <div key={project.draftStorageKey} className="workbench-shell-home-proj-row">
                    <button type="button" className="main-hit" onClick={() => openProject(project)}>
                      <span>
                        <span className="name">
                          {project.title}
                          {project.statuses.includes('error') || project.errorCount > 0 ? (
                            <span className="badge warn">{navCopy.errorMetric}</span>
                          ) : null}
                        </span>
                        <span className="meta">
                          {project.isCurrent
                            ? navCopy.shellCurrentProjectMeta(project.uniqueId || copy.studioDesk.metadataIncomplete, navCopy.currentMarker)
                            : project.uniqueId || copy.studioDesk.metadataIncomplete}
                        </span>
                      </span>
                      <span className="when">
                        {formatRelativeTime(project.lastEditedAt, navCopy.shellMissingValue, copy.studioDesk.edited)}
                      </span>
                    </button>
                    <div className="ops">
                      <button type="button" onClick={() => openProject(project)}>
                        {navCopy.shellOpenProjectAction}
                      </button>
                      <button type="button" className="danger" onClick={() => void onProjectDelete?.(project.draftStorageKey)}>
                        {copy.studioDesk.deleteProject}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="workbench-shell-home-empty-inline">{navCopy.noCurrentProjectHint}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export type { WorkbenchHomePageProps, WorkbenchHomeTaskSummary }
