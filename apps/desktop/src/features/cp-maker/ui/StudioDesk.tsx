import { useCallback, useState, type PointerEvent } from 'react'
import { BookOpen, MoreHorizontal } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { DraftPatch, CpMakerDraft, WorkspaceId } from '@shared/contracts'
import type { StudioDeskInspiration, StudioDeskModel } from '../model/studioDeskModel'
import { cx } from '@shared/lib/cx'
import { CreateDraftDialog } from './CreateDraftDialog'
import { ExportDialog } from './ExportDialog'
import { StudioDeskStoryboard } from './StudioDeskStoryboard'
import { StudioDeskMainStage } from './StudioDeskMainStage'
import { StudioDeskWorldBible } from './StudioDeskWorldBible'
import { StudioDeskProjectGallery } from './StudioDeskProjectGallery'
import { ProjectPropertiesDialog } from './ProjectPropertiesDialog'
import { formatStudioTimestamp } from '@features/cp-maker'

type CreateDraftMetadata = Pick<
  CpMakerDraft['projectMetadata'],
  'projectName' | 'projectDescription' | 'projectAuthor' | 'projectVersion' | 'projectUniqueId'
>

export type StudioDeskProps = {
  model: StudioDeskModel
  onCreateDraft: (metadata: CreateDraftMetadata) => void | Promise<void>
  onImportDraft: () => void | Promise<void>
  onCreatePatch: (action: DraftPatch['action'], workspace: WorkspaceId) => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
  onOpenPatch: (patchId: string) => void
  onOpenDraft: (draftStorageKey: string) => void | Promise<void>
  onCopyDraft: (draftStorageKey: string) => void | Promise<void>
  onDeleteDraft: (draftStorageKey: string) => void | Promise<void>
  onUpdateDraftMetadata: (metadata: Partial<CpMakerDraft['projectMetadata']>) => void | Promise<void>
  onExportPack: (outputPath: string) => Promise<void>
  isLoading: boolean
  galleryOpen?: boolean
  onGalleryOpenChange?: (open: boolean) => void
  createDialogOpenSignal?: number
}

export function StudioDesk({
  model,
  onCreateDraft,
  onImportDraft,
  onCreatePatch,
  onOpenWorkspace,
  onOpenPatch,
  onOpenDraft,
  onCopyDraft,
  onDeleteDraft,
  onUpdateDraftMetadata,
  onExportPack,
  isLoading,
  galleryOpen: controlledGalleryOpen,
  onGalleryOpenChange,
  createDialogOpenSignal,
}: StudioDeskProps) {
  const copy = useEditorCopy()
  const [localGalleryOpen, setLocalGalleryOpen] = useState(true)
  const [createDialogState, setCreateDialogState] = useState(() => ({
    open: false,
    consumedSignal: createDialogOpenSignal ?? 0,
  }))
  const [exportOpen, setExportOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [worldBibleOpen, setWorldBibleOpen] = useState(false)
  const [previewFocus, setPreviewFocus] = useState<StudioDeskInspiration | null>(null)
  const desk = copy.studioDesk
  const worldBibleId = 'studio-world-bible-panel'
  const galleryOpen = controlledGalleryOpen ?? localGalleryOpen
  const createOpen =
    createDialogState.open || Boolean(createDialogOpenSignal && createDialogState.consumedSignal !== createDialogOpenSignal)
  const setGalleryOpen = useCallback(
    (open: boolean) => {
      if (controlledGalleryOpen === undefined) {
        setLocalGalleryOpen(open)
      }
      onGalleryOpenChange?.(open)
    },
    [controlledGalleryOpen, onGalleryOpenChange],
  )
  const openCreateDialog = useCallback(() => {
    setCreateDialogState({
      open: true,
      consumedSignal: createDialogOpenSignal ?? 0,
    })
  }, [createDialogOpenSignal])
  const closeCreateDialog = useCallback(() => {
    setCreateDialogState({
      open: false,
      consumedSignal: createDialogOpenSignal ?? 0,
    })
  }, [createDialogOpenSignal])

  const tagList = desk.designTags.map((tag, index) => (
    <span key={tag}>
      {index === 0 ? <span className="studio-tag-dot" /> : null}
      {tag}
    </span>
  ))

  function handleDeskPointerMove(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const shiftX = (x / Math.max(rect.width, 1) - 0.5) * 10
    const shiftY = (y / Math.max(rect.height, 1) - 0.5) * 10

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
        <StudioDeskProjectGallery
          model={model}
          onCreateDraftRequest={openCreateDialog}
          onImportDraftRequest={onImportDraft}
          onOpenDraft={(draftStorageKey) => {
            setGalleryOpen(false)
            void onOpenDraft(draftStorageKey)
          }}
          onCopyDraft={onCopyDraft}
          onDeleteDraft={onDeleteDraft}
          onEditCurrentDraftProperties={() => setPropertiesOpen(true)}
        />
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
                <span>{formatStudioTimestamp(desk, model.exportSummary.lastExportedAt)}</span>
              </div>
              <button
                className="control-button control-button-primary text-xs"
                type="button"
                onClick={() => setExportOpen(true)}
                disabled={!model.hasActiveDraft}
              >
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
            inspirations={model.recentInspirations}
            hasActiveDraft={model.hasActiveDraft}
            onCreateDraft={openCreateDialog}
            onCreatePatch={onCreatePatch}
            onOpenPatch={onOpenPatch}
            onPreviewFocusChange={setPreviewFocus}
          />
          <StudioDeskMainStage
            model={model}
            previewFocus={previewFocus}
            onCreateDraft={openCreateDialog}
            onOpenWorkspace={onOpenWorkspace}
          />
          <StudioDeskWorldBible
            id={worldBibleId}
            className={cx(worldBibleOpen && 'studio-world-bible-open')}
            bible={model.worldBible}
            exportSummary={model.exportSummary}
            isLoading={isLoading}
            onCloseDrawer={() => setWorldBibleOpen(false)}
            onExportPack={() => setExportOpen(true)}
          />
        </>
      )}

      <CreateDraftDialog
        open={createOpen}
        onClose={closeCreateDialog}
        onCreate={(metadata) => {
          closeCreateDialog()
          setGalleryOpen(false)
          void onCreateDraft(metadata)
        }}
      />
      <ProjectPropertiesDialog
        open={propertiesOpen}
        metadata={{
          projectName: model.projectName,
          projectDescription: model.projectDescription,
          projectAuthor: model.projectAuthor,
          projectVersion: model.projectVersion,
          projectUniqueId: model.projectUniqueId,
        }}
        onClose={() => setPropertiesOpen(false)}
        onSave={onUpdateDraftMetadata}
      />
      <ExportDialog
        open={exportOpen}
        draftName={model.projectName || desk.noActiveDraftTitle}
        fileList={model.exportSummary.fileList}
        onClose={() => setExportOpen(false)}
        onExport={onExportPack}
      />
    </main>
  )
}
