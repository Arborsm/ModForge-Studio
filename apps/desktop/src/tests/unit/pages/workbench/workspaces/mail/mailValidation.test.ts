import { describe, expect, it } from 'vite-plus/test'
import {
  mailDraftFromString,
  type MailLetterValidationInput,
  type MailTriggerDraft,
  summarizeIssues,
  validateMailLetter,
} from '@pages/workbench/workspaces/mail/entities/mail'

function trigger(overrides: Partial<MailTriggerDraft> = {}): MailTriggerDraft {
  return {
    id: '{{ModId}}_Mail_1_Trigger',
    trigger: 'DayStarted',
    mailId: '{{ModId}}_Mail_1',
    target: 'Current',
    deliveryType: 'tomorrow',
    condition: '',
    markActionApplied: true,
    hostOnly: false,
    extraActions: [],
    extraFields: {},
    ...overrides,
  }
}

function input(overrides: Partial<MailLetterValidationInput> = {}): MailLetterValidationInput {
  return {
    mailId: '{{ModId}}_Mail_1',
    draft: mailDraftFromString('Hello @!^Welcome.[#]Welcome'),
    allMailIds: ['{{ModId}}_Mail_1'],
    triggers: [trigger()],
    allTriggerIds: ['{{ModId}}_Mail_1_Trigger'],
    letterBgFrameCount: 8,
    ...overrides,
  }
}

function codes(issues: ReturnType<typeof validateMailLetter>) {
  return issues.map((issue) => issue.code)
}

describe('mail letter validation', () => {
  it('accepts a complete letter with a delivery trigger', () => {
    expect(validateMailLetter(input())).toEqual([])
  })

  it('flags empty bodies as errors', () => {
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('') })))).toContain('emptyBody')
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('   [#]Title') })))).toContain('emptyBody')
  })

  it('validates mail id shape, prefix, duplicates, and reserved words', () => {
    expect(codes(validateMailLetter(input({ mailId: '' })))).toContain('mailIdMissing')
    expect(codes(validateMailLetter(input({ mailId: 'has space' })))).toContain('invalidMailId')
    expect(
      codes(validateMailLetter(input({ mailId: '{{ModId}}_Mail_1', allMailIds: ['{{ModId}}_Mail_1', '{{ModId}}_Mail_1'] }))),
    ).toContain('duplicateMailId')
    expect(codes(validateMailLetter(input({ mailId: 'PlainId' })))).toContain('missingModIdPrefix')
    const reserved = validateMailLetter(input({ mailId: '{{ModId}}_RobinCooking' }))
    expect(codes(reserved)).toContain('reservedMailId')
    expect(reserved.find((issue) => issue.code === 'reservedMailId')?.detail).toBe('Cooking')
  })

  it('flags letter background indexes outside the sheet or the vanilla catalog', () => {
    const beyondSheet = input({ draft: mailDraftFromString('[letterbg 9]Hello.[#]T'), letterBgFrameCount: 8 })
    expect(codes(validateMailLetter(beyondSheet))).toContain('unknownLetterBg')
    const beyondVanilla = input({ draft: mailDraftFromString('[letterbg 5]Hello.[#]T'), letterBgFrameCount: null })
    expect(codes(validateMailLetter(beyondVanilla))).toContain('unknownLetterBg')
    const valid = input({ draft: mailDraftFromString('[letterbg 4]Hello.[#]T'), letterBgFrameCount: 8 })
    expect(codes(validateMailLetter(valid))).not.toContain('unknownLetterBg')
  })

  it('validates attachment payloads', () => {
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item mysteryForm 1 %%') })))).toContain('malformedAttachment')
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item object 388 50 %%') })))).toContain('deprecatedAttachment')
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item money %%') })))).toContain('moneyAmountMissing')
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item money 500 100 %%') })))).toContain('moneyRangeInvalid')
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item quest %%') })))).toContain('questIdMissing')
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item craftingRecipe %%') })))).toContain(
      'craftingRecipeKeyMissing',
    )
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item conversationTopic Topic %%') })))).toContain(
      'conversationTopicInvalid',
    )
    expect(codes(validateMailLetter(input({ draft: mailDraftFromString('Hi. %item tools Sword %%') })))).toContain('toolsInvalid')
  })

  it('warns when a convention cooking recipe is used without Cooking in the mail id', () => {
    const issues = validateMailLetter(input({ mailId: '{{ModId}}_Mail_1', draft: mailDraftFromString('Hi. %item cookingRecipe %%') }))
    expect(codes(issues)).toContain('cookingRecipeKeyConvention')
    const conventional = validateMailLetter(
      input({
        mailId: '{{ModId}}_RobinCooking',
        draft: mailDraftFromString('Hi. %item cookingRecipe %%'),
      }),
    )
    expect(codes(conventional)).not.toContain('cookingRecipeKeyConvention')
  })

  it('validates delivery triggers', () => {
    expect(codes(validateMailLetter(input({ triggers: [] })))).toContain('noDeliveryTrigger')
    expect(codes(validateMailLetter(input({ triggers: [trigger({ id: '' })] })))).toContain('triggerMissingId')
    expect(
      codes(
        validateMailLetter(
          input({
            triggers: [trigger()],
            allTriggerIds: ['{{ModId}}_Mail_1_Trigger', '{{ModId}}_Mail_1_Trigger'],
          }),
        ),
      ),
    ).toContain('duplicateTriggerId')
    expect(codes(validateMailLetter(input({ triggers: [trigger({ trigger: '' })] })))).toContain('triggerMissingEvent')
  })

  it('warns when no delivery rule can put the letter in a mailbox', () => {
    expect(codes(validateMailLetter(input({ triggers: [trigger({ deliveryType: 'received' })] })))).toContain('deliveryNeverShown')
    const mixed = input({
      triggers: [trigger({ deliveryType: 'received' }), trigger({ id: '{{ModId}}_Mail_1_Trigger_2', deliveryType: 'tomorrow' })],
      allTriggerIds: ['{{ModId}}_Mail_1_Trigger', '{{ModId}}_Mail_1_Trigger_2'],
    })
    expect(codes(validateMailLetter(mixed))).not.toContain('deliveryNeverShown')
  })

  it('warns when a host-only rule delivers to the triggering player', () => {
    const issues = validateMailLetter(input({ triggers: [trigger({ hostOnly: true, target: 'Current' })] }))
    expect(codes(issues)).toContain('deliveryHostOnlyMismatch')
    expect(issues.find((issue) => issue.code === 'deliveryHostOnlyMismatch')?.detail).toBe('{{ModId}}_Mail_1_Trigger')
    expect(codes(validateMailLetter(input({ triggers: [trigger({ hostOnly: true, target: 'All' })] })))).not.toContain(
      'deliveryHostOnlyMismatch',
    )
    expect(codes(validateMailLetter(input({ triggers: [trigger({ hostOnly: false, target: 'Current' })] })))).not.toContain(
      'deliveryHostOnlyMismatch',
    )
  })

  it('sorts errors before warnings and summarizes severities', () => {
    const issues = validateMailLetter(input({ mailId: 'PlainId', allMailIds: ['PlainId'], draft: mailDraftFromString(''), triggers: [] }))
    const summary = summarizeIssues(issues)
    expect(summary.errors).toBeGreaterThan(0)
    expect(summary.warnings).toBeGreaterThan(0)
    const firstWarningIndex = issues.findIndex((issue) => issue.severity === 'warning')
    const lastErrorIndex = issues.map((issue) => issue.severity).lastIndexOf('error')
    expect(lastErrorIndex).toBeLessThan(firstWarningIndex)
  })
})
