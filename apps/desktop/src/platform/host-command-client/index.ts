import { globalTaskRuntime, type TaskScope } from '@shared/lib/task-runtime'
import type { PlatformPorts } from '@shared/contracts'
import type { HostCommandName } from '@platform/host-commands'

/**
 * UI-side request lifecycle policy. This governs how the frontend dedups
 * in-flight calls, drops stale results and queues/throttles requests; it is
 * a different namespace from the backend binding's lane/pool/resource
 * scheduling (see docs/frontend-architecture.md). Pool/resource keys here are
 * frontend-only throttle domains, not `HostCommandResource` locks.
 *
 * Implementation note: `latest`/`keyedLatest`/`serviceGate` all run
 * through the latest-wins task primitive and differ only by intent;
 * `exclusiveMutation`/`queuedMutation` both queue behind a key and differ
 * by the key prefix. `parallelPool` is the only bounded-concurrency kind.
 */
export type HostCommandPolicy =
  | { kind: 'latest'; key: string }
  | { kind: 'keyedLatest'; key: string }
  | { kind: 'exclusiveMutation'; resource: string }
  | { kind: 'queuedMutation'; queue: string }
  | { kind: 'parallelPool'; pool: string; limit?: number }
  | { kind: 'serviceGate'; key: string }

export type HostCommandRequest<TArgs> = {
  command: HostCommandName
  args?: TArgs
  policy: HostCommandPolicy
  signal?: AbortSignal
  scope?: TaskScope
}

export interface HostCommandClient {
  invoke<TArgs, TResult>(request: HostCommandRequest<TArgs>): Promise<TResult>
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
  async function rawInvoke<TArgs, TResult>(request: HostCommandRequest<TArgs>, scope: TaskScope) {
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
    invoke<TArgs, TResult>(request: HostCommandRequest<TArgs>) {
      const task = (scope: TaskScope) => rawInvoke<TArgs, TResult>(request, request.scope ?? scope)

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
