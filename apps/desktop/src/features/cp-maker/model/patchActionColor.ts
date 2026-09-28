/**
 * @file Maps a patch action to its CSS color class for UI badges and labels.
 * @module features/cp-maker
 */
import type { DraftPatch } from '@features/cp-maker'

/** Returns the CSS text-color class for a given patch action. */
export function getPatchActionColor(action: DraftPatch['action']): string {
  switch (action) {
    case 'EditData':
      return 'text-blue-400'
    case 'EditImage':
      return 'text-purple-400'
    case 'EditMap':
      return 'text-green-400'
    case 'Load':
      return 'text-orange-400'
    default:
      return 'text-text-secondary'
  }
}
