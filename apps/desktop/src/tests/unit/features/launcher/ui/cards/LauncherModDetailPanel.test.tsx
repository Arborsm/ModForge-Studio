import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { cleanup, type RenderResult } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { LauncherDiscoverDetail, LauncherLibraryItem } from '@features/launcher'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { renderWithLocaleAndLaunchers } from '@test/renderWithLocaleAndLaunchers'
import { LauncherModDetailPanel } from '@features/launcher/ui/cards/LauncherModDetailPanel'

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
    hasConfig: true,
    nexusModId: 1915,
    updateKeys: ['Nexus:1915'],
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/1915',
    imageUrl: null,
    dependencies: [],
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
    loadModConfig?: LauncherPort['loadModConfig']
    saveModConfig?: LauncherPort['saveModConfig']
    loadSettings?: LauncherPort['loadSettings']
    loadConfigItems?: LauncherPort['loadConfigItems']
    libraryMods?: LauncherLibraryItem[]
    onSearchDependency?: Parameters<typeof LauncherModDetailPanel>[0]['onSearchDependency']
  } = {},
): LauncherPort & { renderResult: RenderResult } {
  const port = createMockLauncherPort({
    loadRemoteModDetail: options.loadRemoteModDetail ?? vi.fn().mockResolvedValue(remoteDetail ?? createRemoteDetail()),
    loadModConfig:
      options.loadModConfig ??
      vi.fn().mockResolvedValue({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
        configExists: true,
        fields: [],
        schemaSources: [],
        warnings: [],
        probeStatus: 'unavailable',
      }),
    saveModConfig:
      options.saveModConfig ??
      vi.fn().mockResolvedValue({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
        configExists: true,
        fields: [],
        schemaSources: [],
        warnings: [],
        probeStatus: 'unavailable',
      }),
    ...(options.loadSettings ? { loadSettings: options.loadSettings } : {}),
    ...(options.loadConfigItems ? { loadConfigItems: options.loadConfigItems } : {}),
    openPath: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
    resolveImage: vi.fn().mockResolvedValue({ sourceUrl: '', localPath: '', mimeType: 'image/png' }),
    toDesktopAssetUrl: vi.fn().mockReturnValue(''),
  })

  const renderResult = renderWithLocaleAndLaunchers(
    <LauncherModDetailPanel
      open={options.open ?? true}
      onClose={vi.fn()}
      mod={mod}
      remoteDetail={remoteDetail}
      onToggleEnabled={vi.fn()}
      remoteLoading={options.remoteLoading}
      remoteFilesDeferred={options.remoteFilesDeferred}
      libraryMods={options.libraryMods}
      onOpenFolder={vi.fn()}
      onSetCover={vi.fn()}
      onClearCover={vi.fn()}
      onQueueDownload={options.onQueueDownload}
      onSearchDependency={options.onSearchDependency}
    />,
    'en-US',
    undefined,
    port,
  )

  return Object.assign(port, { renderResult })
}

describe('LauncherModDetailPanel', () => {
  it('prompts to save or discard modified config before leaving the config tab', async () => {
    const configResult = {
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
      configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
      configExists: true,
      fields: [
        {
          key: 'Enabled',
          label: 'Enabled',
          description: null,
          section: null,
          fieldType: 'boolean' as const,
          value: true,
          defaultValue: true,
          allowValues: [],
          allowBlank: false,
          allowMultiple: false,
          editable: true,
          source: 'config-json' as const,
        },
      ],
      schemaSources: ['config-json' as const],
      warnings: [],
      probeStatus: 'not-run' as const,
    }
    const saveModConfig = vi.fn().mockResolvedValue(configResult)
    renderPanel(createLocalMod(), createRemoteDetail(), {
      loadModConfig: vi.fn().mockResolvedValue(configResult),
      saveModConfig,
    })

    fireEvent.click(await screen.findByRole('tab', { name: 'Config' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Enabled' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Description' }))

    const leaveDialog = await screen.findByRole('dialog', { name: 'Unsaved configuration' })
    fireEvent.click(within(leaveDialog).getByText('Keep editing'))
    expect(screen.getByRole('tab', { name: 'Config' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: 'Description' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save and leave' }))

    await waitFor(() => {
      expect(saveModConfig).toHaveBeenCalledWith({
        modPath: configResult.modPath,
        locale: 'en-US',
        values: { Enabled: false },
      })
      expect(screen.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('unmounts the drawer while closed so hidden content cannot retain focus', () => {
    renderPanel(createLocalMod(), createRemoteDetail(), { open: false })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.launcher-library-drawer')).toBeNull()
  })

  it('mounts the drawer at body level while keeping the titlebar outside the backdrop', () => {
    const { renderResult } = renderPanel(createLocalMod(), createRemoteDetail())
    const drawer = document.querySelector('.launcher-library-drawer')

    expect(drawer?.parentElement).toBe(document.body)
    expect(renderResult.container.querySelector('.launcher-library-drawer')).toBeNull()
    expect(drawer).toHaveClass('launcher-library-drawer-open')
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

  it('loads and saves local mod config fields from the config tab', async () => {
    const saveModConfig = vi.fn().mockResolvedValue({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
      configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
      configExists: true,
      warnings: [],
      probeStatus: 'unavailable',
      schemaSources: ['content-patcher'],
      fields: [],
    })
    renderPanel(createLocalMod(), null, {
      loadModConfig: vi.fn().mockResolvedValue({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
        configExists: true,
        warnings: ['GMCM probe did not expose structured options; config.json keys were parsed as editable fallback fields.'],
        probeStatus: 'unavailable',
        schemaSources: ['content-patcher'],
        fields: [
          {
            key: 'Enabled',
            label: 'Enabled',
            description: 'Turns the feature on.',
            section: 'General',
            fieldType: 'boolean',
            value: true,
            defaultValue: true,
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'content-patcher',
          },
          {
            key: 'OpenMenuKey',
            label: 'Open Menu Key',
            description: 'Opens the menu.',
            section: 'Controls',
            fieldType: 'string-array',
            uiHint: 'keybind-list',
            value: ['P'],
            defaultValue: ['P'],
            allowValues: [],
            allowBlank: false,
            allowMultiple: true,
            editable: true,
            source: 'generic-mod-config-menu',
          },
          {
            key: 'ReloadConfigKey',
            label: 'Reload Config Key',
            description: 'Reloads the config file.',
            section: 'Controls',
            fieldType: 'string-array',
            uiHint: 'keybind-list',
            value: 'None',
            defaultValue: 'None',
            allowValues: [],
            allowBlank: false,
            allowMultiple: true,
            editable: true,
            source: 'generic-mod-config-menu',
          },
          {
            key: 'Controls',
            label: 'Controls',
            description: null,
            section: 'Controls',
            fieldType: 'object',
            value: {
              ToggleDebug: 'F3',
              DebugPrevTexture: 'LeftControl',
              DebugNextTexture: 'RightControl',
            },
            defaultValue: null,
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'config-json',
          },
          {
            key: 'SkyReflectionSettings',
            label: 'Sky Reflection Settings',
            description: null,
            section: 'Reflections',
            fieldType: 'object',
            value: {
              AreReflectionsEnabled: true,
              CometChance: 10,
              Advanced: { ShootingStarsEnabled: true },
            },
            defaultValue: null,
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'config-json',
          },
          {
            key: 'Mode',
            label: 'Mode',
            description: 'Selects the rendering mode.',
            section: 'General',
            fieldType: 'string',
            value: 'Balanced',
            defaultValue: 'Balanced',
            allowValues: ['Balanced', 'Fast'],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'generic-mod-config-menu',
          },
          {
            key: 'AccentColor',
            label: 'Accent Color',
            description: 'Controls the overlay accent.',
            section: 'General',
            fieldType: 'string',
            uiHint: 'color',
            value: '#67b36f',
            defaultValue: '#67b36f',
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'generic-mod-config-menu',
          },
          {
            key: 'NamedColor',
            label: 'Named Color',
            description: 'Uses a valid CSS color name.',
            section: 'General',
            fieldType: 'string',
            uiHint: 'color',
            value: 'red',
            defaultValue: 'red',
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'generic-mod-config-menu',
          },
          {
            key: 'Seasons',
            label: 'Seasons',
            description: 'Selects active seasons.',
            section: 'General',
            fieldType: 'string-array',
            value: ['spring'],
            defaultValue: ['spring'],
            allowValues: ['spring', 'summer', 'fall'],
            allowBlank: false,
            allowMultiple: true,
            editable: true,
            source: 'content-patcher',
          },
          {
            key: 'UseLegacyLighting',
            label: 'Use Legacy Lighting',
            description: 'Keeps compatibility with the legacy renderer.',
            section: 'General',
            fieldType: 'string',
            value: 'True',
            defaultValue: 'True',
            allowValues: ['True', 'False'],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'dll-static',
          },
        ],
      }),
      saveModConfig,
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Config' }))

    const enabledField = (await screen.findByText('Enabled')).closest<HTMLElement>('.launcher-mod-detail-config-field')
    const legacyLightingField = screen.getByText('Use Legacy Lighting').closest<HTMLElement>('.launcher-mod-detail-config-field')
    const checkbox = within(enabledField!).getByRole('checkbox')
    const stringBooleanToggle = within(legacyLightingField!).getByRole('checkbox')
    expect(screen.getByRole('heading', { name: 'General', level: 3 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Controls', level: 3 })).toBeTruthy()
    expect(checkbox.closest('.launcher-mod-detail-config-toggle')).toBeTruthy()
    expect(stringBooleanToggle.closest('.launcher-mod-detail-config-toggle')).toBeTruthy()
    expect(screen.getByText('Parse diagnostic')).toBeTruthy()
    expect(screen.getByText('Parse diagnostic').closest('details')).not.toHaveAttribute('open')
    fireEvent.click(checkbox)
    fireEvent.click(stringBooleanToggle)

    fireEvent.click(screen.getByRole('button', { name: 'Mode: Balanced' }))
    fireEvent.click(screen.getByRole('option', { name: 'Fast' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Seasons' })).getByRole('button', { name: 'summer' }))
    expect(document.querySelector('.launcher-mod-detail-config select')).toBeNull()

    const colorInput = screen.getByLabelText('Accent Color')
    fireEvent.change(colorInput, { target: { value: '#ff3366' } })
    expect(document.querySelector('.launcher-mod-detail-config-color-preview')).toHaveStyle('--launcher-config-color: #ff3366')
    const namedColorField = screen.getByText('Named Color').closest<HTMLElement>('.launcher-mod-detail-config-field')
    expect(within(namedColorField!).getByLabelText('Named Color')).not.toHaveAttribute('aria-invalid')
    expect(within(namedColorField!).queryByText(/invalid color/i)).toBeNull()

    const keybindButton = screen.getByRole('button', { name: 'Open Menu Key' })
    fireEvent.click(keybindButton)
    fireEvent.keyDown(keybindButton, { key: 'Shift', code: 'ShiftLeft' })
    fireEvent.keyDown(keybindButton, { key: 'p', code: 'KeyP' })
    fireEvent.keyUp(keybindButton, { key: 'p', code: 'KeyP' })
    fireEvent.keyUp(keybindButton, { key: 'Shift', code: 'ShiftLeft' })

    const reloadKeyField = screen.getByText('Reload Config Key').closest<HTMLElement>('.launcher-mod-detail-config-field')
    const reloadKeyButton = within(reloadKeyField!).getByRole('button', { name: 'Reload Config Key' })
    const reloadClearButton = within(reloadKeyField!).getByRole('button', { name: 'Clear key binding' })
    expect(within(reloadKeyButton).getByText('Not assigned')).toBeTruthy()
    expect(reloadClearButton).toBeDisabled()
    fireEvent.click(reloadKeyButton)
    fireEvent.keyDown(reloadKeyButton, { key: 'Control', code: 'ControlLeft' })
    fireEvent.keyDown(reloadKeyButton, { key: 'r', code: 'KeyR' })
    fireEvent.keyUp(reloadKeyButton, { key: 'r', code: 'KeyR' })
    fireEvent.keyUp(reloadKeyButton, { key: 'Control', code: 'ControlLeft' })
    fireEvent.click(reloadClearButton)

    const controls = screen.getByRole('group', { name: 'Controls' })
    expect(within(controls).queryByRole('textbox')).toBeNull()
    expect(within(controls).getByText('Debug Previous Texture')).toBeTruthy()
    const toggleDebugButton = within(controls).getByRole('button', { name: 'Toggle Debug' })
    fireEvent.click(toggleDebugButton)
    fireEvent.keyDown(toggleDebugButton, { key: 'F4', code: 'F4' })
    fireEvent.keyUp(toggleDebugButton, { key: 'F4', code: 'F4' })

    const reflectionSettings = screen.getByRole('group', { name: 'Sky Reflection Settings' })
    expect(within(reflectionSettings).queryByRole('textbox', { name: 'Sky Reflection Settings' })).toBeNull()
    fireEvent.click(within(reflectionSettings).getByRole('checkbox', { name: 'Are Reflections Enabled' }))
    fireEvent.change(within(reflectionSettings).getByRole('spinbutton', { name: 'Comet Chance' }), { target: { value: '25' } })
    fireEvent.click(within(reflectionSettings).getByRole('checkbox', { name: 'Shooting Stars Enabled' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saveModConfig).toHaveBeenCalledWith({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        locale: 'en-US',
        values: {
          AccentColor: '#ff3366',
          Controls: {
            ToggleDebug: 'F4',
            DebugPrevTexture: 'LeftControl',
            DebugNextTexture: 'RightControl',
          },
          Enabled: false,
          Mode: 'Fast',
          OpenMenuKey: ['LeftShift', 'P'],
          SkyReflectionSettings: {
            AreReflectionsEnabled: false,
            CometChance: 25,
            Advanced: { ShootingStarsEnabled: false },
          },
          ReloadConfigKey: 'None',
          Seasons: ['spring', 'summer'],
          UseLegacyLighting: 'False',
        },
      })
    })
  })

  it('does not restore or save defaults for non-editable GMCM fields', async () => {
    const saveModConfig = vi.fn().mockResolvedValue({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
      configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
      configExists: true,
      warnings: [],
      probeStatus: 'succeeded',
      schemaSources: ['generic-mod-config-menu'],
      fields: [],
    })
    renderPanel(createLocalMod(), null, {
      loadModConfig: vi.fn().mockResolvedValue({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
        configExists: true,
        warnings: [],
        probeStatus: 'succeeded',
        schemaSources: ['generic-mod-config-menu'],
        fields: [
          {
            key: 'Enabled',
            label: 'Enabled',
            description: null,
            section: null,
            fieldType: 'boolean',
            value: false,
            defaultValue: true,
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: true,
            source: 'generic-mod-config-menu',
          },
          {
            key: 'derived-option',
            label: 'Derived option',
            description: null,
            section: null,
            fieldType: 'boolean',
            value: false,
            defaultValue: true,
            allowValues: [],
            allowBlank: false,
            allowMultiple: false,
            editable: false,
            source: 'generic-mod-config-menu',
          },
        ],
      }),
      saveModConfig,
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Config' }))
    await screen.findByText('Derived option')
    fireEvent.click(screen.getByRole('button', { name: 'Restore Defaults' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saveModConfig).toHaveBeenCalledWith({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        locale: 'en-US',
        values: { Enabled: true },
      })
    })
  })

  it('hides the config tab for local mods without detected config', () => {
    const loadModConfig = vi.fn()
    renderPanel(createLocalMod({ hasConfig: false }), null, { loadModConfig })

    expect(screen.queryByRole('tab', { name: 'Config' })).toBeNull()
    expect(loadModConfig).not.toHaveBeenCalled()
  })

  it('edits ordered string lists and selects item values from the item catalog', async () => {
    const saveModConfig = vi.fn().mockResolvedValue({
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
      configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
      configExists: true,
      warnings: [],
      probeStatus: 'unavailable',
      schemaSources: ['config-json'],
      fields: [],
    })
    renderPanel(createLocalMod(), null, {
      loadSettings: vi.fn().mockResolvedValue({
        gamePath: 'E:\\Games\\Stardew Valley',
        modsPath: null,
        downloadPath: null,
        nexusApiKey: null,
        autoInstallDownloads: false,
        keepDownloadedArchives: false,
        autoCheckModUpdates: true,
      }),
      loadConfigItems: vi.fn().mockResolvedValue([
        {
          id: '(O)24',
          value: '(O)24',
          label: 'Parsnip',
          category: 'Crop',
          source: 'Stardew Valley',
          sourceKind: 'game',
          metadata: {},
        },
        {
          id: '(O)72',
          value: '(O)72',
          label: 'Diamond',
          category: 'Mineral',
          source: 'Stardew Valley',
          sourceKind: 'game',
          metadata: {},
        },
      ]),
      loadModConfig: vi.fn().mockResolvedValue({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        configPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher\\config.json',
        configExists: true,
        warnings: [],
        probeStatus: 'unavailable',
        schemaSources: ['config-json'],
        fields: [
          {
            key: 'WeatherTags',
            label: 'Weather Tags',
            description: 'Ordered weather values.',
            section: 'Content',
            fieldType: 'string-array',
            value: ['sunny', 'windy'],
            defaultValue: ['sunny'],
            allowValues: [],
            allowBlank: false,
            allowMultiple: true,
            editable: true,
            source: 'config-json',
          },
          {
            key: 'FavoriteItemIds',
            label: 'Favorite Items',
            description: 'Ordered item values.',
            section: 'Content',
            fieldType: 'string-array',
            uiHint: 'item-list',
            value: ['(O)24'],
            defaultValue: ['(O)24'],
            allowValues: [],
            allowBlank: false,
            allowMultiple: true,
            editable: true,
            source: 'config-json',
          },
        ],
      }),
      saveModConfig,
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Config' }))
    fireEvent.change(await screen.findByLabelText('Weather Tags, entry 1'), { target: { value: 'rainy' } })
    fireEvent.change(screen.getByLabelText('New entry for Weather Tags'), { target: { value: 'stormy' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Choose item for Favorite Items' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Choose item for Favorite Items' }).at(-1)!)
    fireEvent.click(await screen.findByRole('button', { name: /Diamond/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(saveModConfig).toHaveBeenCalledWith({
        modPath: 'E:\\Games\\Stardew Valley\\Mods\\ContentPatcher',
        locale: 'en-US',
        values: {
          FavoriteItemIds: ['(O)24', '(O)72'],
          WeatherTags: ['rainy', 'windy', 'stormy'],
        },
      })
    })
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
    renderPanel(createLocalMod({ missingRequiredDependencies: ['ModForge.MissingCore'] }), null)

    const dependenciesTab = screen.getByRole('tab', { name: 'Dependencies' })
    expect(dependenciesTab).toHaveAttribute('title', '1 missing dependency')
    expect(within(dependenciesTab).getByText('1')).toBeTruthy()
    expect(document.querySelector('.launcher-mod-detail-key-card')).toBeNull()
    fireEvent.click(dependenciesTab)

    const dependenciesPanel = screen.getByRole('tabpanel')
    expect(within(dependenciesPanel).getByText('ModForge.MissingCore')).toBeTruthy()
  })

  it('renders a local dependency tree and keeps transitive issue paths expanded', () => {
    const consumer = createLocalMod({
      id: 'consumer-pack',
      labelKey: 'ModForge.ConsumerPack',
      name: 'Consumer Pack',
      uniqueId: 'ModForge.ConsumerPack',
      folderName: 'ConsumerPack',
      requiredDependencies: ['ModForge.ProviderPack'],
      missingRequiredDependencies: ['ModForge.ProviderPack'],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })
    const provider = createLocalMod({
      id: 'provider-pack',
      labelKey: 'ModForge.ProviderPack',
      name: 'Provider Pack',
      uniqueId: 'ModForge.ProviderPack',
      folderName: 'ProviderPack',
      requiredDependencies: ['ModForge.CorePack'],
      missingRequiredDependencies: ['ModForge.CorePack'],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { libraryMods: [consumer, provider] })

    const dependenciesTab = screen.getByRole('tab', { name: 'Dependencies' })
    expect(dependenciesTab).toHaveAttribute('title', '2 missing dependencies')
    expect(within(dependenciesTab).getByText('2')).toBeTruthy()

    fireEvent.click(dependenciesTab)
    const dependenciesPanel = screen.getByRole('tabpanel')

    expect(within(dependenciesPanel).getByText('Provider Pack')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('ModForge.CorePack')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('Dependency issue')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('Missing')).toBeTruthy()
    const providerRow = within(dependenciesPanel).getByRole('button', { name: 'Collapse dependency Provider Pack' })
    expect(providerRow).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(providerRow)
    expect(providerRow).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(providerRow)
    expect(providerRow).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not collapse a dependency row when its download action is clicked', () => {
    const onQueueDownload = vi.fn()
    const consumer = createLocalMod({
      id: 'consumer-pack',
      labelKey: 'ModForge.ConsumerPack',
      name: 'Consumer Pack',
      uniqueId: 'ModForge.ConsumerPack',
      folderName: 'ConsumerPack',
      requiredDependencies: ['ModForge.ProviderPack'],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })
    const provider = createLocalMod({
      id: 'provider-pack',
      labelKey: 'ModForge.ProviderPack',
      name: 'Provider Pack',
      uniqueId: 'ModForge.ProviderPack',
      folderName: 'ProviderPack',
      requiredDependencies: ['ModForge.CorePack'],
      missingRequiredDependencies: [],
      nexusModId: 9999,
      modUrl: 'https://www.nexusmods.com/stardewvalley/mods/9999',
      updateKeys: [],
    })
    const core = createLocalMod({
      id: 'core-pack',
      labelKey: 'ModForge.CorePack',
      name: 'Core Pack',
      uniqueId: 'ModForge.CorePack',
      folderName: 'CorePack',
      requiredDependencies: [],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { libraryMods: [consumer, provider, core], onQueueDownload })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    const dependenciesPanel = screen.getByRole('tabpanel')
    const providerRow = within(dependenciesPanel).getByRole('button', { name: 'Collapse dependency Provider Pack' })
    expect(providerRow).toHaveAttribute('aria-expanded', 'true')

    const openPageButton = within(providerRow).getByRole('button', { name: 'Open Mod Page Provider Pack' })
    fireEvent.click(openPageButton)

    expect(onQueueDownload).not.toHaveBeenCalled()
    expect(providerRow).toHaveAttribute('aria-expanded', 'true')
  })

  it('disables download and search buttons without callbacks on external requirements without a mod id', () => {
    const remoteDetail = createRemoteDetail({
      requirements: [
        {
          name: 'SMAPI Runtime',
          notes: 'System prerequisite',
          url: null,
          modId: null,
          external: true,
        },
      ],
    })

    renderPanel(null, remoteDetail, { onQueueDownload: vi.fn() })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    const dependenciesPanel = screen.getByRole('tabpanel')

    const downloadButton = within(dependenciesPanel).getByRole('button', { name: 'Download dependency SMAPI Runtime' })
    const searchButton = within(dependenciesPanel).getByRole('button', { name: 'Search Nexus mods SMAPI Runtime' })
    expect(downloadButton).toBeDisabled()
    expect(searchButton).toBeDisabled()
  })

  it('searches discover for no-id dependency names with word splitting', () => {
    const onSearchDependency = vi.fn()
    const consumer = createLocalMod({
      id: 'bush-consumer',
      labelKey: 'ModForge.BushConsumer',
      name: 'Bush Consumer',
      uniqueId: 'ModForge.BushConsumer',
      folderName: 'BushConsumer',
      requiredDependencies: ['furypx639.CustomBush'],
      missingRequiredDependencies: ['furypx639.CustomBush'],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { onSearchDependency })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search Nexus mods furypx639.CustomBush' }))

    expect(onSearchDependency).toHaveBeenCalledWith('Custom Bush')
  })

  it('prefers the installed dependency display name for no-id local dependency search', () => {
    const onSearchDependency = vi.fn()
    const consumer = createLocalMod({
      id: 'flower-consumer',
      labelKey: 'ModForge.FlowerConsumer',
      name: 'Flower Consumer',
      uniqueId: 'ModForge.FlowerConsumer',
      folderName: 'FlowerConsumer',
      requiredDependencies: ['Cornucopia.MoreFlowers'],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })
    const provider = createLocalMod({
      id: 'more-flowers',
      labelKey: 'Cornucopia.MoreFlowers',
      name: 'Cornucopia - More Flowers',
      uniqueId: 'Cornucopia.MoreFlowers',
      folderName: 'MoreFlowers',
      requiredDependencies: [],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { libraryMods: [consumer, provider], onSearchDependency })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search Nexus mods Cornucopia - More Flowers' }))

    expect(onSearchDependency).toHaveBeenCalledWith('Cornucopia More Flowers')
  })

  it('does not satisfy a dependency from a partial UniqueID match', () => {
    const consumer = createLocalMod({
      id: 'consumer-pack',
      labelKey: 'ModForge.ConsumerPack',
      name: 'Consumer Pack',
      uniqueId: 'ModForge.ConsumerPack',
      folderName: 'ConsumerPack',
      requiredDependencies: ['ModForge.Core'],
      missingRequiredDependencies: ['ModForge.Core'],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })
    const similarlyNamedProvider = createLocalMod({
      id: 'core-plus-pack',
      labelKey: 'ModForge.CorePlus',
      name: 'Core Plus',
      uniqueId: 'ModForge.CorePlus',
      folderName: 'CorePlus',
      requiredDependencies: [],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { libraryMods: [consumer, similarlyNamedProvider] })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    const dependenciesPanel = screen.getByRole('tabpanel')

    expect(within(dependenciesPanel).getByText('ModForge.Core')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('Missing')).toBeTruthy()
    expect(within(dependenciesPanel).queryByText('Core Plus')).toBeNull()
  })

  it('merges local UniqueID dependencies with matching Nexus requirement names', () => {
    const consumer = createLocalMod({
      id: 'immersive-family',
      labelKey: 'XiaoLeiWen.ImmersiveFamily',
      name: 'Immersive Family',
      uniqueId: 'XiaoLeiWen.ImmersiveFamily',
      folderName: '[CP] Immersive Family',
      requiredDependencies: ['TheMightyAmondee.CustomTokens'],
      missingRequiredDependencies: ['TheMightyAmondee.CustomTokens'],
      nexusModId: 999,
      updateKeys: ['Nexus:999'],
    })
    const remoteDetail = createRemoteDetail({
      modId: 999,
      requirements: [
        {
          name: 'Custom Tokens',
          notes: 'Required',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2400',
          modId: 2400,
          external: false,
        },
      ],
    })

    renderPanel(consumer, remoteDetail)

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    const dependenciesPanel = screen.getByRole('tabpanel')

    expect(within(dependenciesPanel).getByText('TheMightyAmondee.CustomTokens')).toBeTruthy()
    expect(within(dependenciesPanel).queryByText('Custom Tokens')).toBeNull()
    expect(within(dependenciesPanel).getByText(/Local manifest .* Nexus requirement .* Required/u)).toBeTruthy()
  })

  it('treats SMAPI requirements as the mod loader instead of a downloadable mod dependency', () => {
    const remoteDetail = createRemoteDetail({
      requirements: [
        {
          name: 'SMAPI - Stardew Modding API',
          notes: null,
          url: 'https://smapi.io/',
          modId: 2400,
          external: false,
        },
      ],
    })

    renderPanel(null, remoteDetail, { onQueueDownload: vi.fn() })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    const dependenciesPanel = screen.getByRole('tabpanel')

    expect(within(dependenciesPanel).getByText('SMAPI - Stardew Modding API')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('Mod loader')).toBeTruthy()
    expect(within(dependenciesPanel).getByRole('button', { name: 'Download dependency SMAPI - Stardew Modding API' })).toBeDisabled()
  })

  it('renders serialized local optional dependencies without marking them missing', () => {
    const consumer = createLocalMod({
      id: 'optional-consumer',
      labelKey: 'ModForge.OptionalConsumer',
      name: 'Optional Consumer',
      uniqueId: 'ModForge.OptionalConsumer',
      folderName: 'OptionalConsumer',
      dependencies: [{ uniqueId: 'ModForge.OptionalPack', required: false }],
      requiredDependencies: [],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { onQueueDownload: vi.fn() })

    const dependenciesTab = screen.getByRole('tab', { name: 'Dependencies' })
    expect(dependenciesTab).not.toHaveAttribute('title')
    expect(within(dependenciesTab).queryByText('1')).toBeNull()

    fireEvent.click(dependenciesTab)
    const dependenciesPanel = screen.getByRole('tabpanel')
    expect(within(dependenciesPanel).getByText('ModForge.OptionalPack')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('Optional')).toBeTruthy()
    expect(within(dependenciesPanel).queryByText('Missing')).toBeNull()
    expect(within(dependenciesPanel).queryByText('Dependency issue')).toBeNull()
    expect(within(dependenciesPanel).getByRole('button', { name: 'Download dependency ModForge.OptionalPack' })).toBeDisabled()
  })

  it('keeps missing children under a local optional dependency out of issue counts', () => {
    const consumer = createLocalMod({
      id: 'optional-consumer',
      labelKey: 'ModForge.OptionalConsumer',
      name: 'Optional Consumer',
      uniqueId: 'ModForge.OptionalConsumer',
      folderName: 'OptionalConsumer',
      dependencies: [{ uniqueId: 'ModForge.OptionalProvider', required: false }],
      requiredDependencies: [],
      missingRequiredDependencies: [],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })
    const provider = createLocalMod({
      id: 'optional-provider',
      labelKey: 'ModForge.OptionalProvider',
      name: 'Optional Provider',
      uniqueId: 'ModForge.OptionalProvider',
      folderName: 'OptionalProvider',
      dependencies: [{ uniqueId: 'ModForge.OptionalCore', required: true }],
      requiredDependencies: ['ModForge.OptionalCore'],
      missingRequiredDependencies: ['ModForge.OptionalCore'],
      nexusModId: null,
      updateKeys: [],
      modUrl: null,
    })

    renderPanel(consumer, null, { libraryMods: [consumer, provider] })

    const dependenciesTab = screen.getByRole('tab', { name: 'Dependencies' })
    expect(dependenciesTab).not.toHaveAttribute('title')
    expect(within(dependenciesTab).queryByText('1')).toBeNull()

    fireEvent.click(dependenciesTab)
    const dependenciesPanel = screen.getByRole('tabpanel')
    expect(within(dependenciesPanel).getByText('Optional Provider')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('ModForge.OptionalCore')).toBeTruthy()
    expect(within(dependenciesPanel).getAllByText('Optional')).toHaveLength(2)
    expect(within(dependenciesPanel).queryByText('Missing')).toBeNull()
    expect(within(dependenciesPanel).queryByText('Dependency issue')).toBeNull()
    expect(within(dependenciesPanel).queryByText(/issue/u)).toBeNull()
  })

  it('treats Nexus requirement notes that say optional or not required as optional dependencies', () => {
    const onQueueDownload = vi.fn()
    const loadRemoteModDetail = vi.fn().mockResolvedValue(createRemoteDetail())
    const remoteDetail = createRemoteDetail({
      requirements: [
        {
          name: 'Optional Remote Pack',
          notes: "Not required, but won't do anything without it.",
          url: 'https://www.nexusmods.com/stardewvalley/mods/2600',
          modId: 2600,
          external: false,
        },
        {
          name: 'Recommended Remote Pack',
          notes: 'Optional but highly recommended',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2700',
          modId: 2700,
          external: false,
        },
      ],
    })

    renderPanel(null, remoteDetail, { onQueueDownload, loadRemoteModDetail })

    const dependenciesTab = screen.getByRole('tab', { name: 'Dependencies' })
    expect(dependenciesTab).not.toHaveAttribute('title')

    fireEvent.click(dependenciesTab)
    const dependenciesPanel = screen.getByRole('tabpanel')
    expect(within(dependenciesPanel).getByText('Optional Remote Pack')).toBeTruthy()
    expect(within(dependenciesPanel).getByText('Recommended Remote Pack')).toBeTruthy()
    expect(within(dependenciesPanel).getAllByText('Optional')).toHaveLength(2)
    expect(within(dependenciesPanel).queryByText('Missing')).toBeNull()
    expect(within(dependenciesPanel).getByRole('button', { name: 'Download dependency Optional Remote Pack' })).toBeDisabled()
    expect(within(dependenciesPanel).getByRole('button', { name: 'Download dependency Recommended Remote Pack' })).toBeDisabled()
    expect(loadRemoteModDetail).not.toHaveBeenCalled()
    expect(onQueueDownload).not.toHaveBeenCalled()
  })

  it('loads remote dependency children when the dependencies tab opens', async () => {
    const remoteDetail = createRemoteDetail({
      requirements: [
        {
          name: 'Remote Core',
          notes: 'Needed at runtime',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2400',
          modId: 2400,
          external: false,
        },
      ],
    })
    const remoteDependencyDetail = createRemoteDetail({
      modId: 2400,
      title: 'Remote Core',
      requirements: [
        {
          name: 'Remote Child',
          notes: 'Child requirement',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2500',
          modId: 2500,
          external: false,
        },
      ],
    })
    const remoteChildDetail = createRemoteDetail({ modId: 2500, title: 'Remote Child', requirements: [] })
    const loadRemoteModDetail = vi.fn(({ modId }: { modId: number }) =>
      Promise.resolve(modId === 2500 ? remoteChildDetail : remoteDependencyDetail),
    )
    const port = renderPanel(null, remoteDetail, { onQueueDownload: vi.fn(), loadRemoteModDetail })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))

    await waitFor(() => {
      expect(port.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 2400, includeFiles: false })
    })
    expect(await screen.findByText('Remote Child')).toBeTruthy()
  })

  it('uses a parsed off-site Nexus mod id to preload and replace fallback dependency names', async () => {
    const remoteDetail = createRemoteDetail({
      modId: 999,
      title: 'Remote Host Mod',
      requirements: [
        {
          name: 'Nexus #1915',
          notes: 'REQUIRED',
          url: 'https://www.nexusmods.com/stardewvalley/mods/1915',
          modId: 1915,
          external: true,
        },
      ],
    })
    let resolveRemoteDependencyDetail: (detail: LauncherDiscoverDetail) => void = () => {}
    const remoteDependencyDetail = createRemoteDetail({
      modId: 1915,
      title: 'Content Patcher',
      requirements: [],
    })
    const loadRemoteModDetail = vi.fn(
      () =>
        new Promise<LauncherDiscoverDetail>((resolve) => {
          resolveRemoteDependencyDetail = resolve
        }),
    )
    const port = renderPanel(null, remoteDetail, { onQueueDownload: vi.fn(), loadRemoteModDetail })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    const dependenciesPanel = screen.getByRole('tabpanel')

    expect(within(dependenciesPanel).getByText('Nexus #1915')).toBeTruthy()
    expect(within(dependenciesPanel).queryByText('REQUIRED', { selector: 'strong' })).toBeNull()
    await waitFor(() => {
      expect(port.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 1915, includeFiles: false })
    })
    resolveRemoteDependencyDetail(remoteDependencyDetail)
    expect(await within(dependenciesPanel).findByText('Content Patcher')).toBeTruthy()
    expect(within(dependenciesPanel).queryByText('Nexus #1915')).toBeNull()
    expect(within(dependenciesPanel).getByText(/External requirement .* REQUIRED/u)).toBeTruthy()
  })

  it('marks unloaded remote child dependencies as missing and downloadable', async () => {
    const onQueueDownload = vi.fn()
    const remoteDetail = createRemoteDetail({
      requirements: [
        {
          name: 'Remote Core',
          notes: 'Needed at runtime',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2400',
          modId: 2400,
          external: false,
        },
      ],
    })
    const remoteDependencyDetail = createRemoteDetail({
      modId: 2400,
      title: 'Remote Core',
      requirements: [
        {
          name: 'Remote Child',
          notes: 'Child requirement',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2500',
          modId: 2500,
          external: false,
        },
      ],
    })
    const remoteChildDetail = createRemoteDetail({ modId: 2500, title: 'Remote Child', requirements: [] })
    const loadRemoteModDetail = vi.fn(({ modId }: { modId: number }) =>
      Promise.resolve(modId === 2500 ? remoteChildDetail : remoteDependencyDetail),
    )

    renderPanel(null, remoteDetail, { onQueueDownload, loadRemoteModDetail })

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download dependency Remote Child' }))

    expect(onQueueDownload).toHaveBeenCalledWith({
      modId: 2500,
      title: 'Remote Child',
      imageUrl: null,
      version: '2.9.1',
      source: 'discover',
    })
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
    expect(within(filesPanel).getByText(/Mod manager/)).toBeTruthy()
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

  it('shows an in-panel loading animation while deferred Nexus files load', async () => {
    const remoteWithoutFiles = createRemoteDetail({
      primaryFileId: null,
      primaryFileName: null,
      primaryFileVersion: null,
      primaryFileChangelog: [],
      files: [],
    })
    const loadRemoteModDetail = vi.fn().mockReturnValue(new Promise<LauncherDiscoverDetail>(() => {}))
    const port = renderPanel(null, remoteWithoutFiles, {
      onQueueDownload: vi.fn(),
      remoteFilesDeferred: true,
      loadRemoteModDetail,
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))

    await waitFor(() => {
      expect(port.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 1915, includeFiles: true })
    })
    expect(screen.getByText('Loading Nexus files...')).toBeTruthy()
    expect(document.querySelector('.launcher-mod-detail-data-loading-spinner')).toBeTruthy()
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

  it('does not queue SMAPI from the dependency list because it is the mod loader', () => {
    const onQueueDownload = vi.fn()
    const remoteDetail = createRemoteDetail({
      requirements: [
        {
          name: 'Pathoschild.SMAPI',
          notes: '4.4.0 or later',
          url: 'https://www.nexusmods.com/stardewvalley/mods/2400',
          modId: 2400,
          external: false,
        },
      ],
    })
    renderPanel(
      createLocalMod({
        requiredDependencies: ['Pathoschild.SMAPI'],
        missingRequiredDependencies: ['Pathoschild.SMAPI'],
      }),
      remoteDetail,
      { onQueueDownload },
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Dependencies' }))
    expect(screen.getByRole('button', { name: 'Download dependency Pathoschild.SMAPI' })).toBeDisabled()
    expect(onQueueDownload).not.toHaveBeenCalled()
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
