import { describe, expect, it, vi } from 'vite-plus/test'
import { createWorkbenchOrchestration } from '@app/providers/workbenchOrchestration'
import type { AppCommand } from '@shared/contracts'
import type { AppEvent } from '@shared/contracts'

describe('createWorkbenchOrchestration', () => {
  it('dispatches commands for workbench navigation events', () => {
    const dispatched: AppCommand[] = []
    const orchestration = createWorkbenchOrchestration({
      dispatch: (command) => {
        dispatched.push(command)
      },
    })

    orchestration.handleEvent({
      type: 'cp-maker/asset-selected',
      draftKey: 'draft-1',
      assetId: 'asset-1',
      assetKind: 'map',
    } satisfies AppEvent)
    orchestration.handleEvent({
      type: 'workbench/view-selected',
      viewId: 'workspace-editor',
    } satisfies AppEvent)

    expect(dispatched).toEqual([
      {
        type: 'workbench/open-asset',
        assetId: 'asset-1',
        assetKind: 'map',
        sourceId: 'draft-1',
      },
      { type: 'navigation/open-workbench-view', viewId: 'workspace-editor' },
    ])
  })

  it('does not turn draft selection into workspace navigation', () => {
    const dispatch = vi.fn()
    const orchestration = createWorkbenchOrchestration({ dispatch })

    orchestration.handleEvent({
      type: 'cp-maker/draft-selected',
      draftKey: 'draft-1',
    } satisfies AppEvent)

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores events it does not handle', () => {
    const dispatch = vi.fn()
    const orchestration = createWorkbenchOrchestration({ dispatch })

    orchestration.handleEvent({
      type: 'app/locale-changed',
      locale: 'zh-CN',
    })

    expect(dispatch).not.toHaveBeenCalled()
  })
})
