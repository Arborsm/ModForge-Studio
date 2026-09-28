import { describe, expect, it } from 'vite-plus/test'
import { composeSemanticStripState, type SemanticStripItemState } from '@app/app-shell/settings/semanticStatusStripModel'
import type { AiSemanticIndexStatus, AiSemanticModelStatus, AiSemanticSearchMode, AiSemanticSettingsSnapshot } from '@shared/contracts'

const okSettings = (mode: AiSemanticSearchMode): SemanticStripItemState<AiSemanticSettingsSnapshot> =>
  ({ status: 'ok', value: { mode } as AiSemanticSettingsSnapshot }) as SemanticStripItemState<AiSemanticSettingsSnapshot>
const okModel: SemanticStripItemState<AiSemanticModelStatus> = {
  status: 'ok',
  value: { available: true } as AiSemanticModelStatus,
}
const okIndex: SemanticStripItemState<AiSemanticIndexStatus> = {
  status: 'ok',
  value: { coveragePercentage: 42.5, pendingRecords: 3 } as AiSemanticIndexStatus,
}

describe('composeSemanticStripState', () => {
  it('stays loading until settings settle', () => {
    expect(
      composeSemanticStripState({ settings: { status: 'pending' }, model: { status: 'pending' }, index: { status: 'pending' } }),
    ).toEqual({ kind: 'loading' })
    expect(composeSemanticStripState({ settings: { status: 'pending' }, model: okModel, index: okIndex })).toEqual({ kind: 'loading' })
  })

  it('degrades to load-error when settings fail, keeping the timeout flag', () => {
    expect(composeSemanticStripState({ settings: { status: 'error', timedOut: true }, model: okModel, index: okIndex })).toEqual({
      kind: 'load-error',
      timedOut: true,
    })
    expect(composeSemanticStripState({ settings: { status: 'error', timedOut: false }, model: okModel, index: okIndex })).toEqual({
      kind: 'load-error',
      timedOut: false,
    })
  })

  it('exposes ready fields when all queries settle', () => {
    const state = composeSemanticStripState({ settings: okSettings('builtin'), model: okModel, index: okIndex })
    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.mode).toBe('builtin')
    expect(state.model?.available).toBe(true)
    expect(state.index?.coveragePercentage).toBe(42.5)
    expect(state.index?.pendingRecords).toBe(3)
    expect(state.modelDegraded).toBe(false)
    expect(state.indexDegraded).toBe(false)
  })

  it('degrades only the failed fields while keeping the rest ready', () => {
    const state = composeSemanticStripState({
      settings: okSettings('local-onnx'),
      model: { status: 'error', timedOut: true },
      index: okIndex,
    })
    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.model).toBeNull()
    expect(state.modelDegraded).toBe(true)
    expect(state.index).not.toBeNull()
    expect(state.indexDegraded).toBe(false)

    const indexFailed = composeSemanticStripState({
      settings: okSettings('remote-openai'),
      model: okModel,
      index: { status: 'error', timedOut: false },
    })
    expect(indexFailed.kind).toBe('ready')
    if (indexFailed.kind !== 'ready') return
    expect(indexFailed.model).not.toBeNull()
    expect(indexFailed.modelDegraded).toBe(false)
    expect(indexFailed.index).toBeNull()
    expect(indexFailed.indexDegraded).toBe(true)
  })

  it('omits pending model/index fields without marking them degraded', () => {
    const state = composeSemanticStripState({
      settings: okSettings('remote-openai'),
      model: { status: 'pending' },
      index: { status: 'pending' },
    })
    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.mode).toBe('remote-openai')
    expect(state.model).toBeNull()
    expect(state.modelDegraded).toBe(false)
    expect(state.index).toBeNull()
    expect(state.indexDegraded).toBe(false)
  })
})
