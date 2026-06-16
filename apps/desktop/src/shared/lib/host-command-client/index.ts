import { globalTaskRuntime, type TaskScope } from '@shared/lib/task-runtime'
import type { PlatformPorts } from '@shared/contracts'

export type HostCommandPolicy =
  | { kind: 'latest'; key: string }
  | { kind: 'keyedLatest'; key: string }
  | { kind: 'exclusiveMutation'; resource: string }
  | { kind: 'queuedMutation'; queue: string }
  | { kind: 'parallelPool'; pool: string; limit?: number }
  | { kind: 'serviceGate'; key: string }

export type HostCommandRequest<TArgs, TResult> = {
  command: string
  args?: TArgs
  policy: HostCommandPolicy
  signal?: AbortSignal
  scope?: TaskScope
  readonly resultType?: (_value: TResult) => TResult
}

export interface HostCommandClient {
  invoke<TArgs, TResult>(request: HostCommandRequest<TArgs, TResult>): Promise<TResult>
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }
}

function linkAbortSignal(scope: TaskScope, signal?: AbortSignal) {
  if (!signal) {
    return () => {}
  }

  if (signal.aborted) {
    scope.cancel(signal.reason)
    return () => {}
  }

  const abort = () => scope.cancel(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

export function createHostCommandClient(ports: PlatformPorts): HostCommandClient {
  async function rawInvoke<TArgs, TResult>(request: HostCommandRequest<TArgs, TResult>, scope: TaskScope) {
    throwIfAborted(request.signal)
    const unlink = linkAbortSignal(scope, request.signal)
    try {
      const result = await ports.fileSystem.invokeCommand<TResult>(request.command, request.args as Record<string, unknown> | undefined)
      if (!scope.isCurrent() || scope.signal.aborted) {
        throw scope.signal.reason ?? new DOMException('The command result is stale.', 'AbortError')
      }
      return result
    } finally {
      unlink()
    }
  }

  return {
    invoke(request) {
      const task = (scope: TaskScope) => rawInvoke(request, request.scope ?? scope)

      switch (request.policy.kind) {
        case 'latest':
          return globalTaskRuntime.latest(request.policy.key, task)
        case 'keyedLatest':
          return globalTaskRuntime.keyedLatest(request.policy.key, task)
        case 'exclusiveMutation':
          return globalTaskRuntime.exclusiveMutation(request.policy.resource, task)
        case 'queuedMutation':
          return globalTaskRuntime.queuedMutation(request.policy.queue, task)
        case 'parallelPool':
          return globalTaskRuntime.parallelPool(request.policy.pool, request.policy.limit ?? 4, task)
        case 'serviceGate':
          return globalTaskRuntime.serviceGate(request.policy.key, task)
      }
    },
  }
}
