/**
 * Landing mode for authoring workspaces, declaring how the user enters and what they see first.
 *
 * Replaces the old `WorkspaceContentEntry` (expert | hub | singleton | mapTargets | standalone)
 * with user-facing primitives: what the workspace shows on entry. No workspace lands on a
 * patch list; patches stay an internal implementation detail.
 */

import { listPatchTargetSuggestions } from './patchTargets'
import type { DraftPatch } from './types'

export type WorkspaceLanding =
  /** Direct entry into one asset's structured editor (buildings/characters/items). */
  | { kind: 'asset'; action: DraftPatch['action']; target: string }
  /** Pick one asset from a group first, then edit it (map locations). */
  | { kind: 'assetGroup'; targets: readonly string[] }
  /** The workspace ships its own main view (mail/dialogue/schedules/events). */
  | { kind: 'module' }
  /** Project content overview. */
  | { kind: 'projectContent' }

/**
 * Resolves the landing mode for a workspace, determining what view to show on entry.
 * Group targets come from the shipped-asset catalog; the picker overlays project
 * state (already-authored targets) at render time.
 */
export function resolveWorkspaceLanding(workspaceId: string): WorkspaceLanding {
  switch (workspaceId) {
    case 'mods':
      return { kind: 'projectContent' }

    // Asset workspaces: land directly on the asset's entry table.
    case 'characters':
      return { kind: 'asset', action: 'EditData', target: 'Data/Characters' }
    case 'buildings':
      return { kind: 'asset', action: 'EditData', target: 'Data/Buildings' }
    case 'items':
      return { kind: 'asset', action: 'EditData', target: 'Data/Objects' }

    // Map: pick a location (vanilla map sheets + location data assets), then edit.
    case 'map':
      return {
        kind: 'assetGroup',
        targets: [
          ...listPatchTargetSuggestions('EditMap', 'map').filter((target) => target.startsWith('Maps/')),
          ...listPatchTargetSuggestions('EditData', 'map'),
        ],
      }

    // Module workspaces ship their own main view; events keeps its hub untouched.
    case 'mail':
    case 'dialogue':
    case 'schedules':
    case 'events':
      return { kind: 'module' }

    default:
      return { kind: 'module' }
  }
}
