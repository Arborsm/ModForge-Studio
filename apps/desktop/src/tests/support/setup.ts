import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vite-plus/test'

const desktopTestRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
if (process.cwd() !== desktopTestRoot) {
  process.chdir(desktopTestRoot)
}

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  writable: true,
  value: true,
})

const originalConsoleError = console.error.bind(console)
const originalConsoleWarn = console.warn.bind(console)

console.error = ((...args: unknown[]) => {
  const message = typeof args[0] === 'string' ? args[0] : ''
  if (message.includes('An update to') && message.includes('inside a test was not wrapped in act(...)')) {
    return
  }

  originalConsoleError(...args)
}) as typeof console.error

console.warn = ((...args: unknown[]) => {
  const message = typeof args[0] === 'string' ? args[0] : ''
  if (message.startsWith('Failed to sample palette preview row.') || message.startsWith('[webview][WARN]')) {
    return
  }

  originalConsoleWarn(...args)
}) as typeof console.warn

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn(async () => undefined),
  })
}

if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
