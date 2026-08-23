import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { AppCommand } from '@shared/contracts'
import { appCommands, registerAppCommandHandler } from '@shared/lib/app-runtime/appCommands'

const OPEN_SETTINGS: AppCommand = { type: 'navigation/open-settings', target: { category: 'ai' } }

describe('appCommands singleton', () => {
  let unregister: (() => void) | null = null

  afterEach(() => {
    unregister?.()
    unregister = null
  })

  it('drops commands dispatched before any handler is registered', () => {
    expect(() => appCommands.dispatch(OPEN_SETTINGS)).not.toThrow()
  })

  it('forwards dispatched commands to the registered handler', () => {
    const handler = vi.fn()
    unregister = registerAppCommandHandler(handler)

    void appCommands.dispatch(OPEN_SETTINGS)

    expect(handler).toHaveBeenCalledWith(OPEN_SETTINGS)
  })

  it('stops forwarding after unregister', () => {
    const handler = vi.fn()
    const unregisterHandler = registerAppCommandHandler(handler)
    unregisterHandler()

    void appCommands.dispatch(OPEN_SETTINGS)

    expect(handler).not.toHaveBeenCalled()
  })

  it('replaces the previous handler when a new one registers', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerAppCommandHandler(first)
    unregister = registerAppCommandHandler(second)

    void appCommands.dispatch(OPEN_SETTINGS)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(OPEN_SETTINGS)
  })

  it('does not clear a newer handler when the stale unregister runs', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerAppCommandHandler(first)
    unregister = registerAppCommandHandler(second)

    unregisterFirst()
    void appCommands.dispatch(OPEN_SETTINGS)

    expect(second).toHaveBeenCalledWith(OPEN_SETTINGS)
  })
})
