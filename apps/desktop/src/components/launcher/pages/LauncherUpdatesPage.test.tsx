import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherSettings, LauncherUpdateSummary, LauncherUpdatesResult } from '../../../lib/desktop'
import { checkLauncherUpdates } from '../../../lib/desktop'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherUpdatesPage } from './LauncherUpdatesPage'

vi.mock('../../../lib/desktop', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/desktop')>('../../../lib/desktop')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
  }
})

vi.mock('../../../lib/launcher/imageLoader', () => ({
  useLauncherImage: () => ({
    imageUrl: null,
    error: null,
    loading: false,
  }),
}))

const checkLauncherUpdatesMock = vi.mocked(checkLauncherUpdates)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: null,
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    ...overrides,
  }
}

function createUpdate(overrides: Partial<LauncherUpdateSummary> = {}): LauncherUpdateSummary {
  return {
    modId: 101,
    name: 'NPC Adventures',
    currentVersion: '1.0.0',
    latestVersion: '1.2.0',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    ...overrides,
  }
}

function createResult(updates: LauncherUpdateSummary[]): LauncherUpdatesResult {
  return {
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    checkedAtMs: 123,
    updates,
  }
}

describe('LauncherUpdatesPage', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('checks all loaded updates by default and bulk-queues only the checked items', async () => {
    const updates = [
      createUpdate(),
      createUpdate({
        modId: 202,
        name: 'Horse Overhaul',
        latestVersion: '3.1.0',
        absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Horse Overhaul',
        modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
      }),
    ]
    checkLauncherUpdatesMock.mockResolvedValue(createResult(updates))
    const onQueueDownload = vi.fn()

    renderWithLocale(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={onQueueDownload} />, 'zh-CN')

    const firstCheckbox = await screen.findByRole('checkbox', { name: 'NPC Adventures' })
    const secondCheckbox = await screen.findByRole('checkbox', { name: 'Horse Overhaul' })

    expect(firstCheckbox).toHaveProperty('checked', true)
    expect(secondCheckbox).toHaveProperty('checked', true)

    fireEvent.click(secondCheckbox)
    expect(secondCheckbox).toHaveProperty('checked', false)

    fireEvent.click(screen.getByRole('button', { name: /批量加入下载队列/i }))

    expect(onQueueDownload).toHaveBeenCalledTimes(1)
    expect(onQueueDownload).toHaveBeenCalledWith({
      modId: 101,
      title: 'NPC Adventures',
      imageUrl: null,
      version: '1.2.0',
      source: 'updates',
    })
  })

  it('supports clearing and restoring the bulk selection', async () => {
    checkLauncherUpdatesMock.mockResolvedValue(
      createResult([
        createUpdate(),
        createUpdate({
          modId: 202,
          name: 'Horse Overhaul',
          latestVersion: '3.1.0',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Horse Overhaul',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
        }),
      ]),
    )

    renderWithLocale(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    const firstCheckbox = await screen.findByRole('checkbox', { name: 'NPC Adventures' })
    const secondCheckbox = await screen.findByRole('checkbox', { name: 'Horse Overhaul' })
    const bulkQueueButton = screen.getByRole('button', { name: /批量加入下载队列/i })

    fireEvent.click(screen.getByRole('button', { name: '清除选择' }))

    expect(firstCheckbox).toHaveProperty('checked', false)
    expect(secondCheckbox).toHaveProperty('checked', false)
    expect(bulkQueueButton).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: '选择全部' }))

    expect(firstCheckbox).toHaveProperty('checked', true)
    expect(secondCheckbox).toHaveProperty('checked', true)
    expect(bulkQueueButton).toHaveProperty('disabled', false)
  })
})
