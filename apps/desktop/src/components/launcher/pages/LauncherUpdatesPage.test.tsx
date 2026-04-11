import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  LauncherRemoteModDetail,
  LauncherSettings,
  LauncherUpdateChangelogResult,
  LauncherUpdateSummary,
  LauncherUpdatesResult,
} from '../../../lib/desktop'
import {
  checkLauncherUpdates,
  loadLauncherRemoteModDetail,
  loadLauncherUpdateChangelog,
} from '../../../lib/desktop'
import { LocaleProvider } from '../../../lib/app/localeContext'
import { NotificationProvider, clearNotifications } from '../../../lib/app/notifications'
import { useLauncherUpdateProgressNotifications } from '../../../lib/launcher/useLauncherUpdateProgressNotifications'
import { LauncherUpdatesPage } from './LauncherUpdatesPage'

const eventListeners = new Map<string, (event: { payload: unknown }) => void>()

vi.mock('../../../lib/desktop', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/desktop')>('../../../lib/desktop')
  return {
    ...actual,
    checkLauncherUpdates: vi.fn(),
    loadLauncherRemoteModDetail: vi.fn(),
    loadLauncherUpdateChangelog: vi.fn(),
    openLauncherUrl: vi.fn(),
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
const loadLauncherRemoteModDetailMock = vi.mocked(loadLauncherRemoteModDetail)
const loadLauncherUpdateChangelogMock = vi.mocked(loadLauncherUpdateChangelog)

function UpdateProgressNotificationBridge() {
  useLauncherUpdateProgressNotifications('zh-CN')
  return null
}

function renderWithProviders(ui: ReactElement) {
  return render(
    <LocaleProvider locale="zh-CN">
      <NotificationProvider>
        <UpdateProgressNotificationBridge />
        {ui}
      </NotificationProvider>
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
    author: 'Pathoschild',
    currentVersion: '1.0.0',
    latestVersion: '1.2.0',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    updatedAt: '2026-04-09T08:00:00.000Z',
    fileSize: 13_107_200,
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

function createRemoteDetail(overrides: Partial<LauncherRemoteModDetail> = {}): LauncherRemoteModDetail {
  return {
    modId: 101,
    title: 'NPC Adventures',
    summary: 'Help villagers travel farther and react smarter.',
    author: 'Pathoschild',
    version: '1.2.0',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/101/101-cover.png',
    galleryImages: ['https://staticdelivery.nexusmods.com/mods/1303/images/101/101-gallery-1.png'],
    updatedAt: '2026-04-09T08:00:00.000Z',
    fileSize: 13_107_200,
    ...overrides,
  }
}

function createChangelog(overrides: Partial<LauncherUpdateChangelogResult> = {}): LauncherUpdateChangelogResult {
  return {
    modId: 101,
    version: '1.2.0',
    changelog:
      '- 修复了在冬季由于雪地渲染导致的菜单闪烁 Bug\n- 增加了对 SMAPI 4.0 的完美支持',
    ...overrides,
  }
}

describe('LauncherUpdatesPage', () => {
  afterEach(() => {
    cleanup()
    clearNotifications()
    eventListeners.clear()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders the update console and only loads changelog when the changelog button is clicked', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-12T08:00:00.000Z').getTime())

    checkLauncherUpdatesMock.mockResolvedValue(
      createResult([
        createUpdate(),
        createUpdate({
          modId: 202,
          name: 'Horse Overhaul',
          author: 'FlashShifter',
          latestVersion: '3.1.0',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Horse Overhaul',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/202',
          updatedAt: '2026-04-11T08:00:00.000Z',
          fileSize: 2_097_152,
        }),
      ]),
    )
    loadLauncherRemoteModDetailMock.mockResolvedValue(createRemoteDetail())
    loadLauncherUpdateChangelogMock.mockResolvedValue(createChangelog())

    renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />)

    await screen.findByText('模组更新')

    expect(screen.getByText('(2个可用更新)')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新检查' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消全选' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '一键更新所有勾选项' })).toBeTruthy()
    expect(screen.getByText('3天前发布')).toBeTruthy()
    expect(screen.getByText('12.5 MB')).toBeTruthy()
    expect(screen.queryByText(/修复了在冬季由于雪地渲染导致的菜单闪烁 Bug/)).toBeNull()
    expect(loadLauncherUpdateChangelogMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: '更新日志' })[0]!)

    await waitFor(() => {
      expect(loadLauncherRemoteModDetailMock).toHaveBeenCalledWith({ modId: 101 })
      expect(loadLauncherUpdateChangelogMock).toHaveBeenCalledWith({ modId: 101 })
    })

    expect(await screen.findByText(/修复了在冬季由于雪地渲染导致的菜单闪烁 Bug/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '前往模组主页' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看评论区' })).toBeTruthy()
  })

  it('queues only the checked updates when updating all selected items', async () => {
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
    const onQueueDownload = vi.fn()

    renderWithProviders(<LauncherUpdatesPage settings={createSettings()} onQueueDownload={onQueueDownload} />)

    const firstCheckbox = await screen.findByRole('checkbox', { name: 'NPC Adventures' })
    const secondCheckbox = await screen.findByRole('checkbox', { name: 'Horse Overhaul' })

    expect(firstCheckbox).toHaveProperty('checked', true)
    expect(secondCheckbox).toHaveProperty('checked', true)

    fireEvent.click(secondCheckbox)
    expect(secondCheckbox).toHaveProperty('checked', false)

    fireEvent.click(screen.getByRole('button', { name: '一键更新所有勾选项' }))

    expect(onQueueDownload).toHaveBeenCalledTimes(1)
    expect(onQueueDownload).toHaveBeenCalledWith({
      modId: 101,
      title: 'NPC Adventures',
      imageUrl: null,
      version: '1.2.0',
      source: 'updates',
    })
  })

  it('toggles between select all and clear selection from the console control', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: '取消全选' }))
    expect(firstCheckbox).toHaveProperty('checked', false)
    expect(secondCheckbox).toHaveProperty('checked', false)

    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    expect(firstCheckbox).toHaveProperty('checked', true)
    expect(secondCheckbox).toHaveProperty('checked', true)
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

  it('keeps update progress notifications alive and updating after the page unmounts', async () => {
    checkLauncherUpdatesMock.mockImplementation(() => new Promise(() => {}))

    const { container, rerender } = render(
      <LocaleProvider locale="zh-CN">
        <NotificationProvider>
          <UpdateProgressNotificationBridge />
          <LauncherUpdatesPage settings={createSettings()} onQueueDownload={vi.fn()} />
        </NotificationProvider>
      </LocaleProvider>,
    )

    await waitFor(() => {
      expect(eventListeners.has('launcher://update-check-progress')).toBe(true)
    })

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 1,
          total: 4,
          currentModName: 'NPC Adventures',
        },
      })
      await Promise.resolve()
    })

    expect(screen.getByText(/NPC Adventures/)).toBeTruthy()

    rerender(
      <LocaleProvider locale="zh-CN">
        <NotificationProvider>
          <UpdateProgressNotificationBridge />
          <div>Another page</div>
        </NotificationProvider>
      </LocaleProvider>,
    )

    expect(screen.getByText('Another page')).toBeTruthy()
    expect(screen.getByText(/NPC Adventures/)).toBeTruthy()

    await act(async () => {
      eventListeners.get('launcher://update-check-progress')?.({
        payload: {
          modsPath: 'E:\\Games\\Stardew Valley\\Mods',
          checked: 3,
          total: 4,
          currentModName: 'Horse Overhaul',
        },
      })
      await Promise.resolve()
    })

    expect(screen.queryByText(/NPC Adventures/)).toBeNull()
    expect(screen.getByText(/Horse Overhaul/)).toBeTruthy()
    expect(container.querySelector('.notification-toast-progress')?.getAttribute('style')).toContain('width: 75%')
  })
})
