import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockIpcHandler = (command: string, payload?: unknown) => unknown

let mockIpcHandler: MockIpcHandler | null = null

vi.mock('@tauri-apps/api/mocks', () => ({
  mockConvertFileSrc: vi.fn(),
  mockIPC: vi.fn((handler: MockIpcHandler) => {
    mockIpcHandler = handler
  }),
  mockWindows: vi.fn(),
}))

describe('dev launcher mock', () => {
  beforeEach(() => {
    vi.resetModules()
    mockIpcHandler = null
    window.history.replaceState({}, '', '/')
  })

  it('persists the requested launcher download queue state', async () => {
    window.history.replaceState({}, '', '/?mfLauncherMock=1')
    const { installDevLauncherMock } = await import('./devLauncherMock')

    installDevLauncherMock()

    expect(mockIpcHandler).not.toBeNull()
    const savedQueue = { items: [{ id: 'download-1' }] }

    expect(mockIpcHandler?.('save_launcher_download_queue', { request: savedQueue })).toEqual(savedQueue)
    expect(mockIpcHandler?.('load_launcher_download_queue')).toEqual(savedQueue)
  })
})
