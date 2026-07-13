import { ChevronDown, Download, LayoutDashboard, Minus, Moon, Rocket, Settings2, Square, Sun, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { type AppMode, type LauncherPage, type ThemeMode, type WorkspaceTone } from '@locales/api'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { ProgressRing } from '@shared/ui/ProgressRing'
import GooeyNav, { type GooeyNavItem } from '@shared/ui/GooeyNav'

export type TopMenuBarProjectRecentItem = {
  draftStorageKey: string
  title: string
  uniqueId: string
  version?: string
  isCurrent?: boolean
}

export type TopMenuBarProjectMenu = {
  title: string | null
  version: string | null
  uniqueId: string | null
  recentProjects: readonly TopMenuBarProjectRecentItem[]
  hasActiveProject: boolean
  onSelectProject: (draftStorageKey: string) => void
  onCreateProject: () => void
  onOpenProject: () => void
  onImportProject: () => void
  onProjectSettings: () => void
  onRevealProject?: () => void
  onExportProject: () => void
  onCloseProject: () => void
}

type TopMenuBarProps = {
  appMode: AppMode
  onAppModeChange: (mode: AppMode) => void
  theme: ThemeMode
  onToggleTheme: () => void
  statusTone: WorkspaceTone
  desktopHost: boolean
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  settingsMenu: {
    onOpen: () => void
  }
  /**
   * Workbench project center. When provided in workbench mode, fills the titlebar center slot.
   */
  projectMenu?: TopMenuBarProjectMenu
  launcherChrome?: {
    page: LauncherPage
    visiblePages: LauncherPage[]
    onPageChange: (page: LauncherPage) => void
    updatesBadgeCount: number
    downloadsBadgeCount: number
    downloadsProgressPercent: number | null
    downloadsHasFailure: boolean
    settingsWarning: boolean
    settingsWarningLabel: string
    downloadsPopover: ReactNode
  }
}

function formatLauncherNavBadgeCount(count: number) {
  if (count <= 0) {
    return null
  }

  return count > 99 ? '99+' : String(count)
}

export default function TopMenuBar({
  appMode,
  onAppModeChange,
  theme,
  onToggleTheme,
  statusTone,
  desktopHost,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  settingsMenu,
  projectMenu,
  launcherChrome,
}: TopMenuBarProps) {
  const copy = useEditorCopy()
  const settingsMenuCopy = useSettingsMenuCopy()
  const navCopy = copy.workbenchNavigation
  const [activeMenu, setActiveMenu] = useState<'downloads' | 'project' | null>(null)
  const downloadsMenuId = useId()
  const projectMenuId = useId()
  const downloadsMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadsFloatRef = useRef<HTMLElement | null>(null)
  const projectMenuRef = useRef<HTMLDivElement | null>(null)
  const launcherModeActive = appMode === 'launcher'
  const launcherNav = launcherModeActive ? launcherChrome : undefined
  const projectMenuOpen = activeMenu === 'project' && Boolean(projectMenu) && !launcherModeActive
  const visibleActiveMenu =
    activeMenu === 'downloads' && !launcherNav ? null : activeMenu === 'project' && (launcherModeActive || !projectMenu) ? null : activeMenu
  const downloadsMenuOpen = visibleActiveMenu === 'downloads' && Boolean(launcherNav)
  useEffect(() => {
    if (!activeMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        downloadsMenuRef.current?.contains(target) ||
        downloadsFloatRef.current?.contains(target) ||
        projectMenuRef.current?.contains(target)
      ) {
        return
      }

      setActiveMenu(null)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [activeMenu])

  useEffect(() => {
    if (!activeMenu) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveMenu(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeMenu])

  const closeProjectMenuAnd = (action: () => void) => {
    setActiveMenu(null)
    action()
  }

  return (
    <header className="top-menu-bar relative z-120">
      <div className="top-menu-drag-layer absolute inset-0" data-tauri-drag-region aria-hidden="true" />
      <div className="top-menu-primary">
        <div className="top-menu-cluster top-menu-cluster-start flex min-w-0 items-center gap-4">
          <div className="flex shrink-0 items-center">
            <img className="top-menu-brand-icon" src="/brand/modforge-logo-primary.svg" alt="" aria-hidden="true" />
          </div>

          <div
            className="top-menu-mode-segment pointer-events-auto"
            role="group"
            aria-label={copy.shell.modeLabel}
            data-top-menu-no-drag="true"
          >
            <button
              type="button"
              className="top-menu-mode-option"
              data-active={launcherModeActive ? 'true' : 'false'}
              aria-pressed={launcherModeActive}
              title={copy.shell.launcher}
              onClick={() => {
                if (!launcherModeActive) onAppModeChange('launcher')
              }}
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              <span>{copy.shell.launcher}</span>
            </button>
            <button
              type="button"
              className="top-menu-mode-option"
              data-active={!launcherModeActive ? 'true' : 'false'}
              aria-pressed={!launcherModeActive}
              title={copy.shell.workbench}
              onClick={() => {
                if (launcherModeActive) onAppModeChange('workbench')
              }}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              <span>{copy.shell.workbench}</span>
            </button>
          </div>
        </div>

        <div className="top-menu-center flex min-w-0 items-center justify-self-center">
          {launcherNav ? (
            <div className="top-menu-workspace pointer-events-auto" data-top-menu-no-drag="true">
              <div className="top-menu-workspace-list">
                <GooeyNav
                  items={launcherNav.visiblePages.map((page) => {
                    const updatesBadge = page === 'updates' ? formatLauncherNavBadgeCount(launcherNav.updatesBadgeCount) : null
                    return {
                      label: copy.launcher.pages[page],
                      badge: updatesBadge ?? undefined,
                    } satisfies GooeyNavItem
                  })}
                  activeIndex={launcherNav.visiblePages.indexOf(launcherNav.page)}
                  onChange={(index) => launcherNav.onPageChange(launcherNav.visiblePages[index])}
                  ariaLabel={copy.launcher.navigation}
                  className="top-menu-gooey-nav"
                  variant={theme}
                />
              </div>
            </div>
          ) : projectMenu ? (
            <div className="pointer-events-auto relative" ref={projectMenuRef} data-top-menu-no-drag="true">
              <button
                type="button"
                className={cx('top-menu-project-title', !projectMenu.hasActiveProject && 'is-empty')}
                aria-haspopup="menu"
                aria-expanded={projectMenuOpen}
                aria-controls={projectMenuId}
                title={projectMenu.title ?? navCopy.shellProjectTitleEmpty}
                onClick={() => setActiveMenu((current) => (current === 'project' ? null : 'project'))}
              >
                <span className="dot" aria-hidden="true" />
                <span className="name">{projectMenu.title ?? navCopy.shellProjectTitleEmpty}</span>
                <span className="meta">
                  {projectMenu.hasActiveProject
                    ? projectMenu.version
                      ? `v${projectMenu.version.replace(/^v/i, '')}`
                      : ''
                    : navCopy.shellProjectTitleEmptyMeta}
                </span>
                <ChevronDown className="chev" aria-hidden="true" />
              </button>

              {projectMenuOpen ? (
                <div className="top-menu-project-menu" id={projectMenuId} role="menu" aria-label={navCopy.currentProjectLabel}>
                  <div className="top-menu-project-menu-head">
                    <strong>{projectMenu.title ?? navCopy.shellProjectTitleEmpty}</strong>
                    <span>{projectMenu.uniqueId ?? navCopy.shellProjectMenuEmptyId}</span>
                  </div>

                  {projectMenu.recentProjects.length ? (
                    <>
                      <p className="top-menu-project-menu-label">{navCopy.shellProjectMenuRecent}</p>
                      {projectMenu.recentProjects.slice(0, 6).map((project) => (
                        <button
                          key={project.draftStorageKey}
                          type="button"
                          role="menuitem"
                          className="top-menu-project-menu-item"
                          aria-current={project.isCurrent ? 'true' : undefined}
                          onClick={() => closeProjectMenuAnd(() => projectMenu.onSelectProject(project.draftStorageKey))}
                        >
                          <span className="pm-copy">
                            <strong>{project.title}</strong>
                            <em>{project.uniqueId}</em>
                          </span>
                        </button>
                      ))}
                      <div className="top-menu-project-menu-sep" />
                    </>
                  ) : null}

                  <button
                    type="button"
                    role="menuitem"
                    className="top-menu-project-menu-item"
                    onClick={() => closeProjectMenuAnd(projectMenu.onCreateProject)}
                  >
                    {navCopy.shellProjectMenuNew}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="top-menu-project-menu-item"
                    onClick={() => closeProjectMenuAnd(projectMenu.onOpenProject)}
                  >
                    {navCopy.shellProjectMenuOpen}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="top-menu-project-menu-item"
                    onClick={() => closeProjectMenuAnd(projectMenu.onImportProject)}
                  >
                    {navCopy.shellProjectMenuImport}
                  </button>
                  <div className="top-menu-project-menu-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="top-menu-project-menu-item"
                    disabled={!projectMenu.hasActiveProject}
                    onClick={() => {
                      if (!projectMenu.hasActiveProject) return
                      closeProjectMenuAnd(projectMenu.onProjectSettings)
                    }}
                  >
                    {navCopy.shellProjectMenuSettings}
                  </button>
                  {projectMenu.onRevealProject ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="top-menu-project-menu-item"
                      disabled={!projectMenu.hasActiveProject}
                      onClick={() => {
                        if (!projectMenu.hasActiveProject) return
                        closeProjectMenuAnd(projectMenu.onRevealProject!)
                      }}
                    >
                      {navCopy.shellProjectMenuReveal}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="top-menu-project-menu-item"
                    disabled={!projectMenu.hasActiveProject}
                    onClick={() => {
                      if (!projectMenu.hasActiveProject) return
                      closeProjectMenuAnd(projectMenu.onExportProject)
                    }}
                  >
                    {navCopy.shellProjectMenuExport}
                  </button>
                  <div className="top-menu-project-menu-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="top-menu-project-menu-item"
                    disabled={!projectMenu.hasActiveProject}
                    onClick={() => {
                      if (!projectMenu.hasActiveProject) return
                      closeProjectMenuAnd(projectMenu.onCloseProject)
                    }}
                  >
                    {navCopy.shellProjectMenuClose}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="top-menu-cluster top-menu-controls flex min-w-0 items-center gap-2 justify-self-end"
          role="group"
          aria-label="Shell controls"
          data-top-menu-no-drag="true"
        >
          <span className={cx('status-pill status-pill-compact', `status-pill-${statusTone}`)}>{copy.statusTone[statusTone]}</span>
          {launcherNav ? (
            <div className="top-menu-launcher-tools pointer-events-auto" ref={downloadsMenuRef} data-top-menu-no-drag="true">
              <button
                type="button"
                className={cx(
                  'icon-button top-menu-icon-action pointer-events-auto',
                  downloadsMenuOpen && 'top-menu-icon-action-active',
                  launcherNav.downloadsHasFailure && 'top-menu-icon-action-failure',
                )}
                aria-label={copy.launcher.downloads.title}
                aria-haspopup="dialog"
                aria-expanded={downloadsMenuOpen}
                aria-controls={downloadsMenuId}
                onClick={() => setActiveMenu((current) => (current === 'downloads' ? null : 'downloads'))}
              >
                {launcherNav.downloadsProgressPercent !== null ? (
                  <ProgressRing
                    progress={launcherNav.downloadsProgressPercent}
                    size={32}
                    strokeWidth={2.5}
                    label={`${copy.launcher.downloads.title} progress`}
                    className="top-menu-icon-progress-ring"
                  >
                    <Download className="h-4 w-4" />
                  </ProgressRing>
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {launcherNav.downloadsBadgeCount > 0 ? (
                  <span className={cx('top-menu-icon-badge', launcherNav.downloadsHasFailure && 'top-menu-icon-badge-failure')}>
                    {launcherNav.downloadsBadgeCount}
                  </span>
                ) : null}
              </button>
              {downloadsMenuOpen ? (
                <section
                  className="top-menu-float-panel launcher-downloads-float panel-surface panel-surface-muted pointer-events-auto"
                  id={downloadsMenuId}
                  role="dialog"
                  aria-label={copy.launcher.downloads.title}
                  ref={downloadsFloatRef}
                  onClick={(event) => event.stopPropagation()}
                >
                  {launcherNav.downloadsPopover}
                </section>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="icon-button pointer-events-auto"
            onClick={onToggleTheme}
            aria-label={copy.controls.toggleTheme}
            title={copy.controls.toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="icon-button pointer-events-auto"
            onClick={() => {
              setActiveMenu(null)
              settingsMenu.onOpen()
            }}
            aria-label={launcherNav ? `${settingsMenuCopy.title} Dialog` : settingsMenuCopy.title}
            title={settingsMenuCopy.title}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {desktopHost ? (
            <div
              className="panel-section-muted panel-section pointer-events-auto ml-1 flex items-center overflow-hidden rounded-lg"
              data-top-menu-no-drag="true"
            >
              <button
                type="button"
                className="window-control-button"
                onClick={onMinimizeWindow}
                aria-label="Minimize window"
                title="Minimize"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="window-control-button border-l border-(--border-color)"
                onClick={onToggleMaximizeWindow}
                aria-label="Maximize window"
                title="Maximize"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="window-control-button window-control-close border-l border-(--border-color)"
                onClick={onCloseWindow}
                aria-label="Close window"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
