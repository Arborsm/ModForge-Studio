import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@locales/localeContext'
import { NotificationProvider, clearNotifications, publishNotification } from './notifications'

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
    vi.restoreAllMocks()
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

  it('renders diagnostic notifications with an impact summary, compact route tags, and action buttons', () => {
    const onRetry = vi.fn()
    const onViewDetails = vi.fn()
    renderNotifications()

    act(() => {
      publishNotification({
        id: 'launcher-nexus-diagnostics',
        level: 'error',
        variant: 'diagnostic',
        title: 'Nexus Route Diagnostics Failed',
        summary: 'Impact: Discover / automatic updates paused.',
        description: '4 routes did not pass verification.',
        note: 'You can retry now, or open diagnostics to inspect the exact failures.',
        chips: [
          { label: 'GraphQL', tone: 'warning' },
          { label: 'HTML', tone: 'warning' },
          { label: 'Image CDN', tone: 'warning' },
          { label: 'SMAPI', tone: 'warning' },
        ],
        secondaryAction: {
          label: 'Retry now',
          callback: onRetry,
        },
        action: {
          label: 'View details',
          callback: onViewDetails,
          tone: 'primary',
        },
        autoDismissMs: null,
      })
    })

    const toast = screen.getByText('Nexus Route Diagnostics Failed').closest('.notification-toast')

    expect(toast?.className).toContain('notification-toast-variant-diagnostic')
    expect(screen.getByText('Nexus Route Diagnostics Failed')).toBeTruthy()
    expect(screen.getByText('Impact: Discover / automatic updates paused.')).toBeTruthy()
    expect(screen.getByText('4 routes did not pass verification.')).toBeTruthy()
    expect(screen.getByText('You can retry now, or open diagnostics to inspect the exact failures.')).toBeTruthy()

    expect(screen.getByText('GraphQL').closest('.notification-toast-chip')?.className).toContain('notification-toast-chip-warning')
    expect(screen.getByText('SMAPI').closest('.notification-toast-chip')?.className).toContain('notification-toast-chip-warning')

    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }))
    expect(onRetry).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    expect(onViewDetails).toHaveBeenCalledTimes(1)
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

  it('can keep a persistent notification open after running an action', () => {
    const onOpen = vi.fn()
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'warning',
        title: 'Nexus verification required',
        action: {
          label: 'Open Verification Window',
          callback: onOpen,
          closeOnClick: false,
        },
        autoDismissMs: null,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open Verification Window' }))
    expect(onOpen).toHaveBeenCalledTimes(1)

    expect(screen.getByText('Nexus verification required')).toBeTruthy()
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
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(16)
      return 1
    })

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
    const firstToast = screen.getByText('First notification').closest('.notification-toast') as HTMLElement
    const secondToast = screen.getByText('Second notification').closest('.notification-toast') as HTMLElement
    const thirdToast = screen.getByText('Third notification').closest('.notification-toast') as HTMLElement

    Object.defineProperty(firstToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 320,
        height: 120,
        top: 0,
        right: 0,
        bottom: 120,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(secondToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 360,
        height: 96,
        top: 0,
        right: 0,
        bottom: 96,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(thirdToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 420,
        height: 76,
        top: 0,
        right: 0,
        bottom: 76,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(first?.getAttribute('style')).toContain('bottom: 16px')
    expect(second?.getAttribute('style')).toContain('bottom: 8px')
    expect(first?.getAttribute('style')).toContain('height: 76px')
    expect(second?.getAttribute('style')).toContain('height: 76px')
    expect(first?.getAttribute('style')).toContain('width: 420px')
    expect(second?.getAttribute('style')).toContain('width: 420px')

    requestAnimationFrameSpy.mockRestore()

    fireEvent.mouseEnter(viewport)

    expect(first?.getAttribute('style')).toContain('bottom: 188px')
    expect(second?.getAttribute('style')).toContain('bottom: 84px')
    expect(first?.getAttribute('style')).not.toContain('height:')
    expect(second?.getAttribute('style')).not.toContain('height:')
    expect(first?.getAttribute('style')).toContain('width: 320px')
    expect(second?.getAttribute('style')).toContain('width: 360px')

    fireEvent.mouseLeave(viewport)

    expect(first?.getAttribute('style')).toContain('bottom: 188px')
    expect(second?.getAttribute('style')).toContain('bottom: 84px')

    act(() => {
      vi.advanceTimersByTime(119)
    })

    expect(first?.getAttribute('style')).toContain('bottom: 188px')
    expect(second?.getAttribute('style')).toContain('bottom: 84px')

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(first?.getAttribute('style')).toContain('bottom: 16px')
    expect(second?.getAttribute('style')).toContain('bottom: 8px')
    expect(first?.getAttribute('style')).toContain('height: 76px')
    expect(second?.getAttribute('style')).toContain('height: 76px')
    expect(first?.getAttribute('style')).toContain('width: 420px')
    expect(second?.getAttribute('style')).toContain('width: 420px')
  })

  it('uses measured notification heights when expanding a taller stacked card', () => {
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
        id: 'launcher-nexus-diagnostics',
        level: 'error',
        variant: 'diagnostic',
        title: 'Nexus Route Diagnostics Failed',
        summary: 'Impact: Discover / automatic updates paused.',
        description: '4 routes did not pass verification.',
        chips: [
          { label: 'GraphQL', tone: 'warning' },
          { label: 'HTML', tone: 'warning' },
          { label: 'Image CDN', tone: 'warning' },
          { label: 'SMAPI', tone: 'warning' },
        ],
        autoDismissMs: null,
      })
    })

    const viewport = screen.getByRole('region', { name: 'Notifications' })
    const first = screen.getByText('First notification').closest('.notification-stack-item')
    const second = screen.getByText('Second notification').closest('.notification-stack-item')
    const thirdToast = screen.getByText('Nexus Route Diagnostics Failed').closest('.notification-toast') as HTMLElement
    const secondToast = screen.getByText('Second notification').closest('.notification-toast') as HTMLElement

    Object.defineProperty(thirdToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 520,
        height: 160,
        top: 0,
        right: 0,
        bottom: 160,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(secondToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 320,
        height: 96,
        top: 0,
        right: 0,
        bottom: 96,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
      fireEvent.mouseEnter(viewport)
    })

    expect(second?.getAttribute('style')).toContain('bottom: 168px')
    expect(first?.getAttribute('style')).toContain('bottom: 272px')
  })

  it('matches the hover region width to the rendered notification stack width', () => {
    renderNotifications()

    act(() => {
      publishNotification({
        level: 'info',
        title: 'Narrow notification',
      })
      publishNotification({
        level: 'warning',
        title: 'Wide notification',
      })
    })

    const viewport = screen.getByRole('region', { name: 'Notifications' })
    const hoverRegion = viewport.querySelector('.notification-hover-region') as HTMLElement
    const narrowToast = screen.getByText('Narrow notification').closest('.notification-toast') as HTMLElement
    const wideToast = screen.getByText('Wide notification').closest('.notification-toast') as HTMLElement

    Object.defineProperty(narrowToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 320,
        height: 72,
        top: 0,
        right: 0,
        bottom: 72,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(wideToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 460,
        height: 84,
        top: 0,
        right: 0,
        bottom: 84,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(hoverRegion.getAttribute('style')).toContain('width: 460px')

    fireEvent.mouseEnter(viewport)

    expect(hoverRegion.getAttribute('style')).toContain('width: 460px')
  })

  it('applies collapsed shared width immediately from synchronous measurements', () => {
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains('notification-toast')) {
        const text = this.textContent ?? ''

        if (text.includes('Third notification')) {
          return {
            width: 420,
            height: 76,
            top: 0,
            right: 0,
            bottom: 76,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (text.includes('Second notification')) {
          return {
            width: 360,
            height: 96,
            top: 0,
            right: 0,
            bottom: 96,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect
        }

        if (text.includes('First notification')) {
          return {
            width: 320,
            height: 120,
            top: 0,
            right: 0,
            bottom: 120,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect
        }
      }

      return {
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })

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

    expect(first?.getAttribute('style')).toContain('width: 420px')
    expect(second?.getAttribute('style')).toContain('width: 420px')

    boundsSpy.mockRestore()
  })

  it('positions a taller stacked card using the front card real height when expanded', () => {
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
    const firstToast = screen.getByText('First notification').closest('.notification-toast') as HTMLElement
    const secondToast = screen.getByText('Second notification').closest('.notification-toast') as HTMLElement
    const thirdToast = screen.getByText('Third notification').closest('.notification-toast') as HTMLElement

    Object.defineProperty(firstToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 320,
        height: 120,
        top: 0,
        right: 0,
        bottom: 120,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(secondToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 360,
        height: 96,
        top: 0,
        right: 0,
        bottom: 96,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(thirdToast, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        width: 420,
        height: 52,
        top: 0,
        right: 0,
        bottom: 52,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    act(() => {
      window.dispatchEvent(new Event('resize'))
      fireEvent.mouseEnter(viewport)
    })

    expect(second?.getAttribute('style')).toContain('bottom: 60px')
    expect(first?.getAttribute('style')).toContain('bottom: 164px')
  })
})
