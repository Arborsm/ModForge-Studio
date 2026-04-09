import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherSettings, LauncherUpdateSummary, LauncherUpdatesResult } from '../../../lib/desktop'
import { checkLauncherUpdates } from '../../../lib/desktop'
import { LocaleProvider } from '../../../lib/app/localeContext'
import { NotificationProvider, clearNotifications } from '../../../lib/app/notifications'
import { LauncherUpdatesPage } from './LauncherUpdatesPage'

const eventListeners = new Map<string, (event: { payload: unknown }) => void>()

vi.mock('../../../lib/desktop', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/desktop')>('../../../lib/desktop')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (eventName: string, callback: (event: { payload: unknown }) => void) => {
    eventListeners.set(eventName, callback)
    return () => {
      eventListeners.delete(eventName)
    }
  }),
}))

vi.mock('../../../lib/launcher/imageLoader', () => ({
  useLauncherImage: () => ({
    imageUrl: null,
    error: null,
    loading: false,
  }),
}))

const checkLauncherUpdatesMock = vi.mocked(checkLauncherUpdates)

function renderWithProviders(ui: ReactElement) {
  return render(
    <LocaleProvider locale="zh-CN">
      <NotificationProvider>{ui}</NotificationProvider>
    </LocaleProvider>,
  )
}

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
    clearNotifications()
    eventListeners.clear()
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

    renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={onQueueDownload} />)

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

    renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />)

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

  it('shows update-check progress in the global notification viewport', async () => {
    checkLauncherUpdatesMock.mockImplementation(() => new Promise(() => {}))

    const { container } = renderWithProviders(
      <LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />,
    )

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 2,
          total: 4,
          currentModName: 'Horse Overhaul',
        },
      })
    })

    expect(screen.getByText('检查模组更新')).toBeTruthy()
    expect(screen.getByText(/Horse Overhaul/)).toBeTruthy()
    expect(container.querySelector('.notification-toast-progress')?.getAttribute('style')).toContain('width: 50%')
  })
})
