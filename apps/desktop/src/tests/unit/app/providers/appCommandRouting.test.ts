import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { AppCommand } from '@shared/contracts'
import { createAppCommandHandler } from '@app/providers/appCommandRouting'

describe('createAppCommandHandler', () => {
  const openSettings = vi.fn()
  const reloadCompatPlugins = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes navigation/open-settings to openSettings with the target', () => {
    const handler = createAppCommandHandler({ openSettings, reloadCompatPlugins })
    const command: AppCommand = {
      type: 'navigation/open-settings',
      target: { category: 'ai', aiTab: 'semantic' },
    }

    handler.handleCommand(command)

    expect(openSettings).toHaveBeenCalledWith({ category: 'ai', aiTab: 'semantic' })
    expect(reloadCompatPlugins).not.toHaveBeenCalled()
  })

  it('routes plugins/reload-compat to reloadCompatPlugins', () => {
    const handler = createAppCommandHandler({ openSettings, reloadCompatPlugins })

    handler.handleCommand({ type: 'plugins/reload-compat' })

    expect(reloadCompatPlugins).toHaveBeenCalledTimes(1)
    expect(openSettings).not.toHaveBeenCalled()
  })

  it('ignores unknown command types without throwing', () => {
    const handler = createAppCommandHandler({ openSettings, reloadCompatPlugins })

    handler.handleCommand({ type: 'navigation/unknown' } as unknown as AppCommand)

    expect(openSettings).not.toHaveBeenCalled()
    expect(reloadCompatPlugins).not.toHaveBeenCalled()
  })
})
