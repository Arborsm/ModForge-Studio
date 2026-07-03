import { describe, expect, it, vi } from 'vite-plus/test'
import { TaskCancelledError, createTaskRuntime } from './index'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

async function flushMicrotasks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve()
  }
}

describe('task runtime', () => {
  it('cancels and rejects a latest task when a newer task with the same key wins', async () => {
    const runtime = createTaskRuntime()
    const first = createDeferred<string>()
    const firstAbort = vi.fn()

    const firstRun = runtime.latest('discover', async (scope) => {
      scope.signal.addEventListener('abort', firstAbort)
      return first.promise
    })
    const secondRun = runtime.latest('discover', async () => 'new')

    await expect(secondRun).resolves.toBe('new')
    first.resolve('old')
    await expect(firstRun).rejects.toBeInstanceOf(TaskCancelledError)
    expect(firstAbort).toHaveBeenCalledTimes(1)
  })

  it('keeps keyedLatest isolated by key', async () => {
    const runtime = createTaskRuntime()

    await expect(
      Promise.all([runtime.keyedLatest('root-a::en-US', async () => 'a'), runtime.keyedLatest('root-b::en-US', async () => 'b')]),
    ).resolves.toEqual(['a', 'b'])
  })

  it('serializes exclusive mutations for the same resource', async () => {
    const runtime = createTaskRuntime()
    const events: string[] = []
    const first = createDeferred<void>()

    const firstRun = runtime.exclusiveMutation('LauncherSettings', async () => {
      events.push('first:start')
      await first.promise
      events.push('first:end')
      return 'first'
    })
    const secondRun = runtime.exclusiveMutation('LauncherSettings', async () => {
      events.push('second:start')
      return 'second'
    })

    await flushMicrotasks()
    expect(events).toEqual(['first:start'])
    first.resolve()

    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('runs queued mutations in submission order', async () => {
    const runtime = createTaskRuntime()
    const events: string[] = []

    await Promise.all([
      runtime.queuedMutation('AppUiState', async () => {
        events.push('a')
        return 'a'
      }),
      runtime.queuedMutation('AppUiState', async () => {
        events.push('b')
        return 'b'
      }),
      runtime.queuedMutation('AppUiState', async () => {
        events.push('c')
        return 'c'
      }),
    ])

    expect(events).toEqual(['a', 'b', 'c'])
  })

  it('limits parallel pool concurrency without blocking other pools', async () => {
    const runtime = createTaskRuntime()
    const first = createDeferred<string>()
    const events: string[] = []

    const firstRun = runtime.parallelPool('image-resolve', 1, async () => {
      events.push('image:first:start')
      return first.promise
    })
    const secondRun = runtime.parallelPool('image-resolve', 1, async () => {
      events.push('image:second:start')
      return 'second'
    })
    const otherPoolRun = runtime.parallelPool('map-preload', 1, async () => {
      events.push('map:first:start')
      return 'map'
    })

    await expect(otherPoolRun).resolves.toBe('map')
    expect(events).toEqual(['image:first:start', 'map:first:start'])

    first.resolve('first')
    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['image:first:start', 'map:first:start', 'image:second:start'])
  })

  it('uses serviceGate to let only the newest service side effect publish', async () => {
    const runtime = createTaskRuntime()
    const first = createDeferred<string>()
    const published: string[] = []

    const firstRun = runtime.serviceGate('music', async (scope) => {
      const value = await first.promise
      if (scope.isCurrent()) {
        published.push(value)
      }
      return value
    })
    const secondRun = runtime.serviceGate('music', async (scope) => {
      if (scope.isCurrent()) {
        published.push('new')
      }
      return 'new'
    })

    await expect(secondRun).resolves.toBe('new')
    first.resolve('old')
    await expect(firstRun).rejects.toBeInstanceOf(TaskCancelledError)
    expect(published).toEqual(['new'])
  })
})
