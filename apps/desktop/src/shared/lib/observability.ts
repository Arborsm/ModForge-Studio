import { publishNotification, type NotificationAction, type NotificationLevel } from '@shared/ui/notifications'

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

let debugDiagnosticsEnabled = false
let observabilityAdapter: ObservabilityAdapter = {}

/** Configures the observability adapter used by reportAppEvent. */
export function configureObservability(adapter: ObservabilityAdapter) {
  observabilityAdapter = adapter
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
    void observabilityAdapter.writeFrontendLog?.({
      level: toLogLevel(request.level),
      message: buildLogMessage(request),
      keyValues: request.keyValues,
    })
  }

  if (!shouldNotify(request)) {
    return null
  }

  return publishNotification({
    level: request.level,
    title: request.title,
    description: request.description,
    action: request.action,
    autoDismissMs: request.autoDismissMs,
  })
}
