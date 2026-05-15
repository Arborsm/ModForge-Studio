import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { CpMakerPort } from '@features/cp-maker'
import { CpMakerProvider } from '@features/cp-maker'
import { useCpMaker } from './useCpMaker'

function createMockPort(): CpMakerPort {
  return {
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
})
