import { vi } from 'vitest'
import type { LauncherPort } from '@features/launcher/model/launcherPort'

export function createMockLauncherPort(overrides: Partial<LauncherPort> = {}): LauncherPort {
  const defaultSettings = {
    gamePath: null,
    modsPath: null,
    downloadPath: null,
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    disablePublicHtmlRoute: false,
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
    scanLibrary: unimplemented('scanLibrary'),
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
    loadNexusDiagnostics: vi.fn().mockResolvedValue({ routes: [] }),
    restartNexusDiagnostics: vi.fn().mockResolvedValue({ routes: [] }),
    setNexusForceOffline: vi.fn().mockResolvedValue({ routes: [] }),
    resolveImage: unimplemented('resolveImage'),
    loadCachedUpdates: vi.fn().mockResolvedValue(null),
    loadSuppressedUpdateModIds: vi.fn().mockResolvedValue({ modsPath: '', modIds: [] }),
    checkUpdates: unimplemented('checkUpdates'),
    listenToUpdateProgress: vi.fn().mockResolvedValue(() => {}),
    downloadMod: unimplemented('downloadMod'),
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
    subscribeUpdates: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
}
