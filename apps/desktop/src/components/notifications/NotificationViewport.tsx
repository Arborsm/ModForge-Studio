import { Bug, CheckCircle2, CircleAlert, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNotificationCopy } from '../../lib/app/localeContext'
import type { PublishedNotification } from '../../lib/app/notifications'

type NotificationViewportProps = {
  notifications: PublishedNotification[]
  onDismiss: (id: string) => void
}

const EXIT_ANIMATION_MS = 220
const COLLAPSE_DELAY_MS = 120
const MAX_STACKED_NOTIFICATIONS = 5
const STACK_OFFSET_PX = 8
const STACK_EXPANDED_OFFSET_PX = 76
const STACK_SCALE_STEP = 0.1
const STACK_OPACITY_STEP = 0.14
const MIN_STACK_SCALE = 0.6
const MIN_STACK_OPACITY = 0.38

function NotificationIcon({ level }: { level: PublishedNotification['level'] }) {
  if (level === 'success') {
    return <CheckCircle2 className="h-5 w-5" />
  }

  if (level === 'info') {
    return <Info className="h-5 w-5" />
  }

  if (level === 'debug') {
    return <Bug className="h-5 w-5" />
  }

  if (level === 'warning') {
    return <TriangleAlert className="h-5 w-5" />
  }

  if (level === 'error') {
    return <CircleX className="h-5 w-5" />
  }

  return <CircleAlert className="h-5 w-5" />
}

function NotificationToast({
  notification,
  dismissLabel,
  actionHint,
  levelLabel,
  onDismiss,
}: {
  notification: PublishedNotification
  dismissLabel: string
  actionHint: string
  levelLabel: string
  onDismiss: (id: string) => void
}) {
  const [hovering, setHovering] = useState(false)
  const [closing, setClosing] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const requestClose = () => {
    setClosing((current) => {
      if (current) {
        return current
      }

      return true
    })
  }

  useEffect(() => {
    if (notification.autoDismissMs === null || closing) {
      return
    }

    timeoutRef.current = window.setTimeout(() => {
      requestClose()
    }, notification.autoDismissMs)

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [closing, notification.autoDismissMs])

  useEffect(() => {
    if (!closing) {
      return
    }

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const handle = window.setTimeout(() => {
      onDismiss(notification.id)
    }, EXIT_ANIMATION_MS)

    return () => {
      window.clearTimeout(handle)
    }
  }, [closing, notification.id, onDismiss])

  const handleMouseEnter = () => {
    setHovering(true)
  }

  const handleMouseLeave = () => {
    setHovering(false)
  }

  const handleActionClick = () => {
    if (!notification.action) {
      return
    }

    void notification.action.callback()
    requestClose()
  }

  const levelClassName = `level-${notification.level}`
  const explicitProgress = notification.progress
  const showProgress = explicitProgress !== null || notification.autoDismissMs !== null

  return (
    <article
      className={`notification-toast ${levelClassName}${closing ? ' is-closing' : ''}`}
      role="status"
      aria-live={notification.level === 'error' ? 'assertive' : 'polite'}
      aria-label={`${levelLabel}: ${notification.title}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="notification-toast-icon" aria-hidden="true">
        <NotificationIcon level={notification.level} />
      </div>

      <div className="notification-toast-body">
        <p className="notification-toast-title">{notification.title}</p>
        {notification.description ? <p className="notification-toast-description">{notification.description}</p> : null}
        {notification.action ? (
          <button type="button" className="notification-toast-action" onClick={handleActionClick} title={actionHint}>
            {notification.action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className="notification-toast-close"
        aria-label={dismissLabel}
        title={dismissLabel}
        onClick={requestClose}
      >
        <X className="h-4 w-4" />
      </button>

      {showProgress ? (
        <div className="notification-toast-progress-track" aria-hidden="true">
          <div
            className="notification-toast-progress"
            style={
              explicitProgress !== null
                ? {
                    width: `${explicitProgress}%`,
                    animation: 'none',
                  }
                : {
                    animationDuration: `${notification.autoDismissMs}ms`,
                    animationPlayState: hovering ? 'paused' : 'running',
                  }
            }
          />
        </div>
      ) : null}
    </article>
  )
}

export function NotificationViewport({ notifications, onDismiss }: NotificationViewportProps) {
  const copy = useNotificationCopy()
  const viewportRef = useRef<HTMLElement | null>(null)
  const collapseTimeoutRef = useRef<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const visibleNotifications = notifications.slice(-MAX_STACKED_NOTIFICATIONS)

  const cancelPendingCollapse = () => {
    if (collapseTimeoutRef.current !== null) {
      window.clearTimeout(collapseTimeoutRef.current)
      collapseTimeoutRef.current = null
    }
  }

  const requestExpand = () => {
    cancelPendingCollapse()
    setExpanded(true)
  }

  const requestCollapse = () => {
    cancelPendingCollapse()
    collapseTimeoutRef.current = window.setTimeout(() => {
      setExpanded(false)
      collapseTimeoutRef.current = null
    }, COLLAPSE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      cancelPendingCollapse()
    }
  }, [])

  if (!visibleNotifications.length) {
    return null
  }

  return (
    <section
      ref={viewportRef}
      className="notification-viewport"
      role="region"
      tabIndex={-1}
      aria-label={copy.viewportLabel}
      data-expanded={expanded ? 'true' : 'false'}
      onMouseEnter={requestExpand}
      onMouseLeave={requestCollapse}
      onFocusCapture={requestExpand}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget
        if (nextFocused instanceof Node && viewportRef.current?.contains(nextFocused)) {
          return
        }

        requestCollapse()
      }}
    >
      <div className="notification-hover-region" aria-hidden="true" />
      {visibleNotifications.map((notification, index) => {
        const stackIndex = visibleNotifications.length - 1 - index
        const stackOffsetPx = expanded ? STACK_EXPANDED_OFFSET_PX : STACK_OFFSET_PX
        const stackStyle = {
          bottom: `${stackIndex * stackOffsetPx}px`,
          zIndex: visibleNotifications.length - stackIndex,
          '--notification-stack-scale': expanded ? '1' : `${Math.max(MIN_STACK_SCALE, 1 - stackIndex * STACK_SCALE_STEP)}`,
          '--notification-stack-opacity': `${Math.max(MIN_STACK_OPACITY, 1 - stackIndex * STACK_OPACITY_STEP)}`,
        } as CSSProperties

        return (
          <div
            key={notification.id}
            className="notification-stack-item"
            data-stack-index={stackIndex}
            data-front={stackIndex === 0 ? 'true' : 'false'}
            style={stackStyle}
          >
            <NotificationToast
              notification={notification}
              dismissLabel={copy.dismissLabel}
              actionHint={copy.actionHint}
              levelLabel={copy.levels[notification.level]}
              onDismiss={onDismiss}
            />
          </div>
        )
      })}
    </section>
  )
}
