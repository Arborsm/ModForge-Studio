import { ArrowRight, Building2, FolderOpen, GitMerge, Map, Package, Plus, TriangleAlert, Upload, Users } from 'lucide-react'
import { useMemo, useRef, type ComponentType } from 'react'
import { type WorkspaceMode } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskGalleryProject, StudioDeskModel } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import type { WorkspaceStatus } from '@entities/map'
import type { MakerWorkspaceMode } from '../model/useWorkbenchProjectNavigation'

type DevWorkbenchViewNavigationItem = WorkbenchViewRegistration & {
  active?: boolean
}

type WorkbenchHomeTaskSummary = {
  exportCount: number
  conflictCount: number
  directoryStatus: WorkspaceStatus
}

type WorkbenchHomePageProps = {
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  hasActiveProject: boolean
  gameDirectoryReady: boolean
  gameDirectoryStatus: WorkspaceStatus
  studioDeskModel: StudioDeskModel
  makerPending: MakerWorkspaceMode | null
  projectLibraryFocusKey?: number
  taskSummary: WorkbenchHomeTaskSummary
  devViews?: readonly DevWorkbenchViewNavigationItem[]
  onBackToWorkspace: () => void
  onRootWorkspaceOpen: (mode: WorkspaceMode) => void
  onProjectWorkspaceOpen: (mode: MakerWorkspaceMode) => void
  onDevViewOpen?: (viewId: string) => void
  onProjectCreateOpen: () => void
  onProjectImport: () => void | Promise<void>
  onProjectSelect: (draftStorageKey: string, makerMode?: MakerWorkspaceMode | null) => void | Promise<void>
  onProjectCopy: (draftStorageKey: string) => void | Promise<void>
  onProjectDelete: (draftStorageKey: string) => void | Promise<void>
  onProjectPropertiesOpen: () => void
  onExportProject: () => void
  onMakerPendingChange: (mode: MakerWorkspaceMode | null) => void
  onGameDirectoryAction: () => void
  onCloseProject?: () => void
}

type ContentCountMode = Extract<WorkspaceMode, 'map' | 'events' | 'characters' | 'buildings' | 'items'>

const CONTENT_MODES: ContentCountMode[] = ['map', 'events', 'characters', 'buildings', 'items']
const CREATE_MODES: Array<'map' | 'characters' | 'events' | 'items'> = ['map', 'characters', 'events', 'items']
const BROWSE_ONLY_MODES: ContentCountMode[] = ['map', 'events', 'characters', 'buildings', 'items']

const ICON_BY_MODE: Record<ContentCountMode, ComponentType<{ className?: string }>> = {
  map: Map,
  events: GitMerge,
  characters: Users,
  buildings: Building2,
  items: Package,
}

function getCurrentProject(model: StudioDeskModel) {
  return model.gallery.projects.find((project) => project.isCurrent) ?? null
}

function isProjectEmpty(model: StudioDeskModel) {
  if (!model.hasActiveDraft) {
    return true
  }

  const patchTotal = model.workspaceEntrypoints.reduce((sum, entry) => sum + entry.patchCount, 0)
  const statsTotal = model.stats.mapCount + model.stats.eventCount + model.stats.assetCount + model.stats.festivalCount
  return patchTotal === 0 && statsTotal === 0 && model.recentInspirations.length === 0
}

function formatRelativeTime(timestamp: number | null, emptyLabel: string) {
  if (!timestamp) {
    return emptyLabel
  }

  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) {
    return 'now'
  }
  if (deltaMs < 3_600_000) {
    return `${Math.max(1, Math.round(deltaMs / 60_000))}m`
  }
  if (deltaMs < 86_400_000) {
    return `${Math.max(1, Math.round(deltaMs / 3_600_000))}h`
  }
  return `${Math.max(1, Math.round(deltaMs / 86_400_000))}d`
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
  hasActiveProject,
  gameDirectoryReady,
  studioDeskModel,
  makerPending,
  taskSummary,
  onRootWorkspaceOpen,
  onProjectWorkspaceOpen,
  onProjectCreateOpen,
  onProjectImport,
  onProjectSelect,
  onProjectDelete,
  onProjectPropertiesOpen,
  onExportProject,
  onMakerPendingChange,
  onGameDirectoryAction,
  onCloseProject,
}: WorkbenchHomePageProps) {
  const copy = useEditorCopy()
  const navCopy = copy.workbenchNavigation
  const currentProject = getCurrentProject(studioDeskModel)
  const projectEmpty = isProjectEmpty(studioDeskModel)
  const homeContent: 'none' | 'empty' | 'rich' = !hasActiveProject || !currentProject ? 'none' : projectEmpty ? 'empty' : 'rich'
  const directoryStatus = taskSummary.directoryStatus

  const continueInspiration = studioDeskModel.recentInspirations[0] ?? null
  const continueWorkspace = (continueInspiration?.workspaceId as MakerWorkspaceMode | undefined) ?? 'map'
  const continueMode = continueInspiration?.workspaceId as ContentCountMode | undefined
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

  function openBrowse(mode: WorkspaceMode) {
    if (!gameDirectoryReady) {
      onGameDirectoryAction()
      return
    }
    onMakerPendingChange(null)
    onRootWorkspaceOpen(mode)
  }

  function openCreate(mode: 'map' | 'characters' | 'events' | 'items') {
    if (mode === 'characters') {
      openBrowse('characters')
      return
    }
    onProjectWorkspaceOpen(mode)
  }

  function openProject(project: StudioDeskGalleryProject) {
    void onProjectSelect(project.draftStorageKey, makerPending)
  }

  return (
    <section className="workbench-shell-home" aria-label={navCopy.title} data-content={homeContent}>
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
                  {studioDeskModel.projectVersion ? `v${studioDeskModel.projectVersion.replace(/^v/i, '')}` : '—'}
                  {' · '}
                  <span className="mono">
                    {studioDeskModel.projectUniqueId || currentProject.uniqueId || navCopy.shellProjectMenuEmptyId}
                  </span>
                </p>
              </div>
              <div className="workbench-shell-home-hd-actions">
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
                          ? `${continueLabel} · ${formatRelativeTime(continueInspiration.updatedAt, '—')}`
                          : navCopy.shellContinueEmpty}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="control-button control-button-primary"
                      disabled={!continueInspiration && !hasActiveProject}
                      onClick={() => onProjectWorkspaceOpen(continueWorkspace)}
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
                        onClick={() => openBrowse(mode)}
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
                          onClick={() => onProjectWorkspaceOpen((item.workspaceId as MakerWorkspaceMode) || 'map')}
                        >
                          <span className="when">{formatRelativeTime(item.updatedAt, '—')}</span>
                          <span className="what">
                            <em>{item.title}</em>
                          </span>
                          <span className="where">{navCopy.rootModeLabels[item.workspaceId as ContentCountMode] ?? item.workspaceId}</span>
                        </button>
                      ))
                    ) : (
                      <div className="workbench-shell-home-empty-inline">{navCopy.shellActivityEmpty}</div>
                    )}
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
                    <div className={cx('workbench-shell-home-attn-row', taskSummary.conflictCount > 0 && 'is-warn')} role="status">
                      <span className="t">{navCopy.conflictMetric}</span>
                      <span className="n">{taskSummary.conflictCount}</span>
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
                      <dd className="mono">{studioDeskModel.projectUniqueId || currentProject.uniqueId || '—'}</dd>
                      <dt>{navCopy.shellProjectVersion}</dt>
                      <dd>{studioDeskModel.projectVersion ? studioDeskModel.projectVersion.replace(/^v/i, '') : '—'}</dd>
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
                  {CREATE_MODES.map((mode) => {
                    const title =
                      mode === 'map'
                        ? navCopy.shellCreateMap
                        : mode === 'characters'
                          ? navCopy.shellCreateCharacter
                          : mode === 'events'
                            ? navCopy.shellCreateEvent
                            : navCopy.shellCreateItem
                    const Icon = ICON_BY_MODE[mode === 'characters' ? 'characters' : mode]
                    return (
                      <button key={mode} type="button" onClick={() => openCreate(mode)}>
                        <span className="ic" aria-hidden="true">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="tx">{title}</span>
                        <ArrowRight className="chev h-4 w-4" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
                <div className="workbench-shell-home-pc-ops is-center">
                  <button type="button" className="control-button" onClick={() => openBrowse('map')}>
                    {navCopy.shellBrowseGameResources}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {homeContent === 'none' ? (
          <div className="workbench-shell-home-none">
            <div className="workbench-shell-home-launch" role="group" aria-label={navCopy.shellProjectManagement}>
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
              <button type="button" className="workbench-shell-home-launch-btn" onClick={() => void onProjectImport()}>
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
                          {project.statuses.includes('conflict') || project.conflictCount > 0 ? (
                            <span className="badge warn">{navCopy.conflictMetric}</span>
                          ) : null}
                        </span>
                        <span className="meta">
                          {project.uniqueId || copy.studioDesk.metadataIncomplete}
                          {project.isCurrent ? ` · ${navCopy.currentMarker}` : ''}
                        </span>
                      </span>
                      <span className="when">{formatRelativeTime(project.lastEditedAt, '—')}</span>
                    </button>
                    <div className="ops">
                      <button type="button" onClick={() => openProject(project)}>
                        {navCopy.shellOpenProjectAction}
                      </button>
                      <button type="button" className="danger" onClick={() => void onProjectDelete(project.draftStorageKey)}>
                        {copy.studioDesk.deleteProject}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="workbench-shell-home-empty-inline">{navCopy.noCurrentProjectHint}</div>
              )}
            </div>

            <div className="workbench-shell-home-browse-row" aria-label={navCopy.shellNavBrowseGroup}>
              <p className="workbench-shell-home-sec-label">{navCopy.shellNavBrowseGroup}</p>
              {BROWSE_ONLY_MODES.map((mode) => (
                <button key={mode} type="button" onClick={() => openBrowse(mode)}>
                  {navCopy.rootModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export type { MakerWorkspaceMode, WorkbenchHomePageProps, WorkbenchHomeTaskSummary }
