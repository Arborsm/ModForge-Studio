import { describe, expect, test } from 'vite-plus/test'
import {
  dialogueEntryLabel,
  isInlineEditableScript,
  parseDialogueScript,
  readInlineScriptText,
  serializeDialogueScript,
  writeInlineScriptText,
} from '@entities/dialogue'

describe('isInlineEditableScript', () => {
  test('single text pages are inline-editable, with or without a portrait suffix', () => {
    expect(isInlineEditableScript('你好。')).toBe(true)
    expect(isInlineEditableScript('你好。$h')).toBe(true)
  })

  test('multi-page, question and command entries are not', () => {
    expect(isInlineEditableScript('第一页#$e#第二页')).toBe(false)
    expect(isInlineEditableScript('问题？#$q 1/2 yes#$r 1 0 reply_yes#$r 2 0 reply_no')).toBe(false)
    expect(isInlineEditableScript('$action Warp 5 6 7')).toBe(false)
  })
})

describe('inline text round-trip', () => {
  test('editing the text preserves the portrait suffix', () => {
    const ast = parseDialogueScript('旧文本$h')
    expect(readInlineScriptText(ast)).toBe('旧文本')
    const next = writeInlineScriptText(ast, '新文本')
    expect(next).toBe('新文本$h')
    expect(serializeDialogueScript(parseDialogueScript(next))).toBe('新文本$h')
  })

  test('editing a plain text page round-trips cleanly', () => {
    const ast = parseDialogueScript('啊，对了……我听说有人搬到那座旧农场。')
    expect(writeInlineScriptText(ast, ' rewritten ')).toBe(' rewritten ')
  })
})

describe('dialogueEntryLabel', () => {
  test('author title wins', () => {
    expect(dialogueEntryLabel({ key: 'spring_Mon', title: '周一打招呼', script: 'ignored' })).toBe('周一打招呼')
  })

  test('falls back to the first spoken line, truncated', () => {
    const long = `这是一句${'特别'.repeat(30)}长的台词`
    expect(dialogueEntryLabel({ key: 'spring_Mon', title: null, script: long })).toBe(`${long.slice(0, 40)}…`)
    expect(dialogueEntryLabel({ key: 'spring_Mon', title: null, script: '  首行\n次行' })).toBe('首行')
  })

  test('falls back to the key for textless scripts', () => {
    expect(dialogueEntryLabel({ key: 'spring_Mon', title: null, script: '$action Warp 1 2 3' })).toBe('spring_Mon')
  })
})
