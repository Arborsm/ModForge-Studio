import { describe, expect, it, vi } from 'vite-plus/test'
import { listenForLauncherModDetailDismiss, requestLauncherModDetailDismiss } from '@shared/lib/launcher-overlay-events'

describe('launcher overlay events', () => {
  it('notifies mod detail listeners until disposed', () => {
    const listener = vi.fn()
    const dispose = listenForLauncherModDetailDismiss(listener)
    requestLauncherModDetailDismiss()
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
    requestLauncherModDetailDismiss()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reaches every subscribed listener', () => {
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = listenForLauncherModDetailDismiss(first)
    const disposeSecond = listenForLauncherModDetailDismiss(second)
    requestLauncherModDetailDismiss()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    disposeFirst()
    disposeSecond()
  })
})
