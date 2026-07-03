import { useCallback, useEffect, useMemo, useRef } from 'react'

export type TaskScopeKey = string

export interface TaskScope {
  readonly key: TaskScopeKey
  readonly signal: AbortSignal
  isCurrent(): boolean
  cancel(reason?: unknown): void
}

export interface TaskRuntime {
  latest<T>(key: string, task: (scope: TaskScope) => Promise<T>): Promise<T>
  keyedLatest<T>(key: string, task: (scope: TaskScope) => Promise<T>): Promise<T>
  exclusiveMutation<T>(resource: string, task: (scope: TaskScope) => Promise<T>): Promise<T>
  queuedMutation<T>(queue: string, task: (scope: TaskScope) => Promise<T>): Promise<T>
  parallelPool<T>(pool: string, limit: number, task: (scope: TaskScope) => Promise<T>): Promise<T>
  serviceGate<T>(key: string, task: (scope: TaskScope) => Promise<T>): Promise<T>
}

export class TaskCancelledError extends Error {
  constructor(message = 'Task was cancelled.') {
    super(message)
    this.name = 'TaskCancelledError'
  }
}

type TaskRecord = {
  generation: number
  controller: AbortController
}

type PoolState = {
  active: number
  queue: Array<() => void>
}

function abortController(controller: AbortController, reason?: unknown) {
  if (!controller.signal.aborted) {
    controller.abort(reason)
  }
}

function createScope(key: TaskScopeKey, record: TaskRecord, isCurrentRecord: () => boolean): TaskScope {
  return {
    key,
    signal: record.controller.signal,
    isCurrent: isCurrentRecord,
    cancel(reason?: unknown) {
      abortController(record.controller, reason)
    },
  }
}

function assertCurrent(scope: TaskScope) {
  if (!scope.isCurrent() || scope.signal.aborted) {
    throw new TaskCancelledError()
  }
}

export function createTaskRuntime(): TaskRuntime {
  const latestTasks = new Map<string, TaskRecord>()
  const mutationQueues = new Map<string, Promise<unknown>>()
  const pools = new Map<string, PoolState>()

  async function runLatest<T>(key: string, task: (scope: TaskScope) => Promise<T>) {
    const previous = latestTasks.get(key)
    if (previous) {
      abortController(previous.controller, new TaskCancelledError('Task was superseded.'))
    }

    const record = {
      generation: (previous?.generation ?? 0) + 1,
      controller: new AbortController(),
    }
    latestTasks.set(key, record)
    const scope = createScope(key, record, () => latestTasks.get(key) === record)

    try {
      const result = await task(scope)
      assertCurrent(scope)
      return result
    } finally {
      if (latestTasks.get(key) === record) {
        latestTasks.delete(key)
      }
    }
  }

  async function runQueued<T>(queueKey: string, task: (scope: TaskScope) => Promise<T>) {
    const previous = mutationQueues.get(queueKey) ?? Promise.resolve()
    const record = {
      generation: Date.now(),
      controller: new AbortController(),
    }
    const scope = createScope(queueKey, record, () => !record.controller.signal.aborted)

    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const result = await task(scope)
        assertCurrent(scope)
        return result
      })

    mutationQueues.set(
      queueKey,
      run.finally(() => {
        if (mutationQueues.get(queueKey) === run) {
          mutationQueues.delete(queueKey)
        }
      }),
    )
    return run
  }

  async function runInPool<T>(poolKey: string, limit: number, task: (scope: TaskScope) => Promise<T>) {
    const normalizedLimit = Math.max(1, Math.trunc(limit))
    const pool = pools.get(poolKey) ?? { active: 0, queue: [] }
    pools.set(poolKey, pool)

    const record = {
      generation: Date.now(),
      controller: new AbortController(),
    }
    const scope = createScope(poolKey, record, () => !record.controller.signal.aborted)

    if (pool.active < normalizedLimit) {
      pool.active += 1
    } else {
      await new Promise<void>((resolve) => {
        pool.queue.push(() => {
          pool.active += 1
          resolve()
        })
      })
    }

    try {
      const result = await task(scope)
      assertCurrent(scope)
      return result
    } finally {
      pool.active = Math.max(0, pool.active - 1)
      const next = pool.queue.shift()
      if (next) {
        next()
      } else if (pool.active === 0) {
        pools.delete(poolKey)
      }
    }
  }

  return {
    latest: runLatest,
    keyedLatest: runLatest,
    exclusiveMutation(resource, task) {
      return runQueued(`exclusive:${resource}`, task)
    },
    queuedMutation(queue, task) {
      return runQueued(`queue:${queue}`, task)
    },
    parallelPool: runInPool,
    serviceGate: runLatest,
  }
}

export const globalTaskRuntime = createTaskRuntime()

export function useTaskScope(scopeKey: TaskScopeKey) {
  const runtime = useMemo(() => createTaskRuntime(), [])
  const activeScopeRef = useRef<TaskScope | null>(null)

  useEffect(() => {
    return () => {
      activeScopeRef.current?.cancel(new TaskCancelledError('Component unmounted.'))
      activeScopeRef.current = null
    }
  }, [])

  return useMemo(
    () => ({
      key: scopeKey,
      runtime,
      capture(scope: TaskScope) {
        activeScopeRef.current?.cancel(new TaskCancelledError('Task scope replaced.'))
        activeScopeRef.current = scope
        return scope
      },
      isCurrent(scope: TaskScope) {
        return activeScopeRef.current === scope && scope.isCurrent()
      },
      cancel(reason?: unknown) {
        activeScopeRef.current?.cancel(reason)
        activeScopeRef.current = null
      },
    }),
    [runtime, scopeKey],
  )
}

export function useLatestTask(scopeKey: string) {
  const taskScope = useTaskScope(scopeKey)
  return useCallback(
    async <T>(task: (scope: TaskScope) => Promise<T>) =>
      taskScope.runtime.latest(scopeKey, async (scope) => task(taskScope.capture(scope))),
    [scopeKey, taskScope],
  )
}

export function useKeyedResourceTask(scopeKey: string) {
  const taskScope = useTaskScope(scopeKey)
  return useCallback(
    async <T>(task: (scope: TaskScope) => Promise<T>) =>
      taskScope.runtime.keyedLatest(scopeKey, async (scope) => task(taskScope.capture(scope))),
    [scopeKey, taskScope],
  )
}

export function useExclusiveMutationTask(resource: string) {
  const runtime = useMemo(() => createTaskRuntime(), [])
  return useCallback(<T>(task: (scope: TaskScope) => Promise<T>) => runtime.exclusiveMutation(resource, task), [resource, runtime])
}
