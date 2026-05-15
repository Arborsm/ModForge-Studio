import { Filter, FolderOpen, RefreshCw, Search, Upload } from 'lucide-react'
import type { ModProjectSummary } from '@entities/mod/api'
import { useModWorkspaceCopy } from '@locales/localeContext'
import { cx } from '@shared/lib/cx'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

type ModBrowserPanelProps = {
  projects: ModProjectSummary[]
  filteredProjects: ModProjectSummary[]
  activeProjectPath: string | null
  modFilter: string
  contentPatcherOnly: boolean
  compatibleOnly: boolean
  onFilterChange: (value: string) => void
  onContentPatcherOnlyChange: (value: boolean) => void
  onCompatibleOnlyChange: (value: boolean) => void
  onSelectProject: (path: string) => void
  onImportProject: () => void
  onRefreshProjects: () => void
}

function getPluginKindBadge(project: ModProjectSummary) {
  if (project.pluginKind === 'content-patcher') {
    return {
      label: 'Content Patcher',
      className:
        'border-[color-mix(in_srgb,#10b981_16%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-panel-muted)_88%,transparent)] text-[color-mix(in_srgb,var(--text-primary)_88%,#065f46)]',
    }
  }

  return {
    label: 'Unknown',
    className: 'border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_88%,transparent)] text-[var(--text-primary)]',
  }
}

function getProjectStatusBadge(project: ModProjectSummary, copy: ReturnType<typeof useModWorkspaceCopy>) {
  if (project.status === 'incompatible') {
    return {
      label: copy.incompatibleProject,
      className:
        'border-[color-mix(in_srgb,#f97316_22%,var(--border-color))] bg-[color-mix(in_srgb,#fff7ed_84%,var(--bg-panel))] text-[color-mix(in_srgb,#9a3412_90%,var(--text-primary))]',
    }
  }

  return null
}

function ProjectRow({
  project,
  active,
  index,
  onSelect,
}: {
  project: ModProjectSummary
  active: boolean
  index: number
  onSelect: () => void
}) {
  const copy = useModWorkspaceCopy()
  const pluginKindBadge = getPluginKindBadge(project)
  const statusBadge = getProjectStatusBadge(project, copy)
  const isIncompatible = project.status === 'incompatible'

  const revealProps = getLoadingMotionChildRevealProps({
    index,
    className: cx(
      'w-full rounded-[20px] border px-4 py-3 text-left transition-all',
      isIncompatible
        ? 'cursor-not-allowed border-[color-mix(in_srgb,#f97316_22%,var(--border-color))] bg-[color-mix(in_srgb,#fff7ed_58%,var(--bg-panel))] opacity-90'
        : active
          ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_12%,transparent),color-mix(in_srgb,var(--accent)_6%,var(--bg-panel)))] shadow-[0_14px_28px_rgba(79,70,229,0.10)]'
          : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-panel-muted)] hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]',
    ),
  })

  return (
    <button type="button" disabled={isIncompatible} {...revealProps} onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{project.name}</p>
          <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{project.uniqueId ?? project.folderName}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <span
            className={cx(
              'inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] leading-none font-semibold whitespace-nowrap',
              pluginKindBadge.className,
            )}
          >
            {pluginKindBadge.label}
          </span>
          {statusBadge ? (
            <span
              className={cx(
                'inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] leading-none font-semibold whitespace-nowrap',
                statusBadge.className,
              )}
            >
              {statusBadge.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
        <span className="dock-chip">{project.author ?? copy.unknownLabel}</span>
        <span className="dock-chip">{project.version ?? copy.noVersionLabel}</span>
      </div>

      {isIncompatible ? (
        <p className="mt-3 text-xs leading-5 text-[color-mix(in_srgb,#9a3412_88%,var(--text-primary))]">
          {copy.missingRequiredDependencies(project.missingRequiredDependencies.join(', '))}
        </p>
      ) : null}

      <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="break-all">{project.absolutePath}</span>
      </div>
    </button>
  )
}

export function ModBrowserPanel({
  projects,
  filteredProjects,
  activeProjectPath,
  modFilter,
  contentPatcherOnly,
  compatibleOnly,
  onFilterChange,
  onContentPatcherOnlyChange,
  onCompatibleOnlyChange,
  onSelectProject,
  onImportProject,
  onRefreshProjects,
}: ModBrowserPanelProps) {
  const copy = useModWorkspaceCopy()
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden bg-[var(--bg-panel)] p-4">
      <section className="panel-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">{copy.browserTitle}</p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Get Started</h2>
          </div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-2">
            <button type="button" className="control-button control-button-primary" onClick={onImportProject}>
              <Upload className="h-4 w-4" />
              <span>{copy.importProject}</span>
            </button>
            <button type="button" className="control-button" onClick={onRefreshProjects}>
              <RefreshCw className="h-4 w-4" />
              <span>{copy.refreshProjects}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_95%,white_5%)] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{copy.projectsLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{projects.length}</p>
          </div>
          <div className="rounded-[20px] border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_95%,white_5%)] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{copy.filteredLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{filteredProjects.length}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className="control-input pl-9"
              value={modFilter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={copy.browserFilterPlaceholder}
              spellCheck={false}
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <button
              type="button"
              className={cx(
                'control-button h-10 gap-2 px-4',
                contentPatcherOnly
                  ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_100%,transparent)] text-[var(--text-primary)]'
                  : undefined,
              )}
              aria-pressed={contentPatcherOnly}
              onClick={() => onContentPatcherOnlyChange(!contentPatcherOnly)}
            >
              <Filter className="h-4 w-4" />
              <span>{copy.contentPatcherOnly}</span>
            </button>
            <button
              type="button"
              className={cx(
                'control-button h-10 gap-2 px-4',
                compatibleOnly
                  ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_100%,transparent)] text-[var(--text-primary)]'
                  : undefined,
              )}
              aria-pressed={compatibleOnly}
              onClick={() => onCompatibleOnlyChange(!compatibleOnly)}
            >
              <Filter className="h-4 w-4" />
              <span>{copy.compatibleOnly}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="panel-surface min-h-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-tertiary)] uppercase">Project Library</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {filteredProjects.length
                ? 'Choose one project to open it in the workspace.'
                : 'Import a mod or refresh the scan to populate the workspace list.'}
            </p>
          </div>
          {activeProjectPath ? <span className="dock-chip">Active</span> : null}
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {filteredProjects.length ? (
            filteredProjects.map((project, index) => (
              <ProjectRow
                key={project.absolutePath}
                project={project}
                active={activeProjectPath === project.absolutePath}
                index={index}
                onSelect={() => onSelectProject(project.absolutePath)}
              />
            ))
          ) : (
            <div className="panel-empty-state flex min-h-48 items-center justify-center text-center">
              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">No projects yet</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  Import a mod or refresh the scan to populate the workspace list.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
