import { describe, expect, it } from 'vite-plus/test'
import {
  buildAddMailAction,
  type MailTriggerDraft,
  parseAddMailAction,
  tokenizeActionString,
  triggerDraftFromEntry,
  triggerDraftToEntry,
} from '@pages/workbench/workspaces/mail/entities/mail'

describe('trigger action strings', () => {
  it('tokenizes quoted arguments and escaped quotes like the game parser', () => {
    expect(tokenizeActionString('AddMail Current Abigail_LeoMoved Now')).toEqual(['AddMail', 'Current', 'Abigail_LeoMoved', 'Now'])
    expect(tokenizeActionString('AddFriendshipPoints "Mister Qi" 10')).toEqual(['AddFriendshipPoints', 'Mister Qi', '10'])
    expect(tokenizeActionString('AddFriendshipPoints "Mister \\"Qi\\"" 10')).toEqual(['AddFriendshipPoints', 'Mister "Qi"', '10'])
  })

  it('parses AddMail with target normalization and the tomorrow default', () => {
    expect(parseAddMailAction('AddMail Current {{ModId}}_Mail_1')).toEqual({
      target: 'Current',
      mailId: '{{ModId}}_Mail_1',
      deliveryType: 'tomorrow',
    })
    expect(parseAddMailAction('addmail host SomeLetter now')).toEqual({ target: 'Host', mailId: 'SomeLetter', deliveryType: 'now' })
    expect(parseAddMailAction('AddMail All SomeLetter received')).toEqual({ target: 'All', mailId: 'SomeLetter', deliveryType: 'received' })
    expect(parseAddMailAction('AddMoney 500')).toBeNull()
    expect(parseAddMailAction('AddMail Nearby SomeLetter')).toBeNull()
    expect(parseAddMailAction('AddMail Current SomeLetter later')).toBeNull()
  })

  it('builds the canonical AddMail action with an explicit delivery type', () => {
    expect(buildAddMailAction({ target: 'Current', mailId: '{{ModId}}_Mail_1', deliveryType: 'tomorrow' })).toBe(
      'AddMail Current {{ModId}}_Mail_1 tomorrow',
    )
  })
})

describe('trigger entry mapping', () => {
  const draft: MailTriggerDraft = {
    id: '{{ModId}}_Mail_1_Trigger',
    trigger: 'DayStarted',
    mailId: '{{ModId}}_Mail_1',
    target: 'Current',
    deliveryType: 'tomorrow',
    condition: 'PLAYER_HEARTS Current Abigail 4',
    markActionApplied: true,
    hostOnly: false,
    extraActions: [],
    extraFields: {},
  }

  it('serializes a draft into the Data/TriggerActions entry shape', () => {
    expect(triggerDraftToEntry(draft)).toEqual({
      Id: '{{ModId}}_Mail_1_Trigger',
      Trigger: 'DayStarted',
      Actions: ['AddMail Current {{ModId}}_Mail_1 tomorrow'],
      Condition: 'PLAYER_HEARTS Current Abigail 4',
    })
  })

  it('omits Condition when empty and emits MarkActionApplied/HostOnly only when non-default', () => {
    const entry = triggerDraftToEntry({ ...draft, condition: '  ', markActionApplied: false, hostOnly: true })
    expect(entry).toEqual({
      Id: '{{ModId}}_Mail_1_Trigger',
      Trigger: 'DayStarted',
      Actions: ['AddMail Current {{ModId}}_Mail_1 tomorrow'],
      MarkActionApplied: false,
      HostOnly: true,
    })
  })

  it('round-trips a draft through the entry shape', () => {
    const withExtras: MailTriggerDraft = {
      ...draft,
      deliveryType: 'received',
      extraActions: ['AddConversationTopic {{ModId}}_LeoMoved 5'],
      extraFields: { CustomFields: { Note: 'kept' } },
    }
    const entry = triggerDraftToEntry(withExtras)
    expect(triggerDraftFromEntry(withExtras.id, entry)).toEqual(withExtras)
  })

  it('parses the wiki example entry, keeping non-AddMail actions as extras', () => {
    const parsed = triggerDraftFromEntry('{{ModId}}_OnLeoMoved', {
      Id: '{{ModId}}_OnLeoMoved',
      Trigger: 'DayEnding',
      Condition: 'PLAYER_HAS_MAIL Host leoMoved',
      Actions: ['AddMail Current {{ModId}}_Abigail_LeoMoved', 'AddConversationTopic {{ModId}}_LeoMoved 5'],
    })
    expect(parsed).toEqual({
      id: '{{ModId}}_OnLeoMoved',
      trigger: 'DayEnding',
      mailId: '{{ModId}}_Abigail_LeoMoved',
      target: 'Current',
      deliveryType: 'tomorrow',
      condition: 'PLAYER_HAS_MAIL Host leoMoved',
      markActionApplied: true,
      hostOnly: false,
      extraActions: ['AddConversationTopic {{ModId}}_LeoMoved 5'],
      extraFields: {},
    })
  })

  it('supports the single Action shortcut field', () => {
    const parsed = triggerDraftFromEntry('key', {
      Id: 'key',
      Trigger: 'LocationChanged',
      Action: 'AddMail All SomeLetter now',
    })
    expect(parsed?.mailId).toBe('SomeLetter')
    expect(parsed?.target).toBe('All')
    expect(parsed?.deliveryType).toBe('now')
  })

  it('returns null for entries without a parseable AddMail action so they stay untouched', () => {
    expect(triggerDraftFromEntry('key', { Id: 'key', Trigger: 'DayStarted', Actions: ['AddMoney 500'] })).toBeNull()
    expect(triggerDraftFromEntry('key', 'not-an-object')).toBeNull()
  })
})
