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
})

describe('electron resolvePluginUrl', () => {
  test('uses the real privileged scheme with the plugin id as authority', () => {
    const ports = createElectronPlatformPorts()
    expect(ports.fileSystem.resolvePluginUrl('author.plugin', 'index.js')).toBe('plugin://author.plugin/index.js')
  })
})
