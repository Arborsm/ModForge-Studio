import { describe, expect, it } from 'vite-plus/test'
import {
  buildNpcGiftTasteBuckets,
  buildUniversalGiftTasteBuckets,
  normalizeContextTag,
  normalizeTagFragment,
  parseQualifiedGiftTasteObjectId,
} from './giftTasteHelpers'

describe('giftTasteHelpers', () => {
  it('parses qualified object ids without losing plain ids', () => {
    expect(parseQualifiedGiftTasteObjectId(' (O)74 ')).toBe('74')
    expect(parseQualifiedGiftTasteObjectId('Parsnip')).toBe('Parsnip')
    expect(parseQualifiedGiftTasteObjectId('')).toBeNull()
  })

  it('normalizes context tags and tag fragments consistently', () => {
    expect(normalizeContextTag('  Fish Pond  ')).toBe('fish pond')
    expect(normalizeTagFragment(" Qi's Walnut Room ")).toBe('qis_walnut_room')
  })

  it('builds universal gift taste buckets from the shared data keys', () => {
    expect(
      buildUniversalGiftTasteBuckets({
        Universal_Love: '74 166',
        Universal_Like: '2 4',
        Universal_Dislike: '5',
        Universal_Hate: '6',
        Universal_Neutral: '7',
      }),
    ).toEqual({
      love: ['74', '166'],
      like: ['2', '4'],
      dislike: ['5'],
      hate: ['6'],
      neutral: ['7'],
    })
  })

  it('builds npc gift taste buckets from slash-separated npc data', () => {
    expect(buildNpcGiftTasteBuckets('ignored/74 166/ignored/2 4/ignored/5/ignored/6/ignored/7')).toEqual({
      love: ['74', '166'],
      like: ['2', '4'],
      dislike: ['5'],
      hate: ['6'],
      neutral: ['7'],
    })
  })
})
