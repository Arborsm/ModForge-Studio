import { Bug, CheckCircle2, CircleAlert, CircleX, Info, TriangleAlert, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNotificationCopy } from '@locales/localeContext'
import type { PublishedNotification } from './notifications'

type NotificationViewportProps = {
  notifications: PublishedNotification[]
  onDismiss: (id: string) => void
}

const EXIT_ANIMATION_MS = 220
const COLLAPSE_DELAY_MS = 120
const MAX_STACKED_NOTIFICATIONS = 5
const STACK_OFFSET_PX = 8
const STACK_EXPANDED_GAP_PX = 8
const STACK_EXPANDED_OFFSET_PX = 76
const STACK_HOVER_REGION_MIN_HEIGHT_PX = 88
const STACK_OPACITY_STEP = 0.14
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

function getNotificationChipClassName(tone: PublishedNotification['chips'][number]['tone']) {
  return `notification-toast-chip notification-toast-chip-${tone}`
}

function getNotificationActionButtonClassName(
  tone: NonNullable<PublishedNotification['action']>['tone'],
) {
  return `notification-toast-action-button notification-toast-action-button-${tone}`
}

function NotificationToast({
  notification,
  dismissLabel,
  actionHint,
  levelLabel,
  onDismiss,
  toastRef,
}: {
  notification: PublishedNotification
  dismissLabel: string
  actionHint: string
  levelLabel: string
  onDismiss: (id: string) => void
  toastRef?: (node: HTMLElement | null) => void
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

  const handleActionClick = (action: NonNullable<PublishedNotification['action']> | undefined) => {
    if (!action) {
      return
    }

    void action.callback()
    if (action.closeOnClick) {
      requestClose()
    }
  }

  const levelClassName = `level-${notification.level}`
  const structuredContent = Boolean(
    notification.eyebrow ||
      notification.subtitle ||
      notification.summary ||
      notification.note ||
      notification.chips.length ||
      notification.variant === 'diagnostic',
  )
  const actionButtons = [notification.secondaryAction, notification.action].filter(
    (action): action is NonNullable<PublishedNotification['action']> => action != null,
  )
  const explicitProgress = notification.progress
  const showProgress = explicitProgress !== null || notification.autoDismissMs !== null

  return (
    <article
      ref={toastRef}
      className={`notification-toast ${levelClassName} notification-toast-variant-${notification.variant}${structuredContent ? ' notification-toast-structured' : ''}${closing ? ' is-closing' : ''}`}
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
        {notification.eyebrow ? <p className="notification-toast-eyebrow">{notification.eyebrow}</p> : null}
        <p className="notification-toast-title">{notification.title}</p>
        {notification.subtitle ? <p className="notification-toast-subtitle">{notification.subtitle}</p> : null}
        {notification.summary ? <p className="notification-toast-summary">{notification.summary}</p> : null}
        {notification.description ? <p className="notification-toast-description">{notification.description}</p> : null}
        {notification.chips.length ? (
          <div className="notification-toast-chip-list">
            {notification.chips.map((chip) => (
              <span key={`${notification.id}-${chip.label}`} className={getNotificationChipClassName(chip.tone)}>
                <span className="notification-toast-chip-dot" aria-hidden="true" />
                <span>{chip.label}</span>
              </span>
            ))}
          </div>
        ) : null}
        {notification.note ? <p className="notification-toast-note">{notification.note}</p> : null}
        {notification.variant === 'diagnostic' && actionButtons.length ? (
          <div className="notification-toast-action-row">
            {actionButtons.map((action) => (
              <button
                key={`${notification.id}-${action.label}`}
                type="button"
                className={getNotificationActionButtonClassName(action.tone)}
                onClick={() => handleActionClick(action)}
                title={actionHint}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
        {notification.variant !== 'diagnostic' && notification.action ? (
          <button
            type="button"
            className="notification-toast-action"
            onClick={() => handleActionClick(notification.action)}
            title={actionHint}
          >
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
  const toastRefs = useRef<Record<string, HTMLElement | null>>({})
  const [expanded, setExpanded] = useState(false)
  const [toastHeights, setToastHeights] = useState<Record<string, number>>({})
  const [toastWidths, setToastWidths] = useState<Record<string, number>>({})
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

  useLayoutEffect(() => {
    const measuredNotifications = notifications.slice(-MAX_STACKED_NOTIFICATIONS)

    const measure = () => {
      setToastWidths((currentWidths) => {
        let changed = false
        const nextWidths: Record<string, number> = {}

        for (const notification of measuredNotifications) {
          const measuredWidth = Math.round(toastRefs.current[notification.id]?.getBoundingClientRect().width ?? 0)
          if (measuredWidth > 0) {
            nextWidths[notification.id] = measuredWidth
          }

          if (nextWidths[notification.id] !== currentWidths[notification.id]) {
            changed = true
          }
        }

        if (Object.keys(currentWidths).length !== Object.keys(nextWidths).length) {
          changed = true
        }

        return changed ? nextWidths : currentWidths
      })

      setToastHeights((currentHeights) => {
        let changed = false
        const nextHeights: Record<string, number> = {}

        for (const notification of measuredNotifications) {
          const measuredHeight = Math.round(toastRefs.current[notification.id]?.getBoundingClientRect().height ?? 0)
          if (measuredHeight > 0) {
            nextHeights[notification.id] = measuredHeight
          }

          if (nextHeights[notification.id] !== currentHeights[notification.id]) {
            changed = true
          }
        }

        if (Object.keys(currentHeights).length !== Object.keys(nextHeights).length) {
          changed = true
        }

        return changed ? nextHeights : currentHeights
      })
    }

    measure()
    window.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [notifications])

  if (!visibleNotifications.length) {
    return null
  }

  const getExpandedStackHeight = (notificationId: string) => toastHeights[notificationId] ?? STACK_EXPANDED_OFFSET_PX
  const frontOrderedNotifications = [...visibleNotifications].reverse()
  const expandedOffsets = frontOrderedNotifications.map((_, index) => {
    if (index === 0) {
      return 0
    }

    return frontOrderedNotifications
      .slice(0, index)
      .reduce(
        (total, currentNotification) => total + getExpandedStackHeight(currentNotification.id) + STACK_EXPANDED_GAP_PX,
        0,
      )
  })
  const frontNotificationHeight = Math.max(toastHeights[frontOrderedNotifications[0]?.id] ?? 0, STACK_HOVER_REGION_MIN_HEIGHT_PX)
  const frontNotificationMeasuredHeight = toastHeights[frontOrderedNotifications[0]?.id] ?? null
  const frontNotificationWidth = toastWidths[frontOrderedNotifications[0]?.id] ?? null
  const widestNotificationWidth = Math.max(0, ...frontOrderedNotifications.map((notification) => toastWidths[notification.id] ?? 0))
  const topNotification = frontOrderedNotifications[frontOrderedNotifications.length - 1]
  const topNotificationHeight = topNotification ? getExpandedStackHeight(topNotification.id) : STACK_HOVER_REGION_MIN_HEIGHT_PX
  const expandedHoverRegionHeight = Math.max(
    STACK_HOVER_REGION_MIN_HEIGHT_PX,
    (expandedOffsets[expandedOffsets.length - 1] ?? 0) + topNotificationHeight,
  )
  const hoverRegionHeight = expanded ? expandedHoverRegionHeight : frontNotificationHeight
  const hoverRegionWidth = widestNotificationWidth || frontNotificationWidth

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
      <div
        className="notification-hover-region"
        aria-hidden="true"
        style={{
          height: `${hoverRegionHeight}px`,
          width: hoverRegionWidth ? `${hoverRegionWidth}px` : undefined,
        }}
      />
      {visibleNotifications.map((notification, index) => {
        const stackIndex = visibleNotifications.length - 1 - index
        const measuredWidth = toastWidths[notification.id] ?? null
        const stackWidth = expanded
          ? stackIndex === 0
            ? null
            : (measuredWidth ?? frontNotificationWidth)
          : stackIndex === 0
            ? null
            : frontNotificationWidth
        const stackHeight = expanded ? null : stackIndex === 0 ? null : frontNotificationMeasuredHeight
        const heightClipped = !expanded && stackIndex > 0 && stackHeight !== null
        const stackStyle = {
          bottom: expanded ? `${expandedOffsets[stackIndex] ?? 0}px` : `${stackIndex * STACK_OFFSET_PX}px`,
          height: stackHeight !== null ? `${stackHeight}px` : undefined,
          width: stackWidth !== null ? `${stackWidth}px` : undefined,
          zIndex: visibleNotifications.length - stackIndex,
          '--notification-stack-opacity': `${Math.max(MIN_STACK_OPACITY, 1 - stackIndex * STACK_OPACITY_STEP)}`,
        } as CSSProperties

        return (
          <div
            key={notification.id}
            className="notification-stack-item"
            data-stack-index={stackIndex}
            data-front={stackIndex === 0 ? 'true' : 'false'}
            data-height-clipped={heightClipped ? 'true' : 'false'}
            data-width-controlled={stackWidth !== null ? 'true' : 'false'}
            style={stackStyle}
          >
            <NotificationToast
              notification={notification}
              dismissLabel={copy.dismissLabel}
              actionHint={copy.actionHint}
              levelLabel={copy.levels[notification.level]}
              onDismiss={onDismiss}
              toastRef={(node) => {
                toastRefs.current[notification.id] = node
              }}
            />
          </div>
        )
      })}
    </section>
  )
}
