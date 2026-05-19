import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { cleanup } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LauncherDiscoverDetail, LauncherLibraryItem } from '@features/launcher'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
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
    description: 'Full Content Patcher description with a lot more installation notes.',
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
    open?: boolean
    onQueueDownload?: Parameters<typeof LauncherModDetailPanel>[0]['onQueueDownload']
    remoteLoading?: boolean
    remoteFilesDeferred?: boolean
    loadRemoteModDetail?: LauncherPort['loadRemoteModDetail']
  } = {},
) {
  const port = createMockLauncherPort({
    loadRemoteModDetail: options.loadRemoteModDetail ?? vi.fn().mockResolvedValue(remoteDetail ?? createRemoteDetail()),
    openPath: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
    resolveImage: vi.fn().mockResolvedValue({ sourceUrl: '', localPath: '', mimeType: 'image/png' }),
    toDesktopAssetUrl: vi.fn().mockReturnValue(''),
  })

  renderWithLocaleAndLaunchers(
    <LauncherModDetailPanel
      open={options.open ?? true}
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
      remoteLoading={options.remoteLoading}
      remoteFilesDeferred={options.remoteFilesDeferred}
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
  it('unmounts the drawer while closed so hidden content cannot retain focus', () => {
    renderPanel(createLocalMod(), createRemoteDetail(), { open: false })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.launcher-library-drawer')).toBeNull()
  })

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

  it('keeps the combined hero focused on version state instead of raw update keys', () => {
    renderPanel(createLocalMod(), createRemoteDetail())

    expect(screen.queryByText('Update Keys')).toBeNull()
    expect(screen.getByText('Current folder')).toBeTruthy()
    expect(screen.getByText('Nexus primary file')).toBeTruthy()
    expect(screen.queryByText('VERIFIED')).toBeNull()
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
    const filesPanel = screen.getByRole('tabpanel')
    expect(filesPanel.querySelector('.launcher-mod-detail-rich-head')).toBeNull()
    expect(within(filesPanel).queryByText('Available files')).toBeNull()
    expect(within(filesPanel).getByText('Content Patcher 2.9.1')).toBeTruthy()

    cleanup()
    renderPanel(createLocalMod({ missingRequiredDependencies: [], nexusModId: null, updateKeys: [], modUrl: null }), null)

    expect(screen.queryByRole('tab', { name: 'Dependencies' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Files' })).toBeNull()
  })

  it('groups Nexus files like the download page and keeps changelogs in their own tab', () => {
    renderPanel(
      createLocalMod({ missingRequiredDependencies: [] }),
      createRemoteDetail({
        files: [
          {
            fileId: 4,
            name: 'Content Patcher 2.10.0',
            version: '2.10.0',
            category: 'ARCHIVED',
            size: 395,
            primary: false,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Newer archived release notes.'],
            archiveType: 'ZIP',
          },
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
            uniqueDownloads: 1200,
            totalDownloads: 1800,
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
            uploadedAt: '2026-07-02T07:19:00Z',
            description: '[B]Adds[/B] the latest Stardew Valley support.',
            uniqueDownloads: 346_000,
            totalDownloads: 458_500,
            managerDownloadEnabled: true,
            primary: true,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Compatibility updates and fixes.', '[URL=https://example.com/install]Install guide[/URL]'],
            archiveType: 'ZIP',
          },
        ],
      }),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    const filesPanel = screen.getByRole('tabpanel')

    expect(within(filesPanel).getByText('Main files')).toBeTruthy()
    expect(within(filesPanel).getByText('Optional files')).toBeTruthy()
    expect(within(filesPanel).getByRole('button', { name: 'Old and archived files 2' })).toBeTruthy()
    expect(filesPanel.querySelector('.launcher-mod-detail-info-layout.scrollable')).toBeTruthy()
    expect(within(filesPanel).queryByText('Compatibility updates and fixes.')).toBeNull()
    expect(within(filesPanel).getByText(/2026-07-02/)).toBeTruthy()
    expect(within(filesPanel).getByText(/Unique 346K/)).toBeTruthy()
    expect(within(filesPanel).getByText(/Total 458\.5K/)).toBeTruthy()
    expect(within(filesPanel).getByText('Adds')).toBeTruthy()
    expect(within(filesPanel).getByText('the latest Stardew Valley support.')).toBeTruthy()
    expect(within(filesPanel).queryByRole('link', { name: 'Install guide' })).toBeNull()
    expect(filesPanel.querySelector('.launcher-mod-detail-data-item.file-item')?.getAttribute('title')).toBeNull()
    expect(within(filesPanel).queryByText(/\[URL=/)).toBeNull()
    expect(within(filesPanel).queryByText('Adds translation files.')).toBeNull()
    expect(within(filesPanel).queryByText('Legacy compatibility fixes.')).toBeNull()

    fireEvent.click(within(filesPanel).getByRole('button', { name: 'Old and archived files 2' }))

    expect(within(filesPanel).queryByText('Legacy compatibility fixes.')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Changelog' }))
    const changelogPanel = screen.getByRole('tabpanel')

    expect(within(changelogPanel).getByText('v2.9.1')).toBeTruthy()
    expect(within(changelogPanel).getByText('v2.8.0')).toBeTruthy()
    expect(within(changelogPanel).getByText('v2.10.0')).toBeTruthy()
    const changelogVersions = Array.from(changelogPanel.querySelectorAll('.launcher-mod-detail-changelog-entry span')).map(
      (item) => item.textContent,
    )
    expect(changelogVersions).toEqual(['v2.10.0', 'v2.9.1', 'v2.8.0'])
    expect(within(changelogPanel).getByText('Compatibility updates and fixes.')).toBeTruthy()
    expect(within(changelogPanel).getByRole('link', { name: 'Install guide' })).toHaveAttribute('href', 'https://example.com/install')
    expect(within(changelogPanel).getByText('Adds translation files.')).toBeTruthy()
    expect(within(changelogPanel).getByText('Legacy compatibility fixes.')).toBeTruthy()
  })

  it('shows an overlay while remote mod details are still loading', () => {
    renderPanel(createLocalMod(), createRemoteDetail(), { remoteLoading: true })

    expect(screen.getByRole('status')).toHaveTextContent('Loading mod details...')
  })

  it('moves the short summary into the hero and starts tabs from description', () => {
    renderPanel(
      null,
      createRemoteDetail({
        summary: 'Short overview summary.',
        description: 'Full remote description with many sections.',
      }),
    )

    expect(screen.queryByRole('tab', { name: 'Overview' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Short overview summary.')).toBeTruthy()
    expect(screen.getByText('Full remote description with many sections.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expand Full Description' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Full Description' }))
    expect(screen.getByRole('dialog', { name: 'Full Description' })).toBeTruthy()
  })

  it('loads remote files after opening the changelog or files tab when file data is deferred', async () => {
    const remoteWithoutFiles = createRemoteDetail({
      primaryFileId: null,
      primaryFileName: null,
      primaryFileVersion: null,
      primaryFileChangelog: [],
      files: [],
    })
    const remoteWithFiles = createRemoteDetail({
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
    })
    const port = renderPanel(null, remoteWithoutFiles, {
      onQueueDownload: vi.fn(),
      remoteFilesDeferred: true,
    })
    vi.mocked(port.loadRemoteModDetail).mockResolvedValue(remoteWithFiles)

    expect(port.loadRemoteModDetail).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: 'Changelog' }))

    await waitFor(() => {
      expect(port.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 1915, includeFiles: true })
    })

    expect(await screen.findByText('Compatibility updates and fixes.')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    expect(await screen.findByRole('button', { name: 'Queue Download Content Patcher 2.9.1' })).toBeTruthy()
  })

  it('keeps combined detail file data deferred until files or changelog is opened', async () => {
    const remoteWithoutFiles = createRemoteDetail({
      primaryFileId: null,
      primaryFileName: null,
      primaryFileVersion: null,
      primaryFileChangelog: [],
      files: [],
    })
    const remoteWithFiles = createRemoteDetail({
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
    })
    const loadRemoteModDetail = vi.fn().mockResolvedValueOnce(remoteWithoutFiles).mockResolvedValueOnce(remoteWithFiles)
    const port = renderPanel(createLocalMod(), null, {
      onQueueDownload: vi.fn(),
      remoteFilesDeferred: true,
      loadRemoteModDetail,
    })

    await waitFor(() => {
      expect(port.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 1915, includeFiles: false })
    })
    expect(port.loadRemoteModDetail).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))

    await waitFor(() => {
      expect(port.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 1915, includeFiles: true })
    })
    expect(await screen.findByRole('button', { name: 'Queue Download Content Patcher 2.9.1' })).toBeTruthy()
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
