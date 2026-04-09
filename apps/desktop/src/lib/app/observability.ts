import { setDesktopDebugLoggingEnabled, writeFrontendLog, type FrontendLogLevel } from '../desktop'
import { publishNotification, type NotificationAction, type NotificationLevel } from './notifications'

export type AppEventLevel = NotificationLevel

export type ReportAppEventRequest = {
  level: AppEventLevel
  title: string
  description?: string | null
  action?: NotificationAction
  autoDismissMs?: number
  notify?: boolean
  log?: boolean
  logMessage?: string
  keyValues?: Record<string, string | undefined>
}

let debugDiagnosticsEnabled = false

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

export async function syncDebugDiagnosticsEnabled(enabled: boolean) {
  debugDiagnosticsEnabled = enabled

  try {
    await setDesktopDebugLoggingEnabled(enabled)
  } catch {
    // Logging sync must not break the UI shell.
  }
}

export function reportAppEvent(request: ReportAppEventRequest) {
  if (request.level === 'debug' && !debugDiagnosticsEnabled) {
    return null
  }

  if (request.log !== false) {
    void writeFrontendLog({
      level: toLogLevel(request.level),
      message: buildLogMessage(request),
      keyValues: request.keyValues,
    })
  }

  if (request.notify === false) {
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
