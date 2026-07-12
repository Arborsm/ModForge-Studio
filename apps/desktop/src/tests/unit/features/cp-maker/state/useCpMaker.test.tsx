import { describe, expect, it, vi } from 'vite-plus/test'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { CpMakerPort } from '@features/cp-maker'
import { CpMakerProvider } from '@features/cp-maker'
import { useCpMaker } from '@features/cp-maker/state/useCpMaker'

function createMockPort(): CpMakerPort {
  return {
    loadSession: vi.fn().mockResolvedValue({ activeDraftKey: null, activeGeneratedDraftKey: null }),
    saveSession: vi.fn().mockImplementation(async (session) => session),
    listDrafts: vi.fn().mockResolvedValue([]),
    loadDraft: vi.fn().mockRejectedValue(new Error('not implemented')),
    saveDraft: vi.fn().mockRejectedValue(new Error('not implemented')),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    copyDraft: vi.fn().mockRejectedValue(new Error('not implemented')),
    importPack: vi.fn().mockRejectedValue(new Error('not implemented')),
    exportPack: vi.fn().mockRejectedValue(new Error('not implemented')),
    chooseDirectory: vi.fn().mockResolvedValue('/fake/path'),
    scanMaps: vi.fn().mockResolvedValue([]),
    scanEvents: vi.fn().mockResolvedValue([]),
    scanModProjects: vi.fn().mockResolvedValue([]),
    loadMapAsset: vi.fn().mockRejectedValue(new Error('not implemented')),
    loadTextAsset: vi.fn().mockRejectedValue(new Error('not implemented')),
    loadImageDataUrl: vi.fn().mockRejectedValue(new Error('not implemented')),
  }
}

function createWrapper(port: CpMakerPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CpMakerProvider port={port}>{children}</CpMakerProvider>
  }
}

describe('useCpMaker', () => {
  it('loads draft list on mount via injected port', async () => {
    const port = createMockPort()
    const { result } = renderHook(() => useCpMaker(), {
      wrapper: createWrapper(port),
    })

    await vi.waitFor(() => {
      expect(port.listDrafts).toHaveBeenCalledOnce()
    })
    // Initial state before async resolution
    expect(result.current.drafts).toEqual([])
    expect(result.current.activeDraft).toBeNull()
  })

  it('throws when used outside CpMakerProvider', () => {
    expect(() => {
      renderHook(() => useCpMaker())
    }).toThrow('useCpMakerPort')
  })

  it('uses the injected port for draft operations', async () => {
    const port = createMockPort()
    port.listDrafts = vi.fn().mockResolvedValue([
      {
        draftStorageKey: 'draft-1',
        projectName: 'Test Mod',
        projectUniqueId: 'Author.TestMod',
        lastDraftSavedAt: null,
        lastExportedAt: null,
      },
    ])

    const { result } = renderHook(() => useCpMaker(), {
      wrapper: createWrapper(port),
    })

    await vi.waitFor(() => {
      expect(result.current.drafts).toHaveLength(1)
    })

    expect(result.current.drafts[0].projectName).toBe('Test Mod')
  })

  it('persists an imported pack before activating and refreshing it', async () => {
    const port = createMockPort()
    const imported = {
      draftStorageKey: 'imported-pack',
      projectMetadata: {
        projectName: 'Imported Pack',
        projectDescription: '',
        projectAuthor: 'Author',
        projectVersion: '1.0.0',
        projectUniqueId: 'Author.ImportedPack',
        gameRootPath: null,
        contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      },
      overlayTargets: [],
      configSchemaDraft: {},
      serializedChangeRegistry: {},
      eventSourceSnapshotsByTarget: {},
      i18nFiles: [],
      lastDraftSavedAt: null,
      lastExportedAt: null,
      lastExportPath: null,
      lastExportFingerprint: null,
    }
    port.importPack = vi.fn().mockResolvedValue(imported)
    port.saveDraft = vi.fn().mockResolvedValue({ ...imported, lastDraftSavedAt: 100 })

    const { result } = renderHook(() => useCpMaker(), { wrapper: createWrapper(port) })
    await vi.waitFor(() => expect(port.listDrafts).toHaveBeenCalledOnce())

    await act(async () => {
      await result.current.importPack('/mods/ImportedPack')
    })

    expect(port.importPack).toHaveBeenCalledWith('/mods/ImportedPack')
    expect(port.saveDraft).toHaveBeenCalledWith(imported)
    expect(port.listDrafts).toHaveBeenCalledTimes(2)
    expect(result.current.activeDraft?.draftStorageKey).toBe('imported-pack')
    expect(result.current.isDirty).toBe(false)
  })

  it('reports create failure without activating or navigating the draft', async () => {
    const port = createMockPort()
    port.saveDraft = vi.fn().mockRejectedValue(new Error('disk full'))
    const { result } = renderHook(() => useCpMaker(), { wrapper: createWrapper(port) })
    await vi.waitFor(() => expect(port.listDrafts).toHaveBeenCalledOnce())

    let created = true
    await act(async () => {
      created = await result.current.createDraft({ projectName: 'Broken', projectUniqueId: 'Author.Broken' })
    })

    expect(created).toBe(false)
    expect(result.current.activeDraft).toBeNull()
    expect(result.current.draftError).toBe('disk full')
  })

  it('round-trips export metadata and clears dirty state after a successful export', async () => {
    const port = createMockPort()
    const imported = {
      draftStorageKey: 'export-pack',
      projectMetadata: {
        projectName: 'Export Pack',
        projectDescription: '',
        projectAuthor: 'Author',
        projectVersion: '1.0.0',
        projectUniqueId: 'Author.ExportPack',
        gameRootPath: null,
        contentPackForUniqueId: 'Pathoschild.ContentPatcher',
      },
      overlayTargets: [],
      configSchemaDraft: {},
      serializedChangeRegistry: {},
      eventSourceSnapshotsByTarget: {},
      i18nFiles: [],
      lastDraftSavedAt: 10,
      lastExportedAt: 5,
      lastExportPath: '/mods/old',
      lastExportFingerprint: null,
    }
    port.importPack = vi.fn().mockResolvedValue(imported)
    port.saveDraft = vi.fn().mockImplementation(async (record) => record)
    port.exportPack = vi.fn().mockResolvedValue({
      output_path: '/mods/export-pack',
      manifest_path: '/mods/export-pack/manifest.json',
      content_path: '/mods/export-pack/content.json',
      virtual_asset_paths: [],
    })

    const { result } = renderHook(() => useCpMaker(), { wrapper: createWrapper(port) })
    await vi.waitFor(() => expect(port.listDrafts).toHaveBeenCalledOnce())
    await act(async () => {
      await result.current.importPack('/mods/ExportPack')
    })

    await act(async () => {
      await result.current.exportPack('/mods/export-pack')
    })

    const exportSave = vi.mocked(port.saveDraft).mock.calls.at(-1)?.[0]
    expect(exportSave?.lastExportedAt).toEqual(expect.any(Number))
    expect(exportSave?.lastExportPath).toBe('/mods/export-pack')
    expect(result.current.isDirty).toBe(false)
  })
})
