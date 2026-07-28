/**
 * Priority layering of one NPC's schedule keys for the editor's left rail.
 *
 * `NPC.TryLoadSchedule()` walks key families in a fixed order and stops at the
 * first key it finds, so a flat alphabetical list hides the one thing an author
 * needs to see: which entry actually runs on a given day. Grouping by family in
 * resolution order makes that ordering the shape of the rail itself.
 */

import { describeScheduleKey, SCHEDULE_KEY_FAMILY_ORDER, type ScheduleKeyDescription, type ScheduleKeyFamily } from './scheduleKeys'
import type { ScheduleEntrySummary } from './projectSchedule'

export type SchedulePriorityEntry = {
  summary: ScheduleEntrySummary
  description: ScheduleKeyDescription
}

export type SchedulePriorityGroup = {
  family: ScheduleKeyFamily
  /** Position in `SCHEDULE_KEY_FAMILY_ORDER`; 0 is consulted first by the game. */
  rank: number
  entries: SchedulePriorityEntry[]
}

/** Sorts within a family so numeric key parts (days, hearts) read in order. */
function compareKeys(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Groups merged schedule entries into rail sections, families in resolution
 * order and entries sorted by key. Families with no entries are dropped so the
 * rail never renders a bare heading.
 */
export function buildSchedulePriorityGroups(entries: readonly ScheduleEntrySummary[]): SchedulePriorityGroup[] {
  const byFamily = new Map<ScheduleKeyFamily, SchedulePriorityEntry[]>()

  for (const summary of entries) {
    const description = describeScheduleKey(summary.key)
    const bucket = byFamily.get(description.family)
    if (bucket) {
      bucket.push({ summary, description })
    } else {
      byFamily.set(description.family, [{ summary, description }])
    }
  }

  return SCHEDULE_KEY_FAMILY_ORDER.flatMap((family, rank) => {
    const familyEntries = byFamily.get(family)
    if (!familyEntries) {
      return []
    }
    return [{ family, rank, entries: familyEntries.sort((left, right) => compareKeys(left.summary.key, right.summary.key)) }]
  })
}
