import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import type { LauncherDownloadQueueItem } from '@features/launcher'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherDownloadRow } from '@features/launcher'

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

  it('renders metadata content for downloads', () => {
    renderWithLocale(
      <LauncherDownloadRow
        item={createItem()}
        statusLabel="下载中"
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onInstall={vi.fn()}
      />,
      'zh-CN',
    )

    expect(screen.getByText('NPC Adventures')).toBeTruthy()
    expect(screen.getByText(`${copy.pages.discover} / 1.2.0`)).toBeTruthy()
  })

  it('keeps the install action available for failed installs when the archive still exists', () => {
    renderWithLocale(
      <LauncherDownloadRow
        item={createItem({
          status: 'failed',
          archivePath: 'E:\\Downloads\\Mods\\npc-adventures.zip',
          error: 'Archive missing',
          totalBytes: null,
          downloadedBytes: null,
          bytesPerSecond: null,
        })}
        statusLabel="安装失败"
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onInstall={vi.fn()}
      />,
      'zh-CN',
    )

    expect(screen.getByRole('button', { name: copy.actions.retry })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.actions.install })).toBeTruthy()
  })

  it('shows localized Premium guidance for restricted Nexus download links', () => {
    renderWithLocale(
      <LauncherDownloadRow
        item={createItem({
          status: 'failed',
          error: 'Nexus Premium is required for direct API download links.',
          totalBytes: null,
          downloadedBytes: null,
          bytesPerSecond: null,
        })}
        statusLabel="下载失败"
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onInstall={vi.fn()}
      />,
      'zh-CN',
    )

    expect(screen.getByText('直接下载需要 Premium')).toBeTruthy()
    expect(screen.getByText('请在模组页面手动下载，或连接 Nexus Premium 账号以使用直接 API 下载。')).toBeTruthy()
    expect(screen.queryByText('Nexus Premium is required for direct API download links.')).toBeNull()
  })
})
