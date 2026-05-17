import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LauncherDiscoverDetail, LauncherLibraryItem } from '@features/launcher'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { renderWithLocaleAndLaunchers } from '@test/renderWithLocaleAndLaunchers'
import { LauncherModDetailPanel } from './LauncherModDetailPanel'

function createLocalMod(overrides: Partial<LauncherLibraryItem> = {}): LauncherLibraryItem {
  return {
    id: 'content-patcher',
    labelKey: 'ContentPatcher::E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
    name: 'Content Patcher',
    author: 'Pathoschild',
    version: '2.9.0',
    description: 'Loads content packs for Stardew Valley.',
    uniqueId: 'Pathoschild.ContentPatcher',
    folderName: 'ContentPatcher',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
    enabled: true,
    nexusModId: 1915,
    updateKeys: ['Nexus:1915'],
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/1915',
    imageUrl: null,
    requiredDependencies: [],
    missingRequiredDependencies: [],
    ...overrides,
  }
}

function createRemoteDetail(overrides: Partial<LauncherDiscoverDetail> = {}): LauncherDiscoverDetail {
  return {
    modId: 1915,
    title: 'Content Patcher',
    summary: 'Loads Content Patcher packs for Stardew Valley 1.6 and requires SMAPI 4.4.0 or later.',
    author: 'Pathoschild',
    version: '2.9.1',
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/1915',
    imageUrl: null,
    galleryImages: [],
    updatedAt: '2026-04-16T12:00:00Z',
    fileSize: 381,
    category: 'Modding Tools',
    downloads: 23_100_000,
    endorsements: 457_192,
    tags: ['SMAPI', 'Content Patcher'],
    primaryFileId: 160463,
    primaryFileName: 'Content Patcher 2.9.1',
    primaryFileVersion: '2.9.1',
    primaryFileSize: 381,
    primaryFileSizeBytes: 389_967,
    primaryFileScanStatus: 'VERIFIED',
    primaryFileChangelog: ['Compatibility updates and fixes.'],
    requirements: [],
    files: [],
    ...overrides,
  }
}

function renderPanel(
  mod: LauncherLibraryItem | null,
  remoteDetail: LauncherDiscoverDetail | null = null,
  options: {
    onQueueDownload?: Parameters<typeof LauncherModDetailPanel>[0]['onQueueDownload']
  } = {},
) {
  const port = createMockLauncherPort({
    loadRemoteModDetail: vi.fn().mockResolvedValue(remoteDetail ?? createRemoteDetail()),
    openPath: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
    resolveImage: vi.fn().mockResolvedValue({ sourceUrl: '', localPath: '', mimeType: 'image/png' }),
    toDesktopAssetUrl: vi.fn().mockReturnValue(''),
  })

  renderWithLocaleAndLaunchers(
    <LauncherModDetailPanel
      open
      onClose={vi.fn()}
      closeLabel="Close"
      title="Mod Details"
      subtitle="Inspect metadata"
      empty="Select a mod"
      mod={mod}
      remoteDetail={remoteDetail}
      labels={{
        currentVersion: 'Current Version',
        uniqueId: 'Unique ID',
        path: 'Path',
        dependencies: 'Missing Dependencies',
        updateKeys: 'Update Keys',
        pack: 'Pack',
      }}
      noSummary="No summary"
      onToggleEnabled={vi.fn()}
      enableLabel="Enable"
      disableLabel="Disable"
      enabledStateLabel="Enabled"
      disabledStateLabel="Disabled"
      openFolderLabel="Open Folder"
      setCoverLabel="Set Cover"
      clearCoverLabel="Clear Cover"
      onOpenFolder={vi.fn()}
      onSetCover={vi.fn()}
      onClearCover={vi.fn()}
      openModPageLabel="Open Mod Page"
      onQueueDownload={options.onQueueDownload}
    />,
    'en-US',
    undefined,
    port,
  )

  return port
}

describe('LauncherModDetailPanel', () => {
  it('keeps local-only details focused on install and manifest fields', () => {
    renderPanel(createLocalMod({ nexusModId: null, updateKeys: [], modUrl: null }))

    fireEvent.click(screen.getByRole('tab', { name: 'Details' }))

    const detailsPanel = screen.getByRole('tabpanel')
    expect(within(detailsPanel).getByText('Install')).toBeTruthy()
    expect(within(detailsPanel).getByText('Absolute Path')).toBeTruthy()
    expect(within(detailsPanel).queryByText('Manifest')).toBeNull()
    expect(within(detailsPanel).queryByText('Missing Dependencies')).toBeNull()
    expect(within(detailsPanel).queryByText('Update Evidence')).toBeNull()
    expect(within(detailsPanel).queryByText('Label Key')).toBeNull()
  })

  it('does not repeat local update keys in the sidebar', () => {
    renderPanel(createLocalMod(), createRemoteDetail())

    expect(screen.queryByText('Update Keys')).toBeNull()
    expect(screen.getAllByText('Nexus').length).toBeGreaterThan(0)
  })

  it('renders combined update evidence and exposes truncated full values through titles', async () => {
    renderPanel(createLocalMod(), createRemoteDetail())

    fireEvent.click(screen.getByRole('tab', { name: 'Details' }))

    const detailsPanel = screen.getByRole('tabpanel')
    expect(within(detailsPanel).getByText('Install Path')).toBeTruthy()
    expect(within(detailsPanel).getByText('Update Evidence')).toBeTruthy()
    await waitFor(() => expect(within(detailsPanel).getByText('Nexus:1915')).toBeTruthy())
    expect(
      within(detailsPanel)
        .getAllByText('Nexus:1915')
        .some((item) => item.getAttribute('title')?.includes('manifest updateKeys contains Nexus:1915')),
    ).toBe(true)
    expect(within(detailsPanel).getByText('E:\\...\\Mods\\ContentPatcher').getAttribute('title')).toBe(
      'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
    )
  })

  it('adds a dependencies tab only when dependency data exists', () => {
    renderPanel(createLocalMod({ missingRequiredDependencies: ['Pathoschild.SMAPI'] }), null)

    expect(screen.getByRole('tab', { name: 'Dependencies' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))

    const dependenciesPanel = screen.getByRole('tabpanel')
    expect(within(dependenciesPanel).getByText('Pathoschild.SMAPI')).toBeTruthy()
  })

  it('adds a files tab for Nexus details with files and hides both optional tabs when empty', () => {
    renderPanel(
      createLocalMod({ missingRequiredDependencies: [] }),
      createRemoteDetail({
        requirements: [],
        files: [
          {
            fileId: 160463,
            name: 'Content Patcher 2.9.1',
            version: '2.9.1',
            category: 'MAIN',
            size: 381,
            sizeBytes: 389_967,
            primary: true,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Compatibility updates and fixes.'],
            archiveType: 'ZIP',
          },
        ],
      }),
    )

    expect(screen.queryByRole('tab', { name: 'Dependencies' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Files' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    expect(within(screen.getByRole('tabpanel')).getByText('Content Patcher 2.9.1')).toBeTruthy()

    cleanup()
    renderPanel(createLocalMod({ missingRequiredDependencies: [], nexusModId: null, updateKeys: [], modUrl: null }), null)

    expect(screen.queryByRole('tab', { name: 'Dependencies' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Files' })).toBeNull()
  })

  it('groups Nexus files like the mod page and expands changelogs on click', () => {
    renderPanel(
      createLocalMod({ missingRequiredDependencies: [] }),
      createRemoteDetail({
        files: [
          {
            fileId: 3,
            name: 'Content Patcher 2.8.0',
            version: '2.8.0',
            category: 'ARCHIVED',
            size: 300,
            primary: false,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Legacy compatibility fixes.'],
            archiveType: 'ZIP',
          },
          {
            fileId: 2,
            name: 'Content Patcher i18n Files',
            version: '2.9.1',
            category: 'OPTIONAL',
            size: 12,
            primary: false,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Adds translation files.'],
            archiveType: 'ZIP',
          },
          {
            fileId: 1,
            name: 'Content Patcher 2.9.1',
            version: '2.9.1',
            category: 'MAIN',
            size: 381,
            primary: true,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Compatibility updates and fixes.'],
            archiveType: 'ZIP',
          },
        ],
      }),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    const filesPanel = screen.getByRole('tabpanel')

    expect(within(filesPanel).getByText('Main files')).toBeTruthy()
    expect(within(filesPanel).getByText('Optional files')).toBeTruthy()
    expect(within(filesPanel).getByText('Old files')).toBeTruthy()
    expect(filesPanel.querySelector('.launcher-mod-detail-info-layout.scrollable')).toBeTruthy()
    expect(within(filesPanel).getByText('Compatibility updates and fixes.')).toBeTruthy()
    expect(within(filesPanel).getByText('Adds translation files.')).toBeTruthy()
    expect(within(filesPanel).queryByText('Legacy compatibility fixes.')).toBeNull()

    fireEvent.click(within(filesPanel).getByRole('button', { name: /^F Content Patcher 2\.8\.0/ }))

    expect(within(filesPanel).getByText('Legacy compatibility fixes.')).toBeTruthy()
  })

  it('queues the exact file from the file list and lets the backend resolve direct/manual download behavior', () => {
    const onQueueDownload = vi.fn()
    const remoteDetail = createRemoteDetail({
      files: [
        {
          fileId: 160463,
          name: 'Content Patcher 2.9.1',
          version: '2.9.1',
          category: 'MAIN',
          size: 381,
          primary: true,
          scanned: true,
          scanStatus: 'VERIFIED',
          changelog: ['Compatibility updates and fixes.'],
          archiveType: 'ZIP',
        },
      ],
    })
    renderPanel(createLocalMod(), remoteDetail, { onQueueDownload })

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Queue Download Content Patcher 2.9.1' }))

    expect(onQueueDownload).toHaveBeenCalledWith({
      modId: 1915,
      fileId: 160463,
      title: 'Content Patcher',
      imageUrl: null,
      version: '2.9.1',
      source: 'updates',
    })
  })
})
