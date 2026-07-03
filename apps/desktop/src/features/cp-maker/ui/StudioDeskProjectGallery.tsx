import { useState, type CSSProperties, type MouseEvent } from 'react'
import { CheckSquare, Copy, FilePenLine, MoreHorizontal, Search, Trash2, X } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { StudioDeskGalleryProject, StudioDeskModel } from '../model/studioDeskModel'
import { cx } from '@shared/lib/helper'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { formatStudioTimestamp, handleStudioKeyboardAction } from '@features/cp-maker'

type StudioDeskProjectGalleryProps = {
  model: StudioDeskModel
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

export function StudioDeskProjectGallery({
  model,
  onCreateDraftRequest,
  onImportDraftRequest,
  onOpenDraft,
  onCopyDraft,
  onDeleteDraft,
  onEditCurrentDraftProperties,
}: StudioDeskProjectGalleryProps) {
  const desk = useEditorCopy().studioDesk
  const [projectQuery, setProjectQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{ draftStorageKey: string; x: number; y: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingProjectDelete | null>(null)
  const normalizedProjectQuery = projectQuery.trim().toLowerCase()

  const filteredProjects = model.gallery.projects.filter((project) => {
    const matchesQuery = normalizedProjectQuery === '' || project.searchText.toLowerCase().includes(normalizedProjectQuery)
    return matchesQuery
  })

  const contextProject = contextMenu
    ? (model.gallery.projects.find((project) => project.draftStorageKey === contextMenu.draftStorageKey) ?? null)
    : null

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
    <section className="studio-gallery-view" aria-label={desk.projectLobby}>
      <section className="studio-project-manager">
        <header className="studio-project-manager-hero">
          <div>
            <p className="studio-project-manager-eyebrow">{desk.projectManagerEyebrow}</p>
            <h1>{desk.projectLobby}</h1>
            <p>{desk.projectManagerSubtitle}</p>
          </div>
          <div className="studio-project-manager-actions">
            <button type="button" className="control-button" onClick={onImportDraftRequest}>
              {desk.importDraft}
            </button>
            <button type="button" className="control-button control-button-primary" onClick={onCreateDraftRequest}>
              {desk.createDraft}
            </button>
          </div>
        </header>

        <section className="studio-project-list-surface" aria-label={desk.projectGrid}>
          <div className="studio-project-list-head">
            <div className="studio-project-list-title-block">
              <h2>
                {desk.projectList} <span>{desk.projectCount(model.gallery.counts.all)}</span>
              </h2>
            </div>

            <label className="studio-control-search">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{desk.searchProjects}</span>
              <input
                type="search"
                aria-label={desk.searchProjects}
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder={desk.searchProjects}
              />
            </label>
          </div>

          <div className="studio-project-list-panel">
            {filteredProjects.length ? (
              <div className="studio-project-list">
                {filteredProjects.map((project, index) => {
                  const revealProps = getLoadingMotionChildRevealProps({
                    index,
                    className: cx('studio-project-row', project.isCurrent && 'is-current'),
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
                      <div className={cx('studio-project-cover', `studio-cover-${project.coverTone}`)} aria-hidden="true">
                        {project.title
                          .split(/\s+/)
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="studio-project-row-info">
                        <div className="studio-project-row-name">
                          <strong>{project.title}</strong>
                          {project.isCurrent ? <span className="studio-current-label">{desk.currentActive}</span> : null}
                        </div>
                        <div className="studio-project-row-meta">
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
                      <div className="studio-project-row-actions">
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
                  )
                })}
              </div>
            ) : (
              <section className="studio-gallery-empty-state" aria-label={desk.searchEmpty}>
                <div>
                  <div className="studio-empty-workbench" aria-hidden="true" />
                  <strong>{desk.searchEmpty}</strong>
                  <span>{desk.noActiveDraftSubtitle}</span>
                  <button type="button" className="control-button control-button-primary" onClick={onCreateDraftRequest}>
                    {desk.createDraft}
                  </button>
                </div>
              </section>
            )}
          </div>
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
