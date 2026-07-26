import { Archive, Check, Filter, FolderOpen, Plus, RefreshCw, Search } from 'lucide-react'
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
  onOpenFolder?: () => void
  onOpenArchive?: () => void
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
      'w-full border-b border-(--border-color)/55 px-3 py-2.5 text-left transition-[background-color,color]',
      isIncompatible
        ? 'cursor-not-allowed bg-(--warning-soft) opacity-80'
        : active
          ? 'bg-(--accent-soft) shadow-[inset_2px_0_0_var(--accent)]'
          : 'bg-(--bg-panel) hover:bg-(--bg-panel-muted)',
    ),
  })

  return (
    <button type="button" disabled={isIncompatible} aria-pressed={active} {...revealProps} onClick={onSelect}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-(--text-primary)">{project.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-(--text-tertiary)">{project.uniqueId ?? project.folderName}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <span
            className={cx(
              'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap',
              pluginKindBadge.className,
            )}
          >
            {pluginKindBadge.label}
          </span>
          {statusBadge ? (
            <span
              className={cx(
                'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap',
                statusBadge.className,
              )}
            >
              {statusBadge.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-(--text-secondary)">
        <span className="truncate">{project.author ?? copy.unknownLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{project.version ?? copy.noVersionLabel}</span>
      </div>

      {isIncompatible ? (
        <p className="mt-3 text-xs leading-5 text-(--warning)">
          {copy.missingRequiredDependencies(project.missingRequiredDependencies.join(', '))}
        </p>
      ) : null}
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
  onOpenFolder,
  onOpenArchive,
  onImportProject,
  onRefreshProjects,
}: ModBrowserPanelProps) {
  const copy = useModCopy()
  const i18nCopy = useTranslationEditorCopy()
  const isI18nMode = mode === 'i18n'
  if (isI18nMode) {
    const managementActions = [
      onOpenFolder ? { label: i18nCopy.browserOpenFolder, icon: FolderOpen, action: onOpenFolder } : null,
      onImportProject ? { label: i18nCopy.browserImportProject, icon: Plus, action: onImportProject } : null,
    ].filter(Boolean) as Array<{ label: string; icon: typeof FolderOpen; action: () => void }>
    return (
      <div className="mod-translation-browser-pane flex h-full flex-col overflow-hidden p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-(--text-primary)">{i18nCopy.browserTitle}</h1>
            <p className="mt-1 truncate text-xs text-(--text-secondary)">{i18nCopy.browserProjectsCount(projects.length)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {managementActions.map(({ label, icon: Icon, action }) => (
              <button key={label} type="button" className="icon-button h-9 w-9" title={label} aria-label={label} onClick={action}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <button
              type="button"
              className="icon-button h-9 w-9"
              title={i18nCopy.browserRefreshProjects}
              aria-label={i18nCopy.browserRefreshProjects}
              onClick={onRefreshProjects}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
            <input
              className="control-input bg-(--bg-panel-muted) pl-9"
              value={modFilter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={i18nCopy.browserSearchPlaceholder}
              spellCheck={false}
            />
          </div>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-xs text-(--text-secondary)">
            <input type="checkbox" checked={i18nOnly} onChange={(event) => onI18nOnlyChange?.(event.target.checked)} />
            <span>{i18nCopy.browserI18nOnly}</span>
          </label>
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
                    aria-pressed={active}
                    onClick={() => onSelectProject(project.absolutePath)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] leading-tight font-medium">{project.name}</p>
                      <p className="truncate text-[11px] text-(--text-tertiary)">
                        {i18nCopy.browserProjectMeta(project.author, project.version, project.uniqueId)}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-(--text-tertiary)">
                      {i18nCopy.browserI18nEntries(project.i18nEntryCount)}
                      {active ? <Check className="h-3.5 w-3.5 text-(--accent)" aria-label={i18nCopy.browserSelectedLabel} /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="panel-empty-state flex min-h-48 items-center justify-center text-center">
              <div>
                <p className="text-base font-semibold text-(--text-primary)">
                  {projects.length ? i18nCopy.browserNoMatchesTitle : i18nCopy.browserEmptyTitle}
                </p>
                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
                  {projects.length ? i18nCopy.browserNoMatchesDescription : i18nCopy.browserEmptyDescription}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--bg-panel)">
      <section className="shrink-0 border-b border-(--border-color)/70 p-3">
        <div className="flex gap-2">
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
          <button type="button" className="control-button h-10 px-3" title={copy.refreshProjects} onClick={onRefreshProjects}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">{copy.refreshProjects}</span>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!isI18nMode ? (
            <>
              <button
                type="button"
                className={cx(
                  'control-button h-7 gap-1.5 rounded-sm px-2 text-[11px]',
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
                  'control-button h-7 gap-1.5 rounded-sm px-2 text-[11px]',
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
                'control-button h-7 gap-1.5 rounded-sm px-2 text-[11px]',
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
        <div className="mt-2 flex items-center gap-2 border-t border-(--border-color)/45 pt-2">
          <button type="button" className="control-button h-8 flex-1 rounded-sm px-2 text-xs" onClick={onOpenFolder ?? onImportProject}>
            <FolderOpen className="h-3.5 w-3.5" />
            <span>{copy.openExternalFolder}</span>
          </button>
          <button type="button" className="control-button h-8 flex-1 rounded-sm px-2 text-xs" onClick={onOpenArchive}>
            <Archive className="h-3.5 w-3.5" />
            <span>{copy.openExternalArchive}</span>
          </button>
        </div>
      </section>
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-(--border-color)/55 px-3 text-[11px] text-(--text-tertiary)">
        <span>
          {copy.filteredLabel} <strong className="text-(--text-primary)">{filteredProjects.length}</strong>
        </span>
        <span>
          {copy.projectsLabel} <strong className="text-(--text-primary)">{projects.length}</strong>
        </span>
      </div>
      <section className="custom-scrollbar min-h-0 flex-1 overflow-auto">
        <div className="min-h-0">
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
            <div className="panel-empty-state flex min-h-48 items-center justify-center px-4 text-center">
              <div>
                <p className="text-sm font-semibold text-(--text-primary)">{copy.browserLibraryEmptyTitle}</p>
                <p className="mt-2 text-xs leading-5 text-(--text-secondary)">{copy.browserLibraryEmptyDescription}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
