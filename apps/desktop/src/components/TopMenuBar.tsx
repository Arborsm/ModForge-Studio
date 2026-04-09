import {
  Castle,
  Download,
  GitMerge,
  LayoutDashboard,
  Library,
  Map,
  Minus,
  Moon,
  Package,
  Rocket,
  Settings2,
  Square,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  getWorkspaceModeLabel,
  launcherPages,
  type AppMode,
  type LauncherPage,
  type ThemeMode,
  type WorkspaceMode,
  type WorkspaceTone,
} from '../lib/editor-shell'
import { useEditorCopy, useLocale, useSettingsMenuCopy, useViewMenuCopy } from '../lib/app/localeContext'
import { cx } from '../lib/cx'
import type { WorkspacePanelMeta } from './WorkspaceLayout'

type TopMenuBarProps = {
  appMode: AppMode
  onAppModeChange: (mode: AppMode) => void
  workspaceMode: WorkspaceMode
  onWorkspaceChange: (mode: WorkspaceMode) => void
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
  launcherChrome?: {
    page: LauncherPage
    onPageChange: (page: LauncherPage) => void
    downloadsBadgeCount: number
    downloadsHasFailure: boolean
    settingsWarning: boolean
    settingsWarningLabel: string
    downloadsPopover: ReactNode
  }
}

const MODULE_ICONS = {
  map: Map,
  characters: Users,
  buildings: Castle,
  items: Package,
  events: GitMerge,
  mods: Library,
} satisfies Record<WorkspaceMode, typeof Map>

export default function TopMenuBar({
  appMode,
  onAppModeChange,
  workspaceMode,
  onWorkspaceChange,
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
  launcherChrome,
}: TopMenuBarProps) {
  const copy = useEditorCopy()
  const locale = useLocale()
  const viewMenuCopy = useViewMenuCopy()
  const settingsMenuCopy = useSettingsMenuCopy()
  const [activeMenu, setActiveMenu] = useState<'view' | 'downloads' | null>(null)
  const viewMenuId = useId()
  const downloadsMenuId = useId()
  const viewMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadsMenuRef = useRef<HTMLDivElement | null>(null)
  const downloadsFloatRef = useRef<HTMLElement | null>(null)
  const orderedNavModes: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items', 'mods']
  const visibleNavEntries = (orderedNavModes.length ? orderedNavModes : workspaceModes).map((mode) => [
    mode,
    getWorkspaceModeLabel(locale, copy, mode),
  ] as const)
  const launcherModeActive = appMode === 'launcher'
  const launcherNav = launcherModeActive ? launcherChrome : undefined
  const viewMenuOpen = activeMenu === 'view'
  const downloadsMenuOpen = activeMenu === 'downloads' && Boolean(launcherNav)
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
    <header className="top-menu-bar relative z-[120]">
      <div className="top-menu-drag-layer absolute inset-0" data-tauri-drag-region aria-hidden="true" />
      <div className="top-menu-primary">
        <div className="top-menu-cluster top-menu-cluster-start flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="panel-section flex h-8 w-8 items-center justify-center border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent)] text-xs font-black tracking-[0.18em] text-white">
              MF
            </div>
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{copy.brand.name}</p>
          </div>

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
        </div>

        <div className="top-menu-center flex min-w-0 items-center justify-self-center">
          <div className="top-menu-workspace pointer-events-auto">
            <div className="top-menu-workspace-list">
              {!launcherNav ? (
                <nav className="contents" aria-label={copy.center.moduleWorkspace}>
                  {visibleNavEntries.map(([typedMode, label]) => {
                    const Icon = MODULE_ICONS[typedMode]
                    const active = workspaceMode === typedMode

                    return (
                      <button
                        key={typedMode}
                        type="button"
                        aria-current={active ? 'page' : undefined}
                        data-active={active}
                        className={cx(
                          'top-menu-module-button inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors',
                          active
                            ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]',
                        )}
                        onClick={() => onWorkspaceChange(typedMode)}
                      >
                        <Icon className={cx('h-4 w-4', active && 'text-[var(--accent)]')} />
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </nav>
              ) : (
                <>
                  <nav className="contents" aria-label={copy.launcher.navigation}>
                    {launcherPages.map((page) => {
                      const active = launcherNav.page === page
                      const warning = page === 'settings' && launcherNav.settingsWarning

                      return (
                        <button
                          key={page}
                          type="button"
                          aria-current={active ? 'page' : undefined}
                          data-active={active}
                          title={warning ? launcherNav.settingsWarningLabel : copy.launcher.descriptions[page]}
                          className={cx(
                            'top-menu-module-button top-menu-launcher-nav-button inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors',
                            active
                              ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]',
                          )}
                          onClick={() => launcherNav.onPageChange(page)}
                        >
                          <span>{copy.launcher.pages[page]}</span>
                          {warning ? (
                            <span
                              className="top-menu-warning-dot"
                              aria-hidden="true"
                              title={launcherNav.settingsWarningLabel}
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </nav>

                </>
              )}
            </div>
          </div>
        </div>

        <div className="top-menu-cluster top-menu-controls flex min-w-0 items-center justify-self-end gap-2" role="group" aria-label="Shell controls">
          <span className={cx('status-pill status-pill-compact', `status-pill-${statusTone}`)}>{copy.statusTone[statusTone]}</span>
          {launcherNav ? (
            <div className="top-menu-launcher-tools" ref={downloadsMenuRef}>
              <button
                type="button"
                className={cx(
                  'top-menu-icon-action',
                  downloadsMenuOpen && 'top-menu-icon-action-active',
                  launcherNav.downloadsHasFailure && 'top-menu-icon-action-failure',
                )}
                aria-label={copy.launcher.downloads.title}
                aria-haspopup="dialog"
                aria-expanded={downloadsMenuOpen}
                aria-controls={downloadsMenuId}
                onClick={() => setActiveMenu((current) => (current === 'downloads' ? null : 'downloads'))}
              >
                <Download className="h-4 w-4" />
                {launcherNav.downloadsBadgeCount > 0 ? (
                  <span
                    className={cx(
                      'top-menu-icon-badge',
                      launcherNav.downloadsHasFailure && 'top-menu-icon-badge-failure',
                    )}
                  >
                    {launcherNav.downloadsBadgeCount}
                  </span>
                ) : null}
              </button>
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

      {downloadsMenuOpen ? (
        <div className="top-menu-float-backdrop" role="presentation" onClick={() => setActiveMenu(null)}>
          <section
            className="top-menu-float-panel launcher-downloads-float panel-surface panel-surface-muted"
            id={downloadsMenuId}
            role="dialog"
            aria-modal="true"
            aria-label={copy.launcher.downloads.title}
            ref={downloadsFloatRef}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button top-menu-float-close"
              onClick={() => setActiveMenu(null)}
              aria-label={copy.launcher.actions.closeDialog}
              title={copy.launcher.actions.closeDialog}
            >
              <X className="h-4 w-4" />
            </button>
            {launcherNav?.downloadsPopover}
          </section>
        </div>
      ) : null}
    </header>
  )
}

const workspaceModes: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items', 'mods']
