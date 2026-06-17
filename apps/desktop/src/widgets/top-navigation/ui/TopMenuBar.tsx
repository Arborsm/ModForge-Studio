import { Download, LayoutDashboard, Minus, Moon, Rocket, Settings2, Square, Sun, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { type AppMode, type LauncherPage, type ThemeMode, type WorkspaceMode, type WorkspaceTone } from '@locales/api'
import { useEditorCopy, useSettingsMenuCopy, useViewMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import type { WorkspacePanelMeta } from '@shared/contracts'
import { ProgressRing } from '@shared/ui/ProgressRing'
import GooeyNav, { type GooeyNavItem } from '@shared/ui/GooeyNav'

type TopMenuBarProps = {
  appMode: AppMode
  onAppModeChange: (mode: AppMode) => void
  workspaceMode: WorkspaceMode
  onWorkspaceChange: (mode: WorkspaceMode) => void
  workspaceNavigationDisabled?: boolean
  workspaceViewMode?: 'edit' | 'preview'
  onWorkspaceViewModeChange?: (mode: 'edit' | 'preview') => void
  theme: ThemeMode
  onToggleTheme: () => void
  statusTone: WorkspaceTone
  desktopHost: boolean
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  viewMenu: {
    panelItems: WorkspacePanelMeta[]
    presetNames: string[]
    onTogglePanel: (id: string, visible: boolean) => void
    onResetLayout: () => void
    onSavePreset: (name: string) => void
    onLoadPreset: (name: string) => void
    onDeletePreset: (name: string) => void
  }
  settingsMenu: {
    onOpen: () => void
  }
  projectMenu: {
    highlighted?: boolean
    onOpen: () => void
  }
  workbenchQuickDock?: ReactNode
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
  viewMenu,
  settingsMenu,
  projectMenu,
  workbenchQuickDock,
  launcherChrome,
}: TopMenuBarProps) {
  const copy = useEditorCopy()
  const viewMenuCopy = useViewMenuCopy()
  const settingsMenuCopy = useSettingsMenuCopy()
  const [activeMenu, setActiveMenu] = useState<'view' | 'downloads' | null>(null)
  const viewMenuId = useId()
  const downloadsMenuId = useId()
  const viewMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadsMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadsFloatRef = useRef<HTMLElement | null>(null)
  const launcherModeActive = appMode === 'launcher'
  const launcherNav = launcherModeActive ? launcherChrome : undefined
  const visibleActiveMenu =
    activeMenu === 'view' && launcherModeActive ? null : activeMenu === 'downloads' && !launcherNav ? null : activeMenu
  const viewMenuOpen = visibleActiveMenu === 'view'
  const downloadsMenuOpen = visibleActiveMenu === 'downloads' && Boolean(launcherNav)
  const switchTargetMode: AppMode = launcherModeActive ? 'workbench' : 'launcher'
  const switchTargetLabel = launcherModeActive ? copy.shell.workbench : copy.shell.launcher
  const SwitchTargetIcon = launcherModeActive ? LayoutDashboard : Rocket

  useEffect(() => {
    if (!activeMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        viewMenuRef.current?.contains(target) ||
        downloadsMenuRef.current?.contains(target) ||
        downloadsFloatRef.current?.contains(target)
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

  return (
    <header className="top-menu-bar relative z-120">
      <div className="top-menu-drag-layer absolute inset-0" data-tauri-drag-region aria-hidden="true" />
      <div className="top-menu-primary">
        <div className="top-menu-cluster top-menu-cluster-start flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img className="top-menu-brand-icon" src="/brand/modforge-logo-primary.svg" alt="" aria-hidden="true" />
            <p className="truncate text-sm font-semibold text-(--text-primary)">{copy.brand.name}</p>
          </div>

          {!launcherModeActive ? (
            <nav className="top-menu-menus pointer-events-auto hidden items-center gap-2 xl:flex" aria-label="Main menus">
              <button
                type="button"
                className={cx(
                  'rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]',
                  projectMenu.highlighted ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                )}
                onClick={projectMenu.onOpen}
              >
                {copy.leftDock.project}
              </button>

              <div className="relative" ref={viewMenuRef}>
                <button
                  type="button"
                  className={cx(
                    'rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]',
                    viewMenuOpen ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                  )}
                  aria-haspopup="menu"
                  aria-expanded={viewMenuOpen}
                  aria-controls={viewMenuId}
                  onClick={() => setActiveMenu((current) => (current === 'view' ? null : 'view'))}
                >
                  {viewMenuCopy.title}
                </button>

                {viewMenuOpen ? (
                  <div className="top-menu-dropdown" id={viewMenuId} role="menu" aria-label={viewMenuCopy.title}>
                    <div className="top-menu-section">
                      <p className="top-menu-section-title">{viewMenuCopy.panelsLabel}</p>
                      {viewMenu.panelItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="top-menu-row"
                          role="menuitemcheckbox"
                          aria-checked={item.visible}
                          onClick={() => viewMenu.onTogglePanel(item.id, !item.visible)}
                        >
                          <span>{item.title}</span>
                          <span className={cx('status-pill', item.visible ? 'status-pill-ready' : 'status-pill-idle')}>
                            {item.visible ? viewMenuCopy.panelVisibleLabel : viewMenuCopy.panelHiddenLabel}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="top-menu-section">
                      <p className="top-menu-section-title">{viewMenuCopy.presetsLabel}</p>
                      <button
                        type="button"
                        className="top-menu-row"
                        role="menuitem"
                        onClick={() => {
                          const presetName = window.prompt(viewMenuCopy.presetNamePrompt)
                          if (!presetName?.trim()) {
                            return
                          }

                          viewMenu.onSavePreset(presetName.trim())
                        }}
                      >
                        <span>{viewMenuCopy.savePresetLabel}</span>
                      </button>
                      <button type="button" className="top-menu-row" role="menuitem" onClick={viewMenu.onResetLayout}>
                        <span>{viewMenuCopy.resetLabel}</span>
                      </button>
                      {viewMenu.presetNames.length ? (
                        viewMenu.presetNames.map((name) => (
                          <div key={name} className="top-menu-row">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              role="menuitem"
                              onClick={() => viewMenu.onLoadPreset(name)}
                            >
                              <span className="truncate">{name}</span>
                            </button>
                            <button
                              type="button"
                              className="workspace-panel-action h-7 w-7"
                              onClick={() => {
                                if (!window.confirm(viewMenuCopy.deletePresetConfirm(name))) {
                                  return
                                }

                                viewMenu.onDeletePreset(name)
                              }}
                              title={viewMenuCopy.deletePresetLabel}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="top-menu-empty">{viewMenuCopy.emptyPresetsLabel}</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>

        <div className="top-menu-center flex min-w-0 items-center justify-self-center">
          {launcherNav ? (
            <div className="top-menu-workspace pointer-events-auto">
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
          ) : (
            workbenchQuickDock
          )}
        </div>

        <div
          className="top-menu-cluster top-menu-controls flex min-w-0 items-center gap-2 justify-self-end"
          role="group"
          aria-label="Shell controls"
        >
          <span className={cx('status-pill status-pill-compact', `status-pill-${statusTone}`)}>{copy.statusTone[statusTone]}</span>
          {launcherNav ? (
            <div className="top-menu-launcher-tools pointer-events-auto" ref={downloadsMenuRef}>
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
            onClick={() => onAppModeChange(switchTargetMode)}
            aria-label={switchTargetLabel}
            title={switchTargetLabel}
          >
            <SwitchTargetIcon className="h-4 w-4" />
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
            <div className="panel-section-muted panel-section pointer-events-auto ml-1 flex items-center overflow-hidden rounded-lg">
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
                className="window-control-button border-l border-[var(--border-color)]"
                onClick={onToggleMaximizeWindow}
                aria-label="Maximize window"
                title="Maximize"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="window-control-button window-control-close border-l border-[var(--border-color)]"
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
