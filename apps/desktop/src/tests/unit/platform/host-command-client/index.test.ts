import type { PlatformPorts } from '@shared/contracts'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createHostCommandClient } from '@platform/host-command-client'
import { configureObservability } from '@platform/observability'

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

function createPorts(invokeCommand: PlatformPorts['fileSystem']['invokeCommand']) {
  return {
    fileSystem: {
      invokeCommand,
      toAssetUrl: vi.fn((path: string) => path),
      resolvePluginUrl: vi.fn((pluginId: string, relativePath: string) => `plugin://${pluginId}/${relativePath}`),
    },
    desktopWindow: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      forceClose: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      isMaximized: vi.fn(),
      isFullscreen: vi.fn(),
      setFullscreen: vi.fn(),
      toggleFullscreen: vi.fn(),
    },
    storage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    dialog: {
      open: vi.fn(),
      chooseDirectory: vi.fn(),
      chooseFile: vi.fn(),
      saveFile: vi.fn(),
    },
    hostEvents: {
      canUseHost: vi.fn(() => true),
      listen: vi.fn(),
      listenWindowCloseRequest: vi.fn(),
      listenWindowDragDrop: vi.fn(),
    },
  } satisfies PlatformPorts
}

describe('host command client', () => {
  const report = vi.fn()

  beforeEach(() => {
    configureObservability({ writeFrontendLog: report })
    vi.clearAllMocks()
  })

  it('rejects a stale latest command result when a newer command wins', async () => {
    const first = createDeferred<string>()
    const invokeCommand = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('new')
    const client = createHostCommandClient(createPorts(invokeCommand))

    const firstRun = client.invoke({
      command: 'search_launcher_catalog',
      policy: { kind: 'latest', key: 'discover' },
    })
    const secondRun = client.invoke({
      command: 'search_launcher_catalog',
      policy: { kind: 'latest', key: 'discover' },
    })

    await expect(secondRun).resolves.toBe('new')
    first.resolve('old')
    await expect(firstRun).rejects.toBeTruthy()
  })

  it('reports ordinary failures and rethrows the original error', async () => {
    const failure = new Error('network down')
    const client = createHostCommandClient(createPorts(vi.fn().mockRejectedValue(failure)))
    await expect(client.invoke({ command: 'search_launcher_catalog', policy: { kind: 'parallelPool', pool: 'test' } })).rejects.toBe(
      failure,
    )
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        keyValues: expect.objectContaining({ source: 'host-command', command: 'search_launcher_catalog' }),
      }),
    )
  })

  it('does not report abort or opted-out failures', async () => {
    const abortClient = createHostCommandClient(createPorts(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))))
    await expect(
      abortClient.invoke({ command: 'search_launcher_catalog', policy: { kind: 'parallelPool', pool: 'abort' } }),
    ).rejects.toThrow()
    expect(report).not.toHaveBeenCalled()
    const optOutClient = createHostCommandClient(createPorts(vi.fn().mockRejectedValue(new Error('opt out'))))
    await expect(
      optOutClient.invoke({ command: 'search_launcher_catalog', policy: { kind: 'parallelPool', pool: 'opt' }, errorReporting: false }),
    ).rejects.toThrow('opt out')
    expect(report).not.toHaveBeenCalled()
  })

  it('keeps the original error when reporting throws', async () => {
    const failure = new Error('original')
    configureObservability({
      writeFrontendLog: vi.fn(() => {
        throw new Error('report failed')
      }),
    })
    const client = createHostCommandClient(createPorts(vi.fn().mockRejectedValue(failure)))
    await expect(client.invoke({ command: 'search_launcher_catalog', policy: { kind: 'parallelPool', pool: 'report' } })).rejects.toBe(
      failure,
    )
  })

  it('serializes exclusive mutations by resource', async () => {
    const first = createDeferred<string>()
    const events: string[] = []
    const invokeCommand = vi
      .fn()
      .mockImplementationOnce(() => {
        events.push('first')
        return first.promise
      })
      .mockImplementationOnce(() => {
        events.push('second')
        return Promise.resolve('second')
      })
    const client = createHostCommandClient(createPorts(invokeCommand))

    const firstRun = client.invoke({
      command: 'save_launcher_settings',
      policy: { kind: 'exclusiveMutation', resource: 'LauncherSettings' },
    })
    const secondRun = client.invoke({
      command: 'save_launcher_settings',
      policy: { kind: 'exclusiveMutation', resource: 'LauncherSettings' },
    })

    await flushMicrotasks()
    expect(events).toEqual(['first'])
    first.resolve('first')
    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first', 'second'])
  })
})
