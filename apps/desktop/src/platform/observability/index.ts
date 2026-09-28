/**
 * @file Frontend observability — app event reporting, notification dispatch and console-to-host log bridge.
 * @module platform/observability
 */

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

/** Chainable event configuration used to send a log entry and optional notification. */
export interface AppEventBuilder {
  description(value: string | null): AppEventBuilder
  /** Accent-tinted summary block rendered between subtitle and description on the notification card. */
  summary(value: string | null): AppEventBuilder
  /** Footnote/hint line rendered at the bottom of the notification card. */
  note(value: string | null): AppEventBuilder
  error(value: unknown): AppEventBuilder
  context(values: Record<string, string | undefined>): AppEventBuilder
  logMessage(value: string): AppEventBuilder
  action(value: NotificationAction): AppEventBuilder
  /** Overrides auto-dismiss; pass null to pin the notification until dismissed or replaced. */
  autoDismiss(ms: number | null): AppEventBuilder
  /** Pins the notification to a fixed id so re-emits replace the previous one (progress-style flows). */
  noticeId(value: string): AppEventBuilder
  /** Attaches a 0-100 progress value; pass null to clear the bar while keeping the notification. */
  progress(value: number | null): AppEventBuilder
  /** Marks the notification as an in-flight operation (spinner chrome). */
  loading(value?: boolean): AppEventBuilder
  dedupe(key: string, windowMs?: number): AppEventBuilder
  debugDiagnostics(enabled: boolean): AppEventBuilder
  emit(options?: { notify?: boolean; log?: boolean }): string | null
}

type AppEventRequest = {
  level: AppEventLevel
  title: string
  description?: string | null
  summary?: string | null
  note?: string | null
  error?: unknown
  dedupeKey?: string
  dedupeWindowMs?: number
  debugDiagnosticsEnabled?: boolean
  action?: NotificationAction
  autoDismissMs?: number | null
  noticeId?: string
  progress?: number | null
  loading?: boolean
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
      id?: string
      level: AppEventLevel
      title: string
      description?: string | null
      summary?: string | null
      note?: string | null
      action?: NotificationAction
      autoDismissMs?: number | null
      progress?: number | null
      loading?: boolean
    }) => string | null)
  | null = null
let consoleBridgeInstalled = false
let forwardingConsoleLog = false
const dedupeTimestamps = new Map<string, number>()

/** Configures the observability adapter used by app events and the console bridge. */
export function configureObservability(adapter: ObservabilityAdapter) {
  observabilityAdapter = adapter
  dedupeTimestamps.clear()
  installConsoleLogBridge()
}

/** Injects the UI notification publisher used by app events. */
export function setNotificationDispatcher(
  dispatcher:
    | ((request: {
        id?: string
        level: AppEventLevel
        title: string
        description?: string | null
        summary?: string | null
        note?: string | null
        action?: NotificationAction
        autoDismissMs?: number | null
        progress?: number | null
        loading?: boolean
      }) => string | null)
    | null,
) {
  notificationDispatcher = dispatcher
}

function shouldForceNotification(level: AppEventLevel) {
  return debugDiagnosticsEnabled && (level === 'warning' || level === 'error')
}

function shouldNotify({ level, notify }: AppEventRequest) {
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

function buildLogMessage({ title, description, logMessage, error }: AppEventRequest) {
  if (typeof logMessage === 'string' && logMessage.trim()) {
    return logMessage
  }
  if (error instanceof Error && (error.stack || error.message)) {
    return error.stack || error.message
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

/**
 * Reports a recovered/expected failure at debug level (log only, gated by debug diagnostics).
 * Use inside custom `.catch` handlers that keep their own fallback logic but must not stay silent.
 */
export function reportRecovered(error: unknown, operation?: string) {
  appEvent('debug', operation ? `Recovered async failure: ${operation}` : 'Recovered async failure')
    .error(error)
    .context({ source: 'observability-recovery', operation })
    .emit({ notify: false })
}

/**
 * Awaits `promise` and resolves to `fallback` when it rejects. The rejection is reported as a
 * debug-level app event (log only, gated by debug diagnostics) so expected fallbacks — optional
 * resources, best-effort cleanup — stay traceable without notifying the user.
 */
export async function orValue<T>(promise: Promise<T>, fallback: T, operation?: string): Promise<T> {
  try {
    return await promise
  } catch (error) {
    reportRecovered(error, operation)
    return fallback
  }
}

/** `orValue` shorthand returning `null` on rejection; for optional resource loads. */
export function orNull<T>(promise: Promise<T>, operation?: string): Promise<T | null> {
  return orValue(promise, null, operation)
}

/**
 * Swallows a fire-and-forget rejection after reporting it at debug level. Replaces
 * `void promise.catch(() => {})` on cancel/cleanup calls where failure has no user impact.
 */
export async function ignoreError(promise: Promise<unknown>, operation?: string): Promise<void> {
  await orValue(promise, undefined, operation)
}

/** Creates an app event builder; emit writes a log and optionally publishes a notification. */
export function appEvent(level: AppEventLevel, title: string): AppEventBuilder {
  const request: AppEventRequest = { level, title }
  return {
    description(value) {
      request.description = value
      return this
    },
    summary(value) {
      request.summary = value
      return this
    },
    note(value) {
      request.note = value
      return this
    },
    error(value) {
      request.error = value
      if (value instanceof Error) {
        request.keyValues = { ...request.keyValues, errorName: value.name }
        if (value.cause instanceof Error) {
          request.keyValues.errorCause = value.cause.message
        }
        if (!request.description) request.description = value.message
      } else {
        request.keyValues = { ...request.keyValues, errorMessage: String(value) }
      }
      return this
    },
    context(values) {
      request.keyValues = { ...request.keyValues, ...values }
      return this
    },
    logMessage(value) {
      request.logMessage = value
      return this
    },
    action(value) {
      request.action = value
      return this
    },
    autoDismiss(ms) {
      request.autoDismissMs = ms
      return this
    },
    noticeId(value) {
      request.noticeId = value
      return this
    },
    progress(value) {
      request.progress = value
      return this
    },
    loading(value = true) {
      request.loading = value
      return this
    },
    dedupe(key, windowMs = 5000) {
      request.dedupeKey = key
      request.dedupeWindowMs = windowMs
      return this
    },
    debugDiagnostics(enabled) {
      request.debugDiagnosticsEnabled = enabled
      return this
    },
    emit(options) {
      const now = performance.now()
      if (request.dedupeKey) {
        const previous = dedupeTimestamps.get(request.dedupeKey)
        if (previous !== undefined && now - previous < (request.dedupeWindowMs ?? 5000)) return null
        dedupeTimestamps.set(request.dedupeKey, now)
      }
      request.notify = options?.notify
      request.log = options?.log
      const debugDiagnosticsActive = request.debugDiagnosticsEnabled ?? debugDiagnosticsEnabled
      if (level === 'debug' && !debugDiagnosticsActive) return null
      if (request.log !== false) {
        writeFrontendLogSafely({ level: toLogLevel(level), message: buildLogMessage(request), keyValues: request.keyValues })
      }
      if (!shouldNotify(request)) return null
      return (
        notificationDispatcher?.({
          id: request.noticeId,
          level,
          title,
          description: request.description,
          summary: request.summary,
          note: request.note,
          action: request.action,
          autoDismissMs: request.autoDismissMs,
          progress: request.progress,
          loading: request.loading,
        }) ?? null
      )
    },
  }
}
