import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  BookOpenCheck,
  Castle,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  Eye,
  FolderOpen,
  GitMerge,
  Languages,
  Library,
  Lock,
  Map,
  Package,
  PenLine,
  Play,
  Plus,
  Search,
  TriangleAlert,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent } from 'react'
import { type WorkspaceMode } from '@locales/api'
import { useEditorCopy, useLocale } from '@locales/provider'
import { StudioDeskProjectGallery, type StudioDeskGalleryProject, type StudioDeskModel } from '@features/cp-maker'
import { cx } from '@shared/lib/helper'
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
}

type HomeApp = {
  id: string
  title: string
  code: string
  hint: string
  capability?: string
  capabilityLabel?: string
  capabilityTone?: 'view' | 'edit'
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

function getProjectInitials(project: StudioDeskGalleryProject | null) {
  if (!project) return 'MS'
  return (
    project.title
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'MF'
  )
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
  projectLibraryFocusKey = 0,
  taskSummary,
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
  onExportProject,
  onMakerPendingChange,
  onGameDirectoryAction,
}: WorkbenchHomePageProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const searchListId = useId()
  const taskTitleId = useId()
  const [query, setQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [taskPanelOpen, setTaskPanelOpen] = useState(false)
  const [libraryFocused, setLibraryFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const libraryRef = useRef<HTMLElement | null>(null)
  const currentProject = getCurrentProject(studioDeskModel)
  const hasProjects = studioDeskModel.gallery.projects.length > 0
  const currentProjectInitials = getProjectInitials(currentProject)
  const makerPendingLabel = makerPending ? getMakerLabel(navCopy, makerPending) : ''
  const homeState = !gameDirectoryReady ? 'no-game-dir' : !hasProjects ? 'no-projects' : currentProject ? 'normal' : 'no-current'

  function focusProjectLibrary() {
    setLibraryFocused(true)
    if (typeof libraryRef.current?.scrollIntoView === 'function') {
      libraryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.setTimeout(() => setLibraryFocused(false), 1600)
  }

  function requestProjectForMaker(mode: MakerWorkspaceMode) {
    onMakerPendingChange(mode)
    focusProjectLibrary()
    if (!hasProjects) {
      onProjectCreateOpen()
    }
  }

  function openMaker(mode: MakerWorkspaceMode) {
    if (hasActiveProject && currentProject) {
      onMakerPendingChange(null)
      onProjectWorkspaceOpen(mode)
      return
    }
    requestProjectForMaker(mode)
  }

  useEffect(() => {
    if (!makerPending) return
    focusProjectLibrary()
  }, [makerPending])

  useEffect(() => {
    if (projectLibraryFocusKey === 0) return
    focusProjectLibrary()
  }, [projectLibraryFocusKey])

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

  const rootApps: HomeApp[] = ROOT_MODES.map((mode) => ({
    id: mode,
    title: navCopy.rootModeLabels[mode],
    code: navCopy.rootModeCodes[mode],
    hint: navCopy.globalBrowseHint(mode),
    capability: navCopy.globalBrowseCapability(mode),
    capabilityLabel: navCopy.globalBrowseCapabilityLabel(mode),
    capabilityTone: mode === 'mod-i18n' ? 'edit' : 'view',
    icon: ICON_BY_MODE[mode],
    tone: mode === 'mod-i18n' ? 'i18n' : mode,
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
  const makerApps: HomeApp[] = MAKER_MODES.map((mode) => ({
    id: `maker:${mode}`,
    title: getMakerLabel(navCopy, mode),
    code: navCopy.makerModeCodes[mode],
    hint: navCopy.makerModeHint(mode),
    icon: ICON_BY_MODE[mode],
    tone: mode,
    active: workspaceMode === mode && workspaceViewMode === 'edit',
    onOpen: () => openMaker(mode),
  }))
  const devApps: HomeApp[] = devViews.map((view) => ({
    id: view.viewId,
    title: view.title,
    code: navCopy.devModeCode,
    hint: navCopy.devToolsTitle,
    icon: Beaker,
    tone: 'dev',
    active: view.active,
    disabled: false,
    onOpen: () => {
      onMakerPendingChange(null)
      onDevViewOpen?.(view.viewId)
    },
  }))
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
      onSelect: focusProjectLibrary,
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
      .filter((app) => matchesSearch(locale, query, [app.title, app.code, app.hint]))
      .map((app) => ({
        id: `module:${app.id}`,
        kind: 'module' as const,
        title: app.title,
        hint: app.disabled ? navCopy.gameDirectoryRequiredShort : app.hint,
        icon: app.icon,
        onSelect: app.onOpen,
      })),
    ...makerApps
      .filter((app) => matchesSearch(locale, query, [app.title, app.code, app.hint]))
      .map((app) => ({
        id: `command:${app.id}`,
        kind: 'command' as const,
        title: app.title,
        hint: app.hint,
        icon: app.icon,
        onSelect: app.onOpen,
      })),
    ...devApps
      .filter((app) => matchesSearch(locale, query, [app.title, app.code, app.hint]))
      .map((app) => ({
        id: `dev:${app.id}`,
        kind: 'module' as const,
        title: app.title,
        hint: app.hint,
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
        onSelect: () => onProjectSelect(project.draftStorageKey, makerPending),
      })),
    ...commandResults.filter((item) => matchesSearch(locale, query, [item.title, item.hint])),
  ]
  const visibleSearchResults = query.trim() ? searchResults : commandResults
  const activeSearchResult = visibleSearchResults[activeSearchIndex] ?? visibleSearchResults[0] ?? null
  const globalApps = [...rootApps, ...devApps]
  const filteredGlobalApps = globalApps.filter((app) => matchesSearch(locale, query, [app.title, app.code, app.hint]))

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
    if (!searchOpen) return
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

  function selectProject(draftStorageKey: string) {
    void onProjectSelect(draftStorageKey, makerPending)
  }

  return (
    <section className="workbench-home-page" aria-label={navCopy.title} data-state={homeState}>
      <div className="workbench-home-inner">
        {!gameDirectoryReady ? (
          <div className="workbench-home-game-dir-banner" role="status">
            <span className="workbench-home-game-dir-icon" aria-hidden="true">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <div>
              <strong>{navCopy.gameDirectoryMissingTitle}</strong>
              <span>{navCopy.gameDirectoryMissingDescription}</span>
            </div>
            <button type="button" onClick={onGameDirectoryAction}>
              {navCopy.gameDirectoryAction}
            </button>
          </div>
        ) : null}

        <section className="workbench-home-hero" aria-label={navCopy.heroTitle}>
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

          <div className="workbench-home-hero-grid">
            <article className={cx('workbench-home-current-card', !currentProject && 'is-empty')}>
              <div className="workbench-home-current-top">
                <span
                  className={cx(
                    'workbench-home-current-cover',
                    currentProject ? `studio-cover-${currentProject.coverTone}` : 'studio-cover-festival',
                  )}
                  aria-hidden="true"
                >
                  {currentProjectInitials}
                </span>
                <div className="workbench-home-current-copy">
                  <span className="workbench-home-current-label">
                    {currentProject ? <span className="workbench-home-current-pulse" aria-hidden="true" /> : null}
                    {currentProject ? navCopy.currentProjectLabel : navCopy.noCurrentProject}
                  </span>
                  <h2 className={!currentProject ? 'workbench-home-no-current-title' : undefined}>
                    {currentProject?.title ?? navCopy.noCurrentProjectTitle}
                  </h2>
                  <p>
                    {currentProject
                      ? navCopy.currentProjectMeta(currentProject.uniqueId || copy.studioDesk.metadataIncomplete)
                      : navCopy.noCurrentProjectHint}
                  </p>
                </div>
                {currentProject ? (
                  <button
                    type="button"
                    className="workbench-home-icon-button"
                    aria-label={copy.studioDesk.editProjectProperties}
                    onClick={onProjectPropertiesOpen}
                  >
                    <Edit3 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="workbench-home-makerbar" aria-label={navCopy.projectChildren}>
                {MAKER_MODES.map((mode) => {
                  const Icon = ICON_BY_MODE[mode]
                  return (
                    <button
                      key={mode}
                      type="button"
                      className="workbench-home-maker-button"
                      aria-label={getMakerLabel(navCopy, mode)}
                      onClick={() => openMaker(mode)}
                    >
                      <span className="workbench-home-maker-icon" data-tone={mode} aria-hidden="true">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <strong>{getMakerLabel(navCopy, mode)}</strong>
                        <em>{navCopy.makerModeHint(mode)}</em>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="workbench-home-current-actions">
                {currentProject ? (
                  <>
                    <button type="button" className="control-button control-button-primary" onClick={() => onProjectWorkspaceOpen('map')}>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      {navCopy.continueProjectAction}
                    </button>
                    <button type="button" className="control-button" onClick={onExportProject}>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {copy.studioDesk.publishPack}
                    </button>
                  </>
                ) : (
                  <button type="button" className="control-button control-button-primary" onClick={focusProjectLibrary}>
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    {navCopy.openProjectLibraryAction}
                  </button>
                )}
              </div>
            </article>

            <div className="workbench-home-metrics" aria-label={navCopy.statusMonitorTitle}>
              <button type="button" className="workbench-home-metric" data-tone="warning" onClick={() => setTaskPanelOpen(true)}>
                <span className="workbench-home-metric-icon" aria-hidden="true">
                  <Download className="h-4 w-4" />
                </span>
                <span>
                  <strong>{taskSummary.exportCount}</strong>
                  <em>{navCopy.pendingExportMetric}</em>
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="workbench-home-metric" data-tone="success" onClick={() => setTaskPanelOpen(true)}>
                <span className="workbench-home-metric-icon" aria-hidden="true">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span>
                  <strong>{taskSummary.conflictCount}</strong>
                  <em>{navCopy.conflictMetric}</em>
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className="workbench-home-metric" data-tone={gameDirectoryStatus.tone} onClick={onGameDirectoryAction}>
                <span className="workbench-home-metric-icon" aria-hidden="true">
                  <BookOpenCheck className="h-4 w-4" />
                </span>
                <span>
                  <strong>{navCopy.gameDirectoryTaskTitle}</strong>
                  <em>{gameDirectoryStatus.message || navCopy.gameDirectoryTaskIdle}</em>
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <section
          ref={libraryRef}
          className={cx('workbench-home-library', (libraryFocused || makerPending) && 'is-focus', makerPending && 'is-pending')}
          aria-label={navCopy.projectLibraryTitle}
        >
          <header className="workbench-home-library-head">
            <div className="workbench-home-library-title">
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              <h2>{navCopy.projectLibraryTitle}</h2>
              <span>{copy.studioDesk.projectCount(studioDeskModel.gallery.counts.all)}</span>
            </div>
            <label className="workbench-home-library-search">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{copy.studioDesk.searchProjects}</span>
              <input
                type="search"
                aria-label={copy.studioDesk.searchProjects}
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.currentTarget.value)}
                placeholder={copy.studioDesk.searchProjects}
              />
            </label>
            <div className="workbench-home-library-actions">
              <button type="button" className="control-button workbench-home-small-button" onClick={onProjectImport}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {navCopy.importProjectAction}
              </button>
              <button
                type="button"
                className="control-button control-button-primary workbench-home-small-button"
                onClick={onProjectCreateOpen}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {navCopy.newProjectAction}
              </button>
            </div>
          </header>
          <StudioDeskProjectGallery
            className="workbench-home-gallery"
            model={studioDeskModel}
            query={projectQuery}
            onQueryChange={setProjectQuery}
            variant="cards"
            toolbar={false}
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
            onOpenDraft={selectProject}
            onCopyDraft={onProjectCopy}
            onDeleteDraft={onProjectDelete}
            onEditCurrentDraftProperties={onProjectPropertiesOpen}
          />
        </section>

        <HomeAppSection title={navCopy.rootPages} hint={navCopy.rootPagesHint} apps={filteredGlobalApps} />
      </div>

      <button type="button" className="workbench-home-back" aria-label={navCopy.backToWorkspace} onClick={onBackToWorkspace}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      {taskPanelOpen ? (
        <>
          <button
            type="button"
            className="workbench-home-task-scrim"
            aria-label={navCopy.closeTaskCenter}
            onClick={() => setTaskPanelOpen(false)}
          />
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
        </>
      ) : null}
    </section>
  )
}

function HomeAppSection({ title, hint, apps, compact }: { title: string; hint?: string; apps: HomeApp[]; compact?: boolean }) {
  return (
    <section className="workbench-home-section">
      <div className="workbench-home-section-head">
        <h2>{title}</h2>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className={cx('workbench-home-card-grid', compact && 'workbench-home-card-grid-compact')}>
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
      className={cx('workbench-home-card', app.active && 'is-active', app.disabled && 'is-disabled')}
      aria-label={app.title}
      onClick={app.onOpen}
    >
      <span className="workbench-home-card-icon" data-tone={app.tone} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <span className="workbench-home-card-title">{app.title}</span>
      <span className="workbench-home-card-hint">{app.hint}</span>
      {app.capability ? (
        <span
          className={cx('workbench-home-card-cap', app.capabilityTone === 'edit' && 'workbench-home-card-cap-edit')}
          aria-label={app.capabilityLabel}
        >
          {app.capabilityTone === 'edit' ? (
            <PenLine className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Eye className="h-3 w-3" aria-hidden="true" />
          )}
          {app.capability}
        </span>
      ) : (
        <span className="workbench-home-card-code">{app.code}</span>
      )}
      {app.capability ? (
        <span className="workbench-home-card-lock" aria-hidden="true">
          <Lock className="h-3.5 w-3.5" />
        </span>
      ) : null}
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
