import type { NotificationAction, NotificationLevel } from '@shared/ui/notifications'

/** Event severity used for both notifications and observability routing. */
export type AppEventLevel = NotificationLevel

/** Log severity accepted by the frontend observability adapter. */
export type FrontendLogLevel = 'debug' | 'info' | 'warning' | 'error'

/** Structured log entry sent to the configured observability adapter. */
export type FrontendLogRequest = {
  level: FrontendLogLevel
  message: string
  file?: string
  line?: number
  keyValues?: Record<string, string | undefined>
}

/** App event that may produce a notification, a log entry, or both. */
export type ReportAppEventRequest = {
  level: AppEventLevel
  title: string
  description?: string | null
  debugDiagnosticsEnabled?: boolean
  action?: NotificationAction
  autoDismissMs?: number
  notify?: boolean
  log?: boolean
  logMessage?: string
  keyValues?: Record<string, string | undefined>
}

/** Host adapter for debug logging and frontend log forwarding. */
export type ObservabilityAdapter = {
  setDebugLoggingEnabled?: (enabled: boolean) => Promise<void> | void
  writeFrontendLog?: (request: FrontendLogRequest) => Promise<void> | void
}

const CONSOLE_METHODS = ['debug', 'info', 'warn', 'error'] as const

type ConsoleMethodName = (typeof CONSOLE_METHODS)[number]

declare global {
  interface Window {
    __MODFORGE_MIRRORING_FRONTEND_LOG__?: boolean
  }
}

let debugDiagnosticsEnabled = false
let observabilityAdapter: ObservabilityAdapter = {}
let notificationDispatcher:
  | ((request: {
      level: AppEventLevel
      title: string
      description?: string | null
      action?: NotificationAction
      autoDismissMs?: number
    }) => string | null)
  | null = null
let consoleBridgeInstalled = false
let forwardingConsoleLog = false

/** Configures the observability adapter used by reportAppEvent. */
export function configureObservability(adapter: ObservabilityAdapter) {
  observabilityAdapter = adapter
  installConsoleLogBridge()
}

/** Injects the UI notification publisher used by reportAppEvent. */
export function setNotificationDispatcher(
  dispatcher:
    | ((request: {
        level: AppEventLevel
        title: string
        description?: string | null
        action?: NotificationAction
        autoDismissMs?: number
      }) => string | null)
    | null,
) {
  notificationDispatcher = dispatcher
}

function shouldForceNotification(level: AppEventLevel) {
  return debugDiagnosticsEnabled && (level === 'warning' || level === 'error')
}

function shouldNotify({ level, notify }: ReportAppEventRequest) {
  if (shouldForceNotification(level)) {
    return true
  }

  return notify !== false
}

function toLogLevel(level: AppEventLevel): FrontendLogLevel {
  switch (level) {
    case 'debug':
      return 'debug'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    case 'info':
    case 'success':
      return 'info'
  }
}

function buildLogMessage({ title, description, logMessage }: ReportAppEventRequest) {
  if (typeof logMessage === 'string' && logMessage.trim()) {
    return logMessage
  }

  if (description?.trim()) {
    return `${title}: ${description}`
  }

  return title
}

function toConsoleBridgeLevel(method: ConsoleMethodName): FrontendLogLevel {
  switch (method) {
    case 'debug':
      return 'debug'
    case 'info':
      return 'info'
    case 'warn':
      return 'warning'
    case 'error':
      return 'error'
  }
}

function stringifyConsoleArgument(argument: unknown) {
  if (argument instanceof Error) {
    return argument.stack || argument.message
  }

  if (typeof argument === 'string') {
    return argument
  }

  try {
    return JSON.stringify(argument)
  } catch {
    return String(argument)
  }
}

function buildConsoleBridgeLogMessage(args: unknown[]) {
  return args.map(stringifyConsoleArgument).join(' ')
}

function writeFrontendLogSafely(request: FrontendLogRequest) {
  try {
    void Promise.resolve(observabilityAdapter.writeFrontendLog?.(request)).catch(() => undefined)
  } catch {
    // Logging must not break the UI shell.
  }
}

function installConsoleLogBridge() {
  if (consoleBridgeInstalled || typeof console === 'undefined') {
    return
  }

  for (const method of CONSOLE_METHODS) {
    const original = console[method].bind(console) as typeof console.debug

    console[method] = ((...args: unknown[]) => {
      original(...args)

      if (
        forwardingConsoleLog ||
        !observabilityAdapter.writeFrontendLog ||
        (typeof window !== 'undefined' && window.__MODFORGE_MIRRORING_FRONTEND_LOG__)
      ) {
        return
      }

      const message = buildConsoleBridgeLogMessage(args)
      if (!message.trim()) {
        return
      }

      forwardingConsoleLog = true
      try {
        writeFrontendLogSafely({
          level: toConsoleBridgeLevel(method),
          message,
          keyValues: {
            source: 'console',
            method,
          },
        })
      } finally {
        forwardingConsoleLog = false
      }
    }) as typeof console.debug
  }

  consoleBridgeInstalled = true
}

/** Syncs the debug diagnostics toggle with in-memory state and the host logger. */
export async function syncDebugDiagnosticsEnabled(enabled: boolean) {
  debugDiagnosticsEnabled = enabled

  try {
    await observabilityAdapter.setDebugLoggingEnabled?.(enabled)
  } catch {
    // Logging sync must not break the UI shell.
  }
}

/** Reports an app event, optionally writing a log and publishing a user notification. */
export function reportAppEvent(request: ReportAppEventRequest) {
  const debugDiagnosticsActive = request.debugDiagnosticsEnabled ?? debugDiagnosticsEnabled

  if (request.level === 'debug' && !debugDiagnosticsActive) {
    return null
  }

  if (request.log !== false) {
    writeFrontendLogSafely({
      level: toLogLevel(request.level),
      message: buildLogMessage(request),
      keyValues: request.keyValues,
    })
  }

  if (!shouldNotify(request)) {
    return null
  }

  return (
    notificationDispatcher?.({
      level: request.level,
      title: request.title,
      description: request.description,
      action: request.action,
      autoDismissMs: request.autoDismissMs,
    }) ?? null
  )
}
