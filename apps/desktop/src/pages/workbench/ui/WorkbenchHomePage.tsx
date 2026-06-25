import {
  ArrowLeft,
  Beaker,
  Castle,
  Check,
  Clock3,
  FolderOpen,
  GitMerge,
  Languages,
  Library,
  Map,
  Package,
  Plus,
  Search,
  TriangleAlert,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { type WorkspaceMode } from '@locales/api'
import { useEditorCopy, useLocale } from '@locales/provider'
import { StudioDeskProjectGallery, type StudioDeskModel } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import type { WorkbenchViewRegistration } from '@shared/contracts'
import type { WorkspaceStatus } from '@entities/map'

type DevWorkbenchViewNavigationItem = WorkbenchViewRegistration & {
  active?: boolean
}

type MakerWorkspaceMode = Extract<WorkspaceMode, 'map' | 'events' | 'items'>

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
  taskSummary: WorkbenchHomeTaskSummary
  dock?: ReactNode
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
  onMakerPendingChange: (mode: MakerWorkspaceMode | null) => void
  onGameDirectoryAction: () => void
}

type HomeApp = {
  id: string
  title: string
  code: string
  icon: ComponentType<{ className?: string }>
  tone: string
  active?: boolean
  disabled?: boolean
  onOpen: () => void
}

type SearchResult = {
  id: string
  kind: 'module' | 'project' | 'command'
  title: string
  hint: string
  icon: ComponentType<{ className?: string }>
  onSelect: () => void
}

const ROOT_MODES: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items', 'mod-i18n']
const MAKER_MODES: MakerWorkspaceMode[] = ['map', 'events', 'items']
const ICON_BY_MODE: Record<WorkspaceMode, ComponentType<{ className?: string }>> = {
  mods: Library,
  map: Map,
  events: GitMerge,
  characters: Users,
  buildings: Castle,
  items: Package,
  'mod-i18n': Languages,
}

function getMakerLabel(navCopy: ReturnType<typeof useEditorCopy>['workbenchNavigation'], mode: MakerWorkspaceMode) {
  if (mode === 'map') return navCopy.mapMaking
  if (mode === 'events') return navCopy.eventMaking
  return navCopy.itemMaking
}

function getCurrentProject(model: StudioDeskModel) {
  return model.gallery.projects.find((project) => project.isCurrent) ?? null
}

function matchesSearch(locale: string, query: string, values: readonly string[]) {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  return !normalizedQuery || values.some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))
}

export default function WorkbenchHomePage({
  workspaceMode,
  workspaceViewMode,
  hasActiveProject,
  gameDirectoryReady,
  gameDirectoryStatus,
  studioDeskModel,
  makerPending,
  taskSummary,
  dock,
  devViews = [],
  onBackToWorkspace,
  onRootWorkspaceOpen,
  onProjectWorkspaceOpen,
  onDevViewOpen,
  onProjectCreateOpen,
  onProjectImport,
  onProjectSelect,
  onProjectCopy,
  onProjectDelete,
  onProjectPropertiesOpen,
  onMakerPendingChange,
  onGameDirectoryAction,
}: WorkbenchHomePageProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const searchListId = useId()
  const makerTitleId = useId()
  const projectTitleId = useId()
  const taskTitleId = useId()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [makerDialogOpen, setMakerDialogOpen] = useState(Boolean(makerPending))
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [taskPanelOpen, setTaskPanelOpen] = useState(false)
  const [selectedMakerMode, setSelectedMakerMode] = useState<MakerWorkspaceMode>(makerPending ?? 'map')
  const [useCurrentProject, setUseCurrentProject] = useState(hasActiveProject)
  const [devExpanded, setDevExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const currentProject = getCurrentProject(studioDeskModel)
  const currentProjectInitials =
    currentProject?.title
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MF'
  const hasProjects = studioDeskModel.gallery.projects.length > 0
  const selectedMakerLabel = getMakerLabel(navCopy, selectedMakerMode)
  const makerPendingLabel = makerPending ? getMakerLabel(navCopy, makerPending) : selectedMakerLabel

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        setSearchOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!makerPending) {
      return
    }
    setSelectedMakerMode(makerPending)
    setUseCurrentProject(Boolean(hasActiveProject && currentProject))
    setMakerDialogOpen(true)
    setProjectDialogOpen(true)
  }, [currentProject, hasActiveProject, makerPending])

  const rootApps: HomeApp[] = ROOT_MODES.map((mode) => ({
    id: mode,
    title: navCopy.rootModeLabels[mode],
    code: navCopy.rootModeCodes[mode],
    icon: ICON_BY_MODE[mode],
    tone: mode,
    active: workspaceMode === mode && workspaceViewMode === 'preview',
    disabled: !gameDirectoryReady,
    onOpen: () => {
      if (!gameDirectoryReady) {
        onGameDirectoryAction()
        return
      }
      onMakerPendingChange(null)
      onRootWorkspaceOpen(mode)
    },
  }))
  const devApps: HomeApp[] = devViews.map((view) => ({
    id: view.viewId,
    title: view.title,
    code: navCopy.devModeCode,
    icon: Beaker,
    tone: 'dev',
    active: view.active,
    disabled: false,
    onOpen: () => {
      onMakerPendingChange(null)
      onDevViewOpen?.(view.viewId)
    },
  }))
  const visibleDevApps = devExpanded ? devApps : []
  const makerApps: HomeApp[] = [
    {
      id: 'make',
      title: navCopy.makeLauncher,
      code: navCopy.makeLauncherCode,
      icon: GitMerge,
      tone: 'make',
      active: workspaceViewMode === 'edit' && workspaceMode !== 'mods',
      onOpen: () => {
        setSelectedMakerMode(makerPending ?? 'map')
        setUseCurrentProject(Boolean(hasActiveProject && currentProject))
        setMakerDialogOpen(true)
      },
    },
    {
      id: 'projects',
      title: navCopy.projectLibraryTitle,
      code: navCopy.projectLibraryCode,
      icon: FolderOpen,
      tone: 'projects',
      active: workspaceMode === 'mods' && workspaceViewMode === 'edit',
      onOpen: () => setProjectDialogOpen(true),
    },
    {
      id: 'new-project',
      title: navCopy.newProjectAction,
      code: navCopy.newProjectCode,
      icon: Plus,
      tone: 'projects',
      onOpen: onProjectCreateOpen,
    },
    {
      id: 'import-project',
      title: navCopy.importProjectAction,
      code: navCopy.importProjectCode,
      icon: Upload,
      tone: 'projects',
      onOpen: onProjectImport,
    },
  ]
  const visibleRootApps = rootApps.filter((app) => matchesSearch(locale, query, [app.title, app.code]))
  const visibleMakerApps = makerApps.filter((app) => matchesSearch(locale, query, [app.title, app.code]))
  const commandResults: SearchResult[] = [
    {
      id: 'command:new',
      kind: 'command',
      title: navCopy.newProjectAction,
      hint: navCopy.newProjectHint,
      icon: Plus,
      onSelect: onProjectCreateOpen,
    },
    {
      id: 'command:import',
      kind: 'command',
      title: navCopy.importProjectAction,
      hint: navCopy.importProjectHint,
      icon: Upload,
      onSelect: onProjectImport,
    },
    {
      id: 'command:library',
      kind: 'command',
      title: navCopy.projectLibraryTitle,
      hint: navCopy.projectLibraryHint,
      icon: FolderOpen,
      onSelect: () => setProjectDialogOpen(true),
    },
    {
      id: 'command:tasks',
      kind: 'command',
      title: navCopy.taskCenterTitle,
      hint: navCopy.taskCenterSubtitle,
      icon: Clock3,
      onSelect: () => setTaskPanelOpen((open) => !open),
    },
    {
      id: 'command:back',
      kind: 'command',
      title: navCopy.backToWorkspace,
      hint: navCopy.backToWorkspaceHint,
      icon: ArrowLeft,
      onSelect: onBackToWorkspace,
    },
  ]
  const searchResults: SearchResult[] = [
    ...rootApps
      .filter((app) => matchesSearch(locale, query, [app.title, app.code]))
      .map((app) => ({
        id: `module:${app.id}`,
        kind: 'module' as const,
        title: app.title,
        hint: app.disabled ? navCopy.gameDirectoryRequiredShort : app.code,
        icon: app.icon,
        onSelect: app.onOpen,
      })),
    ...studioDeskModel.gallery.projects
      .filter((project) => matchesSearch(locale, query, [project.title, project.uniqueId, project.searchText]))
      .map((project) => ({
        id: `project:${project.draftStorageKey}`,
        kind: 'project' as const,
        title: project.title,
        hint: project.uniqueId || copy.studioDesk.metadataIncomplete,
        icon: FolderOpen,
        onSelect: () => onProjectSelect(project.draftStorageKey),
      })),
    ...commandResults.filter((item) => matchesSearch(locale, query, [item.title, item.hint])),
  ]
  const visibleSearchResults = query.trim() ? searchResults : commandResults
  const activeSearchResult = visibleSearchResults[activeSearchIndex] ?? visibleSearchResults[0] ?? null

  function closeSearch() {
    setSearchOpen(false)
    setActiveSearchIndex(0)
  }

  function runSearchResult(result: SearchResult | null) {
    if (!result) return
    result.onSelect()
    closeSearch()
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSearchIndex((index) => (visibleSearchResults.length ? (index + 1) % visibleSearchResults.length : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSearchIndex((index) =>
        visibleSearchResults.length ? (index - 1 + visibleSearchResults.length) % visibleSearchResults.length : 0,
      )
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      runSearchResult(activeSearchResult)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuery('')
      closeSearch()
      searchInputRef.current?.blur()
    }
  }

  function selectMakerWithProject(draftStorageKey: string) {
    void onProjectSelect(draftStorageKey, selectedMakerMode)
    setMakerDialogOpen(false)
    setProjectDialogOpen(false)
    onMakerPendingChange(null)
  }

  function continueMaker() {
    if (useCurrentProject && hasActiveProject) {
      onMakerPendingChange(null)
      onProjectWorkspaceOpen(selectedMakerMode)
      setMakerDialogOpen(false)
      return
    }

    onMakerPendingChange(selectedMakerMode)
    if (!hasProjects) {
      onProjectCreateOpen()
      return
    }
    setProjectDialogOpen(true)
  }

  return (
    <section className={cx('workbench-home-page', !gameDirectoryReady && 'is-game-dir-missing')} aria-label={navCopy.title}>
      {!gameDirectoryReady ? (
        <div className="workbench-home-game-dir-banner" role="status">
          <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          <div>
            <strong>{navCopy.gameDirectoryMissingTitle}</strong>
            <span>{navCopy.gameDirectoryMissingDescription}</span>
          </div>
          <button type="button" onClick={onGameDirectoryAction}>
            {navCopy.gameDirectoryAction}
          </button>
        </div>
      ) : null}

      <div className="workbench-home-search-wrap">
        <label className="workbench-home-search">
          <Search className="workbench-home-search-icon" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            role="combobox"
            aria-expanded={searchOpen}
            aria-controls={searchListId}
            aria-activedescendant={activeSearchResult ? `${searchListId}-${activeSearchResult.id}` : undefined}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setSearchOpen(true)
              setActiveSearchIndex(0)
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={navCopy.searchPlaceholder}
          />
          <kbd>{navCopy.searchShortcut}</kbd>
        </label>
        {searchOpen ? (
          <div className="workbench-home-search-results" id={searchListId} role="listbox" aria-label={navCopy.searchResults}>
            {visibleSearchResults.length ? (
              <SearchResultGroup
                items={visibleSearchResults}
                activeIndex={activeSearchIndex}
                listId={searchListId}
                onSelect={runSearchResult}
              />
            ) : (
              <div className="workbench-home-search-empty">{navCopy.searchEmpty(query.trim())}</div>
            )}
          </div>
        ) : null}
      </div>

      <main className="workbench-home-stage">
        <HomeAppSection title={navCopy.rootPages} apps={visibleRootApps} />
        <HomeAppSection title={navCopy.projectChildren} apps={visibleMakerApps} compact />
        {devApps.length > 0 && devExpanded ? (
          <>
            <HomeAppSection title={navCopy.devToolsTitle} apps={visibleDevApps} compact dev />
            <button type="button" className="workbench-home-dev-toggle" onClick={() => setDevExpanded(false)}>
              {navCopy.collapseDevTools}
            </button>
          </>
        ) : null}
        {devApps.length > 0 && !devExpanded ? (
          <button type="button" className="workbench-home-dev-toggle" onClick={() => setDevExpanded(true)}>
            {navCopy.devToolsTitle}
          </button>
        ) : null}
      </main>

      <aside className="workbench-home-status-monitor" aria-label={navCopy.statusMonitorTitle}>
        <button
          className="workbench-home-task-button"
          type="button"
          aria-label={navCopy.taskCenterTitle}
          title={navCopy.taskCenterTitle}
          onClick={() => setTaskPanelOpen((open) => !open)}
        >
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          {taskSummary.exportCount > 0 || taskSummary.conflictCount > 0 || gameDirectoryStatus.tone === 'working' ? (
            <span className="workbench-home-task-dot" aria-hidden="true" />
          ) : null}
        </button>
        <button
          type="button"
          className="workbench-home-current-project"
          onClick={() => setProjectDialogOpen(true)}
          disabled={!currentProject}
        >
          <span
            className={cx('workbench-home-current-cover', currentProject && `studio-cover-${currentProject.coverTone}`)}
            aria-hidden="true"
          >
            {currentProject ? currentProjectInitials : '--'}
          </span>
          <span>
            <strong>{currentProject?.title ?? navCopy.noCurrentProject}</strong>
            <em>
              {currentProject
                ? navCopy.currentProjectMeta(currentProject.uniqueId || copy.studioDesk.metadataIncomplete)
                : navCopy.noCurrentProjectHint}
            </em>
          </span>
        </button>
        <div className="workbench-home-status-stats">
          <button type="button" onClick={() => setTaskPanelOpen(true)}>
            <span className="workbench-home-status-dot workbench-home-status-dot-export" aria-hidden="true" />
            {navCopy.pendingExportCount(taskSummary.exportCount)}
          </button>
          <button type="button" onClick={() => setTaskPanelOpen(true)}>
            <span className="workbench-home-status-dot workbench-home-status-dot-ok" aria-hidden="true" />
            {navCopy.conflictCount(taskSummary.conflictCount)}
          </button>
        </div>
        <button type="button" className="workbench-home-status-back" aria-label={navCopy.backToWorkspace} onClick={onBackToWorkspace}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </aside>

      {taskPanelOpen ? (
        <section className="workbench-home-task-panel" role="dialog" aria-labelledby={taskTitleId}>
          <header>
            <div>
              <h2 id={taskTitleId}>{navCopy.taskCenterTitle}</h2>
              <p>{navCopy.taskCenterSubtitle}</p>
            </div>
            <button type="button" className="icon-button" aria-label={navCopy.closeTaskCenter} onClick={() => setTaskPanelOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="workbench-home-task-list">
            <TaskSummaryRow
              tone="export"
              title={navCopy.pendingExportCount(taskSummary.exportCount)}
              detail={navCopy.pendingExportDetail}
            />
            <TaskSummaryRow tone="ok" title={navCopy.conflictCount(taskSummary.conflictCount)} detail={navCopy.conflictDetail} />
            <TaskSummaryRow
              tone={gameDirectoryStatus.tone}
              title={navCopy.gameDirectoryTaskTitle}
              detail={gameDirectoryStatus.message || navCopy.gameDirectoryTaskIdle}
            />
          </div>
          <footer>{navCopy.taskCenterRealDataNote}</footer>
        </section>
      ) : null}

      <Dialog open={makerDialogOpen} onClose={() => setMakerDialogOpen(false)} size="lg" labelledBy={makerTitleId}>
        <DialogHeader
          id={makerTitleId}
          title={navCopy.makerDialogTitle}
          subtitle={navCopy.makerDialogSubtitle}
          closeLabel={navCopy.closeDialog}
          onClose={() => setMakerDialogOpen(false)}
        />
        <DialogBody>
          <div className="workbench-maker-choice" role="radiogroup" aria-label={navCopy.makerDialogTitle}>
            {MAKER_MODES.map((mode) => {
              const Icon = ICON_BY_MODE[mode]
              const selected = selectedMakerMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cx('workbench-maker-choice-item', selected && 'is-selected')}
                  onClick={() => setSelectedMakerMode(mode)}
                >
                  <span className="workbench-maker-choice-icon">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>{getMakerLabel(navCopy, mode)}</span>
                </button>
              )
            })}
          </div>

          {hasActiveProject && currentProject ? (
            <button
              type="button"
              className={cx('workbench-maker-continue', useCurrentProject && 'is-on')}
              onClick={() => setUseCurrentProject((current) => !current)}
            >
              <span className="workbench-maker-continue-check" aria-hidden="true">
                {useCurrentProject ? <Check className="h-3 w-3" /> : null}
              </span>
              <span>{navCopy.continueCurrentProject(currentProject.title)}</span>
            </button>
          ) : null}

          {!useCurrentProject ? (
            <div className="workbench-maker-project-step">
              <h3>{navCopy.chooseProjectStep}</h3>
              <StudioDeskProjectGallery
                model={studioDeskModel}
                pendingActionLabel={navCopy.useProjectFor(selectedMakerLabel)}
                onCreateDraftRequest={onProjectCreateOpen}
                onImportDraftRequest={onProjectImport}
                onOpenDraft={selectMakerWithProject}
                onCopyDraft={onProjectCopy}
                onDeleteDraft={onProjectDelete}
                onEditCurrentDraftProperties={onProjectPropertiesOpen}
              />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setMakerDialogOpen(false)}>{navCopy.cancelMakerPending}</DialogAction>
          <DialogAction tone="primary" onClick={continueMaker}>
            {useCurrentProject ? navCopy.continueMakerCta(selectedMakerLabel) : navCopy.enterMakerCta(selectedMakerLabel)}
          </DialogAction>
        </DialogFooter>
      </Dialog>

      <Dialog open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} size="xl" labelledBy={projectTitleId}>
        <DialogHeader
          id={projectTitleId}
          title={navCopy.projectLibraryTitle}
          subtitle={navCopy.projectLibraryHint}
          closeLabel={navCopy.closeDialog}
          onClose={() => setProjectDialogOpen(false)}
        />
        <DialogBody>
          <StudioDeskProjectGallery
            model={studioDeskModel}
            pendingActionLabel={makerPending ? navCopy.useProjectFor(makerPendingLabel) : null}
            pendingBanner={
              makerPending ? (
                <div className="workbench-maker-pending-bar">
                  <span>{navCopy.makerPendingFormat(makerPendingLabel)}</span>
                  <button type="button" onClick={() => onMakerPendingChange(null)}>
                    {navCopy.cancelMakerPending}
                  </button>
                </div>
              ) : null
            }
            onCreateDraftRequest={onProjectCreateOpen}
            onImportDraftRequest={onProjectImport}
            onOpenDraft={(draftStorageKey) => {
              void onProjectSelect(draftStorageKey, makerPending)
              setProjectDialogOpen(false)
            }}
            onCopyDraft={onProjectCopy}
            onDeleteDraft={onProjectDelete}
            onEditCurrentDraftProperties={onProjectPropertiesOpen}
          />
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={onProjectImport}>{copy.studioDesk.importDraft}</DialogAction>
          <DialogAction tone="primary" onClick={onProjectCreateOpen}>
            {copy.studioDesk.createDraft}
          </DialogAction>
        </DialogFooter>
      </Dialog>

      {dock}
    </section>
  )
}

function HomeAppSection({ title, apps, compact, dev }: { title: string; apps: HomeApp[]; compact?: boolean; dev?: boolean }) {
  return (
    <section>
      <h2 className="workbench-home-section-title">{title}</h2>
      <div className={cx('workbench-home-app-grid', compact && 'workbench-home-app-grid-workbench', dev && 'workbench-home-app-grid-dev')}>
        {apps.map((app) => (
          <HomeAppButton key={app.id} app={app} />
        ))}
      </div>
    </section>
  )
}

function HomeAppButton({ app }: { app: HomeApp }) {
  const Icon = app.icon

  return (
    <button
      type="button"
      className={cx('workbench-home-app', app.active && 'is-active', app.disabled && 'is-disabled')}
      aria-label={app.title}
      aria-disabled={app.disabled || undefined}
      onClick={app.onOpen}
    >
      <span className="workbench-home-app-icon" data-tone={app.tone} aria-hidden="true">
        <Icon className="h-8 w-8" />
      </span>
      <span className="workbench-home-app-label">{app.title}</span>
      <span className="workbench-home-app-code">{app.code}</span>
    </button>
  )
}

function SearchResultGroup({
  items,
  activeIndex,
  listId,
  onSelect,
}: {
  items: SearchResult[]
  activeIndex: number
  listId: string
  onSelect: (result: SearchResult) => void
}) {
  return (
    <>
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            id={`${listId}-${item.id}`}
            role="option"
            aria-selected={index === activeIndex}
            className={cx('workbench-home-search-result', index === activeIndex && 'is-active')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
          >
            <span className="workbench-home-search-result-icon" aria-hidden="true">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="workbench-home-search-result-body">
              <strong>{item.title}</strong>
              <em>{item.hint}</em>
            </span>
            <span className="workbench-home-search-result-kind">{item.kind}</span>
          </button>
        )
      })}
    </>
  )
}

function TaskSummaryRow({ tone, title, detail }: { tone: string; title: string; detail: string }) {
  return (
    <article className="workbench-home-task-row" data-tone={tone}>
      <span className="workbench-home-task-row-icon" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </article>
  )
}

export type { MakerWorkspaceMode, WorkbenchHomePageProps, WorkbenchHomeTaskSummary }
