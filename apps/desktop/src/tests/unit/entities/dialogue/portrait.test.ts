import { describe, expect, it } from 'vite-plus/test'
import {
  buildPortraitToken,
  getDialoguePortraitFrame,
  getPortraitFrameIndex,
  parsePortraitToken,
  type DialoguePortrait,
} from '@entities/dialogue'
import { getPortraitFrameBounds } from '@entities/event/model/stage/eventStageAssets'

describe('dialogue portrait frames', () => {
  it('maps emotions and numeric commands onto portrait frame indexes', () => {
    expect(getPortraitFrameIndex({ kind: 'none' })).toBe(0)
    expect(getPortraitFrameIndex({ kind: 'emotion', emotion: 'neutral' })).toBe(0)
    expect(getPortraitFrameIndex({ kind: 'emotion', emotion: 'h' })).toBe(1)
    expect(getPortraitFrameIndex({ kind: 'emotion', emotion: 's' })).toBe(2)
    expect(getPortraitFrameIndex({ kind: 'emotion', emotion: 'u' })).toBe(3)
    expect(getPortraitFrameIndex({ kind: 'emotion', emotion: 'l' })).toBe(4)
    expect(getPortraitFrameIndex({ kind: 'emotion', emotion: 'a' })).toBe(5)
    expect(getPortraitFrameIndex({ kind: 'index', index: 9 })).toBe(9)
  })

  it('round-trips portrait tokens through parse and build', () => {
    const cases: Array<[string, DialoguePortrait]> = [
      ['$neutral', { kind: 'emotion', emotion: 'neutral' }],
      ['$h', { kind: 'emotion', emotion: 'h' }],
      ['$a', { kind: 'emotion', emotion: 'a' }],
      ['$12', { kind: 'index', index: 12 }],
    ]
    for (const [token, portrait] of cases) {
      expect(parsePortraitToken(token)).toEqual(portrait)
      expect(buildPortraitToken(portrait)).toBe(token)
    }
    expect(buildPortraitToken({ kind: 'none' })).toBe('')
  })

  it('computes 64x64 portrait sheet crops with clamping', () => {
    expect(getDialoguePortraitFrame(128, 128, 3)).toEqual({ frameSize: 64, frameX: 64, frameY: 64, columns: 2, rows: 2 })
    expect(getDialoguePortraitFrame(128, 384, 5)).toEqual({ frameSize: 64, frameX: 64, frameY: 128, columns: 2, rows: 6 })
    expect(getDialoguePortraitFrame(128, 128, 99)).toEqual({ frameSize: 64, frameX: 64, frameY: 64, columns: 2, rows: 2 })
    expect(getDialoguePortraitFrame(0, 0, 1)).toEqual({ frameSize: 64, frameX: 0, frameY: 0, columns: 1, rows: 1 })
  })

  it('keeps the event stage crop identical to the shared frame math', () => {
    const sheets = [
      [128, 128],
      [128, 384],
      [256, 512],
      [64, 64],
      [0, 0],
    ] as const

    for (const [sheetWidth, sheetHeight] of sheets) {
      for (const frameIndex of [0, 1, 5, 11, 99]) {
        const shared = getDialoguePortraitFrame(sheetWidth, sheetHeight, frameIndex)
        const stage = getPortraitFrameBounds({ portraitSheetWidth: sheetWidth, portraitSheetHeight: sheetHeight }, frameIndex)
        expect(stage).toEqual({
          frameWidth: shared.frameSize,
          frameHeight: shared.frameSize,
          frameX: shared.frameX,
          frameY: shared.frameY,
        })
      }
    }
  })
})
