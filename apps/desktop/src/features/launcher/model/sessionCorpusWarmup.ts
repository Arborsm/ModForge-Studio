/**
 * Session-level corpus warmup singleton for launcher AI translation.
 *
 * `prewarm_localization_corpus` runs on the single-slot `AiSemanticSearch`
 * pool and is idempotent, so auto-warmup must happen at most once per app
 * session: every mod-detail mount shares the same in-flight promise instead of
 * queueing duplicate prewarm calls (which would hold the pool and slow down
 * `inspect_semantic_index` snapshots). Manual retry (`retryCorpus`) calls the
 * backend directly and never routes through this singleton.
 */
export type SessionCorpusWarmup =
  | { status: 'idle' }
  | { status: 'warming'; promise: Promise<boolean> }
  | { status: 'settled'; ready: boolean }

let sessionWarmup: SessionCorpusWarmup = { status: 'idle' }

export function getSessionCorpusWarmup(): SessionCorpusWarmup {
  return sessionWarmup
}

/**
 * Starts the session auto-warmup or joins an in-flight/settled one. Concurrent
 * callers share a single backend call; settled outcomes are replayed without
 * re-running the command. Failures settle the session as `ready: false` and
 * rethrow to the initiating caller so it can surface the error state.
 */
export function startSessionCorpusWarmup(warm: () => Promise<boolean>): Promise<boolean> {
  const current = sessionWarmup
  if (current.status === 'warming') return current.promise
  if (current.status === 'settled') return Promise.resolve(current.ready)
  const promise = warm().then(
    (ready) => {
      sessionWarmup = { status: 'settled', ready }
      return ready
    },
    (cause) => {
      sessionWarmup = { status: 'settled', ready: false }
      throw cause
    },
  )
  sessionWarmup = { status: 'warming', promise }
  return promise
}

/** Records a completed manual warmup so later mounts skip the auto warmup. */
export function markSessionCorpusWarmed(ready: boolean): void {
  if (sessionWarmup.status === 'settled' && sessionWarmup.ready === ready) return
  sessionWarmup = { status: 'settled', ready }
}

/** Test-only: resets the session singleton between suites. */
export function resetSessionCorpusWarmupForTests(): void {
  sessionWarmup = { status: 'idle' }
}
