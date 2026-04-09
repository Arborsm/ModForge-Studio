import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherDownloadQueueItem } from '../../../lib/launcher/types'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDownloadRow } from './LauncherDownloadRow'

const copy = editorCopy['zh-CN'].launcher

function createItem(overrides: Partial<LauncherDownloadQueueItem> = {}): LauncherDownloadQueueItem {
  return {
    id: 'item-1',
    modId: 101,
    title: 'NPC Adventures',
    version: '1.2.0',
    imageUrl: null,
    source: 'discover',
    status: 'downloading',
    archivePath: null,
    installedTargetPath: null,
    error: null,
    addedAt: 1,
    completedAt: null,
    totalBytes: 20 * 1024 * 1024,
    downloadedBytes: 10 * 1024 * 1024,
    bytesPerSecond: 2 * 1024 * 1024,
    ...overrides,
  }
}

describe('LauncherDownloadRow', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders compact inline metadata and detail rows for downloads', () => {
    const { container } = renderWithLocale(
      <LauncherDownloadRow
        item={createItem()}
        statusLabel="下载中"
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onInstall={vi.fn()}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.launcher-download-row-topline')).toBeTruthy()
    expect(container.querySelector('.launcher-download-row-detailline')).toBeTruthy()
    expect(screen.getByText('NPC Adventures')).toBeTruthy()
    expect(screen.getByText(`${copy.pages.discover} / 1.2.0`)).toBeTruthy()
  })
})
