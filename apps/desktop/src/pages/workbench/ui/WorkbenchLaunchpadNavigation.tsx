import { Beaker, Castle, FolderOpen, GitMerge, Home, Languages, Library, Map, Package, Search, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getWorkspaceModeLabel, type WorkspaceMode } from '@locales/api'
import { useEditorCopy, useLocale } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import type { CpMakerDraftSummary } from '@features/cp-maker'
import type { WorkbenchViewRegistration } from '@shared/contracts'

type DevWorkbenchViewNavigationItem = WorkbenchViewRegistration & {
  active?: boolean
}

type WorkbenchLaunchpadNavigationProps = {
  open: boolean
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  hasActiveProject: boolean
  projectManagementActive?: boolean
  dockPlacement?: 'floating' | 'titlebar'
  projectSummaries: CpMakerDraftSummary[]
  devViews?: readonly DevWorkbenchViewNavigationItem[]
  onOpenChange: (open: boolean) => void
  onRootWorkspaceOpen: (mode: WorkspaceMode) => void
  onProjectWorkspaceOpen: (mode: WorkspaceMode) => void
  onDevViewOpen?: (viewId: string) => void
  onProjectManagementOpen: () => void
  onProjectCreateOpen: () => void
  onProjectSelect: (draftStorageKey: string) => void
}

type LaunchpadCard = {
  id: string
  title: string
  description: string
  hint: string
  icon: ComponentType<{ className?: string }>
  tone: string
  active?: boolean
  disabled?: boolean
  onOpen?: () => void
}

type RecentPage =
  | {
      kind: 'root' | 'project'
      mode: WorkspaceMode
    }
  | {
      kind: 'dev'
      viewId: string
    }

const ROOT_MODES: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items', 'mod-i18n']
const DEFAULT_RECENT_PAGES: RecentPage[] = []
const MAX_RECENT_MODES = 4
const ICON_BY_MODE: Record<WorkspaceMode, ComponentType<{ className?: string }>> = {
  mods: Library,
  map: Map,
  events: GitMerge,
  characters: Users,
  buildings: Castle,
  items: Package,
  'mod-i18n': Languages,
}

function getRecentPageKey(page: RecentPage) {
  return page.kind === 'dev' ? `${page.kind}:${page.viewId}` : `${page.kind}:${page.mode}`
}

function canRememberRecentPage(page: RecentPage) {
  return page.kind === 'dev' || page.mode !== 'mods'
}

export default function WorkbenchLaunchpadNavigation({
  open,
  workspaceMode,
  workspaceViewMode,
  hasActiveProject,
  projectManagementActive = false,
  dockPlacement = 'floating',
  projectSummaries,
  devViews = [],
  onOpenChange,
  onRootWorkspaceOpen,
  onProjectWorkspaceOpen,
  onDevViewOpen,
  onProjectManagementOpen,
  onProjectCreateOpen,
  onProjectSelect,
}: WorkbenchLaunchpadNavigationProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const [query, setQuery] = useState('')
  const [pendingProjectMode, setPendingProjectMode] = useState<WorkspaceMode | null>(null)
  const [recentPages, setRecentPages] = useState<RecentPage[]>(() =>
    workspaceViewMode === 'preview' && workspaceMode !== 'mods'
      ? [
          { kind: 'root', mode: workspaceMode },
          ...DEFAULT_RECENT_PAGES.filter((page) => page.kind !== 'dev' && page.mode !== workspaceMode),
        ]
      : DEFAULT_RECENT_PAGES,
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const closeLaunchpad = useCallback(() => onOpenChange(false), [onOpenChange])
  const openLaunchpad = useCallback(() => onOpenChange(true), [onOpenChange])
  const closeProjectPicker = useCallback(() => setPendingProjectMode(null), [])
  const rememberRecentPage = useCallback((page: RecentPage) => {
    if (!canRememberRecentPage(page)) {
      return
    }

    const pageKey = getRecentPageKey(page)
    setRecentPages((current) => {
      if (current.some((candidate) => getRecentPageKey(candidate) === pageKey)) {
        return current
      }

      if (current.length < MAX_RECENT_MODES) {
        return [...current, page]
      }

      return [...current.slice(1), page]
    })
  }, [])

  const openProjectManagement = useCallback(() => {
    closeProjectPicker()
    closeLaunchpad()
    onProjectManagementOpen()
  }, [closeLaunchpad, closeProjectPicker, onProjectManagementOpen])

  const openProjectPage = useCallback(() => {
    if (!hasActiveProject) {
      return
    }

    closeProjectPicker()
    closeLaunchpad()
    onProjectWorkspaceOpen('mods')
  }, [closeLaunchpad, closeProjectPicker, hasActiveProject, onProjectWorkspaceOpen])

  const openProjectWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      if (hasActiveProject) {
        closeProjectPicker()
        closeLaunchpad()
        rememberRecentPage({ kind: 'project', mode })
        onProjectWorkspaceOpen(mode)
        return
      }

      if (projectSummaries.length === 0) {
        closeProjectPicker()
        closeLaunchpad()
        onProjectCreateOpen()
        return
      }

      setPendingProjectMode(mode)
    },
    [
      closeLaunchpad,
      closeProjectPicker,
      hasActiveProject,
      onProjectCreateOpen,
      onProjectWorkspaceOpen,
      projectSummaries.length,
      rememberRecentPage,
    ],
  )

  const openProjectCreate = useCallback(() => {
    closeProjectPicker()
    closeLaunchpad()
    onProjectCreateOpen()
  }, [closeLaunchpad, closeProjectPicker, onProjectCreateOpen])

  useEffect(() => {
    if (devViews.some((view) => view.active)) {
      return
    }

    let canceled = false
    const rememberActivePage = (page: RecentPage) => {
      queueMicrotask(() => {
        if (!canceled) {
          rememberRecentPage(page)
        }
      })
    }

    if (workspaceViewMode === 'preview') {
      rememberActivePage({ kind: 'root', mode: workspaceMode })
      return () => {
        canceled = true
      }
    }

    if (workspaceMode !== 'mods' && hasActiveProject) {
      rememberActivePage({ kind: 'project', mode: workspaceMode })
    }

    return () => {
      canceled = true
    }
  }, [devViews, hasActiveProject, rememberRecentPage, workspaceMode, workspaceViewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        onOpenChange(false)
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) {
      return
    }

    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [open])

  const rootCards = useMemo<LaunchpadCard[]>(
    () => [
      ...ROOT_MODES.map((mode) => ({
        id: mode,
        title: navCopy.rootModeLabels[mode],
        description: navCopy.rootModeCodes[mode],
        hint: workspaceMode === mode && workspaceViewMode === 'preview' ? navCopy.currentMarker : '',
        icon: ICON_BY_MODE[mode],
        tone: mode,
        active: workspaceMode === mode && workspaceViewMode === 'preview',
        onOpen: () => {
          rememberRecentPage({ kind: 'root', mode })
          onRootWorkspaceOpen(mode)
          closeLaunchpad()
        },
      })),
      ...devViews.map((view) => ({
        id: view.viewId,
        title: view.title,
        description: 'DEV',
        hint: '',
        icon: Beaker,
        tone: 'mod-i18n',
        onOpen: () => {
          closeProjectPicker()
          closeLaunchpad()
          rememberRecentPage({ kind: 'dev', viewId: view.viewId })
          onDevViewOpen?.(view.viewId)
        },
      })),
    ],
    [
      closeLaunchpad,
      closeProjectPicker,
      devViews,
      navCopy,
      onDevViewOpen,
      onRootWorkspaceOpen,
      rememberRecentPage,
      workspaceMode,
      workspaceViewMode,
    ],
  )

  const projectCards = useMemo<LaunchpadCard[]>(
    () => [
      {
        id: 'project-page',
        title: navCopy.rootModeLabels.mods,
        description: navCopy.rootModeCodes.mods,
        hint: workspaceMode === 'mods' && workspaceViewMode === 'edit' ? navCopy.currentMarker : '',
        icon: Library,
        tone: 'mods',
        disabled: !hasActiveProject,
        active: workspaceMode === 'mods' && workspaceViewMode === 'edit',
        onOpen: openProjectPage,
      },
      {
        id: 'make-map',
        title: navCopy.mapMaking,
        description: hasActiveProject ? navCopy.openProjectTool : navCopy.projectToolLocked,
        hint: '',
        icon: Map,
        tone: 'make-map',
        disabled: !hasActiveProject,
        onOpen: () => {
          openProjectWorkspace('map')
        },
      },
      {
        id: 'make-event',
        title: navCopy.eventMaking,
        description: hasActiveProject ? navCopy.openProjectTool : navCopy.projectToolLocked,
        hint: '',
        icon: GitMerge,
        tone: 'make-event',
        disabled: !hasActiveProject,
        onOpen: () => {
          openProjectWorkspace('events')
        },
      },
      {
        id: 'make-item',
        title: navCopy.itemMaking,
        description: hasActiveProject ? navCopy.openProjectTool : navCopy.projectToolLocked,
        hint: '',
        icon: Package,
        tone: 'make-item',
        disabled: !hasActiveProject,
        onOpen: () => {
          openProjectWorkspace('items')
        },
      },
    ],
    [hasActiveProject, navCopy, openProjectPage, openProjectWorkspace, workspaceMode, workspaceViewMode],
  )

  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const filterCards = useCallback(
    (cards: LaunchpadCard[]) =>
      normalizedQuery
        ? cards.filter((card) =>
            [card.title, card.description, card.hint].some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery)),
          )
        : cards,
    [locale, normalizedQuery],
  )

  const visibleRootCards = filterCards(rootCards)
  const visibleProjectCards = filterCards(projectCards)
  const activeDevView = devViews.find((view) => view.active)
  const visibleRecentPages = recentPages.slice(0, MAX_RECENT_MODES)
  const navigationActive = open || Boolean(pendingProjectMode)
  const projectManagerActive = projectManagementActive && !navigationActive
  const overlayRoot = document.querySelector<HTMLElement>('.app-window-frame') ?? document.body
  const overlay =
    open || pendingProjectMode ? (
      <>
        {open ? (
          <section
            className="workbench-launchpad"
            aria-label={navCopy.title}
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeLaunchpad()
              }
            }}
          >
            <div className="workbench-launchpad-panel">
              <div className="workbench-launchpad-head">
                <div className="workbench-launchpad-title">
                  <span className="workbench-launchpad-eyebrow">{navCopy.eyebrow}</span>
                  <h2>{navCopy.title}</h2>
                </div>
                <div className="workbench-launchpad-head-tools">
                  <label className="workbench-launchpad-search">
                    <Search className="h-4 w-4" aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder={navCopy.searchPlaceholder}
                    />
                  </label>
                  <button type="button" className="workbench-launchpad-close" aria-label={navCopy.closeLaunchpad} onClick={closeLaunchpad}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <LaunchpadSection title={navCopy.rootPages} cards={visibleRootCards} />
              <LaunchpadSection
                title={navCopy.projectChildren}
                framed
                beforeGrid={
                  !hasActiveProject ? (
                    <ProjectRequiredNotice
                      title={navCopy.projectRequiredTitle}
                      description={
                        projectSummaries.length ? navCopy.projectRequiredChooseDescription : navCopy.projectRequiredCreateDescription
                      }
                      selectProjectAction={projectSummaries.length ? navCopy.selectProjectAction : null}
                      createProjectAction={navCopy.createProjectAction}
                      onSelectProject={openProjectManagement}
                      onCreateProject={openProjectCreate}
                    />
                  ) : null
                }
                cards={visibleProjectCards.map((card) => ({
                  ...card,
                }))}
              />
            </div>
          </section>
        ) : null}

        {pendingProjectMode ? (
          <ProjectPickerDialog
            title={navCopy.chooseProjectTitle}
            cancelLabel={navCopy.cancelProjectSelection}
            projects={projectSummaries}
            onCancel={closeProjectPicker}
            onSelect={(draftStorageKey) => {
              const mode = pendingProjectMode
              closeProjectPicker()
              closeLaunchpad()
              rememberRecentPage({ kind: 'project', mode })
              onProjectSelect(draftStorageKey)
              onProjectWorkspaceOpen(mode)
            }}
          />
        ) : null}
      </>
    ) : null

  return (
    <>
      <nav
        className={cx('workbench-quick-dock', dockPlacement === 'titlebar' && 'workbench-quick-dock-titlebar')}
        aria-label={navCopy.recentPages}
      >
        <button
          type="button"
          className={cx('workbench-dock-item workbench-dock-home', navigationActive && 'workbench-dock-item-active')}
          aria-label={navCopy.home}
          aria-current={navigationActive ? 'page' : undefined}
          title={navCopy.home}
          onClick={openLaunchpad}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cx('workbench-dock-item workbench-dock-project', projectManagerActive && 'workbench-dock-item-active')}
          aria-label={navCopy.projectLobby}
          aria-current={projectManagerActive ? 'page' : undefined}
          title={navCopy.projectLobby}
          onClick={openProjectManagement}
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="workbench-dock-separator" aria-hidden="true" />
        {visibleRecentPages.map((page) => {
          const devView = page.kind === 'dev' ? devViews.find((view) => view.viewId === page.viewId) : null
          const Icon = page.kind === 'dev' ? Beaker : ICON_BY_MODE[page.mode]
          const modeLabel =
            page.kind === 'dev'
              ? (devView?.title ?? page.viewId)
              : page.mode === 'mods'
                ? navCopy.rootModeLabels.mods
                : getWorkspaceModeLabel(locale, copy, page.mode)
          const label =
            page.kind === 'dev'
              ? modeLabel
              : page.kind === 'project' && page.mode !== 'mods'
                ? `${navCopy.projectChildren}: ${modeLabel}`
                : modeLabel
          const active =
            page.kind === 'dev'
              ? Boolean(devView?.active)
              : !activeDevView && workspaceMode === page.mode && workspaceViewMode === (page.kind === 'root' ? 'preview' : 'edit')

          return (
            <button
              key={getRecentPageKey(page)}
              type="button"
              className={cx('workbench-dock-item', active && 'workbench-dock-item-active')}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={label}
              onClick={() => {
                if (page.kind === 'dev') {
                  onDevViewOpen?.(page.viewId)
                  return
                }

                if (page.kind === 'root') {
                  onRootWorkspaceOpen(page.mode)
                  return
                }

                if (page.mode === 'mods') {
                  openProjectPage()
                  return
                }

                openProjectWorkspace(page.mode)
              }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          )
        })}
      </nav>
      {overlay ? createPortal(overlay, overlayRoot) : null}
    </>
  )
}

function ProjectPickerDialog({
  title,
  cancelLabel,
  projects,
  onCancel,
  onSelect,
}: {
  title: string
  cancelLabel: string
  projects: CpMakerDraftSummary[]
  onCancel: () => void
  onSelect: (draftStorageKey: string) => void
}) {
  return (
    <section className="workbench-project-picker" role="dialog" aria-modal="true" aria-label={title}>
      <div className="workbench-project-picker-panel">
        <h2>
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          <span>{title}</span>
        </h2>
        <div className="workbench-project-picker-list">
          {projects.map((project) => (
            <button
              key={project.draftStorageKey}
              type="button"
              className="workbench-project-picker-row"
              aria-label={project.projectName || project.draftStorageKey}
              onClick={() => onSelect(project.draftStorageKey)}
            >
              <span className="workbench-project-picker-icon" aria-hidden="true">
                <Package className="h-4 w-4" />
              </span>
              <span className="workbench-project-picker-copy">
                <strong>{project.projectName || project.draftStorageKey}</strong>
                <span>{project.projectUniqueId}</span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="workbench-project-picker-cancel" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </section>
  )
}

function ProjectRequiredNotice({
  title,
  description,
  selectProjectAction,
  createProjectAction,
  onSelectProject,
  onCreateProject,
}: {
  title: string
  description: string
  selectProjectAction: string | null
  createProjectAction: string
  onSelectProject: () => void
  onCreateProject: () => void
}) {
  return (
    <section className="workbench-project-required" aria-label={title}>
      <div className="workbench-project-required-icon" aria-hidden="true">
        <FolderOpen className="h-5 w-5" />
      </div>
      <div className="workbench-project-required-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="workbench-project-required-actions">
        {selectProjectAction ? (
          <button type="button" className="workbench-project-required-button" onClick={onSelectProject}>
            {selectProjectAction}
          </button>
        ) : null}
        <button
          type="button"
          className="workbench-project-required-button workbench-project-required-button-primary"
          onClick={onCreateProject}
        >
          {createProjectAction}
        </button>
      </div>
    </section>
  )
}

function LaunchpadSection({
  title,
  beforeGrid,
  framed,
  cards,
}: {
  title: string
  beforeGrid?: ReactNode
  framed?: boolean
  cards: LaunchpadCard[]
}) {
  return (
    <section className={cx('workbench-launchpad-section', framed && 'workbench-launchpad-section-framed')}>
      <div className="workbench-launchpad-section-head">
        <h3>{title}</h3>
      </div>
      {beforeGrid}
      <div className="workbench-launchpad-grid">
        {cards.map((card) => (
          <LaunchpadButton key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}

function LaunchpadButton({ card }: { card: LaunchpadCard }) {
  const Icon = card.icon

  return (
    <button
      type="button"
      aria-label={card.title}
      className={cx(
        'workbench-launchpad-card',
        card.active && 'workbench-launchpad-card-active',
        card.disabled && 'workbench-launchpad-card-locked',
      )}
      disabled={card.disabled}
      onClick={card.onOpen}
    >
      <span className="workbench-launchpad-icon" data-tone={card.tone} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <span className="workbench-launchpad-copy">
        <strong>{card.title}</strong>
        <span>{card.description}</span>
        <em>{card.hint}</em>
      </span>
    </button>
  )
}
