import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, CheckSquare, Copy, FilePenLine, FolderOpen, MoreVertical, Search, Trash2, X } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskGalleryProject, StudioDeskModel } from '../model/studioDeskModel'
import { cx } from '@shared/lib/helper'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { formatStudioTimestamp, getStudioProjectStatusLabel, handleStudioKeyboardAction } from '@features/cp-maker'

type StudioDeskProjectGalleryProps = {
  model: StudioDeskModel
  className?: string
  query?: string
  onQueryChange?: (query: string) => void
  variant?: 'list' | 'cards'
  toolbar?: boolean
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
  className,
  query,
  onQueryChange,
  variant = 'list',
  toolbar = true,
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

  useEffect(() => {
    if (!contextMenu) return
    function dismiss() {
      setContextMenu(null)
    }
    function onKeyDown(e: Event) {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        e.stopImmediatePropagation()
        dismiss()
      }
    }
    function onClickOutside(e: Event) {
      const menu = (e.target as HTMLElement).closest('.studio-project-context-menu')
      if (!menu) dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [contextMenu])

  return (
    <section className={cx('studio-project-gallery', className)} aria-label={desk.projectLobby}>
      {toolbar ? (
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
      ) : null}

      {pendingBanner}

      {filteredProjects.length ? (
        <div className="studio-project-gallery-list">
          {filteredProjects.map((project) => {
            const rowClassName = cx(
              'studio-project-gallery-row',
              project.isCurrent && 'is-current',
              project.statuses.includes('error') && 'is-error',
              project.needsMetadata && 'is-incomplete',
              variant === 'cards' && 'studio-project-gallery-row-card',
            )
            const openProject = () => openDraft(project.draftStorageKey)
            const visibleCardStatuses = project.statuses.filter((status) => status !== 'neverExported')
            const moreActionsButton = (
              <button
                type="button"
                className="studio-project-gallery-menu-button"
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
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            )

            if (variant === 'cards') {
              return (
                <article
                  key={project.draftStorageKey}
                  role="button"
                  tabIndex={0}
                  aria-label={`${desk.openProject} ${project.title}`}
                  className={rowClassName}
                  onClick={openProject}
                  onContextMenu={(event) => handleProjectContextMenu(event, project.draftStorageKey)}
                  onKeyDown={(event) => handleStudioKeyboardAction(event, openProject)}
                >
                  <div className="studio-project-gallery-card-top">
                    <div className={cx('studio-project-gallery-cover', `studio-cover-${project.coverTone}`)} aria-hidden="true">
                      {getProjectInitials(project)}
                    </div>
                    <div className="studio-project-gallery-card-id">
                      <strong>{project.title}</strong>
                      <span>{project.uniqueId || desk.metadataIncomplete}</span>
                    </div>
                    <div className="studio-project-gallery-actions">{moreActionsButton}</div>
                  </div>
                  <div className="studio-project-gallery-card-foot">
                    {project.isCurrent ? (
                      <span className="studio-project-gallery-pill studio-project-gallery-pill-current">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        {desk.currentActive}
                      </span>
                    ) : null}
                    {visibleCardStatuses.map((status) => (
                      <span key={status} className={cx('studio-project-gallery-pill', `studio-project-gallery-pill-${status}`)}>
                        {getStudioProjectStatusLabel(desk, status)}
                      </span>
                    ))}
                    <span className="studio-project-gallery-card-time">{formatStudioTimestamp(desk, project.lastEditedAt)}</span>
                  </div>
                  {pendingActionLabel && !project.isCurrent ? (
                    <button
                      type="button"
                      className="studio-project-gallery-use"
                      onClick={(event) => {
                        event.stopPropagation()
                        openProject()
                      }}
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      {pendingActionLabel}
                    </button>
                  ) : null}
                </article>
              )
            }

            return (
              <article
                key={project.draftStorageKey}
                role="button"
                tabIndex={0}
                aria-label={`${desk.openProject} ${project.title}`}
                className={rowClassName}
                onClick={openProject}
                onContextMenu={(event) => handleProjectContextMenu(event, project.draftStorageKey)}
                onKeyDown={(event) => handleStudioKeyboardAction(event, openProject)}
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
                        openProject()
                      }}
                    >
                      {pendingActionLabel}
                    </button>
                  ) : null}
                  {moreActionsButton}
                  <button
                    type="button"
                    className="control-button control-button-primary"
                    onClick={(event) => {
                      event.stopPropagation()
                      openProject()
                    }}
                  >
                    {desk.openProject}
                  </button>
                </div>
              </article>
            )
          })}
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

      {contextProject
        ? createPortal(
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
            </div>,
            document.body,
          )
        : null}

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
