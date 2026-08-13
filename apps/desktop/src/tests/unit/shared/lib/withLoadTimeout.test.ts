import { describe, expect, it } from 'vite-plus/test'
import { LOAD_TIMEOUT_ERROR, isTimeoutError, withLoadTimeout } from '@shared/lib/async/withLoadTimeout'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('withLoadTimeout', () => {
  it('resolves with the underlying value when the promise settles first', async () => {
    const { promise, resolve } = deferred<string>()
    const result = withLoadTimeout(promise, 10_000)
    resolve('ok')
    await expect(result).resolves.toBe('ok')
  })

  it('rejects with the timeout sentinel when the promise hangs past the deadline', async () => {
    const { promise } = deferred<string>()
    const result = withLoadTimeout(promise, 5)
    await expect(result).rejects.toThrow(LOAD_TIMEOUT_ERROR)
  })

  it('rejects with the original error when the promise fails before the deadline', async () => {
    const { promise, reject } = deferred<string>()
    const result = withLoadTimeout(promise, 10_000)
    reject(new Error('host failure'))
    await expect(result).rejects.toThrow('host failure')
  })

  it('supports a custom timeout message', async () => {
    const { promise } = deferred<string>()
    await expect(withLoadTimeout(promise, 5, 'custom-timeout')).rejects.toThrow('custom-timeout')
  })
})

describe('isTimeoutError', () => {
  it('matches the timeout sentinel only', async () => {
    const { promise } = deferred<string>()
    const result = withLoadTimeout(promise, 5)
    const cause = await result.catch((error: unknown) => error)
    expect(isTimeoutError(cause)).toBe(true)
  })

  it('rejects non-timeout causes', () => {
    expect(isTimeoutError(new Error('host failure'))).toBe(false)
    expect(isTimeoutError(null)).toBe(false)
    expect(isTimeoutError('load-timeout')).toBe(false)
  })
})
