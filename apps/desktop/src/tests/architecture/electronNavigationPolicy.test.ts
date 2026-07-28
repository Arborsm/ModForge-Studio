import { describe, expect, it } from 'vite-plus/test'

describe('electron navigation policy', () => {
  it('keeps the renderer on the dev server document only', async () => {
    const { isInternalNavigationUrl } = await import('../../../electron/navigation-policy')
    const policy = { devUrl: 'http://127.0.0.1:5173', appFilePath: '/opt/app/resources/dist/index.html' }

    expect(isInternalNavigationUrl('http://127.0.0.1:5173/', policy)).toBe(true)
    expect(isInternalNavigationUrl('http://127.0.0.1:5173/workbench?view=map', policy)).toBe(true)

    expect(isInternalNavigationUrl('http://127.0.0.1:5174/', policy)).toBe(false)
    expect(isInternalNavigationUrl('https://www.nexusmods.com/stardewvalley/mods/1', policy)).toBe(false)
    expect(isInternalNavigationUrl('http://localhost:5173/', policy)).toBe(false)
    expect(isInternalNavigationUrl('not a url', policy)).toBe(false)
  })

  it('keeps the packaged renderer on its own entry document', async () => {
    const { isInternalNavigationUrl } = await import('../../../electron/navigation-policy')
    const policy = { appFilePath: '/opt/app/resources/dist/index.html' }

    expect(isInternalNavigationUrl('file:///opt/app/resources/dist/index.html', policy)).toBe(true)
    expect(isInternalNavigationUrl('file:///opt/app/resources/dist/index.html?view=map', policy)).toBe(true)

    expect(isInternalNavigationUrl('file:///etc/passwd', policy)).toBe(false)
    expect(isInternalNavigationUrl('file:///opt/app/resources/dist/../../secrets.html', policy)).toBe(false)
    expect(isInternalNavigationUrl('http://127.0.0.1:5173/', policy)).toBe(false)
  })

  it('only hands http and https targets to the system browser', async () => {
    const { isExternalBrowserUrl } = await import('../../../electron/navigation-policy')

    expect(isExternalBrowserUrl('https://www.nexusmods.com/')).toBe(true)
    expect(isExternalBrowserUrl('http://smapi.io/')).toBe(true)

    expect(isExternalBrowserUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalBrowserUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalBrowserUrl('modforge-asset://local/etc/passwd')).toBe(false)
    expect(isExternalBrowserUrl('')).toBe(false)
  })
})
