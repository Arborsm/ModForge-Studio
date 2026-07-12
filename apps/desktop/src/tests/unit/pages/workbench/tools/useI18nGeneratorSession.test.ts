import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const appUiStateMocks = vi.hoisted(() => ({
  applyAppUiStatePatch: vi.fn(async () => undefined),
  getAppUiStateSnapshot: vi.fn(),
}))

vi.mock('@shared/lib/app-state', () => appUiStateMocks)

import { useI18nGeneratorSession } from '@pages/workbench/tools/i18n-generator/useI18nGeneratorSession'

describe('useI18nGeneratorSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    appUiStateMocks.getAppUiStateSnapshot.mockReturnValue({
      workspace: {
        modules: {
          'i18n-generator': {
            prefix: 'Saved.Mod',
            targetPrefixes: { 'Data/Objects': 'objects' },
            enabledTargets: ['Data/Objects'],
            expandedPaths: ['Data'],
          },
        },
      },
    })
  })

  afterEach(() => vi.useRealTimers())

  it('restores the last session without writing it back during hydration', () => {
    const { result } = renderHook(() => useI18nGeneratorSession())

    expect(result.current.prefix).toBe('Saved.Mod')
    expect(result.current.targetPrefixes).toEqual({ 'Data/Objects': 'objects' })
    expect(result.current.enabledTargets).toEqual(new Set(['Data/Objects']))
    expect(appUiStateMocks.applyAppUiStatePatch).not.toHaveBeenCalled()
  })

  it('batches rapid configuration changes into one lightweight patch', async () => {
    const { result } = renderHook(() => useI18nGeneratorSession())

    act(() => {
      result.current.setPrefix('Saved.Mod.One')
      result.current.setPrefix('Saved.Mod.Final')
      result.current.setExpandedPaths(new Set(['Data', 'Data/Objects']))
    })
    await act(async () => vi.advanceTimersByTime(600))

    expect(appUiStateMocks.applyAppUiStatePatch).toHaveBeenCalledTimes(1)
    expect(appUiStateMocks.applyAppUiStatePatch).toHaveBeenCalledWith({
      workspace: {
        modules: {
          'i18n-generator': {
            prefix: 'Saved.Mod.Final',
            targetPrefixes: { 'Data/Objects': 'objects' },
            enabledTargets: ['Data/Objects'],
            expandedPaths: ['Data', 'Data/Objects'],
          },
        },
      },
    })
  })
})
