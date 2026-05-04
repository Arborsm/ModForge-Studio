import type { KeyboardEvent } from 'react'
import type { EditorCopy } from '../../locales'
import type { StudioDeskProjectStatus } from '../../lib/app/studioDeskModel'

export function formatStudioTimestamp(copy: EditorCopy['studioDesk'], timestamp: number | null) {
  if (!timestamp) return copy.edited.recently
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes <= 1) return copy.edited.justNow
  if (minutes < 60) return copy.edited.minutesAgo(minutes)
  return copy.edited.hoursAgo(Math.max(1, Math.round(minutes / 60)))
}

export function getStudioProjectStatusLabel(copy: EditorCopy['studioDesk'], status: StudioDeskProjectStatus) {
  if (status === 'export') return copy.pendingExport
  if (status === 'conflict') return copy.hasConflict
  if (status === 'archive') return copy.archived
  return copy.galleryFilters.active
}

export function handleStudioKeyboardAction(event: KeyboardEvent<HTMLElement>, callback: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  callback()
}
