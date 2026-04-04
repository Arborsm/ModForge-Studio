import {
  Castle,
  GitMerge,
  Globe,
  Library,
  Map,
  Minus,
  Moon,
  Package,
  Square,
  Settings2,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  getWorkspaceModeLabel,
  workspaceModes,
  type EditorCopy,
  type LocaleCode,
  type ThemeMode,
  type WorkspaceMode,
  type WorkspaceTone,
} from '../lib/editor-shell'
import { cx } from '../lib/cx'
import type { WorkspacePanelMeta } from './WorkspaceLayout'

type TopMenuBarProps = {
  copy: EditorCopy
  workspaceMode: WorkspaceMode
  onWorkspaceChange: (mode: WorkspaceMode) => void
  theme: ThemeMode
  onToggleTheme: () => void
  locale: LocaleCode
  onToggleLocale: () => void
  statusTone: WorkspaceTone
  desktopHost: boolean
  onMinimizeWindow: () => void
  onToggleMaximizeWindow: () => void
  onCloseWindow: () => void
  viewMenu: {
    title: string
    resetLabel: string
    savePresetLabel: string
    panelsLabel: string
    presetsLabel: string
    emptyPresetsLabel: string
    panelItems: WorkspacePanelMeta[]
    presetNames: string[]
    onTogglePanel: (id: string, visible: boolean) => void
    onResetLayout: () => void
    onSavePreset: () => void
    onLoadPreset: (name: string) => void
    onDeletePreset: (name: string) => void
  }
  settingsMenu: {
    title: string
    onOpen: () => void
  }
  projectMenu: {
    title: string
    highlighted?: boolean
    onOpen: () => void
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
  copy,
  workspaceMode,
  onWorkspaceChange,
  theme,
  onToggleTheme,
  locale,
  onToggleLocale,
  statusTone,
  desktopHost,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  viewMenu,
  settingsMenu,
  projectMenu,
}: TopMenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<'view' | null>(null)
  const viewMenuId = useId()
  const viewMenuRef = useRef<HTMLDivElement | null>(null)
  const orderedNavModes: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items', 'mods']
  const visibleNavEntries = (orderedNavModes.length ? orderedNavModes : workspaceModes).map((mode) => [
    mode,
    getWorkspaceModeLabel(locale, copy, mode),
  ] as const)
  const viewMenuOpen = activeMenu === 'view'

  useEffect(() => {
    if (!activeMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (viewMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setActiveMenu(null)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [activeMenu])

  return (
    <header className="top-menu-bar relative z-[120] border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_94%,transparent)] backdrop-blur-xl">
      <div className="top-menu-drag-layer absolute inset-0" data-tauri-drag-region aria-hidden="true" />
      <div className="top-menu-primary pointer-events-none relative grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3">
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
              {projectMenu.title}
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
                {viewMenu.title}
              </button>

              {viewMenuOpen ? (
                <div className="top-menu-dropdown" id={viewMenuId} role="menu" aria-label={viewMenu.title}>
                  <div className="top-menu-section">
                    <p className="top-menu-section-title">{viewMenu.panelsLabel}</p>
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
                          {item.visible ? 'On' : 'Off'}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="top-menu-section">
                    <p className="top-menu-section-title">{viewMenu.presetsLabel}</p>
                    <button type="button" className="top-menu-row" role="menuitem" onClick={viewMenu.onSavePreset}>
                      <span>{viewMenu.savePresetLabel}</span>
                    </button>
                    <button type="button" className="top-menu-row" role="menuitem" onClick={viewMenu.onResetLayout}>
                      <span>{viewMenu.resetLabel}</span>
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
                            onClick={() => viewMenu.onDeletePreset(name)}
                            title="Delete preset"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="top-menu-empty">{viewMenu.emptyPresetsLabel}</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </nav>
        </div>

        <div className="top-menu-center flex min-w-0 items-center justify-self-center">
          <nav className="top-menu-workspace pointer-events-auto" aria-label={copy.center.moduleWorkspace}>
            <div className="top-menu-workspace-list">
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
            </div>
          </nav>
        </div>

        <div className="top-menu-cluster top-menu-controls flex min-w-0 items-center justify-self-end gap-2" role="group" aria-label="Shell controls">
          <span className={cx('status-pill status-pill-compact', `status-pill-${statusTone}`)}>{copy.statusTone[statusTone]}</span>
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
            onClick={onToggleLocale}
            aria-label={copy.controls.toggleLocale}
            title={copy.controls.toggleLocale}
          >
            <Globe className="h-4 w-4" />
          </button>
          <div className="dock-chip">{copy.localeShort[locale]}</div>
          <button
            type="button"
            className="icon-button pointer-events-auto"
            onClick={() => {
              setActiveMenu(null)
              settingsMenu.onOpen()
            }}
            aria-label={settingsMenu.title}
            title={settingsMenu.title}
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
