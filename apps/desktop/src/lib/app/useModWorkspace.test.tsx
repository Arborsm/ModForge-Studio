import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { chooseDirectory, loadContentPatcherResultAsset, saveModProject, scanModProjects, simulateContentPatcher } from '../desktop'
import { reportAppEvent } from './observability'
import useModWorkspace from './useModWorkspace'

vi.mock('../editor-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor-shell')>()
  const enUSCopy = {
    ...actual.getModWorkspaceCopy('en-US'),
    scanStatus: () => 'TASK2-SCAN-1',
  }

  return {
    ...actual,
    getModWorkspaceCopy: vi.fn((locale: 'en-US' | 'zh-CN') => (locale === 'en-US' ? enUSCopy : actual.getModWorkspaceCopy(locale))),
  }
})

vi.mock('../desktop', () => ({
  chooseDirectory: vi.fn(),
  loadModProject: vi.fn().mockResolvedValue({
    pluginKind: 'content-patcher',
    capabilities: ['edit', 'save', 'export', 'validate'],
    summary: {
      id: 'cp-pack',
      name: 'CP Pack',
      author: 'ModForge',
      version: '1.0.0',
      description: null,
      uniqueId: 'ModForge.CPPack',
      contentPackFor: 'Pathoschild.ContentPatcher',
      folderName: 'CPPack',
      absolutePath: 'E:\\Mods\\CPPack',
      manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
      contentPath: 'E:\\Mods\\CPPack\\content.json',
      pluginKind: 'content-patcher',
      status: 'ready',
      missingRequiredDependencies: [],
    },
    diagnostics: [],
    contentPatcher: {
      manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
      contentPath: 'E:\\Mods\\CPPack\\content.json',
      manifestJson: '{\n  "Name": "CP Pack"\n}\n',
      contentJson: '{\n  "Changes": []\n}\n',
      format: '2.0.0',
      changeCount: 1,
      includeCount: 0,
      dynamicTokenCount: 0,
      configKeys: [],
      hasI18n: false,
      patches: [],
    },
  }),
  loadContentPatcherProject: vi.fn().mockResolvedValue({
    summary: {
      name: 'CP Pack',
      uniqueId: 'ModForge.CPPack',
      contentPackFor: 'Pathoschild.ContentPatcher',
      absolutePath: 'E:\\Mods\\CPPack',
      manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
      contentPath: 'E:\\Mods\\CPPack\\content.json',
    },
    sources: [],
    includeTree: [],
    diagnostics: [],
  }),
  loadContentPatcherResultAsset: vi.fn().mockResolvedValue({
    target: {
      path: 'Data/Objects',
      assetKind: 'json',
      touchedPatchCount: 1,
      resultState: 'determinate',
      patchIds: ['content.json:0#target:0#from:0'],
    },
    trace: [],
    result: {
      kind: 'json',
      json: { 24: { Price: 35 } },
      imageDataUrl: null,
      originalImageDataUrl: null,
      originalImageSource: null,
      mapDebug: null,
    },
    diagnostics: [],
    exportable: true,
  }),
  saveModProject: vi.fn(),
  scanModProjects: vi.fn().mockResolvedValue([
    {
      id: 'cp-pack',
      name: 'CP Pack',
      author: 'ModForge',
      version: '1.0.0',
      description: null,
      uniqueId: 'ModForge.CPPack',
      contentPackFor: 'Pathoschild.ContentPatcher',
      folderName: 'CPPack',
      absolutePath: 'E:\\Mods\\CPPack',
      manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
      contentPath: 'E:\\Mods\\CPPack\\content.json',
      pluginKind: 'content-patcher',
      status: 'ready',
      missingRequiredDependencies: [],
    },
  ]),
  simulateContentPatcher: vi.fn().mockResolvedValue({
    plan: {
      patches: [
        {
          id: 'content.json:0#target:0#from:0',
          sourcePath: 'content.json',
          logName: 'Spring patch',
          action: 'EditData',
          target: 'Data/Objects',
          fromFile: null,
          when: { Season: 'spring' },
        },
      ],
    },
    patchStatuses: [
      {
        patchId: 'content.json:0#target:0#from:0',
        status: 'applied',
        reasons: [],
      },
    ],
    targets: [
      {
        path: 'Data/Objects',
        assetKind: 'json',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
    ],
    diagnostics: [],
  }),
}))

vi.mock('./observability', () => ({
  reportAppEvent: vi.fn(),
}))

describe('useModWorkspace', () => {
  it('reads scan status copy from editor-shell during initial project scan', async () => {
    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.statusMessage).toBe('TASK2-SCAN-1')
    })
  })

  it('loads backend snapshot and simulation state for content patcher projects', async () => {
    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.contentPatcherSnapshot?.summary.uniqueId).toBe('ModForge.CPPack')
      expect(result.current.contentPatcherSimulation?.patchStatuses[0]?.status).toBe('applied')
      expect(result.current.contentPatcherResultAsset?.result.kind).toBe('json')
    })
  })

  it('sends unsaved manifest and content edits to backend simulation', async () => {
    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.contentPatcherSnapshot?.summary.uniqueId).toBe('ModForge.CPPack')
    })

    act(() => {
      result.current.handleManifestTextChange('{\n  "Name": "Edited Pack"\n}\n')
      result.current.handleContentTextChange(
        '{\n  "Format": "2.0.0",\n  "Changes": [\n    {\n      "Action": "EditData",\n      "Target": "Data/Objects"\n    }\n  ]\n}\n',
      )
    })

    await waitFor(() => {
      expect(vi.mocked(simulateContentPatcher)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          gameRootPath: 'E:\\Games\\Stardew Valley',
          manifestJson: '{\n  "Name": "Edited Pack"\n}\n',
          contentJson:
            '{\n  "Format": "2.0.0",\n  "Changes": [\n    {\n      "Action": "EditData",\n      "Target": "Data/Objects"\n    }\n  ]\n}\n',
        }),
      )
    })

    await waitFor(() => {
      expect(vi.mocked(loadContentPatcherResultAsset)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          gameRootPath: 'E:\\Games\\Stardew Valley',
          target: 'Data/Objects',
          manifestJson: '{\n  "Name": "Edited Pack"\n}\n',
        }),
      )
    })
  })

  it('defaults to Content Patcher projects when mixed mod types are scanned', async () => {
    vi.mocked(scanModProjects).mockResolvedValueOnce([
      {
        id: 'archive-helper',
        name: 'Archive Helper',
        author: 'ModForge',
        version: '0.4.0',
        description: null,
        uniqueId: 'ModForge.ArchiveHelper',
        contentPackFor: null,
        folderName: 'ArchiveHelper',
        absolutePath: 'E:\\Mods\\ArchiveHelper',
        manifestPath: 'E:\\Mods\\ArchiveHelper\\manifest.json',
        contentPath: null,
        pluginKind: 'unknown',
        status: 'unsupported',
        missingRequiredDependencies: [],
      },
      {
        id: 'cp-pack',
        name: 'CP Pack',
        author: 'ModForge',
        version: '1.0.0',
        description: null,
        uniqueId: 'ModForge.CPPack',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'CPPack',
        absolutePath: 'E:\\Mods\\CPPack',
        manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
        contentPath: 'E:\\Mods\\CPPack\\content.json',
        pluginKind: 'content-patcher',
        status: 'ready',
        missingRequiredDependencies: [],
      },
    ])

    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.modProjects).toHaveLength(2)
    })

    expect(result.current.contentPatcherOnly).toBe(true)
    expect(result.current.filteredModProjects.map((project) => project.pluginKind)).toEqual(['content-patcher'])
    expect(result.current.activeProjectPath).toBe('E:\\Mods\\CPPack')

    act(() => {
      result.current.setContentPatcherOnly(false)
    })

    await waitFor(() => {
      expect(result.current.filteredModProjects).toHaveLength(2)
    })
  })

  it('hides incompatible content packs by default and reveals them when compatible-only is disabled', async () => {
    vi.mocked(scanModProjects).mockResolvedValueOnce([
      {
        id: 'needs-scaleup',
        name: 'Needs ScaleUp',
        author: 'Aly',
        version: '1.0.0',
        description: null,
        uniqueId: 'Aly.NeedsScaleUp',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'NeedsScaleUp',
        absolutePath: 'E:\\Mods\\NeedsScaleUp',
        manifestPath: 'E:\\Mods\\NeedsScaleUp\\manifest.json',
        contentPath: 'E:\\Mods\\NeedsScaleUp\\content.json',
        pluginKind: 'content-patcher',
        status: 'incompatible',
        missingRequiredDependencies: ['Platonymous.ScaleUp'],
      },
      {
        id: 'cp-pack',
        name: 'CP Pack',
        author: 'ModForge',
        version: '1.0.0',
        description: null,
        uniqueId: 'ModForge.CPPack',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'CPPack',
        absolutePath: 'E:\\Mods\\CPPack',
        manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
        contentPath: 'E:\\Mods\\CPPack\\content.json',
        pluginKind: 'content-patcher',
        status: 'ready',
        missingRequiredDependencies: [],
      },
      {
        id: 'archive-helper',
        name: 'Archive Helper',
        author: 'ModForge',
        version: '0.4.0',
        description: null,
        uniqueId: 'ModForge.ArchiveHelper',
        contentPackFor: null,
        folderName: 'ArchiveHelper',
        absolutePath: 'E:\\Mods\\ArchiveHelper',
        manifestPath: 'E:\\Mods\\ArchiveHelper\\manifest.json',
        contentPath: null,
        pluginKind: 'unknown',
        status: 'unsupported',
        missingRequiredDependencies: [],
      },
    ])

    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.modProjects).toHaveLength(3)
    })

    expect(result.current.compatibleOnly).toBe(true)
    expect(result.current.filteredModProjects.map((project) => project.id)).toEqual(['cp-pack'])
    expect(result.current.activeProjectPath).toBe('E:\\Mods\\CPPack')

    act(() => {
      result.current.setCompatibleOnly(false)
    })

    await waitFor(() => {
      expect(result.current.filteredModProjects.map((project) => project.id)).toEqual(['needs-scaleup', 'cp-pack'])
    })
  })

  it('publishes a success notification after saving the active project', async () => {
    vi.mocked(saveModProject).mockResolvedValueOnce({
      pluginKind: 'content-patcher',
      targetPath: 'E:\\Mods\\CPPack',
      manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
      contentPath: 'E:\\Mods\\CPPack\\content.json',
      diagnostics: [],
    })

    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.projectDetail?.summary.absolutePath).toBe('E:\\Mods\\CPPack')
    })

    await act(async () => {
      await result.current.handleSaveProject()
    })

    expect(vi.mocked(reportAppEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'success',
      }),
    )
  })

  it('publishes an error notification when project save fails', async () => {
    vi.mocked(saveModProject).mockRejectedValueOnce(new Error('Disk full'))

    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.projectDetail?.summary.absolutePath).toBe('E:\\Mods\\CPPack')
    })

    await expect(result.current.handleSaveProject()).rejects.toThrow('Disk full')

    expect(vi.mocked(reportAppEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
      }),
    )
  })

  it('publishes a success notification after exporting the active project', async () => {
    vi.mocked(chooseDirectory).mockResolvedValueOnce('E:\\Exports')
    vi.mocked(saveModProject).mockResolvedValueOnce({
      pluginKind: 'content-patcher',
      targetPath: 'E:\\Exports\\CPPack',
      manifestPath: 'E:\\Exports\\CPPack\\manifest.json',
      contentPath: 'E:\\Exports\\CPPack\\content.json',
      diagnostics: [],
    })

    const { result } = renderHook(() =>
      useModWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
      }),
    )

    await waitFor(() => {
      expect(result.current.projectDetail?.summary.absolutePath).toBe('E:\\Mods\\CPPack')
    })

    await act(async () => {
      await result.current.handleExportProject()
    })

    expect(vi.mocked(reportAppEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'success',
      }),
    )
  })
})
