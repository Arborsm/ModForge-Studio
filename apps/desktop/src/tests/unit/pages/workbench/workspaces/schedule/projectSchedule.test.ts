import { describe, expect, it } from 'vite-plus/test'
import type { DraftPatch } from '@features/cp-maker'
import {
  buildScheduleEntrySummaries,
  buildScheduleNpcOptions,
  buildScheduleTarget,
  collectProjectNpcIds,
  getScheduleEntryKeyError,
  type SchedulePatchEditorState,
} from '@pages/workbench/workspaces/schedule/entities/schedule'

function makePatch(patch: Partial<DraftPatch> & Pick<DraftPatch, 'id' | 'workspace' | 'target'>): DraftPatch {
  return {
    action: 'EditData',
    logName: '',
    enabled: true,
    editorState: {},
    ...patch,
  }
}

const EMPTY_STATE: SchedulePatchEditorState = { entries: {}, disabledEntries: {}, entryLabels: {} }

describe('schedule patch targets', () => {
  it('builds the schedule target for an NPC', () => {
    expect(buildScheduleTarget('Abigail')).toBe('Characters/schedules/Abigail')
    expect(buildScheduleTarget('MyMod.Npc')).toBe('Characters/schedules/MyMod.Npc')
  })
})

describe('schedule entry key validation', () => {
  it('validates entry keys against project entries only', () => {
    const state: SchedulePatchEditorState = {
      entries: { spring: 'GOTO summer' },
      disabledEntries: { rain: 'GOTO spring' },
      entryLabels: {},
    }
    expect(getScheduleEntryKeyError(state, '', null)).toBe('empty')
    expect(getScheduleEntryKeyError(state, '   ', null)).toBe('empty')
    expect(getScheduleEntryKeyError(state, 'spring', null)).toBe('conflict')
    expect(getScheduleEntryKeyError(state, 'rain', null)).toBe('conflict')
    expect(getScheduleEntryKeyError(state, 'spring', 'spring')).toBeNull()
    expect(getScheduleEntryKeyError(state, 'summer', 'spring')).toBeNull()
  })
})

describe('schedule entry merging', () => {
  it('merges project entries over vanilla ones with origin flags', () => {
    const vanilla = {
      spring: '900 SeedShop 39 5 0/1930 SeedShop 1 9 3 abigail_sleep',
      rain: '900 SeedShop 9 5 0',
      '16': 'GOTO 6',
    }
    const state: SchedulePatchEditorState = {
      entries: { rain: '900 Saloon 1 2 0', custom_day: 'GOTO spring' },
      disabledEntries: { winter: '900 SeedShop 1 1 0' },
      entryLabels: { rain: 'Rainy override' },
    }

    const summaries = buildScheduleEntrySummaries(vanilla, state)
    // Integer-like keys ('16') enumerate first per JS object semantics; the
    // vanilla group still precedes project-only keys.
    expect(summaries.map((summary) => summary.key)).toEqual(['16', 'spring', 'rain', 'custom_day', 'winter'])

    const spring = summaries[1]!
    expect(spring).toMatchObject({ origin: 'vanilla', enabled: true, script: vanilla.spring, vanillaScript: vanilla.spring })

    const rain = summaries[2]!
    expect(rain).toMatchObject({
      origin: 'override',
      enabled: true,
      script: '900 Saloon 1 2 0',
      vanillaScript: '900 SeedShop 9 5 0',
      label: 'Rainy override',
    })

    expect(summaries[3]).toMatchObject({ origin: 'project', enabled: true, vanillaScript: null })
    expect(summaries[4]).toMatchObject({ origin: 'project', enabled: false, script: '900 SeedShop 1 1 0' })
  })

  it('marks structured parseability per effective script', () => {
    const summaries = buildScheduleEntrySummaries({ spring: '900 SeedShop 39 5 0', broken: 'ArchaeologyHouse 16 10 2' }, EMPTY_STATE)
    expect(summaries.find((summary) => summary.key === 'spring')?.structured).toBe(true)
    expect(summaries.find((summary) => summary.key === 'broken')?.structured).toBe(false)
  })

  it('handles the missing vanilla schedule as an empty base', () => {
    const state: SchedulePatchEditorState = {
      entries: { spring: 'GOTO summer' },
      disabledEntries: {},
      entryLabels: {},
    }
    expect(buildScheduleEntrySummaries(null, state)).toHaveLength(1)
    expect(buildScheduleEntrySummaries(null, EMPTY_STATE)).toEqual([])
  })
})

describe('schedule NPC catalog', () => {
  it('collects project NPC ids from Data/Characters EditData patches in any workspace', () => {
    const patches = [
      makePatch({ id: '1', workspace: 'characters', target: 'Data/Characters', editorState: { entries: { MyNpc: '{}', Abigail: '{}' } } }),
      makePatch({ id: '2', workspace: 'mods', target: 'data\\characters', editorState: { entries: { OtherNpc: '{}' } } }),
      makePatch({
        id: '3',
        workspace: 'characters',
        target: 'Data/Characters',
        action: 'Load',
        editorState: { entries: { Ignored: '{}' } },
      }),
      makePatch({ id: '4', workspace: 'characters', target: 'Data/Objects', editorState: { entries: { AlsoIgnored: '{}' } } }),
      makePatch({ id: '5', workspace: 'characters', target: 'Data/Characters', editorState: { entries: null } }),
    ]
    expect(collectProjectNpcIds(patches).sort()).toEqual(['Abigail', 'MyNpc', 'OtherNpc'])
  })

  it('builds NPC options with display-name fallback and project-first grouping', () => {
    const vanillaCharacters = {
      Abigail: { DisplayName: '[LocalizedText Strings\\NPCNames:Abigail]' },
      Caroline: { DisplayName: 'Caroline the Green' },
      Broken: 42,
    }
    const options = buildScheduleNpcOptions(vanillaCharacters, ['MyNpc', 'Abigail'])

    expect(options.map((option) => `${option.source}:${option.id}`)).toEqual([
      'project:MyNpc',
      'vanilla:Abigail',
      'vanilla:Broken',
      'vanilla:Caroline',
    ])
    expect(options.find((option) => option.id === 'Abigail')?.displayName).toBe('Abigail')
    expect(options.find((option) => option.id === 'Caroline')?.displayName).toBe('Caroline the Green')
    expect(options.find((option) => option.id === 'Broken')?.displayName).toBe('Broken')
  })

  it('prefers the loader-resolved sidecar name over a raw token', () => {
    const vanillaCharacters = {
      Abigail: { DisplayName: '[LocalizedText Strings\\NPCNames:Abigail]', __resolvedDisplayName: '阿比盖尔' },
    }
    const options = buildScheduleNpcOptions(vanillaCharacters, [])
    expect(options[0]?.displayName).toBe('阿比盖尔')
  })

  it('returns only project options without vanilla data', () => {
    expect(buildScheduleNpcOptions(null, ['MyNpc'])).toEqual([{ id: 'MyNpc', displayName: 'MyNpc', source: 'project' }])
  })
})
