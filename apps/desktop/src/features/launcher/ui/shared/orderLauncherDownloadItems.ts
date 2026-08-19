/**
 * @file Download queue item ordering: sorts by status priority then by
 * most-recent timestamp.
 */
import type { LauncherDownloadQueueItem } from '../../model/types'

const DOWNLOAD_STATUS_PRIORITY: Record<LauncherDownloadQueueItem['status'], number> = {
  downloading: 0,
  queued: 1,
  completed: 2,
  installed: 3,
  failed: 4,
}

/** Sorts download queue items by status priority (downloading first) then by most-recent timestamp. */
export function orderLauncherDownloadItems(items: LauncherDownloadQueueItem[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = DOWNLOAD_STATUS_PRIORITY[left.status] - DOWNLOAD_STATUS_PRIORITY[right.status]
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    const leftTimestamp = left.completedAt ?? left.addedAt
    const rightTimestamp = right.completedAt ?? right.addedAt
    return rightTimestamp - leftTimestamp
  })
}
