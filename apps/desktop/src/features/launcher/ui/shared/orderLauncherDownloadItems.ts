import type { LauncherDownloadQueueItem } from '@features/launcher'

const DOWNLOAD_STATUS_PRIORITY: Record<LauncherDownloadQueueItem['status'], number> = {
  downloading: 0,
  queued: 1,
  completed: 2,
  installed: 3,
  failed: 4,
}

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
