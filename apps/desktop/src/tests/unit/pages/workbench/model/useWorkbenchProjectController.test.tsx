import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { CpMakerPort, UseCpMakerReturn } from '@features/cp-maker'
import { useWorkbenchProjectController } from '@pages/workbench/model/useWorkbenchProjectController'

const port = vi.hoisted(() => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
}))

vi.mock('@features/cp-maker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/cp-maker')>()
  return { ...actual, useCpMakerPort: () => port as unknown as CpMakerPort }
})

function cpMaker(overrides: Partial<UseCpMakerReturn> = {}): UseCpMakerReturn {
  return {
    activeDraft: null,
    getActiveDraftKey: vi.fn().mockReturnValue(null),
    drafts: [],
    draftsReady: true,
    isDirty: false,
    loadDraft: vi.fn(),
    ...overrides,
  } as unknown as UseCpMakerReturn
}

describe('useWorkbenchProjectController', () => {
  it('clears a missing restored draft key and stays on home', async () => {
    port.loadSession.mockResolvedValueOnce({ activeDraftKey: 'missing-draft', activeGeneratedDraftKey: 'generated-draft' })
    port.saveSession.mockImplementationOnce(async (session) => session)
    const onRestoreFailed = vi.fn()
    const project = cpMaker({
      drafts: [
        {
          draftStorageKey: 'available-draft',
          projectName: 'Available',
          projectUniqueId: 'Test.Available',
          lastDraftSavedAt: null,
          lastExportedAt: null,
        },
      ],
    })

    const { result } = renderHook(() =>
      useWorkbenchProjectController({
        cpMaker: project,
        onRestoreFailed,
        saveFailedMessage: 'Save failed',
        runWithExternalGuard: async (action) => {
          await action()
          return true
        },
      }),
    )

    await waitFor(() => expect(result.current.projectReady).toBe(true))
    expect(project.loadDraft).not.toHaveBeenCalled()
    expect(port.saveSession).toHaveBeenCalledWith({ activeDraftKey: null, activeGeneratedDraftKey: 'generated-draft' })
    expect(onRestoreFailed).toHaveBeenCalledTimes(1)
  })

  it('clears the session when an existing restored draft fails to load', async () => {
    port.loadSession.mockResolvedValueOnce({ activeDraftKey: 'broken-draft', activeGeneratedDraftKey: null })
    port.saveSession.mockImplementation(async (session) => session)
    const onRestoreFailed = vi.fn()
    const loadDraft = vi.fn().mockResolvedValue(false)
    const project = cpMaker({
      loadDraft,
      drafts: [
        {
          draftStorageKey: 'broken-draft',
          projectName: 'Broken',
          projectUniqueId: 'Test.Broken',
          lastDraftSavedAt: null,
          lastExportedAt: null,
        },
      ],
    })

    const { result } = renderHook(() =>
      useWorkbenchProjectController({
        cpMaker: project,
        onRestoreFailed,
        saveFailedMessage: 'Save failed',
        runWithExternalGuard: async (action) => {
          await action()
          return true
        },
      }),
    )

    await waitFor(() => expect(result.current.projectReady).toBe(true))
    expect(loadDraft).toHaveBeenCalledWith('broken-draft')
    expect(port.saveSession).toHaveBeenCalledWith({ activeDraftKey: null, activeGeneratedDraftKey: null })
    expect(onRestoreFailed).toHaveBeenCalledTimes(1)
  })

  it('does not run the success callback when selecting a draft fails', async () => {
    port.loadSession.mockResolvedValueOnce({ activeDraftKey: null, activeGeneratedDraftKey: null })
    const loadDraft = vi.fn().mockResolvedValue(false)
    const onRestoreFailed = vi.fn()
    const project = cpMaker({ loadDraft })
    const { result } = renderHook(() =>
      useWorkbenchProjectController({
        cpMaker: project,
        onRestoreFailed,
        saveFailedMessage: 'Save failed',
        runWithExternalGuard: async (action) => {
          await action()
          return true
        },
      }),
    )

    await waitFor(() => expect(result.current.projectReady).toBe(true))
    const onSelected = vi.fn()
    await act(async () => {
      await result.current.selectDraft('broken-draft', onSelected)
    })
    expect(onSelected).not.toHaveBeenCalled()
    expect(onRestoreFailed).toHaveBeenCalledTimes(1)
  })

  it('does not run the success callback when creating a draft fails', async () => {
    port.loadSession.mockResolvedValueOnce({ activeDraftKey: null, activeGeneratedDraftKey: null })
    const onRestoreFailed = vi.fn()
    const onCreated = vi.fn()
    const project = cpMaker({ createDraft: vi.fn().mockResolvedValue(false) })
    const { result } = renderHook(() =>
      useWorkbenchProjectController({
        cpMaker: project,
        onRestoreFailed,
        saveFailedMessage: 'Save failed',
        runWithExternalGuard: async (action) => {
          await action()
          return true
        },
      }),
    )

    await waitFor(() => expect(result.current.projectReady).toBe(true))
    await act(async () => {
      await result.current.createDraft({ projectName: 'Broken', projectUniqueId: 'Author.Broken' }, onCreated)
    })

    expect(onCreated).not.toHaveBeenCalled()
  })
})
