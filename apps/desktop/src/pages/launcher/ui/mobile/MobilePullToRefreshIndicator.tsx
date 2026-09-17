/**
 * @file Pull-to-refresh ring indicator rendered at the top of a launcher page
 * while the user drags down (or a refresh is running).
 */
import { cx } from '@shared/lib/helper'
import type { MobilePullToRefreshState } from './usePullToRefresh'

type MobilePullToRefreshIndicatorProps = {
  state: MobilePullToRefreshState
  hint: string
  release: string
  refreshing: string
}

/** Ring + hint label; hidden while the gesture is idle. */
export function MobilePullToRefreshIndicator({ state, hint, release, refreshing }: MobilePullToRefreshIndicatorProps) {
  if (!state.pulling && !state.refreshing) {
    return null
  }

  const label = state.refreshing ? refreshing : state.readyToRelease ? release : hint

  return (
    <div
      className={cx('mobile-ptr', state.refreshing && 'is-refreshing')}
      style={{ opacity: state.refreshing ? 1 : Math.min(1, state.pullDistance / 48) }}
    >
      <span className="mobile-ptr-ring" aria-hidden="true" />
      <span className="mobile-ptr-label">{label}</span>
    </div>
  )
}
