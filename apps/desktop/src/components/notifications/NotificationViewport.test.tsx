import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../lib/app/localeContext'
import { NotificationProvider, clearNotifications, publishNotification } from '../../lib/app/notifications'

function renderNotifications() {
  return render(
    <LocaleProvider locale="en-US">
      <NotificationProvider>
        <div>Test Host</div>
      </NotificationProvider>
    </LocaleProvider>,
  )
}

describe('NotificationProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearNotifications()
  })

  afterEach(() => {
    cleanup()
    clearNotifications()
    vi.useRealTimers()
  })

  it('auto-dismisses success notifications and shows a progress indicator', () => {
    const { container } = renderNotifications()

    act(() => {
      publishNotification({
        level: 'success',
        title: 'Settings saved',
        description: 'Launcher settings are synced.',
        autoDismissMs: 1_000,
      })
    })

    expect(screen.getByText('Settings saved')).toBeTruthy()
    expect(screen.getByText('Launcher settings are synced.')).toBeTruthy()
    expect(container.querySelector('.notification-toast-progress')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByText('Settings saved')).toBeNull()
  })

  it('renders an explicit progress value without auto-dismiss animation and updates in place', () => {
    const { container } = renderNotifications()

    act(() => {
      publishNotification({
        id: 'resource-preload',
        level: 'info',
        title: 'Preloading resources',
        description: 'Maps/Town.tmx',
        autoDismissMs: null,
        progress: 40,
      })
    })

    const initialProgress = container.querySelector('.notification-toast-progress')
    expect(initialProgress?.getAttribute('style')).toContain('width: 40%')
    expect(initialProgress?.getAttribute('style')).toContain('animation: none')

    act(() => {
      publishNotification({
        id: 'resource-preload',
        level: 'info',
        title: 'Preloading resources',
        description: 'Maps/Farm.tmx',
        autoDismissMs: null,
        progress: 75,
      })
    })

    expect(screen.queryByText('Maps/Town.tmx')).toBeNull()
    expect(screen.getByText('Maps/Farm.tmx')).toBeTruthy()
    expect(screen.getAllByText('Preloading resources')).toHaveLength(1)
    expect(container.querySelector('.notification-toast-progress')?.getAttribute('style')).toContain('width: 75%')

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByText('Preloading resources')).toBeTruthy()
  })

  it('auto-dismisses info and debug notifications by default', () => {
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'info',
        title: 'Library refreshed',
        autoDismissMs: 800,
      })
      publishNotification({
        level: 'debug',
        title: 'Diagnostics synced',
        autoDismissMs: 800,
      })
    })

    expect(screen.getByText('Library refreshed')).toBeTruthy()
    expect(screen.getByText('Diagnostics synced')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(800)
    })

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByText('Library refreshed')).toBeNull()
    expect(screen.queryByText('Diagnostics synced')).toBeNull()
  })

  it('keeps warning and error notifications until dismissed', () => {
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'warning',
        title: 'Missing dependency',
      })
      publishNotification({
        level: 'error',
        title: 'Export failed',
      })
    })

    act(() => {
      vi.advanceTimersByTime(20_000)
    })

    expect(screen.getByText('Missing dependency')).toBeTruthy()
    expect(screen.getByText('Export failed')).toBeTruthy()
  })

  it('runs optional actions and allows manual dismissal', () => {
    const onRetry = vi.fn()
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'error',
        title: 'Export failed',
        action: {
          label: 'Retry export',
          callback: onRetry,
        },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Retry export' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByText('Export failed')).toBeNull()
  })

  it('stacks newer notifications above older ones with queue offsets', () => {
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'info',
        title: 'First notification',
      })
      publishNotification({
        level: 'info',
        title: 'Second notification',
      })
      publishNotification({
        level: 'info',
        title: 'Third notification',
      })
    })

    const first = screen.getByText('First notification').closest('.notification-stack-item')
    const second = screen.getByText('Second notification').closest('.notification-stack-item')
    const third = screen.getByText('Third notification').closest('.notification-stack-item')

    expect(first?.getAttribute('data-stack-index')).toBe('2')
    expect(second?.getAttribute('data-stack-index')).toBe('1')
    expect(third?.getAttribute('data-stack-index')).toBe('0')
    expect(first?.getAttribute('style')).toContain('bottom: 16px')
    expect(second?.getAttribute('style')).toContain('bottom: 8px')
    expect(third?.getAttribute('style')).toContain('bottom: 0px')
  })

  it('expands the stacked column upward while hovered and only collapses after a short leave delay', () => {
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'info',
        title: 'First notification',
      })
      publishNotification({
        level: 'info',
        title: 'Second notification',
      })
      publishNotification({
        level: 'info',
        title: 'Third notification',
      })
    })

    const viewport = screen.getByRole('region', { name: 'Notifications' })
    const first = screen.getByText('First notification').closest('.notification-stack-item')
    const second = screen.getByText('Second notification').closest('.notification-stack-item')

    expect(first?.getAttribute('style')).toContain('bottom: 16px')
    expect(second?.getAttribute('style')).toContain('bottom: 8px')

    fireEvent.mouseEnter(viewport)

    expect(first?.getAttribute('style')).toContain('bottom: 152px')
    expect(second?.getAttribute('style')).toContain('bottom: 76px')
    expect(first?.getAttribute('style')).toContain('--notification-stack-scale: 1')
    expect(second?.getAttribute('style')).toContain('--notification-stack-scale: 1')

    fireEvent.mouseLeave(viewport)

    expect(first?.getAttribute('style')).toContain('bottom: 152px')
    expect(second?.getAttribute('style')).toContain('bottom: 76px')

    act(() => {
      vi.advanceTimersByTime(119)
    })

    expect(first?.getAttribute('style')).toContain('bottom: 152px')
    expect(second?.getAttribute('style')).toContain('bottom: 76px')

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(first?.getAttribute('style')).toContain('bottom: 16px')
    expect(second?.getAttribute('style')).toContain('bottom: 8px')
  })

  it('styles notifications with shared theme tokens', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/features/notifications.css'), 'utf8')

    expect(stylesheet).toContain('var(--bg-panel)')
    expect(stylesheet).toContain('var(--text-primary)')
    expect(stylesheet).toContain('var(--text-secondary)')
    expect(stylesheet).toContain('var(--border-color)')
    expect(stylesheet).toContain('.notification-stack-item')
    expect(stylesheet).toContain('scaleX(var(--notification-stack-scale))')
    expect(stylesheet).toContain('data-expanded="true"')
    expect(stylesheet).toContain('.notification-toast-close')
    expect(stylesheet).toContain('grid-template-columns: auto 1fr auto;')
    expect(stylesheet).toContain('width: 1.65rem;')
    expect(stylesheet).toContain('height: 1.65rem;')
    expect(stylesheet).toContain('border-radius: 8px;')
    expect(stylesheet).toContain('transform: translateY(-2px);')
    expect(stylesheet).toContain('transition:')
  })

  it('does not reserve an invisible hover band above the notification stack', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/features/notifications.css'), 'utf8')

    expect(stylesheet).toContain('.notification-viewport {')
    expect(stylesheet).toContain('height: 0;')
    expect(stylesheet).not.toContain('min-height: 4rem;')
  })

  it('uses a stable hover capture region so stack motion does not retrigger enter and leave', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/features/notifications.css'), 'utf8')

    expect(stylesheet).toContain('.notification-hover-region')
    expect(stylesheet).toContain('pointer-events: auto;')
    expect(stylesheet).toContain('.notification-viewport[data-expanded="true"] .notification-hover-region')
  })
})
