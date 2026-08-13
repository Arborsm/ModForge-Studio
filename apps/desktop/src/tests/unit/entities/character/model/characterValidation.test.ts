import { describe, expect, it } from 'vite-plus/test'
import { formatIssuePath } from '@entities/asset-schema'
import { validateCharacterEntries, validateGiftTasteEntries } from '@entities/character'

describe('validateCharacterEntries', () => {
  it('flags out-of-range birthdays', () => {
    const issues = validateCharacterEntries({ Aspen: { DisplayName: 'Aspen', BirthDay: 29 } })
    expect(issues.map((issue) => issue.code)).toEqual(['birthDayRange'])
    expect(validateCharacterEntries({ Aspen: { DisplayName: 'Aspen', BirthDay: 28 } })).toEqual([])
  })

  it('flags non-numeric home tiles and invalid directions with the home index in the path', () => {
    const issues = validateCharacterEntries({
      Aspen: {
        DisplayName: 'Aspen',
        Home: [
          { Location: 'Town', Tile: { X: 'one', Y: 2 }, Direction: 'down' },
          { Location: 'Desert', Tile: { X: 1, Y: 2 }, Direction: 'backwards' },
        ],
      },
    })
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([
      ['homeTileNotNumeric', 'Aspen.Home[1].Tile'],
      ['enumUnknown', 'Aspen.Home[2].Direction'],
    ])
  })

  it('accepts direction spellings in any case', () => {
    expect(validateCharacterEntries({ Aspen: { DisplayName: 'Aspen', Home: [{ Direction: 'Down' }] } })).toEqual([])
  })

  it('requires a display name on every entry', () => {
    expect(validateCharacterEntries({ Aspen: {} }).map((issue) => issue.code)).toEqual(['requiredMissing'])
  })
})

describe('validateGiftTasteEntries', () => {
  const fullRow = 'Lovely!/(O)220/Nice./(O)24/Meh./(O)16/Awful./(O)80/Hmm./(O)78'

  it('accepts a well-formed row for a known character', () => {
    expect(validateGiftTasteEntries({ Aspen: fullRow }, ['Aspen'])).toEqual([])
  })

  it('never reports Universal_* rows as orphans', () => {
    expect(validateGiftTasteEntries({ Universal_Love: '(O)220 (O)24' }, ['Aspen'])).toEqual([])
  })

  it('reports a row whose NPC has no character entry as info', () => {
    const issues = validateGiftTasteEntries({ Aspen: fullRow }, ['Birch'])
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([['info', 'giftTasteOrphanEntry']])
  })

  it('stays quiet about orphans when no character keys are known yet', () => {
    expect(validateGiftTasteEntries({ Aspen: fullRow })).toEqual([])
  })

  it('warns when a taste lists items but no reaction dialogue', () => {
    const issues = validateGiftTasteEntries({ Aspen: '/(O)220/Nice./(O)24////' }, ['Aspen'])
    expect(issues.map((issue) => [issue.code, formatIssuePath(issue.path)])).toEqual([['giftTasteReactionMissing', 'Aspen.love.reaction']])
  })

  it('rejects slashes inside a reaction or an item token', () => {
    const issues = validateGiftTasteEntries({ Aspen: { love: { reaction: 'a/b', items: ['(O)220'] } } }, ['Aspen'])
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([['error', 'giftTasteTokenDelimiter']])
  })

  it('warns when the same item appears under two different tastes', () => {
    const issues = validateGiftTasteEntries({ Aspen: 'Lovely!/(O)220/Nice./(o)220/////' }, ['Aspen'])
    expect(issues.map((issue) => [issue.code, issue.params?.['taste']])).toEqual([['giftTasteDuplicateToken', 'love']])
  })

  it('allows the same item twice inside one taste', () => {
    expect(validateGiftTasteEntries({ Aspen: 'Lovely!/(O)220 (O)220/////// ' }, ['Aspen'])).toEqual([])
  })
})
