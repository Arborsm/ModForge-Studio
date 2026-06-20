import { act, cleanup, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { LocaleProvider } from '@locales/provider'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { LauncherTestWrapper } from '@test/launcherTestWrapper'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { useLauncherUpdateProgressNotifications } from './useLauncherUpdateProgressNotifications'
import type { LauncherPort } from './launcherPort'
import type { LauncherUpdateProgressPayload } from './launcherContracts'

vi.mock('@shared/ui/notifications', async () => {
  const actual = await vi.importActual<typeof import('@shared/ui/notifications')>('@shared/ui/notifications')
  return {
    ...actual,
    dismissNotification: vi.fn(),
    publishNotification: vi.fn(),
  }
})

const publishNotificationMock = vi.mocked(publishNotification)

let launcherPort: LauncherPort
let progressListener: ((payload: LauncherUpdateProgressPayload) => void) | null = null

function Wrapper({ children }: PropsWithChildren) {
  return (
    <LauncherTestWrapper port={launcherPort}>
      <LocaleProvider locale="en-US">{children}</LocaleProvider>
    </LauncherTestWrapper>
  )
}

function createProgressPayload(overrides: Partial<LauncherUpdateProgressPayload> = {}): LauncherUpdateProgressPayload {
  return {
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    sessionId: 'updates-session',
    checked: 0,
    total: 100,
    currentModName: null,
    updates: [],
    ...overrides,
  }
}

describe('useLauncherUpdateProgressNotifications', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
    progressListener = null
  })

  it('throttles high-frequency update progress notification writes', async () => {
    vi.useFakeTimers()
    launcherPort = createMockLauncherPort({
      listenToUpdateProgress: vi.fn(async (listener) => {
        progressListener = listener
        return () => {}
      }),
    })

    renderHook(() => useLauncherUpdateProgressNotifications(), { wrapper: Wrapper })

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    act(() => {
      progressListener?.(createProgressPayload({ checked: 1, currentModName: 'Mod 1' }))
      progressListener?.(createProgressPayload({ checked: 2, currentModName: 'Mod 2' }))
      progressListener?.(createProgressPayload({ checked: 3, currentModName: 'Mod 3' }))
      progressListener?.(createProgressPayload({ checked: 4, currentModName: 'Mod 4' }))
    })

    expect(publishNotificationMock).toHaveBeenCalledTimes(1)
    expect(publishNotificationMock).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Checking Mod 1 (1/100)' }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(publishNotificationMock).toHaveBeenCalledTimes(2)
    expect(publishNotificationMock).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Checking Mod 4 (4/100)' }))
  })

  it('dismisses immediately when update progress completes', async () => {
    launcherPort = createMockLauncherPort({
      listenToUpdateProgress: vi.fn(async (listener) => {
        progressListener = listener
        return () => {}
      }),
    })

    renderHook(() => useLauncherUpdateProgressNotifications(), { wrapper: Wrapper })

    await act(async () => {})

    act(() => {
      progressListener?.(createProgressPayload({ checked: 100, total: 100, currentModName: 'Last Mod' }))
    })

    expect(dismissNotification).toHaveBeenCalledWith('launcher-updates-progress')
    expect(publishNotificationMock).not.toHaveBeenCalled()
  })
})
