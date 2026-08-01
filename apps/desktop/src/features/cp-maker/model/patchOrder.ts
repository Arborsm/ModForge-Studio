import type { DraftPatch } from './types'

/**
 * Content Patcher target group key: case- and separator-insensitive, so
 * `Maps\Farm` and `maps/farm` land in the same group.
 */
function normalizeTargetKey(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

/** Display spelling of a target: the author's case, separators normalized. */
function displayTarget(target: string): string {
  return target.trim().replaceAll('\\', '/')
}

/**
 * Moves one patch one position earlier or later in the draft's export order.
 *
 * Content Patcher applies the `Changes` array top to bottom, so this is the
 * order that matters for same-target stacks. Returns the original array when
 * the patch is absent or the move would cross the array boundary, letting the
 * caller skip dirtying the draft on a no-op.
 */
export function movePatchWithin<T extends { id: string }>(patches: readonly T[], patchId: string, delta: -1 | 1): T[] {
  const index = patches.findIndex((patch) => patch.id === patchId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= patches.length) {
    return patches as T[]
  }
  const next = [...patches]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  return next
}

/**
 * Deep-copies a patch, swaps the id for `newId`, and inserts the copy right
 * after the original, leaving every other patch's export position untouched.
 * The clone is a `structuredClone`, so typed arrays inside editor state (e.g.
 * `Uint32Array` map layer gids) survive the copy. Returns the original array
 * when `patchId` is absent.
 */
export function duplicatePatchInArray<T extends { id: string }>(patches: readonly T[], patchId: string, newId: string): T[] {
  const index = patches.findIndex((patch) => patch.id === patchId)
  if (index < 0) {
    return patches as T[]
  }
  const clone: T = structuredClone(patches[index])
  clone.id = newId
  const next = [...patches]
  next.splice(index + 1, 0, clone)
  return next
}

/** One target group of the patch manager: the target plus its patches in export order. */
export type PatchTargetGroup = {
  /** First-seen spelling of the target, separators normalized, case preserved. */
  target: string
  patches: DraftPatch[]
}

/**
 * Groups patches by their full Content Patcher target.
 *
 * Multi-target comma expressions are intentionally NOT split: a patch is one
 * export entry, so the whole target string is the group key (normalized for
 * case and separators). Group order follows the first patch of each target in
 * the array; patch order inside a group is the array order, which is exactly
 * the Content Patcher application order the manager lets the author control.
 */
export function groupPatchesByTarget(
  patches: readonly DraftPatch[],
  actionFilter: (action: DraftPatch['action']) => boolean = () => true,
): PatchTargetGroup[] {
  const groups: PatchTargetGroup[] = []
  const indexByKey = new Map<string, number>()
  for (const patch of patches) {
    if (!actionFilter(patch.action)) continue
    const key = normalizeTargetKey(patch.target)
    const groupIndex = indexByKey.get(key)
    if (groupIndex === undefined) {
      indexByKey.set(key, groups.length)
      groups.push({ target: displayTarget(patch.target), patches: [patch] })
    } else {
      groups[groupIndex]!.patches.push(patch)
    }
  }
  return groups
}
