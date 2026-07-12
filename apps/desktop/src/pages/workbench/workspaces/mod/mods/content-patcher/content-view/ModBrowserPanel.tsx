import { Check, Filter, FolderOpen, RefreshCw, Search, Upload } from 'lucide-react'
import type { ModProjectSummary } from '@entities/mod/api'
import { useModCopy, useTranslationEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

type ModBrowserPanelProps = {
  projects: ModProjectSummary[]
  filteredProjects: ModProjectSummary[]
  activeProjectPath: string | null
  modFilter: string
  contentPatcherOnly: boolean
  compatibleOnly: boolean
  i18nOnly?: boolean
  mode?: 'mod' | 'i18n'
  onFilterChange: (value: string) => void
  onContentPatcherOnlyChange: (value: boolean) => void
  onCompatibleOnlyChange: (value: boolean) => void
  onI18nOnlyChange?: (value: boolean) => void
  onSelectProject: (path: string) => void
  onImportProject?: () => void
  onRefreshProjects: () => void
}

function getPluginKindBadge(project: ModProjectSummary, copy: ReturnType<typeof useModCopy>) {
  if (project.pluginKind === 'content-patcher') {
    return {
      label: 'Content Patcher',
      className: 'border-(--success) bg-(--success-soft) text-(--success)',
    }
  }

  return {
    label: copy.unknownLabel,
    className: 'border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel-muted)_88%,transparent)] text-(--text-primary)',
  }
}

function getProjectStatusBadge(project: ModProjectSummary, copy: ReturnType<typeof useModCopy>) {
  if (project.status === 'incompatible') {
    return {
      label: copy.incompatibleProject,
      className: 'border-(--warning) bg-(--warning-soft) text-(--warning)',
    }
  }

  return null
}

function ProjectRow({
  project,
  active,
  index,
  mode,
  onSelect,
}: {
  project: ModProjectSummary
  active: boolean
  index: number
  mode: 'mod' | 'i18n'
  onSelect: () => void
}) {
  const copy = useModCopy()
  const pluginKindBadge = getPluginKindBadge(project, copy)
  const statusBadge = mode === 'i18n' ? null : getProjectStatusBadge(project, copy)
  const isIncompatible = mode !== 'i18n' && project.status === 'incompatible'

  const revealProps = getLoadingMotionChildRevealProps({
    index,
    className: cx(
      'w-full rounded-md border px-4 py-3 text-left transition-all',
      isIncompatible
        ? 'cursor-not-allowed border-(--warning) bg-(--warning-soft) opacity-90'
        : active
          ? 'border-(--accent) bg-(--accent-soft)'
          : 'border-(--border-color) bg-(--bg-panel) hover:bg-(--bg-panel-muted)',
    ),
  })

  return (
    <button type="button" disabled={isIncompatible} {...revealProps} onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-(--text-primary)">{project.name}</p>
          <p className="mt-1 truncate text-xs text-(--text-secondary)">{project.uniqueId ?? project.folderName}</p>
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

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-(--text-secondary)">
        <span className="dock-chip">{project.author ?? copy.unknownLabel}</span>
        <span className="dock-chip">{project.version ?? copy.noVersionLabel}</span>
      </div>

      {isIncompatible ? (
        <p className="mt-3 text-xs leading-5 text-(--warning)">
          {copy.missingRequiredDependencies(project.missingRequiredDependencies.join(', '))}
        </p>
      ) : null}

      <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-(--text-tertiary)">
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
  i18nOnly = false,
  mode = 'mod',
  onFilterChange,
  onContentPatcherOnlyChange,
  onCompatibleOnlyChange,
  onI18nOnlyChange,
  onSelectProject,
  onImportProject,
  onRefreshProjects,
}: ModBrowserPanelProps) {
  const copy = useModCopy()
  const i18nCopy = useTranslationEditorCopy()
  const isI18nMode = mode === 'i18n'
  if (isI18nMode) {
    return (
      <div className="mod-translation-browser-pane flex h-full flex-col overflow-hidden border-r border-(--border-color)/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.625rem] font-bold tracking-[0.16em] text-(--text-tertiary) uppercase">{i18nCopy.browserTitle}</p>
            <p className="mt-1 truncate text-xs text-(--text-secondary)">{i18nCopy.browserProjectsCount(filteredProjects.length)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="control-button h-8 px-2.5 text-xs" onClick={onRefreshProjects}>
              <RefreshCw className="h-4 w-4" />
              <span>{i18nCopy.browserRefreshProjects}</span>
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
          <input
            className="control-input bg-(--bg-panel-muted) pl-9"
            value={modFilter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={i18nCopy.browserSearchPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto pr-1">
          {filteredProjects.length ? (
            <div className="flex flex-col divide-y divide-(--border-color)/40">
              {filteredProjects.map((project, index) => {
                const active = activeProjectPath === project.absolutePath
                return (
                  <button
                    key={project.absolutePath}
                    type="button"
                    {...getLoadingMotionChildRevealProps({
                      index,
                      className: cx(
                        'flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left transition-colors',
                        active
                          ? 'bg-(--accent-soft) text-(--accent)'
                          : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
                      ),
                    })}
                    onClick={() => onSelectProject(project.absolutePath)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] leading-tight font-medium">{project.name}</p>
                      <p className="truncate text-[11px] text-(--text-tertiary)">
                        {i18nCopy.browserProjectMeta(project.author, project.version, project.uniqueId)}
                      </p>
                    </div>
                    {active ? <Check className="h-3.5 w-3.5 shrink-0" aria-label={i18nCopy.browserSelectedLabel} /> : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="panel-empty-state flex min-h-48 items-center justify-center text-center">
              <div>
                <p className="text-base font-semibold text-(--text-primary)">{i18nCopy.browserEmptyTitle}</p>
                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">{i18nCopy.browserEmptyDescription}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden bg-(--bg-panel) p-4">
      <section className="panel-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">{copy.browserTitle}</p>
            <h2 className="mt-2 text-lg font-semibold text-(--text-primary)">{copy.browserQuickStartTitle}</h2>
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
          <div className="rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-(--text-tertiary) uppercase">{copy.projectsLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-(--text-primary)">{projects.length}</p>
          </div>
          <div className="rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-(--text-tertiary) uppercase">{copy.filteredLabel}</p>
            <p className="mt-2 text-2xl font-semibold text-(--text-primary)">{filteredProjects.length}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
            <input
              className="control-input pl-9"
              value={modFilter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={copy.browserFilterPlaceholder}
              spellCheck={false}
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {!isI18nMode ? (
              <>
                <button
                  type="button"
                  className={cx(
                    'control-button h-10 gap-2 px-4',
                    contentPatcherOnly
                      ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_100%,transparent)] text-(--text-primary)'
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
                      ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_100%,transparent)] text-(--text-primary)'
                      : undefined,
                  )}
                  aria-pressed={compatibleOnly}
                  onClick={() => onCompatibleOnlyChange(!compatibleOnly)}
                >
                  <Filter className="h-4 w-4" />
                  <span>{copy.compatibleOnly}</span>
                </button>
              </>
            ) : null}
            {onI18nOnlyChange && !isI18nMode ? (
              <button
                type="button"
                className={cx(
                  'control-button h-10 gap-2 px-4',
                  i18nOnly
                    ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent-soft)_100%,transparent)] text-(--text-primary)'
                    : undefined,
                )}
                aria-pressed={i18nOnly}
                onClick={() => onI18nOnlyChange(!i18nOnly)}
              >
                <Filter className="h-4 w-4" />
                <span>{copy.i18nOnly}</span>
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel-surface min-h-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-(--text-tertiary) uppercase">{copy.browserLibraryTitle}</p>
            <p className="mt-2 text-sm text-(--text-secondary)">
              {filteredProjects.length ? copy.browserLibraryHasProjectsDescription : copy.browserLibraryEmptyDescription}
            </p>
          </div>
          {activeProjectPath ? <span className="dock-chip">{copy.browserLibraryActive}</span> : null}
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
          {filteredProjects.length ? (
            filteredProjects.map((project, index) => (
              <ProjectRow
                key={project.absolutePath}
                project={project}
                active={activeProjectPath === project.absolutePath}
                index={index}
                mode={mode}
                onSelect={() => onSelectProject(project.absolutePath)}
              />
            ))
          ) : (
            <div className="panel-empty-state flex min-h-48 items-center justify-center text-center">
              <div>
                <p className="text-base font-semibold text-(--text-primary)">{copy.browserLibraryEmptyTitle}</p>
                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">{copy.browserLibraryEmptyDescription}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
