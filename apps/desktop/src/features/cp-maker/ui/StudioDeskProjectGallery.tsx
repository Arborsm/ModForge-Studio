/**
 * @file Studio Desk project gallery with list/cards variants, search, context
 * menu, and delete confirmation.
 * @module features/cp-maker
 */
import { useState, type ReactNode } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ArrowRight, Check, FolderOpen, Search } from 'lucide-react'
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

/** Project gallery with search, list/cards variants, and delete confirmation. */
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
  const [pendingDelete, setPendingDelete] = useState<PendingProjectDelete | null>(null)
  const projectQuery = query ?? localProjectQuery
  const normalizedProjectQuery = projectQuery.trim().toLowerCase()
  const filteredProjects = model.gallery.projects.filter((project) =>
    normalizedProjectQuery ? project.searchText.toLowerCase().includes(normalizedProjectQuery) : true,
  )

  function setProjectQuery(nextQuery: string) {
    if (onQueryChange) {
      onQueryChange(nextQuery)
      return
    }
    setLocalProjectQuery(nextQuery)
  }

  function openDraft(draftStorageKey: string) {
    void onOpenDraft(draftStorageKey)
  }

  function editProjectProperties(project: StudioDeskGalleryProject) {
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

  /** Radix context menu content shared by the list and cards variants. */
  function renderProjectContextMenu(project: StudioDeskGalleryProject) {
    return (
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          <ContextMenu.Item className="context-menu-item" onSelect={() => openDraft(project.draftStorageKey)}>
            {desk.openProject}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => editProjectProperties(project)}>
            {desk.editProjectProperties}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => void onCopyDraft(project.draftStorageKey)}>
            {desk.copyProject}
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-separator" />
          <ContextMenu.Item className="context-menu-item is-danger" onSelect={() => requestProjectDelete([project.draftStorageKey])}>
            {desk.deleteProject}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    )
  }

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

            if (variant === 'cards') {
              return (
                <ContextMenu.Root key={project.draftStorageKey}>
                  <ContextMenu.Trigger asChild>
                    <article
                      role="button"
                      tabIndex={0}
                      aria-label={`${desk.openProject} ${project.title}`}
                      className={rowClassName}
                      onClick={openProject}
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
                  </ContextMenu.Trigger>
                  {renderProjectContextMenu(project)}
                </ContextMenu.Root>
              )
            }

            return (
              <ContextMenu.Root key={project.draftStorageKey}>
                <ContextMenu.Trigger asChild>
                  <article
                    role="button"
                    tabIndex={0}
                    aria-label={`${desk.openProject} ${project.title}`}
                    className={rowClassName}
                    onClick={openProject}
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
                </ContextMenu.Trigger>
                {renderProjectContextMenu(project)}
              </ContextMenu.Root>
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
