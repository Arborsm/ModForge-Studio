import type { AppUiState, GuideDefinition } from '@shared/contracts'

/**
 * Workspace module key under which guide progress persists inside app UI state
 * (`workspace.modules[GUIDE_PROGRESS_MODULE_KEY].completed`). Using the generic
 * module-state bag avoids an app-ui-state schema change; values are normalized
 * on every read.
 */
export const GUIDE_PROGRESS_MODULE_KEY = 'guideCenter'

/** Normalizes an unknown persisted value into a list of completed guide ids. */
export function normalizeCompletedGuideIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)))
}

/** Reads completed guide ids from an app UI state snapshot. */
export function readCompletedGuideIds(snapshot: AppUiState): string[] {
  const moduleState = snapshot.workspace.modules[GUIDE_PROGRESS_MODULE_KEY]
  if (!moduleState || typeof moduleState !== 'object') {
    return []
  }

  return normalizeCompletedGuideIds((moduleState as Record<string, unknown>).completed)
}

/** Finds the guide bound to a surface (`data-guide-surface` value), if any. */
export function findGuideForSurface(definitions: Record<string, GuideDefinition>, surface: string | null): GuideDefinition | null {
  if (!surface) {
    return null
  }

  return Object.values(definitions).find((definition) => definition.surface === surface) ?? null
}

/** Validates registration objects; returns a lookup map keyed by guide id. */
export function indexGuideDefinitions(definitions: GuideDefinition[]): Record<string, GuideDefinition> {
  const indexed: Record<string, GuideDefinition> = {}
  for (const definition of definitions) {
    if (!definition.id.trim() || !definition.surface.trim() || definition.steps.length === 0) {
      throw new Error(`Invalid guide definition: ${JSON.stringify(definition)}`)
    }
    if (indexed[definition.id]) {
      throw new Error(`Duplicate guide definition id: ${definition.id}`)
    }
    indexed[definition.id] = definition
  }
  return indexed
}
