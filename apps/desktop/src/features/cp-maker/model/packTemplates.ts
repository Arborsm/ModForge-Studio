import type { DraftPatch, WorkspaceId } from './types'

/**
 * Pre-built starting points for project creation.
 *
 * A template is not a project type — every draft stays one Content Patcher
 * pack. Templates only seed the unambiguous singleton patches (the workspace
 * auto-resolution would create them on first edit anyway) and decide which
 * authoring module opens right after creation, so a new project lands on
 * content instead of an empty dashboard.
 */
export type PackTemplateId = 'blank' | 'npc' | 'item' | 'building' | 'map' | 'event' | 'mail'

export type PackTemplateSeedPatch = {
  workspace: WorkspaceId
  action: DraftPatch['action']
  target: string
}

export type PackTemplate = {
  id: PackTemplateId
  seedPatches: readonly PackTemplateSeedPatch[]
  /** Workbench module opened after creation; `null` lands on the project dashboard. */
  landingModule: string | null
}

export const PACK_TEMPLATES: readonly PackTemplate[] = [
  {
    id: 'blank',
    seedPatches: [],
    landingModule: null,
  },
  {
    id: 'npc',
    seedPatches: [
      { workspace: 'characters', action: 'EditData', target: 'Data/Characters' },
      { workspace: 'characters', action: 'EditData', target: 'Data/NPCGiftTastes' },
    ],
    landingModule: 'character-authoring',
  },
  {
    id: 'item',
    seedPatches: [{ workspace: 'items', action: 'EditData', target: 'Data/Objects' }],
    landingModule: 'item-authoring',
  },
  {
    id: 'building',
    seedPatches: [{ workspace: 'buildings', action: 'EditData', target: 'Data/Buildings' }],
    landingModule: 'building-authoring',
  },
  {
    id: 'map',
    seedPatches: [],
    landingModule: 'map-authoring',
  },
  {
    id: 'event',
    seedPatches: [],
    landingModule: 'event-authoring',
  },
  {
    id: 'mail',
    seedPatches: [
      { workspace: 'mail', action: 'EditData', target: 'Data/mail' },
      { workspace: 'mail', action: 'EditData', target: 'Data/TriggerActions' },
    ],
    landingModule: 'mail-editor',
  },
]

/** Looks up a template by id; unknown ids fall back to the blank template. */
export function getPackTemplate(id: PackTemplateId): PackTemplate {
  return PACK_TEMPLATES.find((template) => template.id === id) ?? PACK_TEMPLATES[0]
}
