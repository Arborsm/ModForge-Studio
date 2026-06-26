import { describe, expect, it, vi } from 'vite-plus/test'
import { createAppEventBus } from './appEventBus'
import { createCommandDispatcher } from './commandDispatcher'
import type { AppCommand } from '@shared/contracts'
import type { AppEvent } from '@shared/contracts'

describe('app event bus and command dispatcher', () => {
  it('publishes events to active subscribers in order', () => {
    const bus = createAppEventBus()
    const received: AppEvent[] = []

    const unsubscribe = bus.subscribe((event) => {
      received.push(event)
    })

    bus.emit({
      type: 'app/locale-changed',
      locale: 'zh-CN',
    })
    bus.emit({
      type: 'workbench/view-selected',
      viewId: 'workspace-editor',
    })
    unsubscribe()
    bus.emit({
      type: 'cp-maker/draft-selected',
      draftKey: 'draft-1',
    })

    expect(received).toEqual([
      { type: 'app/locale-changed', locale: 'zh-CN' },
      { type: 'workbench/view-selected', viewId: 'workspace-editor' },
    ])
  })

  it('forwards dispatched commands to the provided handler', async () => {
    const handled: AppCommand[] = []
    const dispatch = createCommandDispatcher(async (command) => {
      handled.push(command)
    })

    await expect(dispatch.dispatch({ type: 'navigation/open-page', pageId: 'launcher' })).resolves.toBeUndefined()
    expect(handled).toEqual([{ type: 'navigation/open-page', pageId: 'launcher' }])
  })

  it('allows handlers to be synchronous', () => {
    const dispatch = createCommandDispatcher((command) => {
      handled.push(command)
    })
    const handled: AppCommand[] = []
    expect(dispatch.dispatch({ type: 'navigation/open-page', pageId: 'launcher' })).toBeUndefined()
    expect(handled).toEqual([{ type: 'navigation/open-page', pageId: 'launcher' }])
  })

  it('can be used with a no-op handler during setup', () => {
    const dispatch = createCommandDispatcher(vi.fn())
    expect(dispatch).toHaveProperty('dispatch')
  })
})
