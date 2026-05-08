import { describe, expect, test } from 'vitest'
import type { DraftPatch, CpMakerDraft } from '@shared/contracts'
import { buildStudioDeskModel } from '@features/cp-maker'

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

function draft(patches: DraftPatch[] = []): CpMakerDraft {
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
  test('derives project lobby cards and counts from draft summaries', () => {
    const activeDraft = draft([patch({ id: 'disabled', enabled: false })])

    const model = buildStudioDeskModel({
      activeDraft,
      drafts: [
        {
          draftStorageKey: 'draft-1',
          projectName: '星露谷夏日祭扩展',
          projectUniqueId: 'Arbor.SummerFestival',
          lastDraftSavedAt: 200,
          lastExportedAt: 100,
        },
        {
          draftStorageKey: 'draft-2',
          projectName: '海风旅店',
          projectUniqueId: 'Arbor.HarborInn',
          lastDraftSavedAt: 50,
          lastExportedAt: 60,
        },
      ],
      patchCountByWorkspace: { events: 1 },
      dirtyPatchIds: new Set(['disabled']),
      isDirty: true,
    })

    expect(model.gallery.projects.map((project) => project.title)).toEqual([
      '星露谷夏日祭扩展',
      '海风旅店',
    ])
    expect(model.gallery.projects[0]?.statuses).toEqual(['active', 'export', 'conflict'])
    expect(model.gallery.counts).toMatchObject({ all: 2, active: 2, export: 1, conflict: 1, archive: 0 })
  })

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
    activeDraft.customLocations = [{ name: 'FestivalPlaza', fromMapFile: 'Maps/FestivalPlaza.tmx' }]
    activeDraft.patches = [
      patch({ id: 'event', workspace: 'events', logName: 'Festival intro', target: 'Data/Events/Town' }),
      patch({ id: 'item', workspace: 'items', logName: 'Festival drink', target: 'Data/Objects' }),
    ]

    const model = buildStudioDeskModel({
      activeDraft,
      drafts: [],
      patchCountByWorkspace: {},
      dirtyPatchIds: new Set(),
      isDirty: false,
    })

    expect(model.worldBible.configSchema).toEqual([{ key: 'EnableFestival', value: 'true' }])
    expect(model.worldBible.tokens).toEqual([{ key: 'FestivalDay', value: '{{FestivalDay}}' }])
    expect(model.worldBible.story).toEqual([{ key: 'Festival intro', value: 'Data/Events/Town' }])
    expect(model.worldBible.items).toEqual([{ key: 'Festival drink', value: 'Data/Objects' }])
    expect(model.worldBible.scenes).toEqual([{ key: 'FestivalPlaza', value: 'Maps/FestivalPlaza.tmx' }])
  })
})
