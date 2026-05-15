import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { CheckSquare, Copy, Trash2, X } from 'lucide-react'
import type { EditorCopy } from '@locales'
import type { StudioDeskModel, StudioDeskProjectFilter, StudioDeskProjectStatus } from '../model/studioDeskModel'
import { cx } from '@shared/lib/cx'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { formatStudioTimestamp, getStudioProjectStatusLabel, handleStudioKeyboardAction } from '@features/cp-maker'

type StudioDeskProjectGalleryProps = {
  model: StudioDeskModel
  copy: EditorCopy
  onCreateDraftRequest: () => void
  onReturnToDesk: () => void
  onOpenDraft: (draftStorageKey: string) => void | Promise<void>
  onCopyDraft: (draftStorageKey: string) => void | Promise<void>
  onDeleteDraft: (draftStorageKey: string) => void | Promise<void>
}

type PendingProjectDelete = {
  keys: string[]
  message: string
}

const projectFilters: StudioDeskProjectFilter[] = ['all', 'active', 'export', 'conflict', 'archive']

export function StudioDeskProjectGallery({
  model,
  copy,
  onCreateDraftRequest,
  onReturnToDesk,
  onOpenDraft,
  onCopyDraft,
  onDeleteDraft,
}: StudioDeskProjectGalleryProps) {
  const desk = copy.studioDesk
  const [projectFilter, setProjectFilter] = useState<StudioDeskProjectFilter>('all')
  const [projectQuery, setProjectQuery] = useState('')
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<{ draftStorageKey: string; x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingProjectDelete | null>(null)
  const normalizedProjectQuery = projectQuery.trim().toLowerCase()
  const selectedCount = selectedProjectKeys.size

  const filteredProjects = useMemo(() => {
    return model.gallery.projects.filter((project) => {
      const matchesFilter = projectFilter === 'all' || project.statuses.includes(projectFilter as StudioDeskProjectStatus)
      const matchesQuery = normalizedProjectQuery === '' || project.searchText.toLowerCase().includes(normalizedProjectQuery)
      return matchesFilter && matchesQuery
    })
  }, [model.gallery.projects, normalizedProjectQuery, projectFilter])

  const contextProject = contextMenu
    ? (model.gallery.projects.find((project) => project.draftStorageKey === contextMenu.draftStorageKey) ?? null)
    : null

  function openDraft(draftStorageKey: string) {
    setContextMenu(null)
    void onOpenDraft(draftStorageKey)
  }

  function toggleSelectedProject(draftStorageKey: string) {
    setSelectedProjectKeys((current) => {
      const next = new Set(current)
      if (next.has(draftStorageKey)) {
        next.delete(draftStorageKey)
      } else {
        next.add(draftStorageKey)
      }
      return next
    })
  }

  function requestProjectDelete(keys: string[]) {
    const names = keys
      .map((key) => model.gallery.projects.find((project) => project.draftStorageKey === key)?.title)
      .filter((title): title is string => Boolean(title))
    setContextMenu(null)
    setPendingDelete({
      keys,
      message: keys.length === 1 ? desk.deleteProjectMessage(names[0] ?? keys[0] ?? '') : desk.deleteProjectsMessage(keys.length),
    })
  }

  function deletePendingProjects() {
    if (!pendingDelete) return
    for (const key of pendingDelete.keys) {
      void onDeleteDraft(key)
    }
    setSelectedProjectKeys((current) => {
      const next = new Set(current)
      for (const key of pendingDelete.keys) next.delete(key)
      return next
    })
  }

  function handleProjectContextMenu(event: MouseEvent<HTMLElement>, draftStorageKey: string) {
    event.preventDefault()
    setContextMenu({ draftStorageKey, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="studio-gallery-view" aria-label={desk.projectLobby}>
      <section className="studio-gallery-workstation">
        <aside className="studio-gallery-control-pane" aria-label={desk.projectLobbyControl}>
          <div className="studio-control-title">
            <h1>{desk.projectLobby}</h1>
            <span>{desk.projectCount(model.gallery.counts.all)}</span>
          </div>

          <label className="studio-control-search">
            <span className="sr-only">{desk.searchProjects}</span>
            <input
              type="search"
              aria-label={desk.searchProjects}
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder={desk.searchProjects}
            />
          </label>

          <div className="studio-control-block">
            <div className="studio-control-label">{desk.galleryFilters.all}</div>
            <div className="studio-control-filter-list" aria-label={desk.searchProjects}>
              {projectFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={cx('studio-filter-row', projectFilter === filter && 'active')}
                  data-count-label={model.gallery.counts[filter]}
                  onClick={() => setProjectFilter(filter)}
                >
                  {desk.galleryFilters[filter]}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-control-block">
            <div className="studio-control-label">{desk.overview}</div>
            <div className="studio-control-stats">
              <div>
                <strong>{model.gallery.counts.all}</strong>
                <span>{desk.totalProjects}</span>
              </div>
              <div>
                <strong>{model.gallery.counts.export}</strong>
                <span>{desk.waitingExport}</span>
              </div>
              <div>
                <strong>{model.gallery.counts.conflict}</strong>
                <span>{desk.needsAttention}</span>
              </div>
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="studio-selection-bar">
              <span>{desk.selectedProjects(selectedCount)}</span>
              <div>
                <button type="button" className="control-button text-xs" onClick={() => setSelectedProjectKeys(new Set())}>
                  {desk.clearSelection}
                </button>
                <button
                  type="button"
                  className="control-button text-xs text-red-400"
                  onClick={() => requestProjectDelete(Array.from(selectedProjectKeys))}
                >
                  {desk.bulkDelete}
                </button>
              </div>
            </div>
          ) : null}

          <div className="studio-control-actions">
            <button type="button" className="control-button control-button-primary" onClick={onCreateDraftRequest}>
              {desk.createDraft}
            </button>
            <button type="button" className="control-button" onClick={onReturnToDesk} disabled={!model.hasActiveDraft}>
              {desk.returnCurrentDesk}
            </button>
          </div>
        </aside>

        <section className="studio-project-grid-panel" aria-label={desk.projectGrid}>
          {filteredProjects.length ? (
            <div className="studio-project-grid">
              {filteredProjects.map((project, index) => {
                const revealProps = getLoadingMotionChildRevealProps({
                  index,
                  className: cx(
                    'studio-project-card',
                    project.isCurrent && 'is-current',
                    selectedProjectKeys.has(project.draftStorageKey) && 'is-selected',
                  ),
                })

                return (
                  <article
                    key={project.draftStorageKey}
                    role="button"
                    tabIndex={0}
                    aria-label={`${desk.openProject} ${project.title}`}
                    {...revealProps}
                    onClick={() => openDraft(project.draftStorageKey)}
                    onContextMenu={(event) => handleProjectContextMenu(event, project.draftStorageKey)}
                    onKeyDown={(event) => handleStudioKeyboardAction(event, () => openDraft(project.draftStorageKey))}
                  >
                    <label className="studio-project-select" onClick={(event) => event.stopPropagation()}>
                      <span className="sr-only">{desk.selectProject(project.title)}</span>
                      <input
                        type="checkbox"
                        aria-label={desk.selectProject(project.title)}
                        checked={selectedProjectKeys.has(project.draftStorageKey)}
                        onChange={() => toggleSelectedProject(project.draftStorageKey)}
                      />
                    </label>
                    <div className={cx('studio-cover-art', `studio-cover-${project.coverTone}`)}>
                      {project.isCurrent ? <span className="studio-current-label">{desk.currentActive}</span> : null}
                      <div className="studio-status-badges" aria-label={desk.patchCatalog.status}>
                        {project.statuses
                          .filter((status) => status !== 'active')
                          .map((status) => (
                            <span
                              key={status}
                              className={cx('studio-status-badge', `studio-status-badge-${status}`)}
                              aria-label={getStudioProjectStatusLabel(desk, status)}
                            />
                          ))}
                      </div>
                      <div className="studio-cover-fingerprint" aria-hidden="true">
                        {Array.from({ length: 10 }).map((_, index) => (
                          <span key={index} />
                        ))}
                      </div>
                      <div className="studio-cover-name">{project.title}</div>
                      <div className="studio-current-note">{formatStudioTimestamp(desk, project.lastEditedAt)}</div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <section className="studio-gallery-empty-state" aria-label={desk.searchEmpty}>
              <div>
                <div className="studio-empty-workbench" aria-hidden="true" />
                <strong>{desk.searchEmpty}</strong>
                <span>{desk.noEntries}</span>
              </div>
            </section>
          )}
        </section>
      </section>

      {contextProject ? (
        <div
          className="studio-project-context-menu"
          role="menu"
          style={{ '--studio-menu-x': `${contextMenu?.x ?? 0}px`, '--studio-menu-y': `${contextMenu?.y ?? 0}px` } as CSSProperties}
        >
          <button type="button" role="menuitem" onClick={() => openDraft(contextProject.draftStorageKey)}>
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {desk.openProject}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setContextMenu(null)
              void onCopyDraft(contextProject.draftStorageKey)
            }}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {desk.copyProject}
          </button>
          <button type="button" role="menuitem" onClick={() => requestProjectDelete([contextProject.draftStorageKey])}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {desk.deleteProject}
          </button>
          <button type="button" role="menuitem" onClick={() => setContextMenu(null)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {desk.clearSelection}
          </button>
        </div>
      ) : null}

      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title={desk.deleteProjectTitle}
        message={pendingDelete?.message ?? ''}
        cancelLabel={desk.createDialog.cancel}
        confirmLabel={desk.deleteProject}
        onClose={() => setPendingDelete(null)}
        onConfirm={deletePendingProjects}
      />
    </section>
  )
}
