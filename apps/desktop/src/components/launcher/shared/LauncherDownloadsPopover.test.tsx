import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherDownloadQueueItem } from '../../../lib/launcher/types'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDownloadsPopover } from './LauncherDownloadsPopover'

const copy = editorCopy['zh-CN'].launcher

function createItem(overrides: Partial<LauncherDownloadQueueItem>): LauncherDownloadQueueItem {
  return {
    id: 'item-1',
    modId: 101,
    title: 'NPC Adventures',
    version: '1.2.0',
    imageUrl: null,
    source: 'discover',
    status: 'completed',
    archivePath: 'E:\\Downloads\\npc-adventures.zip',
    installedTargetPath: null,
    error: null,
    addedAt: 1,
    completedAt: 2,
    totalBytes: null,
    downloadedBytes: null,
    bytesPerSecond: null,
    ...overrides,
  }
}

function createDownloads(items: LauncherDownloadQueueItem[]) {
  const readyToInstall = items.filter((item) => item.status === 'completed' && Boolean(item.archivePath))
  const failedItems = items.filter((item) => item.status === 'failed')
  const removableItems = items.filter(
    (item) => item.status === 'completed' || item.status === 'installed' || item.status === 'failed',
  )

  return {
    items,
    queuedItems: items.filter((item) => item.status === 'queued'),
    activeItems: items.filter((item) => item.status === 'downloading'),
    counts: {
      queued: items.filter((item) => item.status === 'queued').length,
      downloading: items.filter((item) => item.status === 'downloading').length,
      completed: items.filter((item) => item.status === 'completed' || item.status === 'installed').length,
      failed: failedItems.length,
      readyToInstall: readyToInstall.length,
    },
    readyToInstall,
    installedItems: items.filter((item) => item.status === 'installed'),
    failedItems,
    removableItems,
    downloadProgressPercent: null,
    queueDownload: vi.fn(),
    startDebugSimulation: vi.fn(),
    retryItem: vi.fn(),
    retryFailed: vi.fn(),
    removeItem: vi.fn(),
    removeCompleted: vi.fn(),
    installItem: vi.fn(async () => {}),
    installAllReady: vi.fn(async () => {}),
    clearAll: vi.fn(),
  }
}

describe('LauncherDownloadsPopover', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders downloads in a single fixed-height list without grouped sections', () => {
    const downloads = createDownloads([
      createItem({ id: 'queued-item', title: 'Queued Item', status: 'queued', archivePath: null }),
      createItem({ id: 'active-item', title: 'Active Item', status: 'downloading', archivePath: null }),
      createItem({ id: 'failed-item', title: 'Failed Item', status: 'failed', archivePath: null, error: 'Request timed out.' }),
    ])

    const { container } = renderWithLocale(<LauncherDownloadsPopover downloads={downloads} />, 'zh-CN')

    expect(screen.getByText(copy.downloads.title)).toBeTruthy()
    expect(container.querySelector('.launcher-downloads-popover-list-shell')).toBeTruthy()
    expect(container.querySelectorAll('.launcher-download-row')).toHaveLength(3)
    expect(container.querySelector('.launcher-downloads-popover-section')).toBeNull()
  })
})
