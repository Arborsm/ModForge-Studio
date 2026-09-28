/**
 * @file Top menu bar component: hosts mode switching, project menu, launcher navigation, and window controls.
 */
import {
  Bell,
  BookOpenText,
  ChevronDown,
  Compass,
  Download,
  LayoutDashboard,
  Minus,
  Moon,
  RefreshCw,
  Rocket,
  Settings2,
  Square,
  Stethoscope,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { type AppMode, type LauncherPage, type ThemeMode } from '@locales/api'
import { useEditorCopy, useNotificationCopy, useSettingsMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useLauncherMobileChromeStore, useLauncherOverlayDismissStore } from '@shared/lib/app-state'
import { ProgressRing } from '@shared/ui/ProgressRing'
import { NotificationCenter, markNotificationsSeen, useUnreadNotificationCount } from '@shared/ui/notifications'
import GooeyNav, { type GooeyNavItem } from '@shared/ui/GooeyNav'

/** "Recent projects" list item for the top menu bar. */
export type TopMenuBarProjectRecentItem = {
  draftStorageKey: string
  title: string
  uniqueId: string
  version?: string
  isCurrent?: boolean
}

/** Configuration and callbacks for the top menu bar project hub menu. */
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
  /**
   * Whether the launcher/workbench mode switcher is rendered. Hosts locked to
   * the launcher (Android) pass `false`; desktop keeps the default `true`.
   */
  modeSwitchable?: boolean
  theme: ThemeMode
  onToggleTheme: () => void
  desktopHost: boolean
  /**
   * True inside the Android WebView launcher host; hides the brand, the theme
   * toggle, and the desktop GooeyNav (a fixed bottom nav renders instead), and
   * fills the bar center with the page-injected mobile leading slot.
   */
  androidHost?: boolean
  /**
   * Whether the desktop window control group (minimize / maximize / close) is
   * shown; hosts without desktop window semantics (e.g. Android) hide it.
   * Defaults to `desktopHost` for callers that never split the two concepts.
   */
  windowControls?: boolean
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
    downloadsPopover: ReactNode
    /**
     * Provided by page-style hosts (Android): opens downloads/notifications as
     * full-screen pages instead of the anchored titlebar floats.
     */
    onOpenDownloads?: () => void
    onOpenNotifications?: () => void
  }
}

function formatLauncherNavBadgeCount(count: number) {
  if (count <= 0) {
    return null
  }

  return count > 99 ? '99+' : String(count)
}

/**
 * Top menu bar. Switches between launcher and workbench modes; displays the project menu,
 * launcher navigation tabs, downloads entry, theme toggle, settings entry, and window control buttons.
 */
export default function TopMenuBar({
  appMode,
  onAppModeChange,
  modeSwitchable = true,
  theme,
  onToggleTheme,
  desktopHost,
  androidHost = false,
  windowControls = desktopHost,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  settingsMenu,
  projectMenu,
  launcherChrome,
}: TopMenuBarProps) {
  const copy = useEditorCopy()
  const settingsMenuCopy = useSettingsMenuCopy()
  const notificationCopy = useNotificationCopy()
  const navCopy = copy.workbenchNavigation
  const unreadNotificationCount = useUnreadNotificationCount()
  const [activeMenu, setActiveMenu] = useState<'downloads' | 'project' | 'notifications' | null>(null)
  const downloadsMenuId = useId()
  const projectMenuId = useId()
  const downloadsMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadsFloatRef = useRef<HTMLElement | null>(null)
  const notificationsFloatRef = useRef<HTMLElement | null>(null)
  const projectMenuRef = useRef<HTMLDivElement | null>(null)
  const launcherModeActive = appMode === 'launcher'
  const launcherNav = launcherModeActive ? launcherChrome : undefined
  const mobileTopLeading = useLauncherMobileChromeStore((state) => state.leading)
  const projectMenuOpen = activeMenu === 'project' && Boolean(projectMenu) && !launcherModeActive
  const visibleActiveMenu =
    activeMenu === 'downloads' && !launcherNav ? null : activeMenu === 'project' && (launcherModeActive || !projectMenu) ? null : activeMenu
  const downloadsMenuOpen = visibleActiveMenu === 'downloads' && Boolean(launcherNav)
  const notificationsMenuOpen = visibleActiveMenu === 'notifications'
  useEffect(() => {
    if (!activeMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        downloadsMenuRef.current?.contains(target) ||
        downloadsFloatRef.current?.contains(target) ||
        notificationsFloatRef.current?.contains(target) ||
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
    <header className={cx('top-menu-bar relative z-120', androidHost && 'top-menu-bar-android')}>
      <div className="top-menu-drag-layer absolute inset-0" data-tauri-drag-region aria-hidden="true" />
      <div className="top-menu-primary">
        <div className="top-menu-cluster top-menu-cluster-start flex min-w-0 items-center gap-4">
          {androidHost ? null : (
            <div className="flex shrink-0 items-center">
              <img className="top-menu-brand-icon" src="/brand/modforge-logo-primary.svg" alt="" aria-hidden="true" />
            </div>
          )}

          {modeSwitchable ? (
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
          ) : null}
        </div>

        <div className="top-menu-center flex min-w-0 items-center justify-self-center">
          {launcherNav ? (
            androidHost ? (
              /* The Android host fills the bar with page-injected content
                 (search field or page title) from the mobile chrome slot. */
              <div className="top-menu-mobile-leading pointer-events-auto min-w-0 flex-1" data-top-menu-no-drag="true">
                {mobileTopLeading}
              </div>
            ) : (
              <div className="top-menu-workspace pointer-events-auto" data-top-menu-no-drag="true">
                <div className="top-menu-workspace-list" data-guide="launcher-nav-tabs">
                  <GooeyNav
                    items={launcherNav.visiblePages.map((page) => {
                      const updatesBadge = page === 'updates' ? formatLauncherNavBadgeCount(launcherNav.updatesBadgeCount) : null
                      const pageIcon = {
                        library: <BookOpenText className="h-5 w-5" />,
                        discover: <Compass className="h-5 w-5" />,
                        updates: <RefreshCw className="h-5 w-5" />,
                        configuration: <Stethoscope className="h-5 w-5" />,
                      }[page]
                      return {
                        label: copy.launcher.pages[page],
                        icon: pageIcon,
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
            )
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
                aria-haspopup={launcherNav.onOpenDownloads ? undefined : 'dialog'}
                aria-expanded={launcherNav.onOpenDownloads ? undefined : downloadsMenuOpen}
                aria-controls={launcherNav.onOpenDownloads ? undefined : downloadsMenuId}
                onClick={() => {
                  // Page-style hosts open downloads as a full-screen page.
                  if (launcherNav.onOpenDownloads) {
                    launcherNav.onOpenDownloads()
                    return
                  }
                  const downloadsOpening = activeMenu !== 'downloads'
                  setActiveMenu(downloadsOpening ? 'downloads' : null)
                  // The downloads float renders inside the window frame, so it
                  // cannot stack above the body-portal mod detail drawer; ask
                  // launcher pages to close their detail panel instead.
                  if (downloadsOpening) {
                    useLauncherOverlayDismissStore.getState().requestLauncherOverlayDismiss()
                  }
                }}
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
              <button
                type="button"
                className={cx(
                  'icon-button top-menu-icon-action pointer-events-auto',
                  notificationsMenuOpen && 'top-menu-icon-action-active',
                )}
                aria-label={
                  unreadNotificationCount > 0
                    ? notificationCopy.unreadBadgeAriaLabel(unreadNotificationCount)
                    : notificationCopy.centerTitle
                }
                aria-haspopup={launcherNav.onOpenNotifications ? undefined : 'dialog'}
                aria-expanded={launcherNav.onOpenNotifications ? undefined : notificationsMenuOpen}
                onClick={() => {
                  // Page-style hosts open the notification center as a page.
                  if (launcherNav.onOpenNotifications) {
                    launcherNav.onOpenNotifications()
                    return
                  }
                  const notificationsOpening = activeMenu !== 'notifications'
                  setActiveMenu(notificationsOpening ? 'notifications' : null)
                  // The float shares the downloads float's layer constraints and
                  // reading the center marks every record seen.
                  if (notificationsOpening) {
                    markNotificationsSeen()
                    useLauncherOverlayDismissStore.getState().requestLauncherOverlayDismiss()
                  }
                }}
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationCount > 0 ? (
                  <span className="top-menu-icon-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>
                ) : null}
              </button>
              {notificationsMenuOpen ? (
                <section
                  className="top-menu-float-panel top-menu-notifications-float panel-surface panel-surface-muted pointer-events-auto"
                  role="dialog"
                  aria-label={notificationCopy.centerTitle}
                  ref={notificationsFloatRef}
                  onClick={(event) => event.stopPropagation()}
                >
                  <NotificationCenter />
                </section>
              ) : null}
            </div>
          ) : null}
          {androidHost ? null : (
            <button
              type="button"
              className="icon-button pointer-events-auto"
              onClick={onToggleTheme}
              aria-label={copy.controls.toggleTheme}
              title={copy.controls.toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}
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
          {desktopHost && windowControls ? (
            <div
              className="top-menu-window-controls border-border-subtle bg-surface-panel-muted pointer-events-auto ml-1 flex items-center overflow-hidden rounded-lg border"
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
                className="window-control-button border-border-subtle border-l"
                onClick={onToggleMaximizeWindow}
                aria-label="Maximize window"
                title="Maximize"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="window-control-button window-control-close border-border-subtle border-l"
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
