import { Copy, Grid3X3, MessageSquare, PackagePlus, Plus, Trash2 } from 'lucide-react'
import type { EditorCopy } from '../../locales'
import type { StudioDeskInspiration, StudioDeskInspirationKind } from '../../lib/app/studioDeskModel'
import type { DraftPatch } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'

type StudioDeskStoryboardProps = {
  copy: EditorCopy
  inspirations: StudioDeskInspiration[]
  hasActiveDraft: boolean
  onCreateDraft: () => void
  onCreatePatch: (action: DraftPatch['action'], workspace: WorkspaceId) => void
  onOpenPatch: (patchId: string) => void
  onPreviewFocusChange: (item: StudioDeskInspiration | null) => void
}

function iconFor(kind: StudioDeskInspirationKind) {
  if (kind === 'map') return <Grid3X3 className="h-4 w-4" />
  if (kind === 'event') return <MessageSquare className="h-4 w-4" />
  return <PackagePlus className="h-4 w-4" />
}

function formatEditedLabel(copy: EditorCopy['studioDesk'], updatedAt: number | null) {
  if (!updatedAt) return copy.edited.recently
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000))
  if (minutes <= 1) return copy.edited.justNow
  if (minutes < 60) return copy.edited.minutesAgo(minutes)
  return copy.edited.hoursAgo(Math.max(1, Math.round(minutes / 60)))
}

export function StudioDeskStoryboard({
  copy,
  inspirations,
  hasActiveDraft,
  onCreateDraft,
  onCreatePatch,
  onOpenPatch,
  onPreviewFocusChange,
}: StudioDeskStoryboardProps) {
  const desk = copy.studioDesk

  return (
    <aside className="studio-storyboard">
      <div className="studio-section-label">{desk.recentInspirations}</div>
      <button type="button" className="studio-create-button" onClick={onCreateDraft}>
        <Plus className="h-4 w-4" />
        <span>{desk.newCreation}</span>
      </button>
      <div className="studio-create-strip">
        <button
          type="button"
          disabled={!hasActiveDraft}
          onClick={() => onCreatePatch('EditData', 'events')}
        >
          {desk.newEvent}
        </button>
        <button
          type="button"
          disabled={!hasActiveDraft}
          onClick={() => onCreatePatch('EditMap', 'map')}
        >
          {desk.newMap}
        </button>
        <button
          type="button"
          disabled={!hasActiveDraft}
          onClick={() => onCreatePatch('EditData', 'items')}
        >
          {desk.newItem}
        </button>
      </div>

      <div className="studio-inspiration-list">
        {inspirations.length ? (
          inspirations.map((item) => (
            <article key={item.patchId} className={`studio-inspiration studio-inspiration-${item.kind}`}>
              <button
                type="button"
                className="studio-inspiration-main"
                onClick={() => onOpenPatch(item.patchId)}
                onMouseEnter={() => onPreviewFocusChange(item)}
                onMouseLeave={() => onPreviewFocusChange(null)}
              >
                <span className="studio-inspiration-icon">{iconFor(item.kind)}</span>
                <span className="studio-inspiration-text">
                  <strong>{item.title}</strong>
                  <span>{formatEditedLabel(desk, item.updatedAt)}</span>
                </span>
                <span
                  className={`studio-status-dot studio-status-${item.status}`}
                  aria-label={item.status === 'modified' ? desk.modified : desk.synced}
                />
              </button>
              <span className="studio-inspiration-actions" aria-hidden="true">
                <Copy className="h-3.5 w-3.5" />
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </article>
          ))
        ) : (
          <div className="studio-empty-note">{desk.noEntries}</div>
        )}
      </div>
    </aside>
  )
}
