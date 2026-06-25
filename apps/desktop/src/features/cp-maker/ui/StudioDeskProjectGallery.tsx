import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { CheckSquare, Copy, FilePenLine, FolderOpen, MoreHorizontal, Search, Trash2, X } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskGalleryProject, StudioDeskModel } from '../model/studioDeskModel'
import { cx } from '@shared/lib/helper'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { formatStudioTimestamp, getStudioProjectStatusLabel, handleStudioKeyboardAction } from '@features/cp-maker'

type StudioDeskProjectGalleryProps = {
  model: StudioDeskModel
  query?: string
  onQueryChange?: (query: string) => void
  pendingBanner?: ReactNode
  pendingActionLabel?: string | null
  onCreateDraftRequest: () => void
  onImportDraftRequest: () => void | Promise<void>
  onOpenDraft: (draftStorageKey: string) => void | Promise<void>
  onCopyDraft: (draftStorageKey: string) => void | Promise<void>
  onDeleteDraft: (draftStorageKey: string) => void | Promise<void>
  onEditCurrentDraftProperties: () => void
}

type PendingProjectDelete = {
  keys: string[]
  message: string
}

function getProjectInitials(project: StudioDeskGalleryProject) {
  return project.title
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function StudioDeskProjectGallery({
  model,
  query,
  onQueryChange,
  pendingBanner,
  pendingActionLabel,
  onCreateDraftRequest,
  onImportDraftRequest,
  onOpenDraft,
  onCopyDraft,
  onDeleteDraft,
  onEditCurrentDraftProperties,
}: StudioDeskProjectGalleryProps) {
  const desk = useEditorCopy().studioDesk
  const [localProjectQuery, setLocalProjectQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{ draftStorageKey: string; x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingProjectDelete | null>(null)
  const projectQuery = query ?? localProjectQuery
  const normalizedProjectQuery = projectQuery.trim().toLowerCase()
  const filteredProjects = model.gallery.projects.filter((project) =>
    normalizedProjectQuery ? project.searchText.toLowerCase().includes(normalizedProjectQuery) : true,
  )
  const contextProject = contextMenu
    ? (model.gallery.projects.find((project) => project.draftStorageKey === contextMenu.draftStorageKey) ?? null)
    : null

  function setProjectQuery(nextQuery: string) {
    if (onQueryChange) {
      onQueryChange(nextQuery)
      return
    }
    setLocalProjectQuery(nextQuery)
  }

  function openDraft(draftStorageKey: string) {
    setContextMenu(null)
    void onOpenDraft(draftStorageKey)
  }

  function editProjectProperties(project: StudioDeskGalleryProject) {
    setContextMenu(null)
    if (project.isCurrent) {
      onEditCurrentDraftProperties()
      return
    }
    void onOpenDraft(project.draftStorageKey)
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
    setPendingDelete(null)
  }

  function handleProjectContextMenu(event: MouseEvent<HTMLElement>, draftStorageKey: string) {
    event.preventDefault()
    setContextMenu({ draftStorageKey, x: event.clientX, y: event.clientY })
  }

  return (
    <section className="studio-project-gallery" aria-label={desk.projectLobby}>
      <div className="studio-project-gallery-toolbar">
        <label className="studio-project-gallery-search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{desk.searchProjects}</span>
          <input
            type="search"
            aria-label={desk.searchProjects}
            value={projectQuery}
            onChange={(event) => setProjectQuery(event.currentTarget.value)}
            placeholder={desk.searchProjects}
          />
        </label>
        <span className="studio-project-gallery-count">
          {normalizedProjectQuery
            ? `${filteredProjects.length} / ${model.gallery.counts.all}`
            : desk.projectCount(model.gallery.counts.all)}
        </span>
      </div>

      {pendingBanner}

      {filteredProjects.length ? (
        <div className="studio-project-gallery-list">
          {filteredProjects.map((project) => (
            <article
              key={project.draftStorageKey}
              role="button"
              tabIndex={0}
              aria-label={`${desk.openProject} ${project.title}`}
              className={cx(
                'studio-project-gallery-row',
                project.isCurrent && 'is-current',
                project.statuses.includes('conflict') && 'is-conflict',
                project.needsMetadata && 'is-incomplete',
              )}
              onClick={() => openDraft(project.draftStorageKey)}
              onContextMenu={(event) => handleProjectContextMenu(event, project.draftStorageKey)}
              onKeyDown={(event) => handleStudioKeyboardAction(event, () => openDraft(project.draftStorageKey))}
            >
              <div className={cx('studio-project-gallery-cover', `studio-cover-${project.coverTone}`)} aria-hidden="true">
                {getProjectInitials(project)}
              </div>
              <div className="studio-project-gallery-info">
                <div className="studio-project-gallery-name">
                  <strong>{project.title}</strong>
                  {project.isCurrent ? (
                    <span className="studio-project-gallery-pill studio-project-gallery-pill-current">{desk.currentActive}</span>
                  ) : null}
                  {project.statuses.map((status) => (
                    <span key={status} className={cx('studio-project-gallery-pill', `studio-project-gallery-pill-${status}`)}>
                      {getStudioProjectStatusLabel(desk, status)}
                    </span>
                  ))}
                </div>
                <div className="studio-project-gallery-meta">
                  <span>
                    <b>{desk.uniqueIdLabel}</b>
                    {project.uniqueId || desk.metadataIncomplete}
                  </span>
                  <span>
                    <b>{desk.lastEditedLabel}</b>
                    {formatStudioTimestamp(desk, project.lastEditedAt)}
                  </span>
                  <span>
                    <b>{desk.lastExportedLabel}</b>
                    {project.lastExportedAt === null ? desk.neverExported : formatStudioTimestamp(desk, project.lastExportedAt)}
                  </span>
                </div>
              </div>
              <div className="studio-project-gallery-actions">
                {pendingActionLabel && !project.isCurrent ? (
                  <button
                    type="button"
                    className="control-button control-button-primary"
                    onClick={(event) => {
                      event.stopPropagation()
                      openDraft(project.draftStorageKey)
                    }}
                  >
                    {pendingActionLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={desk.projectMoreActions(project.title)}
                  onClick={(event) => {
                    event.stopPropagation()
                    setContextMenu({
                      draftStorageKey: project.draftStorageKey,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="control-button control-button-primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    openDraft(project.draftStorageKey)
                  }}
                >
                  {desk.openProject}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="studio-project-gallery-empty" aria-label={desk.searchEmpty}>
          <div className="studio-project-gallery-empty-icon" aria-hidden="true">
            {normalizedProjectQuery ? <Search className="h-5 w-5" /> : <FolderOpen className="h-5 w-5" />}
          </div>
          <strong>{normalizedProjectQuery ? desk.searchEmpty : desk.noActiveDraftTitle}</strong>
          <span>{normalizedProjectQuery ? desk.noEntries : desk.noActiveDraftSubtitle}</span>
          <div className="studio-project-gallery-empty-actions">
            <button type="button" className="control-button" onClick={onImportDraftRequest}>
              {desk.importDraft}
            </button>
            <button type="button" className="control-button control-button-primary" onClick={onCreateDraftRequest}>
              {desk.createDraft}
            </button>
          </div>
        </section>
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
            title={contextProject.isCurrent ? undefined : desk.editProjectPropertiesHint}
            onClick={() => editProjectProperties(contextProject)}
          >
            <FilePenLine className="h-3.5 w-3.5" aria-hidden="true" />
            {desk.editProjectProperties}
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

export type { StudioDeskProjectGalleryProps }
