/**
 * @file Notification center: bounded recent + unread history rendered inside the
 * desktop bell float and (Phase 4) the mobile notifications page.
 */

import { useEffect, useState } from 'react'
import { useNotificationCopy } from '@locales/provider'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { NotificationIcon } from './NotificationViewport'
import { clearNotifications, markNotificationRead, useNotificationLog } from './notifications'
import type { PublishedNotification } from './notifications'

const RELATIVE_TIME_REFRESH_MS = 30_000

function getLevelIconClassName(level: PublishedNotification['level']) {
  return `notification-center-item-icon level-${level}`
}

function getChipClassName(tone: PublishedNotification['chips'][number]['tone']) {
  return `notification-toast-chip notification-toast-chip-${tone}`
}

function getActionButtonClassName(tone: NonNullable<PublishedNotification['action']>['tone']) {
  return `notification-center-item-action notification-center-item-action-${tone}`
}

function formatRelativeTime(publishedAt: number, locale: string, now: number) {
  const relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diffSeconds = Math.round((publishedAt - now) / 1000)
  if (Math.abs(diffSeconds) < 60) {
    return relativeFormat.format(diffSeconds, 'second')
  }

  const diffMinutes = Math.round(diffSeconds / 60)
  if (Math.abs(diffMinutes) < 60) {
    return relativeFormat.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return relativeFormat.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  if (Math.abs(diffDays) < 30) {
    return relativeFormat.format(diffDays, 'day')
  }

  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(publishedAt))
}

type NotificationCenterProps = {
  /** Renders the title + clear-all header row; the mobile page shell supplies its own header instead. */
  showHeader?: boolean
  /** Invoked after an action with `closeOnClick` runs (closes the mobile page). */
  onAfterCloseOnClickAction?: () => void
}

/**
 * Recent notification history (newest first) with unread highlights, level
 * glyphs, relative times, and replayable actions; toasts keep their own viewport.
 */
export function NotificationCenter({ showHeader = true, onAfterCloseOnClickAction }: NotificationCenterProps = {}) {
  const copy = useNotificationCopy()
  const locale = usePreferencesStore((state) => state.locale)
  const notifications = useNotificationLog()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS)
    return () => {
      window.clearInterval(handle)
    }
  }, [])

  const orderedNotifications = [...notifications].reverse()
  const handleAction = (notification: PublishedNotification, action: NonNullable<PublishedNotification['action']>) => {
    void action.callback()
    markNotificationRead(notification.id)
    if (action.closeOnClick) {
      onAfterCloseOnClickAction?.()
    }
  }

  return (
    <div className="notification-center">
      {showHeader ? (
        <div className="notification-center-header">
          <p className="notification-center-title">{copy.centerTitle}</p>
          <button type="button" className="notification-center-clear" onClick={clearNotifications} disabled={!orderedNotifications.length}>
            {copy.centerClearAll}
          </button>
        </div>
      ) : null}

      {orderedNotifications.length ? (
        <div className="notification-center-list">
          {orderedNotifications.map((notification) => (
            <article
              key={notification.id}
              className={`notification-center-item${notification.unread ? ' is-unread' : ''}`}
              onClick={() => {
                markNotificationRead(notification.id)
              }}
            >
              <span className={getLevelIconClassName(notification.level)} aria-hidden="true">
                <NotificationIcon level={notification.level} loading={notification.loading} />
              </span>

              <div className="notification-center-item-body">
                <div className="notification-center-item-title-row">
                  <p className="notification-center-item-title">{notification.title}</p>
                  <span className="notification-center-item-time">{formatRelativeTime(notification.publishedAt, locale, now)}</span>
                </div>
                {notification.summary ? <p className="notification-center-item-desc">{notification.summary}</p> : null}
                {notification.description ? <p className="notification-center-item-desc">{notification.description}</p> : null}
                {notification.chips.length ? (
                  <div className="notification-center-item-chips">
                    {notification.chips.map((chip) => (
                      <span key={`${notification.id}-${chip.label}`} className={getChipClassName(chip.tone)}>
                        <span className="notification-toast-chip-dot" aria-hidden="true" />
                        <span>{chip.label}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {notification.note ? <p className="notification-center-item-desc is-note">{notification.note}</p> : null}
                {notification.action || notification.secondaryAction ? (
                  <div className="notification-center-item-actions">
                    {[notification.secondaryAction, notification.action]
                      .filter((action): action is NonNullable<PublishedNotification['action']> => action != null)
                      .map((action) => (
                        <button
                          key={`${notification.id}-${action.label}`}
                          type="button"
                          className={getActionButtonClassName(action.tone)}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleAction(notification, action)
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>

              {notification.unread ? <span className="notification-center-item-dot" aria-hidden="true" /> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="notification-center-empty">{copy.centerEmpty}</p>
      )}
    </div>
  )
}
