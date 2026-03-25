import {
  Castle,
  GitMerge,
  Globe,
  Map,
  Minus,
  Moon,
  Package,
  Square,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { EditorCopy, LocaleCode, ThemeMode, WorkspaceMode, WorkspaceTone } from '../lib/editor-shell'
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
}

const MODULE_ICONS = {
  map: Map,
  characters: Users,
  buildings: Castle,
  items: Package,
  events: GitMerge,
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
}: TopMenuBarProps) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!viewMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (viewMenuRef.current?.contains(event.target as Node)) {
        return
      }

      setViewMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [viewMenuOpen])

  return (
    <header className="relative z-[120] border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_94%,transparent)] backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3" data-tauri-drag-region>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-xs font-black tracking-[0.18em] text-white">
              MF
            </div>
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{copy.brand.name}</p>
          </div>

          <nav className="hidden items-center gap-2 xl:flex">
            {copy.menus.map((label, index) =>
              index === 2 ? (
                <div key={label} className="relative" ref={viewMenuRef}>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
                    onClick={() => setViewMenuOpen((current) => !current)}
                  >
                    {viewMenu.title}
                  </button>

                  {viewMenuOpen ? (
                    <div className="top-menu-dropdown">
                      <div className="top-menu-section">
                        <p className="top-menu-section-title">{viewMenu.panelsLabel}</p>
                        {viewMenu.panelItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="top-menu-row"
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
                        <button type="button" className="top-menu-row" onClick={viewMenu.onSavePreset}>
                          <span>{viewMenu.savePresetLabel}</span>
                        </button>
                        <button type="button" className="top-menu-row" onClick={viewMenu.onResetLayout}>
                          <span>{viewMenu.resetLabel}</span>
                        </button>
                        {viewMenu.presetNames.length ? (
                          viewMenu.presetNames.map((name) => (
                            <div key={name} className="top-menu-row">
                              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => viewMenu.onLoadPreset(name)}>
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
              ) : (
                <button
                  key={label}
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
                >
                  {label}
                </button>
              ),
            )}

            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
              onClick={() => {
                setViewMenuOpen(false)
                settingsMenu.onOpen()
              }}
            >
              <span>{settingsMenu.title}</span>
            </button>
          </nav>
        </div>

        <div className="h-full flex-1" data-tauri-drag-region />

        <div className="flex items-center gap-2">
          <span className={cx('status-pill', `status-pill-${statusTone}`)}>{copy.statusTone[statusTone]}</span>
          <button
            type="button"
            className="icon-button"
            onClick={onToggleTheme}
            aria-label={copy.controls.toggleTheme}
            title={copy.controls.toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onToggleLocale}
            aria-label={copy.controls.toggleLocale}
            title={copy.controls.toggleLocale}
          >
            <Globe className="h-4 w-4" />
          </button>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
            {copy.localeShort[locale]}
          </div>
          {desktopHost ? (
            <div className="ml-1 flex items-center overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
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

      <div className="flex h-12 items-center gap-2 overflow-x-auto border-t border-[color-mix(in_srgb,var(--border-color)_70%,transparent)] px-3">
        {Object.entries(copy.nav).map(([mode, label]) => {
          const typedMode = mode as WorkspaceMode
          const Icon = MODULE_ICONS[typedMode]
          const active = workspaceMode === typedMode

          return (
            <button
              key={typedMode}
              type="button"
              className={cx(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors',
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
    </header>
  )
}
