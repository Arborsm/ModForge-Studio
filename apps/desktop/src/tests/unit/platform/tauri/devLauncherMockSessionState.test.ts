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

describe('dev launcher mock session state', () => {
  beforeEach(() => {
    vi.resetModules()
    mockIpcHandler = null
    window.history.replaceState({}, '', '/')
    window.sessionStorage.clear()
  })

  it('restores patched app UI state after a simulated refresh', async () => {
    window.history.replaceState({}, '', '/?mfLauncherMock=1')
    const { installDevLauncherMock } = await import('@platform/tauri/devLauncherMock')

    installDevLauncherMock()
    expect(mockIpcHandler).not.toBeNull()

    const patchedLocation = { kind: 'module', moduleId: 'map' } as const
    await mockIpcHandler?.('patch_app_ui_state', {
      request: { workspace: { location: patchedLocation } },
    })

    expect(window.sessionStorage.getItem('modforge.devMock.appUiState')).not.toBeNull()

    // A same-tab refresh re-evaluates the mock, which must resume from sessionStorage.
    installDevLauncherMock()

    const restored = (await mockIpcHandler?.('load_app_ui_state')) as {
      workspace: { location: { kind: string; moduleId: string } }
    }
    expect(restored.workspace.location).toEqual(patchedLocation)
  })

  it('restores CP Maker drafts, project assets and session after a simulated refresh', async () => {
    window.history.replaceState({}, '', '/?mfLauncherMock=1')
    const { installDevLauncherMock } = await import('@platform/tauri/devLauncherMock')

    installDevLauncherMock()
    expect(mockIpcHandler).not.toBeNull()

    const draftStorageKey = 'draft-session-restore'
    await mockIpcHandler?.('save_cp_maker_draft', {
      draft: {
        draftStorageKey,
        projectMetadata: { projectName: 'Session Restore Draft', projectUniqueId: 'Dev.SessionRestore.1' },
        lastDraftSavedAt: null,
        lastExportedAt: null,
        lastExportPath: null,
        lastExportFingerprint: null,
      },
    })
    const bytesBase64 = 'aGVsbG8gd29ybGQ='
    await mockIpcHandler?.('write_cp_maker_project_asset', {
      request: {
        draftStorageKey,
        relativePath: 'assets/session.png',
        mediaType: 'image/png',
        bytesBase64,
      },
    })
    await mockIpcHandler?.('save_cp_maker_session', {
      session: { activeDraftKey: draftStorageKey, activeGeneratedDraftKey: null },
    })

    expect(window.sessionStorage.getItem('modforge.devMock.cpMakerState')).not.toBeNull()

    // A same-tab refresh re-evaluates the mock, which must resume from sessionStorage.
    installDevLauncherMock()

    const drafts = (await mockIpcHandler?.('list_cp_maker_drafts')) as Array<{
      draftStorageKey: string
      projectName: string
    }>
    expect(drafts.find((item) => item.draftStorageKey === draftStorageKey)?.projectName).toBe('Session Restore Draft')

    const asset = (await mockIpcHandler?.('read_cp_maker_project_asset', {
      request: { draftStorageKey, relativePath: 'assets/session.png' },
    })) as { bytesBase64: string; asset: { relativePath: string } }
    expect(asset.asset.relativePath).toBe('assets/session.png')
    expect(asset.bytesBase64).toBe(bytesBase64)

    const session = (await mockIpcHandler?.('load_cp_maker_session')) as {
      activeDraftKey: string | null
      activeGeneratedDraftKey: string | null
    }
    expect(session).toEqual({ activeDraftKey: draftStorageKey, activeGeneratedDraftKey: null })
  })
})
