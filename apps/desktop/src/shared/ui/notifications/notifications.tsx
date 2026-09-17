import { useSyncExternalStore, type ReactNode } from 'react'
import { NotificationViewport } from './NotificationViewport'
import { playNotificationSound } from './notificationSounds'

export type NotificationLevel = 'success' | 'info' | 'debug' | 'warning' | 'error'
export type NotificationChipTone = NotificationLevel | 'neutral'
export type NotificationVariant = 'default' | 'diagnostic'
export type NotificationActionTone = 'default' | 'primary'

export type NotificationAction = {
  label: string
  callback: () => void | Promise<void>
  tone?: NotificationActionTone
  closeOnClick?: boolean
}

export type PublishedNotificationAction = {
  label: string
  callback: () => void | Promise<void>
  tone: NotificationActionTone
  closeOnClick: boolean
}

export type NotificationChip = {
  label: string
  tone?: NotificationChipTone
}

export type PublishedNotificationChip = {
  label: string
  tone: NotificationChipTone
}

export type PublishNotificationRequest = {
  id?: string
  level: NotificationLevel
  variant?: NotificationVariant
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  summary?: string | null
  description?: string | null
  note?: string | null
  chips?: NotificationChip[]
  secondaryAction?: NotificationAction
  action?: NotificationAction
  autoDismissMs?: number | null
  progress?: number | null
  /** Shows an activity indicator for a notification backed by an active task. */
  loading?: boolean
}

export type PublishedNotification = {
  id: string
  level: NotificationLevel
  variant: NotificationVariant
  eyebrow: string | null
  title: string
  subtitle: string | null
  summary: string | null
  description: string | null
  note: string | null
  chips: PublishedNotificationChip[]
  secondaryAction?: PublishedNotificationAction
  action?: PublishedNotificationAction
  autoDismissMs: number | null
  progress: number | null
  loading: boolean
  /** Unread marker consumed by the notification center badge and highlights. */
  unread: boolean
  /**
   * The toast already auto-expired; the record is kept for the notification
   * center history but no longer renders in the viewport stack.
   */
  toastExpired: boolean
  /** Wall-clock publish time (ms) used for center ordering and relative times. */
  publishedAt: number
}

/** The notification center keeps a bounded recent-history log of records. */
const MAX_NOTIFICATION_LOG = 50

const DEFAULT_TRANSIENT_AUTO_DISMISS_MS = 5_000
const listeners = new Set<() => void>()

let notificationState: PublishedNotification[] = []
let notificationSequence = 0

function emitNotifications() {
  listeners.forEach((listener) => listener())
}

function subscribeNotifications(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getNotificationSnapshot() {
  return notificationState
}

function normalizeAutoDismiss(level: NotificationLevel, autoDismissMs?: number | null) {
  if (autoDismissMs === null) {
    return null
  }

  if (level === 'warning' || level === 'error') {
    return null
  }

  if (typeof autoDismissMs === 'number' && Number.isFinite(autoDismissMs) && autoDismissMs >= 0) {
    return autoDismissMs
  }

  return DEFAULT_TRANSIENT_AUTO_DISMISS_MS
}

function normalizeProgress(progress?: number | null) {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    return null
  }

  return Math.max(0, Math.min(100, progress))
}

function normalizeText(value?: string | null) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : null
}

function normalizeChips(chips?: NotificationChip[]) {
  return (chips ?? [])
    .map((chip) => ({
      label: chip.label.trim(),
      tone: chip.tone ?? 'neutral',
    }))
    .filter((chip) => chip.label.length > 0)
}

function normalizeAction(action?: NotificationAction) {
  if (!action) {
    return undefined
  }

  return {
    ...action,
    label: action.label.trim(),
    tone: action.tone ?? 'default',
    closeOnClick: action.closeOnClick ?? true,
  }
}

export function publishNotification(request: PublishNotificationRequest) {
  const id = request.id?.trim() || `notification-${++notificationSequence}`
  const notification: PublishedNotification = {
    id,
    level: request.level,
    variant: request.variant ?? 'default',
    eyebrow: normalizeText(request.eyebrow),
    title: request.title,
    subtitle: normalizeText(request.subtitle),
    summary: normalizeText(request.summary),
    description: normalizeText(request.description),
    note: normalizeText(request.note),
    chips: normalizeChips(request.chips),
    secondaryAction: normalizeAction(request.secondaryAction),
    action: normalizeAction(request.action),
    autoDismissMs: normalizeAutoDismiss(request.level, request.autoDismissMs),
    progress: normalizeProgress(request.progress),
    loading: request.loading ?? false,
    unread: true,
    toastExpired: false,
    publishedAt: Date.now(),
  }

  const existingIndex = notificationState.findIndex((item) => item.id === id)
  notificationState =
    existingIndex === -1
      ? [...notificationState, notification].slice(-MAX_NOTIFICATION_LOG)
      : notificationState.map((item, index) => (index === existingIndex ? notification : item))
  if (existingIndex === -1) {
    playNotificationSound(notification.level)
  }
  emitNotifications()
  return id
}

export function dismissNotification(id: string) {
  const nextState = notificationState.filter((item) => item.id !== id)
  if (nextState.length === notificationState.length) {
    return
  }

  notificationState = nextState
  emitNotifications()
}

/** Retires an auto-dismissed toast without deleting its record from the center history. */
export function expireNotificationToast(id: string) {
  const existing = notificationState.find((item) => item.id === id)
  if (!existing || existing.toastExpired) {
    return
  }

  notificationState = notificationState.map((item) => (item.id === id ? { ...item, toastExpired: true } : item))
  emitNotifications()
}

/** Clears every unread marker once the notification center has been opened. */
export function markNotificationsSeen() {
  if (!notificationState.some((item) => item.unread)) {
    return
  }

  notificationState = notificationState.map((item) => (item.unread ? { ...item, unread: false } : item))
  emitNotifications()
}

/** Marks a single notification read (e.g. after its center row was activated). */
export function markNotificationRead(id: string) {
  const existing = notificationState.find((item) => item.id === id)
  if (!existing || !existing.unread) {
    return
  }

  notificationState = notificationState.map((item) => (item.id === id ? { ...item, unread: false } : item))
  emitNotifications()
}

export function clearNotifications() {
  if (!notificationState.length) {
    return
  }

  notificationState = []
  emitNotifications()
}

export function getUnreadNotificationCount() {
  return notificationState.reduce((total, item) => (item.unread ? total + 1 : total), 0)
}

export function useUnreadNotificationCount() {
  return useSyncExternalStore(subscribeNotifications, getUnreadNotificationCount, getUnreadNotificationCount)
}

/** Full recent-history log (newest last), including toasts that already expired. */
export function useNotificationLog() {
  return useSyncExternalStore(subscribeNotifications, getNotificationSnapshot, getNotificationSnapshot)
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notifications = useSyncExternalStore(subscribeNotifications, getNotificationSnapshot, getNotificationSnapshot)
  // Expired toasts stay in the log for the notification center but leave the viewport.
  const activeNotifications = notifications.filter((item) => !item.toastExpired)

  return (
    <>
      {children}
      <NotificationViewport notifications={activeNotifications} onDismiss={dismissNotification} onExpire={expireNotificationToast} />
    </>
  )
}
