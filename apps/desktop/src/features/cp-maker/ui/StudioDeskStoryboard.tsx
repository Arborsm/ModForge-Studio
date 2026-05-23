import { useMemo, useState } from 'react'
import { Copy, Grid3X3, MessageSquare, PackagePlus, Plus, Trash2 } from 'lucide-react'
import type { EditorCopy } from '@locales'
import type { StudioDeskInspiration, StudioDeskInspirationKind } from '../model/studioDeskModel'
import type { DraftPatch } from '@shared/contracts'
import type { WorkspaceId } from '@shared/contracts'
import { formatStudioTimestamp } from '@features/cp-maker'

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
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredInspirations = useMemo(() => {
    if (!normalizedQuery) return inspirations
    return inspirations.filter((item) => `${item.title} ${item.target} ${item.action}`.toLowerCase().includes(normalizedQuery))
  }, [inspirations, normalizedQuery])
  const handlePrimaryCreate = () => {
    if (hasActiveDraft) {
      onCreatePatch('EditData', 'events')
      return
    }

    onCreateDraft()
  }

  return (
    <aside className="studio-storyboard" aria-label={desk.recentInspirations}>
      <div className="studio-section-label">{desk.recentInspirations}</div>
      <label className="studio-stack-filter">
        <span className="sr-only">{desk.quickSearchLabel}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={desk.quickSearchPlaceholder} />
      </label>
      <button type="button" className="studio-create-button" onClick={handlePrimaryCreate}>
        <Plus className="h-4 w-4" />
        <span>{hasActiveDraft ? desk.newCreation : desk.createDraft}</span>
      </button>
      <div className="studio-create-strip">
        <button type="button" disabled={!hasActiveDraft} onClick={() => onCreatePatch('EditData', 'events')}>
          {desk.newEvent}
        </button>
        <button type="button" disabled={!hasActiveDraft} onClick={() => onCreatePatch('EditMap', 'map')}>
          {desk.newMap}
        </button>
        <button type="button" disabled={!hasActiveDraft} onClick={() => onCreatePatch('EditData', 'items')}>
          {desk.newItem}
        </button>
      </div>

      <div className="studio-inspiration-list">
        {filteredInspirations.length ? (
          filteredInspirations.map((item) => (
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
                  <span>{formatStudioTimestamp(desk, item.updatedAt)}</span>
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
