import { describe, expect, it } from 'vite-plus/test'
import { type MailAttachment, parseMailAttachmentBody, serializeMailAttachment } from '@pages/workbench/workspaces/mail/entities/mail'

describe('mail attachment builder', () => {
  it('serializes every buildable kind in canonical %item form', () => {
    const cases: Array<[MailAttachment, string]> = [
      [
        {
          kind: 'id',
          items: [
            { itemId: '(O)388', count: 50 },
            { itemId: '(BC)12', count: 3 },
          ],
        },
        '%item id (O)388 50 (BC)12 3 %%',
      ],
      [{ kind: 'id', items: [{ itemId: '(F)2312', count: null }] }, '%item id (F)2312 %%'],
      [{ kind: 'money', min: 500, max: null }, '%item money 500 %%'],
      [{ kind: 'money', min: 250, max: 601 }, '%item money 250 601 %%'],
      [{ kind: 'quest', questId: '15', autoAdd: true }, '%item quest 15 true %%'],
      [{ kind: 'quest', questId: '20', autoAdd: false }, '%item quest 20 %%'],
      [{ kind: 'cookingRecipe', recipeKey: null }, '%item cookingRecipe %%'],
      [{ kind: 'cookingRecipe', recipeKey: 'Pizza' }, '%item cookingRecipe Pizza %%'],
      [{ kind: 'craftingRecipe', recipeKey: 'Tea_Sapling' }, '%item craftingRecipe Tea_Sapling %%'],
      [{ kind: 'conversationTopic', topicId: 'ElliottGone2', days: 4 }, '%item conversationTopic ElliottGone2 4 %%'],
      [{ kind: 'specialOrder', orderId: 'Willy2', immediately: true }, '%item specialOrder Willy2 true %%'],
      [{ kind: 'specialOrder', orderId: 'Willy2', immediately: false }, '%item specialOrder Willy2 %%'],
      [{ kind: 'itemRecovery' }, '%item itemRecovery %%'],
      [{ kind: 'tools', tools: ['Axe', 'Scythe'] }, '%item tools Axe Scythe %%'],
      [
        {
          kind: 'object',
          items: [
            { itemId: '388', count: 50 },
            { itemId: '390', count: 10 },
          ],
        },
        '%item object 388 50 390 10 %%',
      ],
      [{ kind: 'bigobject', ids: ['144', '163'] }, '%item bigobject 144 163 %%'],
      [{ kind: 'furniture', ids: ['1142', '709'] }, '%item furniture 1142 709 %%'],
      [{ kind: 'unknown', body: 'mysteryForm abc 1' }, '%item mysteryForm abc 1 %%'],
    ]
    for (const [attachment, expected] of cases) {
      expect(serializeMailAttachment(attachment)).toBe(expected)
    }
  })

  it('round-trips typed attachments through parse(serialize(x))', () => {
    const attachments: MailAttachment[] = [
      { kind: 'id', items: [{ itemId: '(O)388', count: 50 }] },
      { kind: 'money', min: 250, max: 601 },
      { kind: 'quest', questId: '1', autoAdd: true },
      { kind: 'cookingRecipe', recipeKey: null },
      { kind: 'craftingRecipe', recipeKey: 'Stone_Chest' },
      { kind: 'conversationTopic', topicId: 'Topic', days: 0 },
      { kind: 'specialOrder', orderId: 'QiChallenge', immediately: false },
      { kind: 'itemRecovery' },
      { kind: 'tools', tools: ['Can'] },
      { kind: 'bigobject', ids: ['141'] },
    ]
    for (const attachment of attachments) {
      const serialized = serializeMailAttachment(attachment)
      expect(parseMailAttachmentBody(serialized.slice('%item'.length, serialized.length - 2))).toEqual(attachment)
    }
  })

  it('treats an integer after an item id as its count, mirroring the game scan', () => {
    expect(parseMailAttachmentBody(' id 224 1 (O)223 ')).toEqual({
      kind: 'id',
      items: [
        { itemId: '224', count: 1 },
        { itemId: '(O)223', count: null },
      ],
    })
  })

  it('captures malformed payloads without throwing', () => {
    expect(parseMailAttachmentBody(' money ')).toEqual({ kind: 'money', min: null, max: null })
    expect(parseMailAttachmentBody(' quest ')).toEqual({ kind: 'quest', questId: '', autoAdd: false })
    expect(parseMailAttachmentBody(' conversationTopic OnlyTopic ')).toEqual({
      kind: 'conversationTopic',
      topicId: 'OnlyTopic',
      days: null,
    })
    expect(parseMailAttachmentBody(' somethingElse 1 2 3 ')).toEqual({ kind: 'unknown', body: 'somethingElse 1 2 3' })
  })
})
