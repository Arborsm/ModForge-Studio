import { describe, expect, test } from 'vitest'
import type { DraftPatch, GeneratedProjectDraft } from './useGeneratedProject'
import { buildStudioDeskModel } from './studioDeskModel'

function patch(overrides: Partial<DraftPatch>): DraftPatch {
  return {
    id: 'patch-1',
    workspace: 'events',
    target: 'Data/Events/Town',
    action: 'EditData',
    logName: 'Abigail secret event',
    enabled: true,
    editorState: {},
    updatedAt: 100,
    ...overrides,
  }
}

function draft(patches: DraftPatch[] = []): GeneratedProjectDraft {
  return {
    draftStorageKey: 'draft-1',
    projectMetadata: {
      projectName: '星露谷夏日祭扩展',
      projectDescription: '',
      projectAuthor: 'Arbor',
      projectVersion: '1.0.0',
      projectUniqueId: 'Arbor.SummerFestival',
      gameRootPath: 'E:/Stardew Valley',
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
    },
    overlayTargets: [],
    configSchema: [],
    patches,
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
  }
}

describe('buildStudioDeskModel', () => {
  test('sorts recent inspirations by updatedAt descending', () => {
    const model = buildStudioDeskModel({
      activeDraft: draft([
        patch({ id: 'old', logName: 'Old map', workspace: 'map', updatedAt: 10 }),
        patch({ id: 'new', logName: 'New event', workspace: 'events', updatedAt: 30 }),
      ]),
      drafts: [],
      patchCountByWorkspace: { map: 1, events: 1 },
      dirtyPatchIds: new Set(),
      isDirty: false,
    })

    expect(model.recentInspirations.map((item) => item.patchId)).toEqual(['new', 'old'])
  })

  test('marks dirty inspirations with blue status only when patch id is dirty', () => {
    const model = buildStudioDeskModel({
      activeDraft: draft([patch({ id: 'dirty', updatedAt: 20 })]),
      drafts: [],
      patchCountByWorkspace: { events: 1 },
      dirtyPatchIds: new Set(['dirty']),
      isDirty: true,
    })

    expect(model.recentInspirations[0]?.status).toBe('modified')
  })

  test('models workspaces as independent entries instead of categories', () => {
    const model = buildStudioDeskModel({
      activeDraft: draft([
        patch({ id: 'map-1', workspace: 'map' }),
        patch({ id: 'event-1', workspace: 'events' }),
      ]),
      drafts: [],
      patchCountByWorkspace: { map: 1, events: 1 },
      dirtyPatchIds: new Set(),
      isDirty: false,
    })

    expect(model.workspaceEntrypoints.map((entry) => entry.workspaceId)).toEqual([
      'events',
      'map',
      'characters',
      'buildings',
      'items',
      'mods',
    ])
    expect(model.workspaceEntrypoints.find((entry) => entry.workspaceId === 'events')?.kind).toBe(
      'independent-workspace',
    )
  })

  test('exposes world bible entries without reference or drag actions', () => {
    const activeDraft = draft()
    activeDraft.configSchema = [{ key: 'EnableFestival', defaultValue: true }]
    activeDraft.dynamicTokens = [{ name: 'FestivalDay', value: '14' }]

    const model = buildStudioDeskModel({
      activeDraft,
      drafts: [],
      patchCountByWorkspace: {},
      dirtyPatchIds: new Set(),
      isDirty: false,
    })

    expect(model.worldBible.configSchema).toEqual([{ key: 'EnableFestival', value: 'true' }])
    expect(model.worldBible.tokens).toEqual([{ key: 'FestivalDay', value: '{{FestivalDay}}' }])
  })
})
