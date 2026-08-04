import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  getSessionCorpusWarmup,
  markSessionCorpusWarmed,
  resetSessionCorpusWarmupForTests,
  startSessionCorpusWarmup,
} from '@features/launcher/model/sessionCorpusWarmup'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  resetSessionCorpusWarmupForTests()
})

describe('session corpus warmup singleton', () => {
  it('starts the first warmup and settles the session', async () => {
    const warm = vi.fn(async () => true)
    const promise = startSessionCorpusWarmup(warm)
    expect(getSessionCorpusWarmup().status).toBe('warming')
    await expect(promise).resolves.toBe(true)
    expect(getSessionCorpusWarmup()).toEqual({ status: 'settled', ready: true })
    expect(warm).toHaveBeenCalledTimes(1)
  })

  it('shares a single in-flight backend call across concurrent starters', async () => {
    const { promise, resolve } = deferred<boolean>()
    const warm = vi.fn(() => promise)
    const first = startSessionCorpusWarmup(warm)
    const second = startSessionCorpusWarmup(warm)
    expect(warm).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    resolve(true)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
  })

  it('replays a settled outcome without re-running the backend', async () => {
    const warm = vi.fn(async () => true)
    await startSessionCorpusWarmup(warm)
    await expect(startSessionCorpusWarmup(warm)).resolves.toBe(true)
    expect(warm).toHaveBeenCalledTimes(1)
  })

  it('settles as not-ready when the backend fails and rethrows to the initiator', async () => {
    const warm = vi.fn(async () => {
      throw new Error('warmup failed')
    })
    await expect(startSessionCorpusWarmup(warm)).rejects.toThrow('warmup failed')
    expect(getSessionCorpusWarmup()).toEqual({ status: 'settled', ready: false })
    await expect(startSessionCorpusWarmup(warm)).resolves.toBe(false)
    expect(warm).toHaveBeenCalledTimes(1)
  })

  it('lets manual warmup record its outcome so later mounts skip auto warmup', () => {
    markSessionCorpusWarmed(true)
    expect(getSessionCorpusWarmup()).toEqual({ status: 'settled', ready: true })
    markSessionCorpusWarmed(false)
    expect(getSessionCorpusWarmup()).toEqual({ status: 'settled', ready: false })
  })
})
