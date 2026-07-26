import { describe, expect, it, vi } from 'vite-plus/test'
import { listenForAppSettingsRequests, requestAppSettings } from '@shared/lib/app-settings-events'

describe('app settings events', () => {
  it('routes a typed category until the listener is disposed', () => {
    const listener = vi.fn()
    const dispose = listenForAppSettingsRequests(listener)
    requestAppSettings('ai')
    expect(listener).toHaveBeenCalledWith({ category: 'ai' })
    dispose()
    requestAppSettings('debug')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('preserves a nested AI settings destination', () => {
    const listener = vi.fn()
    const dispose = listenForAppSettingsRequests(listener)
    requestAppSettings({ category: 'ai', aiTab: 'semantic' })
    expect(listener).toHaveBeenCalledWith({ category: 'ai', aiTab: 'semantic' })
    dispose()
  })
})
