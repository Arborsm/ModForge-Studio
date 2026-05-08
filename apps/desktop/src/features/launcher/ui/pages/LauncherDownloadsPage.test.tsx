import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { LauncherDownloadQueueItem } from '@features/launcher'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherDownloadsPage } from './LauncherDownloadsPage'

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

describe('LauncherDownloadsPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders localized launcher download actions for completed and failed jobs', () => {
    const downloads = createDownloads([
      createItem({ id: 'completed-item', title: 'NPC Adventures', status: 'completed' }),
      createItem({
        id: 'failed-item',
        title: 'Horse Overhaul',
        status: 'failed',
        error: 'Request timed out.',
        archivePath: null,
      }),
    ])

    renderWithLocale(<LauncherDownloadsPage downloads={downloads} />, 'zh-CN')

    expect(screen.getAllByText(copy.downloads.title).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: `${copy.actions.install} (1)` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${copy.actions.retry} (1)` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${copy.actions.remove} (2)` })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.actions.install })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.actions.retry })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: copy.actions.remove })).toHaveLength(2)
  })

  it('renders downloads in a single fixed-height list without status sections', () => {
    const downloads = createDownloads([
      createItem({ id: 'queued-item', title: 'Queued Item', status: 'queued', archivePath: null }),
      createItem({ id: 'active-item', title: 'Active Item', status: 'downloading', archivePath: null }),
      createItem({ id: 'failed-item', title: 'Failed Item', status: 'failed', archivePath: null, error: 'Request timed out.' }),
    ])

    const { container } = renderWithLocale(<LauncherDownloadsPage downloads={downloads} />, 'zh-CN')

    expect(container.querySelector('.launcher-manager-grid')).toBeNull()
    expect(container.querySelector('.launcher-download-list-shell')).toBeTruthy()
    expect(container.querySelectorAll('.launcher-download-row')).toHaveLength(3)
    expect(screen.queryByText(new RegExp(`^${copy.states.failed} \\(`))).toBeNull()
    expect(screen.queryByText(new RegExp(`^${copy.overview.completedDownloads} \\(`))).toBeNull()
  })

  it('forwards row and bulk actions to the download controller callbacks', () => {
    const downloads = createDownloads([
      createItem({ id: 'completed-item', title: 'NPC Adventures', status: 'completed' }),
      createItem({
        id: 'failed-item',
        title: 'Horse Overhaul',
        status: 'failed',
        error: 'Request timed out.',
        archivePath: null,
      }),
    ])

    renderWithLocale(<LauncherDownloadsPage downloads={downloads} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: `${copy.actions.install} (1)` }))
    fireEvent.click(screen.getByRole('button', { name: `${copy.actions.retry} (1)` }))
    fireEvent.click(screen.getByRole('button', { name: `${copy.actions.remove} (2)` }))
    fireEvent.click(screen.getByRole('button', { name: copy.actions.install }))
    fireEvent.click(screen.getByRole('button', { name: copy.actions.retry }))
    fireEvent.click(screen.getAllByRole('button', { name: copy.actions.remove })[1])

    expect(downloads.installAllReady).toHaveBeenCalledTimes(1)
    expect(downloads.retryFailed).toHaveBeenCalledTimes(1)
    expect(downloads.removeCompleted).toHaveBeenCalledTimes(1)
    expect(downloads.installItem).toHaveBeenCalledWith('completed-item')
    expect(downloads.retryItem).toHaveBeenCalledWith('failed-item')
    expect(downloads.removeItem).toHaveBeenCalledWith('failed-item')
  })
})
