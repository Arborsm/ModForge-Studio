  import { FolderOpen, RefreshCw, Search, Upload } from 'lucide-react'
import type { ModProjectSummary } from '../../lib/desktop'
import type { ModWorkspaceCopy } from '../../lib/plugins/copy'
import { cx } from '../../lib/cx'

type ModBrowserPanelProps = {
  copy: ModWorkspaceCopy
  projects: ModProjectSummary[]
  filteredProjects: ModProjectSummary[]
  activeProjectPath: string | null
  modFilter: string
  onFilterChange: (value: string) => void
  onSelectProject: (path: string) => void
  onImportProject: () => void
  onRefreshProjects: () => void
}

function ProjectRow({
  copy,
  project,
  active,
  onSelect,
}: {
  copy: ModWorkspaceCopy
  project: ModProjectSummary
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={cx(
        'w-full rounded-[24px] border p-4 text-left transition',
        active
          ? 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_14%,var(--bg-panel)),color-mix(in_srgb,var(--bg-elevated)_94%,transparent))] shadow-[var(--shadow-panel)]'
          : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:border-[color-mix(in_srgb,var(--accent)_24%,transparent)] hover:bg-[var(--bg-elevated)]',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{project.name}</p>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{project.uniqueId ?? project.folderName}</p>
        </div>
        <span className={cx(
          'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold',
          project.pluginKind === 'content-patcher'
            ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
            : 'border-amber-400/25 bg-amber-500/10 text-amber-100',
        )}>
          {project.pluginKind}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
        <span className="dock-chip">{project.author ?? copy.unknownLabel}</span>
        <span className="dock-chip">{project.version ?? copy.noVersionLabel}</span>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="break-all">{project.absolutePath}</span>
      </div>
    </button>
  )
}

export function ModBrowserPanel({
  copy,
  projects,
  filteredProjects,
  activeProjectPath,
  modFilter,
  onFilterChange,
  onSelectProject,
  onImportProject,
  onRefreshProjects,
}: ModBrowserPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_96%,transparent),color-mix(in_srgb,var(--bg-app)_94%,transparent))] p-4">
      <section className="rounded-[28px] border border-[var(--border-color)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bg-elevated)_95%,transparent),color-mix(in_srgb,var(--accent)_8%,var(--bg-panel)))] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{copy.browserTitle}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Browse detected Content Patcher projects, narrow the list fast, and jump directly into a focused editing workspace.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="control-button control-button-primary" onClick={onImportProject}>
            <Upload className="h-4 w-4" />
            <span>{copy.importProject}</span>
          </button>
          <button type="button" className="control-button" onClick={onRefreshProjects}>
            <RefreshCw className="h-4 w-4" />
            <span>{copy.refreshProjects}</span>
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="control-input pl-9"
            value={modFilter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={copy.browserFilterPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-app))] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.projectsLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{projects.length}</p>
          </div>
          <div className="rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-app)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{copy.filteredLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{filteredProjects.length}</p>
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Project Library</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{filteredProjects.length ? 'Choose one project to open it in the central studio.' : copy.browserEmpty}</p>
          </div>
          {activeProjectPath ? <span className="dock-chip">Active</span> : null}
        </div>

        <div className="mt-4 min-h-0 space-y-3 overflow-auto pr-1">
          {filteredProjects.length ? (
            filteredProjects.map((project) => (
              <ProjectRow
                key={project.absolutePath}
                copy={copy}
                project={project}
                active={activeProjectPath === project.absolutePath}
                onSelect={() => onSelectProject(project.absolutePath)}
              />
            ))
          ) : (
            <div className="panel-empty-state">{copy.browserEmpty}</div>
          )}
        </div>
      </section>
    </div>
  )
}
