import { Castle, FolderOpen, GitMerge, Home, Languages, Library, Map, Package, Search, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { getWorkspaceModeLabel, type WorkspaceMode } from '@locales/editor-shell'
import { useEditorCopy, useLocale } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import type { CpMakerDraftSummary } from '@features/cp-maker'

type WorkbenchLaunchpadNavigationProps = {
  open: boolean
  workspaceMode: WorkspaceMode
  workspaceViewMode: 'edit' | 'preview'
  hasActiveProject: boolean
  projectSummaries: CpMakerDraftSummary[]
  onOpenChange: (open: boolean) => void
  onRootWorkspaceOpen: (mode: WorkspaceMode) => void
  onProjectWorkspaceOpen: (mode: WorkspaceMode) => void
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

const ROOT_MODES: WorkspaceMode[] = ['mods', 'map', 'events', 'characters', 'buildings', 'items', 'mod-i18n']
const DEFAULT_RECENT_MODES: WorkspaceMode[] = ['mods']
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

export default function WorkbenchLaunchpadNavigation({
  open,
  workspaceMode,
  workspaceViewMode,
  hasActiveProject,
  projectSummaries,
  onOpenChange,
  onRootWorkspaceOpen,
  onProjectWorkspaceOpen,
  onProjectManagementOpen,
  onProjectCreateOpen,
  onProjectSelect,
}: WorkbenchLaunchpadNavigationProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const navCopy = copy.workbenchNavigation
  const [query, setQuery] = useState('')
  const [pendingProjectMode, setPendingProjectMode] = useState<WorkspaceMode | null>(null)
  const [recentModes, setRecentModes] = useState<WorkspaceMode[]>(() =>
    workspaceViewMode === 'preview'
      ? [workspaceMode, ...DEFAULT_RECENT_MODES.filter((mode) => mode !== workspaceMode)]
      : DEFAULT_RECENT_MODES,
  )
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const closeLaunchpad = useCallback(() => onOpenChange(false), [onOpenChange])
  const openLaunchpad = useCallback(() => onOpenChange(true), [onOpenChange])
  const closeProjectPicker = useCallback(() => setPendingProjectMode(null), [])
  const rememberRootMode = useCallback((mode: WorkspaceMode) => {
    setRecentModes((current) => [mode, ...current.filter((candidate) => candidate !== mode)].slice(0, MAX_RECENT_MODES))
  }, [])

  const openProjectManagement = useCallback(() => {
    closeProjectPicker()
    closeLaunchpad()
    onProjectManagementOpen()
  }, [closeLaunchpad, closeProjectPicker, onProjectManagementOpen])

  const openProjectWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      if (hasActiveProject) {
        closeProjectPicker()
        closeLaunchpad()
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
    [closeLaunchpad, closeProjectPicker, hasActiveProject, onProjectCreateOpen, onProjectWorkspaceOpen, projectSummaries.length],
  )

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
        hint: workspaceMode === mode ? navCopy.currentMarker : '',
        icon: ICON_BY_MODE[mode],
        tone: mode,
        active: workspaceMode === mode && workspaceViewMode === 'preview',
        onOpen: () => {
          rememberRootMode(mode)
          onRootWorkspaceOpen(mode)
          closeLaunchpad()
        },
      })),
    ],
    [closeLaunchpad, navCopy, onRootWorkspaceOpen, rememberRootMode, workspaceMode, workspaceViewMode],
  )

  const projectCards = useMemo<LaunchpadCard[]>(
    () => [
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
    [hasActiveProject, navCopy, openProjectWorkspace],
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
  const visibleRecentModes =
    workspaceViewMode === 'preview'
      ? [workspaceMode, ...recentModes.filter((mode) => mode !== workspaceMode)].slice(0, MAX_RECENT_MODES)
      : recentModes

  return (
    <>
      <nav className="workbench-quick-dock" aria-label={navCopy.recentPages}>
        <button
          type="button"
          className="workbench-dock-item workbench-dock-home"
          aria-label={navCopy.home}
          title={navCopy.home}
          onClick={openLaunchpad}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="workbench-dock-item workbench-dock-project"
          aria-label={navCopy.projectLobby}
          title={navCopy.projectLobby}
          onClick={openProjectManagement}
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="workbench-dock-separator" aria-hidden="true" />
        {visibleRecentModes.map((mode) => {
          const Icon = ICON_BY_MODE[mode]
          const label = getWorkspaceModeLabel(locale, copy, mode)
          const active = workspaceMode === mode && workspaceViewMode === 'preview'

          return (
            <button
              key={mode}
              type="button"
              className={cx('workbench-dock-item', active && 'workbench-dock-item-active')}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              title={label}
              onClick={() => {
                rememberRootMode(mode)
                onRootWorkspaceOpen(mode)
              }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          )
        })}
      </nav>

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
                    onCreateProject={onProjectCreateOpen}
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
            onProjectSelect(draftStorageKey)
            onProjectWorkspaceOpen(mode)
          }}
        />
      ) : null}
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
