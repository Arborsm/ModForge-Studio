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
import type { EditorCopy, LocaleCode, ThemeMode, WorkspaceMode, WorkspaceTone } from '../lib/editor-shell'
import { cx } from '../lib/cx'

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
}: TopMenuBarProps) {
  return (
    <header className="border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_94%,transparent)] backdrop-blur-xl">
      <div className="flex h-12 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-3" data-tauri-drag-region>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-xs font-black tracking-[0.18em] text-white">
              MF
            </div>
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{copy.brand.name}</p>
          </div>

          <nav className="hidden items-center gap-2 xl:flex">
            {copy.menus.map((label) => (
              <button
                key={label}
                type="button"
                className="rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
              >
                {label}
              </button>
            ))}
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
