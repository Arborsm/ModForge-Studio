import { describe, expect, it } from 'vite-plus/test'
import { buildDialoguePriorityTree, type DialogueEntrySummary } from '@entities/dialogue'

function entry(key: string, overrides: Partial<DialogueEntrySummary> = {}): DialogueEntrySummary {
  return {
    key,
    script: `Line for ${key}.`,
    origin: 'project',
    vanillaScript: null,
    title: null,
    pageCount: 1,
    preview: `Line for ${key}.`,
    ...overrides,
  }
}

function shape(entries: readonly DialogueEntrySummary[]) {
  return buildDialoguePriorityTree(entries).map((tier) => ({
    tier: tier.tier,
    entryCount: tier.entryCount,
    families: tier.families.map((family) => ({ family: family.family, keys: family.entries.map((node) => node.entry.key) })),
  }))
}

describe('dialogue priority tree', () => {
  it('groups entries into tiers in fixed order with families by descending rank', () => {
    expect(
      shape([
        entry('Mon'),
        entry('Introduction'),
        entry('spring_1'),
        entry('Resort_Bar'),
        entry('eventSeen_1_memory'),
        entry('summer_Mon'),
      ]),
    ).toEqual([
      { tier: 'story', entryCount: 1, families: [{ family: 'introduction', keys: ['Introduction'] }] },
      { tier: 'location', entryCount: 1, families: [{ family: 'location', keys: ['Resort_Bar'] }] },
      {
        tier: 'date',
        entryCount: 3,
        families: [
          { family: 'seasonDay', keys: ['spring_1'] },
          { family: 'seasonWeekday', keys: ['summer_Mon'] },
          { family: 'weekday', keys: ['Mon'] },
        ],
      },
      { tier: 'custom', entryCount: 1, families: [{ family: 'custom', keys: ['eventSeen_1_memory'] }] },
    ])
  })

  it('orders entries inside a family by descending precedence, then numerically by key', () => {
    // A bare weekday key and its heart-gated variants live in different families,
    // so precedence ordering only has to hold inside `weekdayHearts`.
    expect(shape([entry('Mon2'), entry('Mon10'), entry('Mon'), entry('Mon4')])).toEqual([
      {
        tier: 'date',
        entryCount: 4,
        families: [
          { family: 'weekdayHearts', keys: ['Mon10', 'Mon4', 'Mon2'] },
          { family: 'weekday', keys: ['Mon'] },
        ],
      },
    ])
  })

  it('attaches the shadow report of each entry so the rail can degrade the row', () => {
    const tree = buildDialoguePriorityTree([entry('Mon10'), entry('summer_Mon')])
    const rows = tree.flatMap((tier) => tier.families.flatMap((family) => family.entries))
    expect(rows.map((node) => [node.entry.key, node.shadow?.shadowedBy ?? null, node.shadow?.scope ?? null])).toEqual([
      ['summer_Mon', null, null],
      ['Mon10', 'summer_Mon', 'partial'],
    ])
  })

  it('re-homes marriage-asset keys when the entries come from a MarriageDialogue asset', () => {
    const entries = [entry('spring_1'), entry('Mon'), entry('funLeave')]
    expect(buildDialoguePriorityTree(entries, { marriageAsset: true }).map((tier) => tier.tier)).toEqual(['highPriority'])
    expect(buildDialoguePriorityTree(entries).map((tier) => tier.tier)).toEqual(['highPriority', 'date'])
  })

  it('drops empty tiers and returns nothing for an empty entry list', () => {
    expect(buildDialoguePriorityTree([])).toEqual([])
    expect(buildDialoguePriorityTree([entry('Mon')]).map((tier) => tier.tier)).toEqual(['date'])
  })
})
