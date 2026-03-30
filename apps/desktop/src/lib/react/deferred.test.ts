// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { deferToAnimationFrame, deferToTimeout, scheduleDeferred } from './deferred'

describe('deferred scheduling helpers', () => {
  it('runs a callback on the next animation frame and can cancel', () => {
    const callback = vi.fn()
    let rafCallback: FrameRequestCallback | null = null

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((next) => {
      rafCallback = next
      return 101
    })
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const cancel = deferToAnimationFrame(callback)

    expect(callback).not.toHaveBeenCalled()
    if (!rafCallback) {
      throw new Error('requestAnimationFrame callback was not captured')
    }
    const frame = rafCallback as (time: number) => void
    frame(16)
    expect(callback).toHaveBeenCalledTimes(1)

    cancel()
    expect(cancelSpy).toHaveBeenCalledWith(101)

    rafSpy.mockRestore()
    cancelSpy.mockRestore()
  })

  it('runs a callback on timeout and can cancel', () => {
    vi.useFakeTimers()

    const callback = vi.fn()
    const cancel = deferToTimeout(callback)

    expect(callback).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(callback).toHaveBeenCalledTimes(1)

    cancel()

    vi.useRealTimers()
  })

  it('can cancel a timeout before it runs', () => {
    vi.useFakeTimers()

    const callback = vi.fn()
    const cancel = deferToTimeout(callback)

    cancel()
    vi.runAllTimers()
    expect(callback).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})

describe('scheduleDeferred', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('defers timeout callbacks until timers run', () => {
    vi.useFakeTimers()
    const spy = vi.fn()

    scheduleDeferred(spy, 'timeout')

    expect(spy).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('cancels deferred timeout callbacks', () => {
    vi.useFakeTimers()
    const spy = vi.fn()

    const cancel = scheduleDeferred(spy, 'timeout')
    cancel()

    vi.runAllTimers()
    expect(spy).not.toHaveBeenCalled()
  })

  it('defers frame callbacks until the animation frame fires', () => {
    const spy = vi.fn()
    let captured: FrameRequestCallback | null = null

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      captured = callback
      return 42
    })

    scheduleDeferred(spy, 'frame')

    expect(spy).not.toHaveBeenCalled()
    if (!captured) {
      throw new Error('requestAnimationFrame callback was not captured')
    }
    const frame = captured as (time: number) => void
    frame(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('cancels deferred frame callbacks', () => {
    const spy = vi.fn()
    let captured: FrameRequestCallback | null = null

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      captured = callback
      return 7
    })
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const cancel = scheduleDeferred(spy, 'frame')
    cancel()
    if (!captured) {
      throw new Error('requestAnimationFrame callback was not captured')
    }
    const frame = captured as (time: number) => void
    frame(0)

    expect(spy).not.toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7)
  })
})
