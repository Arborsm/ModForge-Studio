import { vi } from 'vite-plus/test'
import type { LauncherPort } from '@features/launcher/model/launcherPort'

export function createMockLauncherPort(overrides: Partial<LauncherPort> = {}): LauncherPort {
  const defaultSettings = {
    gamePath: null,
    modsPath: null,
    downloadPath: null,
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
  }

  const unimplemented = (method: keyof LauncherPort) =>
    vi.fn(() => {
      throw new Error(`LauncherPort.${method} was called without an explicit test override.`)
    })

  return {
    loadSettings: vi.fn().mockResolvedValue({
      ...defaultSettings,
    }),
    saveSettings: vi.fn().mockImplementation(async (request) => ({
      ...defaultSettings,
      ...request,
    })),
    scanLibrary: vi.fn().mockResolvedValue({ modsPath: '', mods: [] }),
    loadRuntimeInfo: vi.fn().mockResolvedValue({
      gameVersion: null,
      smapiVersion: null,
    }),
    loadLibraryState: vi.fn().mockResolvedValue({
      storageFolders: [],
      hiddenModKeys: [],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all' as const,
    }),
    saveLibraryState: unimplemented('saveLibraryState'),
    loadLibraryCovers: unimplemented('loadLibraryCovers'),
    setLibraryCover: unimplemented('setLibraryCover'),
    persistLibraryRemoteCover: unimplemented('persistLibraryRemoteCover'),
    loadDownloadQueue: vi.fn().mockResolvedValue({ items: [] }),
    saveDownloadQueue: unimplemented('saveDownloadQueue'),
    searchCatalog: unimplemented('searchCatalog'),
    loadRemoteModDetail: unimplemented('loadRemoteModDetail'),
    loadUpdateChangelog: unimplemented('loadUpdateChangelog'),
    loadNexusDiagnostics: vi.fn().mockResolvedValue({
      routes: [
        {
          routeId: 'publicGraphql',
          label: 'Nexus Public GraphQL',
          endpoint: 'https://api.nexusmods.com/v2/graphql',
          status: 'success' as const,
          attempts: 1,
          maxAttempts: 3,
          available: true,
          message: 'Connected after 1 attempt.',
        },
      ],
    }),
    restartNexusDiagnostics: vi.fn().mockResolvedValue({ routes: [] }),
    retryNexusDiagnosticsRoute: vi.fn().mockResolvedValue({ routes: [] }),
    setNexusForceOffline: vi.fn().mockResolvedValue({ routes: [] }),
    resolveImage: unimplemented('resolveImage'),
    loadCachedUpdates: vi.fn().mockResolvedValue(null),
    loadSuppressedUpdateModIds: vi.fn().mockResolvedValue({ modsPath: '', modIds: [] }),
    checkUpdates: unimplemented('checkUpdates'),
    listenToUpdateProgress: vi.fn().mockResolvedValue(() => {}),
    downloadMod: unimplemented('downloadMod'),
    cancelDownload: vi.fn().mockResolvedValue(undefined),
    listenToDownloadProgress: vi.fn().mockResolvedValue(() => {}),
    installArchive: unimplemented('installArchive'),
    listInstallBackups: unimplemented('listInstallBackups'),
    restoreInstallBackup: unimplemented('restoreInstallBackup'),
    inspectArchive: unimplemented('inspectArchive'),
    launchGame: unimplemented('launchGame'),
    openPath: unimplemented('openPath'),
    openUrl: unimplemented('openUrl'),
    clearLibraryReadCaches: vi.fn(),
    chooseArchiveFile: unimplemented('chooseArchiveFile'),
    chooseImageFile: unimplemented('chooseImageFile'),
    getBackupDirectory: unimplemented('getBackupDirectory'),
    setModEnabled: unimplemented('setModEnabled'),
    chooseDirectory: unimplemented('chooseDirectory'),
    detectDefaultGameDirectory: vi.fn().mockResolvedValue(null),
    toDesktopAssetUrl: vi.fn().mockReturnValue(''),
    validateNexusApiKey: vi.fn().mockResolvedValue({
      userName: 'TestUser',
      avatarUrl: null,
      profileUrl: null,
      isPremium: true,
      dailyRemaining: 950,
      hourlyRemaining: 450,
      dailyResetAt: null,
      hourlyResetAt: null,
    }),
    startNexusSso: vi.fn().mockResolvedValue({ ssoId: 'test-sso-id', status: 'connecting' as const }),
    getNexusSsoStatus: vi.fn().mockResolvedValue({
      status: 'idle' as const,
      errorKind: null,
      errorMessage: null,
      userName: null,
      isPremium: false,
      ssoId: null,
    }),
    cancelNexusSso: vi.fn().mockResolvedValue(undefined),

    subscribeUpdates: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
}
