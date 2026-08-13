/**
 * Progress accounting for streaming AI translation jobs.
 *
 * The batching layer can split oversized items into chunks (ids get a
 * `\u0000`-index suffix), so "completed entries" must be deduplicated back to
 * their original item ids before being compared against the original item
 * count. Both helpers stay pure so they can be unit-tested without a host.
 */

/** Strips chunk suffixes and returns unique original item ids in first-seen order. */
export function uniqueOriginalItemIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const original = id.split('\u0000')[0] ?? id
    if (seen.has(original)) continue
    seen.add(original)
    result.push(original)
  }
  return result
}

export type TranslationProgress = {
  completed: number
  total: number
  /** Completion ratio clamped to 0..1; null when the total is unknown (<= 0). */
  ratio: number | null
}

/** Clamps streaming progress to a valid ratio; null when the total is unknown. */
export function resolveTranslationProgress(completed: number, total: number): TranslationProgress {
  const safeCompleted = Math.max(0, Math.floor(completed))
  const safeTotal = Math.max(0, Math.floor(total))
  if (safeTotal <= 0) {
    return { completed: 0, total: 0, ratio: null }
  }
  return {
    completed: Math.min(safeCompleted, safeTotal),
    total: safeTotal,
    ratio: Math.min(1, safeCompleted / safeTotal),
  }
}
