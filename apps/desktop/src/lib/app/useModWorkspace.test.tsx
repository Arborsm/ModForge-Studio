import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { simulateContentPatcher } from '../desktop'
import { useModWorkspace } from './useModWorkspace'

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
    diagnostics: [],
  }),
}))

describe('useModWorkspace', () => {
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
          manifestJson: '{\n  "Name": "Edited Pack"\n}\n',
          contentJson:
            '{\n  "Format": "2.0.0",\n  "Changes": [\n    {\n      "Action": "EditData",\n      "Target": "Data/Objects"\n    }\n  ]\n}\n',
        }),
      )
    })
  })
})
