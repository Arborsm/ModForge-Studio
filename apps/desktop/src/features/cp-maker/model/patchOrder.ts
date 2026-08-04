/**
 * Moves one patch one position earlier or later in the draft's export order.
 *
 * Content Patcher applies the `Changes` array top to bottom, so this is the
 * order that matters for same-target stacks. With `within`, the move skips
 * patches the predicate rejects — a manager showing a filtered view (e.g. one
 * workspace's EditMap/Load patches) can swap with the visible neighbor instead
 * of landing on an invisible one. Returns the original array when the patch is
 * absent or the move would cross the (filtered) array boundary, letting the
 * caller skip dirtying the draft on a no-op.
 */
export function movePatchWithin<T extends { id: string }>(
  patches: readonly T[],
  patchId: string,
  delta: -1 | 1,
  within?: (patch: T) => boolean,
): T[] {
  const index = patches.findIndex((patch) => patch.id === patchId)
  if (index < 0) {
    return patches as T[]
  }
  let target = index
  do {
    target += delta
  } while (within !== undefined && target >= 0 && target < patches.length && !within(patches[target]!))
  if (target < 0 || target >= patches.length) {
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
