import { HOST_COMMANDS } from '@platform/host-commands'
import { canUseDesktopHost, invokeDesktop } from './runtime'

export type FrontendLogLevel = 'debug' | 'info' | 'warning' | 'error'

declare global {
  interface Window {
    __MODFORGE_MIRRORING_FRONTEND_LOG__?: boolean
  }
}

/** Structured frontend log entry forwarded to the desktop logger. */
export type FrontendLogRequest = {
  level: FrontendLogLevel
  message: string
  file?: string
  line?: number
  keyValues?: Record<string, string | undefined>
}

function toConsoleLogMethod(level: FrontendLogLevel) {
  switch (level) {
    case 'debug':
      return console.debug
    case 'info':
      return console.info
    case 'warning':
      return console.warn
    case 'error':
      return console.error
  }
}

function mirrorFrontendLogToConsole(request: FrontendLogRequest) {
  const metadata: Record<string, string | number | undefined> = {
    ...request.keyValues,
    file: request.file,
    line: request.line,
  }

  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined)
  const logMethod = toConsoleLogMethod(request.level)
  const levelLabel = request.level === 'warning' ? 'WARN' : request.level.toUpperCase()
  const metadataText = entries.map(([key, value]) => `${key}=${value}`).join(' ')
  const message = [`[webview][${levelLabel}]`, request.message, metadataText].filter(Boolean).join(' ')

  if (typeof window !== 'undefined') {
    window.__MODFORGE_MIRRORING_FRONTEND_LOG__ = true
  }

  try {
    logMethod(message)
  } finally {
    if (typeof window !== 'undefined') {
      window.__MODFORGE_MIRRORING_FRONTEND_LOG__ = false
    }
  }
}

/** Mirrors a frontend log to the browser console and forwards it to the desktop logger when available. */
export async function writeFrontendLog(request: FrontendLogRequest) {
  mirrorFrontendLogToConsole(request)

  if (!canUseDesktopHost()) {
    return
  }

  await invokeDesktop<void>(HOST_COMMANDS.writeFrontendLog, { request }, { kind: 'serviceGate', key: 'frontend-log' })
}

/** Enables or disables verbose desktop-side debug logging. */
export async function setDesktopDebugLoggingEnabled(enabled: boolean) {
  if (!canUseDesktopHost()) {
    return
  }

  await invokeDesktop<void>(HOST_COMMANDS.setDebugLoggingEnabled, { enabled }, { kind: 'serviceGate', key: 'debug-logging' })
}
