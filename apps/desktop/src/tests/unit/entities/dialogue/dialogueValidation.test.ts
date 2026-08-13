import { describe, expect, it } from 'vite-plus/test'
import { validateDialogueScript } from '@entities/dialogue'

describe('dialogue script validation', () => {
  it('accepts well-formed vanilla scripts without warnings', () => {
    const clean = [
      "Oh, that's right... I heard someone new was moving onto that old farm.#$e#It's kind of a shame.$9",
      'I wonder what would happen?#$q 17/18 Sun_old#What do you think?#$r 17 0 Sun_17#I have no idea.#$r 18 40 Sun_18#Ghosts.',
      '$p 17#I guess you think nothing would happen, right?$u|Maybe a wicked ghost would appear!',
      "#$1 Abigail1#Oh no, my Dad is cooking tonight...$s#$e#I don't feel like doing anything today...$u",
      "You're an interesting ${guy^lady}$, @.$h",
    ]
    for (const script of clean) {
      expect(validateDialogueScript(script), script).toEqual([])
    }
  })

  it('surfaces unknown dollar commands as warnings, never errors', () => {
    const warnings = validateDialogueScript('$frobnicate all the things#and more')
    expect(warnings).toEqual([{ code: 'unknown-command', pageIndex: 0, detail: '$frobnicate' }])
  })

  it('flags unterminated question blocks', () => {
    expect(validateDialogueScript('Ask me.#$q 1/2 fallback')).toContainEqual({
      code: 'unterminated-question',
      pageIndex: 0,
      detail: '$q 1/2 fallback',
    })
    expect(validateDialogueScript('Ask me.#$q 1/2 fallback#Prompt#$r 1 0 key')).toContainEqual({
      code: 'unterminated-question',
      pageIndex: 0,
      detail: '$r 1 0 key',
    })
  })

  it('flags orphan and malformed response segments', () => {
    expect(validateDialogueScript('Hello#$r 1 0 key#Answer')).toContainEqual({
      code: 'orphan-response',
      pageIndex: 0,
      detail: '$r 1 0 key',
    })
    expect(validateDialogueScript('Ask.#$q 1 f#Prompt#$r 1#Answer')).toContainEqual({
      code: 'malformed-response',
      pageIndex: 0,
      detail: '$r 1',
    })
  })

  it('flags empty pages and unbalanced gender switches with page indexes', () => {
    expect(validateDialogueScript('First#$e#')).toContainEqual({ code: 'empty-page', pageIndex: 1, detail: '' })
    expect(validateDialogueScript('Fine.#$e#Broken ${guy^lady here')).toContainEqual({
      code: 'unbalanced-gender-switch',
      pageIndex: 1,
      detail: '${...}$',
    })
  })
})
