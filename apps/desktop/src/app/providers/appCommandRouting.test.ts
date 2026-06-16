import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { AppCommand } from '@shared/contracts'
import { createAppCommandHandler } from './appCommandRouting'

describe('createAppCommandHandler', () => {
  const setAppMode = vi.fn()
  const onPendingIntent = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores workbench/open-asset intent and switches to workbench', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })
    const command: AppCommand = {
      type: 'workbench/open-asset',
      assetId: 'patch-123',
      assetKind: 'event',
      sourceId: 'draft-abc',
    }

    handler.handleCommand(command)

    expect(setAppMode).toHaveBeenCalledWith('workbench')
    expect(onPendingIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        command,
      }),
    )
  })

  it('stores navigation/open-workbench-view intent and switches to workbench', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })
    const command: AppCommand = {
      type: 'navigation/open-workbench-view',
      viewId: 'workspace-editor',
    }

    handler.handleCommand(command)

    expect(setAppMode).toHaveBeenCalledWith('workbench')
    expect(onPendingIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        command,
      }),
    )
  })

  it('allows a later view intent to replace a pending open-asset intent', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })

    handler.handleCommand({
      type: 'workbench/open-asset',
      assetId: 'patch-456',
      assetKind: 'map',
    })

    expect(onPendingIntent).toHaveBeenCalledTimes(1)
    const firstCall = onPendingIntent.mock.calls[0]
    void firstCall[0].id

    vi.clearAllMocks()

    handler.handleCommand({
      type: 'navigation/open-workbench-view',
      viewId: 'studio-desk',
    })

    expect(onPendingIntent).toHaveBeenCalledTimes(1)
    const nextPending = handler.getCurrentPendingIntent()
    expect(nextPending?.command).toEqual({
      type: 'navigation/open-workbench-view',
      viewId: 'studio-desk',
    })
  })

  it('allows overwriting after pending intent is cleared', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })

    handler.handleCommand({
      type: 'workbench/open-asset',
      assetId: 'patch-1',
      assetKind: 'event',
    })
    handler.clearPendingIntent()
    vi.clearAllMocks()

    handler.handleCommand({
      type: 'navigation/open-workbench-view',
      viewId: 'studio-desk',
    })

    expect(onPendingIntent).toHaveBeenCalledTimes(1)
    expect(setAppMode).toHaveBeenCalledWith('workbench')
  })

  it('does nothing for navigation/open-page', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })

    handler.handleCommand({ type: 'navigation/open-page', pageId: 'library' })

    expect(setAppMode).not.toHaveBeenCalled()
    expect(onPendingIntent).not.toHaveBeenCalled()
  })

  it('does nothing for unknown commands', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })

    handler.handleCommand({ type: 'navigation/open-page', pageId: 'unknown' } as AppCommand)

    expect(setAppMode).not.toHaveBeenCalled()
    expect(onPendingIntent).not.toHaveBeenCalled()
  })

  it('assigns a unique monotonic id to each intent', () => {
    const handler = createAppCommandHandler({ setAppMode, onPendingIntent })

    handler.handleCommand({
      type: 'navigation/open-workbench-view',
      viewId: 'studio-desk',
    })
    const id1 = onPendingIntent.mock.calls[0][0].id

    handler.clearPendingIntent()
    vi.clearAllMocks()

    handler.handleCommand({
      type: 'navigation/open-workbench-view',
      viewId: 'workspace-editor',
    })
    const id2 = onPendingIntent.mock.calls[0][0].id

    expect(id1).not.toBe(id2)
  })
})
