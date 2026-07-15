import { describe, expect, it, vi } from 'vite-plus/test'
import { getAppUiStateSnapshot } from '@shared/lib/app-state'
import { openLocalizationCenter } from '@pages/workbench/ui/module-runtimes/localizationNavigation'

describe('localization center navigation', () => {
  it('persists the requested scope before opening the module', async () => {
    const open = vi.fn(() => {
      expect(getAppUiStateSnapshot().workspace.modules['ai-localization/scope']?.value).toBe('scope-1')
    })
    await openLocalizationCenter('scope-1', open)
    expect(open).toHaveBeenCalledWith('ai-localization')
  })
})
