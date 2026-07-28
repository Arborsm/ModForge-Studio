import type { DraftPatch, WorkspaceId } from './types'

/**
 * How an authoring workspace presents its content entry point.
 *
 * The whole point of the workspace shell is that authors think in content
 * ("which NPC", "which map"), never in patches. Each workspace therefore
 * declares how its landing view resolves content to patches:
 *
 * - `expert`: the full patch list with manual action/target picking. Only the
 *   project-content workspace uses this; it is the authoritative patch list.
 * - `hub`: the events workspace's own event-card hub.
 * - `singleton`: one `EditData` patch edits the workspace's single asset; the
 *   shell ensures it exists and lands directly in its editor.
 * - `mapTargets`: a target list of vanilla maps; picking one ensures an
 *   `EditMap` patch and opens the map editor.
 *
 * The standalone dialogue/schedule/mail modules never reach the shell, so they
 * declare `standalone` and the shell refuses to render them.
 */
export type WorkspaceContentEntry =
  | { kind: 'expert' }
  | { kind: 'hub' }
  | { kind: 'singleton'; action: DraftPatch['action']; target: string }
  | { kind: 'mapTargets' }
  | { kind: 'standalone' }

export const WORKSPACE_CONTENT_ENTRY: Record<WorkspaceId, WorkspaceContentEntry> = {
  mods: { kind: 'expert' },
  map: { kind: 'mapTargets' },
  events: { kind: 'hub' },
  characters: { kind: 'singleton', action: 'EditData', target: 'Data/Characters' },
  buildings: { kind: 'singleton', action: 'EditData', target: 'Data/Buildings' },
  items: { kind: 'singleton', action: 'EditData', target: 'Data/Objects' },
  dialogue: { kind: 'standalone' },
  schedules: { kind: 'standalone' },
  mail: { kind: 'standalone' },
}

/** The content entry mode of one workspace. */
export function getWorkspaceContentEntry(workspaceId: WorkspaceId): WorkspaceContentEntry {
  return WORKSPACE_CONTENT_ENTRY[workspaceId]
}
