import type { AiSemanticIndexStatus, AiSemanticModelStatus, AiSemanticSearchMode, AiSemanticSettingsSnapshot } from '@shared/contracts'

/**
 * Per-field status of the semantic status strip. Each host query settles
 * independently (with its own timeout), so one slow or failed command only
 * degrades its own field instead of pinning the whole strip to loading.
 */
export type SemanticStripItemState<T> = { status: 'pending' } | { status: 'ok'; value: T } | { status: 'error'; timedOut: boolean }

export type SemanticStripState =
  | { kind: 'loading' }
  | { kind: 'load-error'; timedOut: boolean }
  | {
      kind: 'ready'
      mode: AiSemanticSearchMode
      model: AiSemanticModelStatus | null
      index: AiSemanticIndexStatus | null
      modelDegraded: boolean
      indexDegraded: boolean
    }

/**
 * Composes the strip's display state from the three independently-fetched
 * status fields. Settings gate the whole strip (no mode without them);
 * model/index failures degrade only their own field, and pending fields are
 * omitted so the strip renders progressively as each query settles.
 */
export function composeSemanticStripState(args: {
  settings: SemanticStripItemState<AiSemanticSettingsSnapshot>
  model: SemanticStripItemState<AiSemanticModelStatus>
  index: SemanticStripItemState<AiSemanticIndexStatus>
}): SemanticStripState {
  if (args.settings.status !== 'ok') {
    return args.settings.status === 'pending' ? { kind: 'loading' } : { kind: 'load-error', timedOut: args.settings.timedOut }
  }
  return {
    kind: 'ready',
    mode: args.settings.value.mode,
    model: args.model.status === 'ok' ? args.model.value : null,
    index: args.index.status === 'ok' ? args.index.value : null,
    modelDegraded: args.model.status === 'error',
    indexDegraded: args.index.status === 'error',
  }
}
