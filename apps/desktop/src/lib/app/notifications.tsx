/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import { NotificationViewport } from '../../components/notifications/NotificationViewport'
import { playNotificationSound } from './notificationSounds'

export type NotificationLevel = 'success' | 'info' | 'debug' | 'warning' | 'error'

export type NotificationAction = {
  label: string
  callback: () => void | Promise<void>
}

export type PublishNotificationRequest = {
  id?: string
  level: NotificationLevel
  title: string
  description?: string | null
  action?: NotificationAction
  autoDismissMs?: number | null
  progress?: number | null
}

export type PublishedNotification = {
  id: string
  level: NotificationLevel
  title: string
  description: string | null
  action?: NotificationAction
  autoDismissMs: number | null
  progress: number | null
}

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

export function publishNotification(request: PublishNotificationRequest) {
  const id = request.id?.trim() || `notification-${++notificationSequence}`
  const notification: PublishedNotification = {
    id,
    level: request.level,
    title: request.title,
    description: request.description ?? null,
    action: request.action,
    autoDismissMs: normalizeAutoDismiss(request.level, request.autoDismissMs),
    progress: normalizeProgress(request.progress),
  }

  const existingIndex = notificationState.findIndex((item) => item.id === id)
  notificationState =
    existingIndex === -1
      ? [...notificationState, notification]
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

export function clearNotifications() {
  if (!notificationState.length) {
    return
  }

  notificationState = []
  emitNotifications()
}

const NotificationDispatchContext = createContext<typeof publishNotification | null>(null)

export function useNotificationPublisher() {
  return useContext(NotificationDispatchContext) ?? publishNotification
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notifications = useSyncExternalStore(subscribeNotifications, getNotificationSnapshot, getNotificationSnapshot)

  return (
    <NotificationDispatchContext.Provider value={publishNotification}>
      {children}
      <NotificationViewport notifications={notifications} onDismiss={dismissNotification} />
    </NotificationDispatchContext.Provider>
  )
}
