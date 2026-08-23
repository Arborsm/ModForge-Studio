import { describe, expect, it } from 'vite-plus/test'
import { useLauncherOverlayDismissStore } from '@shared/lib/app-state/launcherOverlayDismissStore'

describe('launcher overlay dismiss store', () => {
  it('increments the dismiss epoch for every request', () => {
    const initialEpoch = useLauncherOverlayDismissStore.getState().dismissEpoch

    useLauncherOverlayDismissStore.getState().requestLauncherOverlayDismiss()
    const firstEpoch = useLauncherOverlayDismissStore.getState().dismissEpoch
    useLauncherOverlayDismissStore.getState().requestLauncherOverlayDismiss()
    const secondEpoch = useLauncherOverlayDismissStore.getState().dismissEpoch

    expect(firstEpoch).toBe(initialEpoch + 1)
    expect(secondEpoch).toBe(firstEpoch + 1)
  })
})
