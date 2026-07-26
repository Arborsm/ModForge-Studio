import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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
    const { installDevLauncherMock } = await import('@platform/tauri/devLauncherMock')

    installDevLauncherMock()

    expect(mockIpcHandler).not.toBeNull()
    const savedQueue = { items: [{ id: 'download-1' }] }

    expect(mockIpcHandler?.('save_launcher_download_queue', { request: savedQueue })).toEqual(savedQueue)
    expect(mockIpcHandler?.('load_launcher_download_queue')).toEqual(savedQueue)
  })

  it('seeds AI settings fixtures when mfSettingsMock is enabled', async () => {
    window.history.replaceState({}, '', '/?mfSettingsMock=1')
    const { installDevLauncherMock } = await import('@platform/tauri/devLauncherMock')

    installDevLauncherMock()
    expect(mockIpcHandler).not.toBeNull()

    const aiSettings = mockIpcHandler?.('load_ai_settings') as {
      profiles: Array<{ id: string }>
      defaultProfileId: string | null
    }
    expect(aiSettings.profiles.length).toBeGreaterThan(0)
    expect(aiSettings.defaultProfileId).toBe('openai-workbench')

    const engine = mockIpcHandler?.('load_localization_default_engine') as { kind: string; profileId: string }
    expect(engine).toEqual({ kind: 'generative-ai', profileId: 'openai-workbench' })

    const mt = mockIpcHandler?.('load_machine_translation_settings') as { profiles: unknown[] }
    expect(mt.profiles.length).toBeGreaterThan(0)

    const semantic = mockIpcHandler?.('load_localization_semantic_settings') as { mode: string }
    expect(semantic.mode).toBe('builtin')

    const usage = mockIpcHandler?.('query_ai_usage_summary') as { totals: { requests: number } }
    expect(usage.totals.requests).toBeGreaterThan(0)
  })
})
