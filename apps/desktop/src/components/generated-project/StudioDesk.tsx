import { useCallback, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { BookOpen, CheckSquare, Copy, MoreHorizontal, Trash2, X } from 'lucide-react'
import type { EditorCopy } from '../../locales'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { StudioDeskInspiration, StudioDeskModel, StudioDeskProjectFilter, StudioDeskProjectStatus } from '../../lib/app/studioDeskModel'
import { cx } from '../../lib/cx'
import { CreateDraftDialog } from './CreateDraftDialog'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { ExportDialog } from './ExportDialog'
import { StudioDeskStoryboard } from './StudioDeskStoryboard'
import { StudioDeskMainStage } from './StudioDeskMainStage'
import { StudioDeskWorldBible } from './StudioDeskWorldBible'

type CreateDraftMetadata = Pick<
  GeneratedProjectDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

export type StudioDeskProps = {
  model: StudioDeskModel
  copy: EditorCopy
  onCreateDraft: (metadata: CreateDraftMetadata) => void | Promise<void>
  onCreatePatch: (action: DraftPatch['action'], workspace: WorkspaceId) => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
  onOpenPatch: (patchId: string) => void
  onOpenDraft: (draftStorageKey: string) => void | Promise<void>
  onCopyDraft: (draftStorageKey: string) => void | Promise<void>
  onDeleteDraft: (draftStorageKey: string) => void | Promise<void>
  onExportPack: (outputPath: string) => Promise<void>
  isLoading: boolean
  galleryOpen?: boolean
  onGalleryOpenChange?: (open: boolean) => void
}

type PendingProjectDelete = {
  keys: string[]
  message: string
}

const projectFilters: StudioDeskProjectFilter[] = ['all', 'active', 'export', 'conflict', 'archive']

function formatTimestamp(copy: EditorCopy['studioDesk'], timestamp: number | null) {
  if (!timestamp) return copy.edited.recently
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes <= 1) return copy.edited.justNow
  if (minutes < 60) return copy.edited.minutesAgo(minutes)
  return copy.edited.hoursAgo(Math.max(1, Math.round(minutes / 60)))
}

function statusLabel(copy: EditorCopy['studioDesk'], status: StudioDeskProjectStatus) {
  if (status === 'export') return copy.pendingExport
  if (status === 'conflict') return copy.hasConflict
  if (status === 'archive') return copy.archived
  return copy.galleryFilters.active
}

function handleKeyboardAction(event: KeyboardEvent<HTMLElement>, callback: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  callback()
}

export function StudioDesk({
  model,
  copy,
  onCreateDraft,
  onCreatePatch,
  onOpenWorkspace,
  onOpenPatch,
  onOpenDraft,
  onCopyDraft,
  onDeleteDraft,
  onExportPack,
  isLoading,
  galleryOpen: controlledGalleryOpen,
  onGalleryOpenChange,
}: StudioDeskProps) {
  const [localGalleryOpen, setLocalGalleryOpen] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [worldBibleOpen, setWorldBibleOpen] = useState(false)
  const [previewFocus, setPreviewFocus] = useState<StudioDeskInspiration | null>(null)
  const [projectFilter, setProjectFilter] = useState<StudioDeskProjectFilter>('all')
  const [projectQuery, setProjectQuery] = useState('')
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<{ draftStorageKey: string; x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingProjectDelete | null>(null)
  const desk = copy.studioDesk
  const worldBibleId = 'studio-world-bible-panel'
  const normalizedProjectQuery = projectQuery.trim().toLowerCase()
  const selectedCount = selectedProjectKeys.size
  const galleryOpen = controlledGalleryOpen ?? localGalleryOpen
  const setGalleryOpen = useCallback((open: boolean) => {
    if (controlledGalleryOpen === undefined) {
      setLocalGalleryOpen(open)
    }
    onGalleryOpenChange?.(open)
  }, [controlledGalleryOpen, onGalleryOpenChange])

  const filteredProjects = useMemo(() => {
    return model.gallery.projects.filter((project) => {
      const matchesFilter = projectFilter === 'all' || project.statuses.includes(projectFilter as StudioDeskProjectStatus)
      const matchesQuery = normalizedProjectQuery === '' || project.searchText.toLowerCase().includes(normalizedProjectQuery)
      return matchesFilter && matchesQuery
    })
  }, [model.gallery.projects, normalizedProjectQuery, projectFilter])

  const contextProject = contextMenu
    ? model.gallery.projects.find((project) => project.draftStorageKey === contextMenu.draftStorageKey) ?? null
    : null

  const tagList = desk.designTags.map((tag, index) => (
    <span key={tag}>{index === 0 ? <span className="studio-tag-dot" /> : null}{tag}</span>
  ))

  function openDraft(draftStorageKey: string) {
    setContextMenu(null)
    setGalleryOpen(false)
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
      message: keys.length === 1
        ? desk.deleteProjectMessage(names[0] ?? keys[0] ?? '')
        : desk.deleteProjectsMessage(keys.length),
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

  function handleDeskPointerMove(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const shiftX = ((x / Math.max(rect.width, 1)) - 0.5) * 10
    const shiftY = ((y / Math.max(rect.height, 1)) - 0.5) * 10

    event.currentTarget.style.setProperty('--studio-pointer-x', `${x}px`)
    event.currentTarget.style.setProperty('--studio-pointer-y', `${y}px`)
    event.currentTarget.style.setProperty('--studio-grid-shift-x', `${shiftX}px`)
    event.currentTarget.style.setProperty('--studio-grid-shift-y', `${shiftY}px`)
  }

  function handleDeskPointerLeave(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.removeProperty('--studio-pointer-x')
    event.currentTarget.style.removeProperty('--studio-pointer-y')
    event.currentTarget.style.removeProperty('--studio-grid-shift-x')
    event.currentTarget.style.removeProperty('--studio-grid-shift-y')
  }

  return (
    <main
      className={cx('studio-desk', galleryOpen && 'studio-desk-gallery-active')}
      aria-label={desk.title}
      onPointerMove={handleDeskPointerMove}
      onPointerLeave={handleDeskPointerLeave}
    >
      {galleryOpen ? (
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
                  <div><strong>{model.gallery.counts.all}</strong><span>{desk.totalProjects}</span></div>
                  <div><strong>{model.gallery.counts.export}</strong><span>{desk.waitingExport}</span></div>
                  <div><strong>{model.gallery.counts.conflict}</strong><span>{desk.needsAttention}</span></div>
                </div>
              </div>

              {selectedCount > 0 ? (
                <div className="studio-selection-bar">
                  <span>{desk.selectedProjects(selectedCount)}</span>
                  <div>
                    <button type="button" className="control-button text-xs" onClick={() => setSelectedProjectKeys(new Set())}>
                      {desk.clearSelection}
                    </button>
                    <button type="button" className="control-button text-xs text-red-400" onClick={() => requestProjectDelete(Array.from(selectedProjectKeys))}>
                      {desk.bulkDelete}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="studio-control-actions">
                <button type="button" className="control-button control-button-primary" onClick={() => setCreateOpen(true)}>
                  {desk.createDraft}
                </button>
                <button type="button" className="control-button" onClick={() => setGalleryOpen(false)} disabled={!model.hasActiveDraft}>
                  {desk.returnCurrentDesk}
                </button>
              </div>
            </aside>

            <section className="studio-project-grid-panel" aria-label={desk.projectGrid}>
              {filteredProjects.length ? (
                <div className="studio-project-grid">
                  {filteredProjects.map((project) => (
                    <article
                      key={project.draftStorageKey}
                      role="button"
                      tabIndex={0}
                      aria-label={`${desk.openProject} ${project.title}`}
                      className={cx('studio-project-card', project.isCurrent && 'is-current', selectedProjectKeys.has(project.draftStorageKey) && 'is-selected')}
                      onClick={() => openDraft(project.draftStorageKey)}
                      onContextMenu={(event) => handleProjectContextMenu(event, project.draftStorageKey)}
                      onKeyDown={(event) => handleKeyboardAction(event, () => openDraft(project.draftStorageKey))}
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
                          {project.statuses.filter((status) => status !== 'active').map((status) => (
                            <span key={status} className={cx('studio-status-badge', `studio-status-badge-${status}`)} aria-label={statusLabel(desk, status)} />
                          ))}
                        </div>
                        <div className="studio-cover-fingerprint" aria-hidden="true">
                          {Array.from({ length: 10 }).map((_, index) => <span key={index} />)}
                        </div>
                        <div className="studio-cover-name">{project.title}</div>
                        <div className="studio-current-note">{formatTimestamp(desk, project.lastEditedAt)}</div>
                      </div>
                    </article>
                  ))}
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
        </section>
      ) : (
        <>
          <header className="studio-desk-header">
            <div>
              <h1>{desk.heading}</h1>
              <p>{desk.subtitle}</p>
            </div>
            <div className="studio-desk-tag-shell">
              <div className="studio-desk-tags" aria-label={desk.designTagsLabel}>
                {tagList}
              </div>
              <details className="studio-desk-tag-menu">
                <summary aria-label={desk.designTagsLabel}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </summary>
                <div className="studio-desk-tag-popover" aria-label={desk.designTagsLabel}>
                  {tagList}
                </div>
              </details>
            </div>
          </header>
          <header className="studio-top-bar">
            <button className="studio-mark-button" type="button" aria-label={desk.projectLobby} onClick={() => setGalleryOpen(true)}>
              <span className="studio-mark-icon">S</span>
              <span>Studio Desk</span>
            </button>
            <div className="studio-top-tools" aria-label={desk.toolbar.editView}>
              <div className="studio-save-strip">
                <span className="studio-save-dot" />
                <span>{formatTimestamp(desk, model.exportSummary.lastExportedAt)}</span>
              </div>
              <button className="control-button control-button-primary text-xs" type="button" onClick={() => setExportOpen(true)} disabled={!model.hasActiveDraft}>
                {desk.publishPack}
              </button>
            </div>
          </header>
          <div className="studio-side-tools">
            <button
              type="button"
              className="studio-world-drawer-toggle"
              aria-label={desk.worldBible}
              aria-controls={worldBibleId}
              aria-expanded={worldBibleOpen}
              onClick={() => setWorldBibleOpen((open) => !open)}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {worldBibleOpen ? (
            <div
              className="studio-world-bible-backdrop"
              data-testid="studio-world-bible-backdrop"
              onClick={() => setWorldBibleOpen(false)}
            />
          ) : null}
          <StudioDeskStoryboard
            copy={copy}
            inspirations={model.recentInspirations}
            hasActiveDraft={model.hasActiveDraft}
            onCreateDraft={() => setCreateOpen(true)}
            onCreatePatch={onCreatePatch}
            onOpenPatch={onOpenPatch}
            onPreviewFocusChange={setPreviewFocus}
          />
          <StudioDeskMainStage
            copy={copy}
            model={model}
            previewFocus={previewFocus}
            onCreateDraft={() => setCreateOpen(true)}
            onOpenWorkspace={onOpenWorkspace}
          />
          <StudioDeskWorldBible
            id={worldBibleId}
            className={cx(worldBibleOpen && 'studio-world-bible-open')}
            copy={copy}
            bible={model.worldBible}
            exportSummary={model.exportSummary}
            isLoading={isLoading}
            onCloseDrawer={() => setWorldBibleOpen(false)}
            onExportPack={() => setExportOpen(true)}
          />
        </>
      )}

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

      <CreateDraftDialog
        open={createOpen}
        copy={desk.createDialog}
        onClose={() => setCreateOpen(false)}
        onCreate={(metadata) => {
          setCreateOpen(false)
          setGalleryOpen(false)
          void onCreateDraft(metadata)
        }}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDelete)}
        title={desk.deleteProjectTitle}
        message={pendingDelete?.message ?? ''}
        cancelLabel={desk.createDialog.cancel}
        confirmLabel={desk.deleteProject}
        onClose={() => setPendingDelete(null)}
        onConfirm={deletePendingProjects}
      />
      <ExportDialog
        open={exportOpen}
        copy={desk.exportDialog}
        draftName={model.projectName || desk.noActiveDraftTitle}
        fileList={model.exportSummary.fileList}
        onClose={() => setExportOpen(false)}
        onExport={onExportPack}
      />
    </main>
  )
}
