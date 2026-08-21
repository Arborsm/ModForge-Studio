import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { createElectronPlatformPorts } from '@platform/electron'
import { createTauriPlatformPorts } from '@platform/tauri'

const originalUserAgent = navigator.userAgent

function stubUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true })
}

afterEach(() => {
  stubUserAgent(originalUserAgent)
  vi.unstubAllGlobals()
})

describe('tauri resolvePluginUrl', () => {
  test('uses http://plugin.localhost on Windows WebView2', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js')).toBe('http://plugin.localhost/author.plugin/index.js')
  })

  test('uses plugin://localhost on macOS/Linux', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'assets/ui.js')).toBe('plugin://localhost/author.plugin/assets/ui.js')
  })

  test('percent-encodes each path segment', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('my plugin', 'dir/a b.js')).toBe('plugin://localhost/my%20plugin/dir/a%20b.js')
  })

  test('inserts __v<N>/ epoch segment on Windows when epoch is provided', () => {
    stubUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js', 3)).toBe('http://plugin.localhost/author.plugin/__v3/index.js')
  })

  test('inserts __v<N>/ epoch segment on macOS/Linux when epoch is provided', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'assets/ui.js', 1)).toBe('plugin://localhost/author.plugin/__v1/assets/ui.js')
  })

  test('epoch 0 is treated as a provided epoch and inserts __v0/', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js', 0)).toBe('plugin://localhost/author.plugin/__v0/index.js')
  })

  test('omits the epoch segment when epoch is undefined', () => {
    stubUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15')
    const ports = createTauriPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js', undefined)).toBe('plugin://localhost/author.plugin/index.js')
  })
})

describe('electron resolvePluginUrl', () => {
  test('uses the real privileged scheme with the plugin id as authority', () => {
    const ports = createElectronPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js')).toBe('plugin://author.plugin/index.js')
  })

  test('inserts __v<N>/ epoch segment after the plugin id when epoch is provided', () => {
    const ports = createElectronPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js', 2)).toBe('plugin://author.plugin/__v2/index.js')
  })

  test('omits the epoch segment when epoch is undefined', () => {
    const ports = createElectronPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js', undefined)).toBe('plugin://author.plugin/index.js')
  })
})
