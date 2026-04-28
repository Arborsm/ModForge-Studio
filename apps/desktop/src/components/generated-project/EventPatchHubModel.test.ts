import { describe, expect, test } from 'vitest'
import type { DraftPatch } from '../../lib/app/useGeneratedProject'
import { buildEventPatchHubPatches } from './EventPatchHubModel'

function patch(overrides: Partial<DraftPatch> = {}): DraftPatch {
  return {
    id: 'patch-town',
    workspace: 'events',
    action: 'EditData',
    target: 'Data/Events/Town',
    logName: 'Town_Events_Spring',
    enabled: true,
    when: { Season: 'spring' },
    editorState: {
      entries: {
        event_square_meeting_1900:
          'spring/Farmer 12 45/Abigail 12 45 2 Sam 13 45 2/speak Abigail "今天广场的人比平时多"/pause 500',
      },
    },
    ...overrides,
  }
}

describe('EventPatchHubModel', () => {
  test('derives storyboard event data from draft patch entries', () => {
    const [model] = buildEventPatchHubPatches([patch()])

    expect(model?.displayName).toBe('Town_Events_Spring')
    expect(model?.conditionSummary).toBe('Season = spring')
    expect(model?.events).toHaveLength(1)
    expect(model?.events[0]).toMatchObject({
      key: 'event_square_meeting_1900',
      title: 'event_square_meeting_1900',
      location: 'Town (12, 45)',
      commandCount: 2,
      status: 'draft',
    })
    expect(model?.events[0]?.actors.map((actor) => actor.name)).toEqual(['Abigail', 'Sam'])
  })

  test('keeps empty real state empty instead of inventing mock events', () => {
    const [model] = buildEventPatchHubPatches([
      patch({
        editorState: { entries: {} },
      }),
    ])

    expect(model?.events).toEqual([])
    expect(model?.stats.commands).toBe(0)
  })

  test('groups event preconditions into semantic hub columns', () => {
    const [model] = buildEventPatchHubPatches([
      patch({
        editorState: {
          entries: {
            'event_market/Season Spring/Time 1400 2300/Friendship Clint 750/SawEvent FestivalIntroSeen/DaysPlayed 28':
              'spring/Farmer 12 45/Clint 12 45 2/message "Market"',
          },
        },
      }),
    ])

    expect(model?.events[0]?.preconditionGroups.environment.map((item) => item.canonicalKey)).toEqual(['Season', 'Time'])
    expect(model?.events[0]?.preconditionGroups.player.map((item) => item.canonicalKey)).toEqual(['Friendship'])
    expect(model?.events[0]?.preconditionGroups.progress.map((item) => item.canonicalKey)).toEqual(['SawEvent', 'DaysPlayed'])
  })
})
