import { canUseDesktopHost, invokeDesktop } from './runtime'

export type FrontendLogLevel = 'debug' | 'info' | 'warning' | 'error'

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

  if (!entries.length) {
    logMethod(request.message)
    return
  }

  logMethod(request.message, Object.fromEntries(entries))
}

/** Mirrors a frontend log to the browser console and forwards it to the desktop logger when available. */
export async function writeFrontendLog(request: FrontendLogRequest) {
  mirrorFrontendLogToConsole(request)

  if (!canUseDesktopHost()) {
    return
  }

  await invokeDesktop<void>('write_frontend_log', { request })
}

/** Enables or disables verbose desktop-side debug logging. */
export async function setDesktopDebugLoggingEnabled(enabled: boolean) {
  if (!canUseDesktopHost()) {
    return
  }

  await invokeDesktop<void>('set_debug_logging_enabled', { enabled })
}
