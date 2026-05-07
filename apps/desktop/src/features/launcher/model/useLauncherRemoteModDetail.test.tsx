import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@locales/localeContext'
import { NotificationProvider, clearNotifications } from '@shared/ui/notifications'
import { loadLauncherRemoteModDetail } from '@platform/desktop'
import { useLauncherRemoteModDetail } from './useLauncherRemoteModDetail'
import { LauncherTestWrapper } from '@test/launcherTestWrapper'
import { createMockLauncherPort } from '@test/launcherTestPort'
import type { LauncherPort } from './launcherPort'

vi.mock('@platform/desktop', async () => {
  const actual = await vi.importActual<typeof import('@platform/desktop')>('@platform/desktop')
  return {
    ...actual,
    loadLauncherRemoteModDetail: vi.fn(),
  }
})

const loadLauncherRemoteModDetailMock = vi.mocked(loadLauncherRemoteModDetail)
let launcherPort: LauncherPort

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <LauncherTestWrapper port={launcherPort}>
      <LocaleProvider locale="zh-CN">
        <NotificationProvider>{children}</NotificationProvider>
      </LocaleProvider>
    </LauncherTestWrapper>
  )
}

function HookProbe({ modId }: { modId: number | null }) {
  const result = useLauncherRemoteModDetail(modId)
  return (
    <div>
      <span data-testid="state">{result.state}</span>
      <span data-testid="title">{result.detail?.title ?? ''}</span>
    </div>
  )
}

describe('useLauncherRemoteModDetail', () => {
  beforeEach(() => {
    launcherPort = createMockLauncherPort({
      loadRemoteModDetail: loadLauncherRemoteModDetailMock,
    })
  })

  afterEach(() => {
    cleanup()
    clearNotifications()
    vi.clearAllMocks()
  })

  it('publishes a loading notification while remote mod detail is pending and clears it when finished', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof loadLauncherRemoteModDetail>>>()
    loadLauncherRemoteModDetailMock.mockReturnValue(deferred.promise)

    await act(async () => {
      render(<HookProbe modId={44722} />, { wrapper: Wrapper })
      await Promise.resolve()
    })

    expect(screen.getByTestId('state').textContent).toBe('loading')
    expect(screen.getByText('查看详情')).toBeTruthy()
    expect(screen.getByText('Nexus #44722')).toBeTruthy()

    await act(async () => {
      deferred.resolve({
        modId: 44722,
        title: 'Joja Civic Center',
        summary: 'Welcome to the Joja Civic Center.',
        author: 'blue704',
        version: '1.0.0',
        modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
        imageUrl: null,
        galleryImages: [],
      })
      await deferred.promise
    })

    expect(screen.getByTestId('state').textContent).toBe('ready')
    expect(screen.getByTestId('title').textContent).toBe('Joja Civic Center')
    expect(screen.queryByText('查看详情')).toBeNull()
  })
})
