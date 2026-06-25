import { useState, type PointerEvent } from 'react'
import { BookOpen, MoreHorizontal } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { DraftPatch, WorkspaceId } from '@features/cp-maker'
import type { StudioDeskInspiration, StudioDeskModel } from '../model/studioDeskModel'
import { cx } from '@shared/lib/helper'
import { StudioDeskStoryboard } from './StudioDeskStoryboard'
import { StudioDeskMainStage } from './StudioDeskMainStage'
import { StudioDeskWorldBible } from './StudioDeskWorldBible'
import { formatStudioTimestamp } from '@features/cp-maker'

export type StudioDeskProps = {
  model: StudioDeskModel
  onCreateDraftRequest: () => void
  onCreatePatch: (action: DraftPatch['action'], workspace: WorkspaceId) => void
  onOpenWorkspace: (workspace: WorkspaceId) => void
  onOpenPatch: (patchId: string) => void
  onExportPackRequest: () => void
  isLoading: boolean
}

export function StudioDesk({
  model,
  onCreateDraftRequest,
  onCreatePatch,
  onOpenWorkspace,
  onOpenPatch,
  onExportPackRequest,
  isLoading,
}: StudioDeskProps) {
  const copy = useEditorCopy()
  const [worldBibleOpen, setWorldBibleOpen] = useState(false)
  const [previewFocus, setPreviewFocus] = useState<StudioDeskInspiration | null>(null)
  const desk = copy.studioDesk
  const worldBibleId = 'studio-world-bible-panel'

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
    <main className="studio-desk" aria-label={desk.title} onPointerMove={handleDeskPointerMove} onPointerLeave={handleDeskPointerLeave}>
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
        <div className="studio-mark-button" aria-label={desk.title}>
          <span className="studio-mark-icon">S</span>
          <span>Studio Desk</span>
        </div>
        <div className="studio-top-tools" aria-label={desk.toolbar.editView}>
          <div className="studio-save-strip">
            <span className="studio-save-dot" />
            <span>{formatStudioTimestamp(desk, model.exportSummary.lastExportedAt)}</span>
          </div>
          <button
            className="control-button control-button-primary text-xs"
            type="button"
            onClick={onExportPackRequest}
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
        <div className="studio-world-bible-backdrop" data-testid="studio-world-bible-backdrop" onClick={() => setWorldBibleOpen(false)} />
      ) : null}
      <StudioDeskStoryboard
        inspirations={model.recentInspirations}
        hasActiveDraft={model.hasActiveDraft}
        onCreateDraft={onCreateDraftRequest}
        onCreatePatch={onCreatePatch}
        onOpenPatch={onOpenPatch}
        onPreviewFocusChange={setPreviewFocus}
      />
      <StudioDeskMainStage
        model={model}
        previewFocus={previewFocus}
        onCreateDraft={onCreateDraftRequest}
        onOpenWorkspace={onOpenWorkspace}
      />
      <StudioDeskWorldBible
        id={worldBibleId}
        className={cx(worldBibleOpen && 'studio-world-bible-open')}
        bible={model.worldBible}
        exportSummary={model.exportSummary}
        isLoading={isLoading}
        onCloseDrawer={() => setWorldBibleOpen(false)}
        onExportPack={onExportPackRequest}
      />
    </main>
  )
}
