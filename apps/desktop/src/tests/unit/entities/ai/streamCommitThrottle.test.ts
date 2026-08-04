import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createStreamCommitThrottle } from '@entities/ai'

describe('createStreamCommitThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces high-frequency schedules into at most one commit per interval', () => {
    const commit = vi.fn()
    const throttle = createStreamCommitThrottle(commit, 80)
    throttle.schedule()
    throttle.schedule()
    throttle.schedule()
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(80)
    expect(commit).toHaveBeenCalledTimes(1)
    throttle.dispose()
  })

  it('runs a trailing commit after the burst ends', () => {
    const commit = vi.fn()
    const throttle = createStreamCommitThrottle(commit, 80)
    throttle.schedule()
    vi.advanceTimersByTime(79)
    throttle.schedule()
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledTimes(1)
    // The schedule that arrived mid-window must still produce a trailing commit.
    vi.advanceTimersByTime(80)
    expect(commit).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(80)
    expect(commit).toHaveBeenCalledTimes(2)
    throttle.dispose()
  })

  it('keeps firing while schedules keep arriving', () => {
    const commit = vi.fn()
    const throttle = createStreamCommitThrottle(commit, 80)
    throttle.schedule()
    vi.advanceTimersByTime(80)
    throttle.schedule()
    vi.advanceTimersByTime(80)
    throttle.schedule()
    vi.advanceTimersByTime(80)
    expect(commit).toHaveBeenCalledTimes(3)
    throttle.dispose()
  })

  it('never commits after dispose', () => {
    const commit = vi.fn()
    const throttle = createStreamCommitThrottle(commit, 80)
    throttle.schedule()
    throttle.dispose()
    vi.advanceTimersByTime(200)
    expect(commit).not.toHaveBeenCalled()
  })
})
