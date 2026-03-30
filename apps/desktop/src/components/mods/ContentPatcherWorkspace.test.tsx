import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContentPatcherWorkspace } from './ContentPatcherWorkspace'
import { getModWorkspaceCopy } from '../../lib/plugins/copy'
import type { WorkspacePluginCapability } from '../../lib/plugins/types'

vi.mock('../../lib/desktop', () => ({
  loadImageDataUrl: vi.fn(),
}))

const copy = getModWorkspaceCopy('en-US')

function buildProps(): ComponentProps<typeof ContentPatcherWorkspace> {
  return {
    copy,
    pluginDefinition: {
      id: 'content-patcher' as const,
      pluginKind: 'content-patcher' as const,
      capabilities: ['edit', 'save', 'export', 'validate'] as WorkspacePluginCapability[],
      futureScopes: ['wizard'],
      getDisplayName: () => 'Content Patcher',
      getDescription: () => 'Test plugin',
    },
    projectDetail: {
      pluginKind: 'content-patcher' as const,
      capabilities: ['edit', 'save', 'export', 'validate'],
      summary: {
        id: 'seasonal-garden',
        name: 'Seasonal Garden',
        author: 'Aly',
        version: '1.2.0',
        description: 'A patch-heavy content pack',
        uniqueId: 'Aly.SeasonalGarden',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'SeasonalGarden',
        pluginKind: 'content-patcher' as const,
        absolutePath: 'E:\\Mods\\SeasonalGarden',
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
        status: 'ready' as const,
      },
      diagnostics: [
        {
          severity: 'warning' as const,
          message: 'One patch uses a broad target.',
          field: 'Changes[1].Target',
        },
      ],
      contentPatcher: {
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
        manifestJson: '{\n  "Name": "Seasonal Garden"\n}\n',
        contentJson: '{\n  "Changes": []\n}\n',
        format: '2.0.0',
        changeCount: 3,
        includeCount: 1,
        dynamicTokenCount: 2,
        configKeys: ['Season', 'Festival'],
        hasI18n: false,
        patches: [],
      },
    },
    gameRootPath: 'E:\\Games\\Stardew Valley',
    manifestEditor: {
      text: '{\n  "Name": "Seasonal Garden"\n}\n',
      value: {
        Name: 'Seasonal Garden',
        Author: 'Aly',
        Version: '1.2.0',
        UniqueID: 'Aly.SeasonalGarden',
        Description: 'A patch-heavy content pack',
        ContentPackFor: {
          UniqueID: 'Pathoschild.ContentPatcher',
        },
      },
      error: null,
    },
    contentEditor: {
      text: '{\n  "Changes": []\n}\n',
      value: {
        Format: '2.0.0',
        Changes: [],
      },
      error: null,
    },
    contentSummary: {
      format: '2.0.0',
      changeCount: 3,
      includeCount: 1,
      dynamicTokenCount: 2,
      configKeys: ['Season', 'Festival'],
      patches: [
        {
          id: 'spring',
          action: 'EditImage',
          target: 'Maps/spring_town',
          fromFile: 'assets/spring-town.png',
          logName: 'Spring town',
          hasWhen: true,
          whenKeys: ['Season'],
          updateKeys: ['OnDayStarted'],
        },
        {
          id: 'summer',
          action: 'EditData',
          target: 'Data/Locations',
          fromFile: 'data/locations.json',
          logName: 'Summer locations',
          hasWhen: false,
          whenKeys: [],
          updateKeys: [],
        },
        {
          id: 'festival',
          action: 'Load',
          target: 'TileSheets/festival',
          fromFile: 'assets/festival.png',
          logName: 'Festival texture',
          hasWhen: true,
          whenKeys: ['Festival'],
          updateKeys: ['OnWarped'],
        },
      ],
    },
    selectedPatchId: 'spring',
    selectedPatch: {
      Action: 'EditImage',
      Target: 'Maps/spring_town',
      FromFile: 'assets/spring-town.png',
      LogName: 'Spring town',
      When: {
        Season: 'spring',
      },
    },
    hasUnsavedChanges: true,
    canPersist: true,
    diagnostics: [
      {
        severity: 'warning' as const,
        message: 'One patch uses a broad target.',
        field: 'Changes[1].Target',
      },
    ],
    patchWhenError: null,
    statusMessage: '3 mod projects detected.',
    lastSaveResult: {
      pluginKind: 'content-patcher' as const,
      targetPath: 'E:\\Exports\\SeasonalGarden',
      manifestPath: 'E:\\Exports\\SeasonalGarden\\manifest.json',
      contentPath: 'E:\\Exports\\SeasonalGarden\\content.json',
      diagnostics: [],
    },
    onSelectPatch: vi.fn(),
    onManifestFieldChange: vi.fn(),
    onManifestTextChange: vi.fn(),
    onContentTextChange: vi.fn(),
    onPatchFieldChange: vi.fn(),
    onPatchWhenChange: vi.fn(),
    onAddPatch: vi.fn(),
    onRemoveSelectedPatch: vi.fn(),
    onSaveProject: vi.fn(),
    onExportProject: vi.fn(),
  } as unknown as ComponentProps<typeof ContentPatcherWorkspace>
}

describe('ContentPatcherWorkspace', () => {
  it('shows an empty state when no project detail is available', () => {
    const props = buildProps()
    render(<ContentPatcherWorkspace {...props} projectDetail={null} />)

    expect(screen.getByText(copy.noProject)).toBeInTheDocument()
  })

  it('filters the patch queue and notifies when a patch is selected', () => {
    const props = buildProps()
    render(<ContentPatcherWorkspace {...props} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Patch Flow' }))

    fireEvent.change(screen.getByPlaceholderText('Filter patches by action, target, file, or When key'), {
      target: { value: 'festival' },
    })

    expect(screen.getByText('Festival texture')).toBeInTheDocument()
    expect(screen.queryByText('Spring town')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Festival texture'))

    expect(props.onSelectPatch).toHaveBeenCalledWith('festival')
  })

  it('shows workspace health, raw json editors, and diagnostics inside the workspace', async () => {
    render(<ContentPatcherWorkspace {...buildProps()} />)

    expect(screen.getByText('One patch uses a broad target.')).toBeInTheDocument()
    expect(screen.getByText('E:\\Exports\\SeasonalGarden')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Raw JSON' }))
    const manifestEditor = await screen.findByLabelText('manifest.json editor')
    const contentEditor = await screen.findByLabelText('content.json editor')
    expect((manifestEditor as HTMLTextAreaElement).value).toContain('Seasonal Garden')
    expect((contentEditor as HTMLTextAreaElement).value).toContain('"Changes"')

    fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }))
    expect(await screen.findByText('Validation Feed')).toBeInTheDocument()
  })
})
