import { describe, expect, it } from 'vite-plus/test'
import { makeTestPatch, mountDraftPort } from '@test/draftPortHost'
import {
  buildMailDeliveryGroups,
  classifyMailDelivery,
  MAIL_DELIVERY_GROUP_ORDER,
  type MailDeliveryGroupId,
  type MailLetterSummary,
  type MailTriggerDraft,
  triggerDraftFromEntry,
  triggerDraftToEntry,
} from '@pages/workbench/workspaces/mail/entities/mail'

const MAIL_TARGET = 'Data/mail'
const TRIGGER_TARGET = 'Data/TriggerActions'

function makeTrigger(id: string, mailId: string, trigger: string): MailTriggerDraft {
  return {
    id,
    trigger,
    mailId,
    target: 'Current',
    deliveryType: 'tomorrow',
    condition: '',
    markActionApplied: true,
    hostOnly: false,
    extraActions: [],
    extraFields: {},
  }
}

function makeLetter(mailId: string, deliveryGroup: MailDeliveryGroupId): MailLetterSummary {
  return { mailId, title: null, bodyPreview: '', errors: 0, warnings: 0, deliveryGroup }
}

describe('mail delivery classification', () => {
  it('maps the vanilla triggers to their group, case-insensitively', () => {
    expect(classifyMailDelivery([makeTrigger('t', 'M', 'DayStarted')])).toBe('dayStarted')
    expect(classifyMailDelivery([makeTrigger('t', 'M', 'dayending')])).toBe('dayEnding')
    expect(classifyMailDelivery([makeTrigger('t', 'M', ' LocationChanged ')])).toBe('locationChanged')
  })

  it('treats an unknown or blank trigger name as a custom trigger', () => {
    expect(classifyMailDelivery([makeTrigger('t', 'M', 'MyMod.CustomTrigger')])).toBe('customTrigger')
    // A trigger row with no event is still a trigger; validation flags it separately.
    expect(classifyMailDelivery([makeTrigger('t', 'M', '')])).toBe('customTrigger')
  })

  it('classifies a letter with no trigger as undeliverable', () => {
    expect(classifyMailDelivery([])).toBe('noTrigger')
  })

  it('places a multi-trigger letter under its earliest delivery method', () => {
    const triggers = [makeTrigger('t1', 'M', 'MyMod.Custom'), makeTrigger('t2', 'M', 'DayEnding'), makeTrigger('t3', 'M', 'DayStarted')]
    expect(classifyMailDelivery(triggers)).toBe('dayStarted')
    expect(classifyMailDelivery(triggers.slice(0, 2))).toBe('dayEnding')
  })
})

describe('mail delivery groups', () => {
  it('lays out groups in delivery order and drops empty ones', () => {
    const groups = buildMailDeliveryGroups([
      makeLetter('M_noTrigger', 'noTrigger'),
      makeLetter('M_custom', 'customTrigger'),
      makeLetter('M_start', 'dayStarted'),
      makeLetter('M_start2', 'dayStarted'),
    ])

    expect(groups.map((group) => group.id)).toEqual(['dayStarted', 'customTrigger', 'noTrigger'])
    expect(groups.map((group) => group.rank)).toEqual([0, 3, 4])
    expect(groups[0]!.letters.map((letter) => letter.mailId)).toEqual(['M_start', 'M_start2'])
    expect(buildMailDeliveryGroups([])).toEqual([])
  })

  it('lists every letter exactly once across the groups', () => {
    const letters = MAIL_DELIVERY_GROUP_ORDER.map((id) => makeLetter(`M_${id}`, id))
    const grouped = buildMailDeliveryGroups(letters).flatMap((group) => group.letters)
    expect(grouped).toHaveLength(letters.length)
    expect(new Set(grouped.map((letter) => letter.mailId)).size).toBe(letters.length)
  })
})

describe('mail two-asset split', () => {
  function mountMailDraft() {
    return mountDraftPort([
      makeTestPatch('patch-mail', MAIL_TARGET, { entries: { '{{ModId}}_Intro': 'Welcome!' } }, { workspace: 'mail' }),
      makeTestPatch(
        'patch-triggers',
        TRIGGER_TARGET,
        {
          entries: {
            '{{ModId}}_Intro_Trigger': triggerDraftToEntry(makeTrigger('{{ModId}}_Intro_Trigger', '{{ModId}}_Intro', 'DayStarted')),
            Unrelated: { Id: 'Unrelated', Trigger: 'DayStarted', Actions: ['AddMoney 500'] },
          },
        },
        { workspace: 'mail' },
      ),
    ])
  }

  it('keeps letters and delivery triggers in two independent patches', () => {
    const host = mountMailDraft()

    host.port().stageValue(MAIL_TARGET, '{{ModId}}_Intro', 'Rewritten!')

    expect(host.editorState('patch-mail')).toEqual({ entries: { '{{ModId}}_Intro': 'Rewritten!' } })
    // The trigger patch is untouched by a letter edit.
    expect(host.port().listEntries(TRIGGER_TARGET)).toEqual(['{{ModId}}_Intro_Trigger', 'Unrelated'])
    expect(host.patches().filter((patch) => patch.workspace === 'mail')).toHaveLength(2)
  })

  it('rewrites the AddMail action of bound triggers when the letter id changes', () => {
    const host = mountMailDraft()
    const port = host.port()

    port.renameEntry(MAIL_TARGET, '{{ModId}}_Intro', '{{ModId}}_Welcome')
    const bound = triggerDraftFromEntry('{{ModId}}_Intro_Trigger', port.readValue(TRIGGER_TARGET, '{{ModId}}_Intro_Trigger'))!
    host.port().stageValues(TRIGGER_TARGET, {
      '{{ModId}}_Intro_Trigger': triggerDraftToEntry({ ...bound, mailId: '{{ModId}}_Welcome' }),
    })

    expect(host.port().listEntries(MAIL_TARGET)).toEqual(['{{ModId}}_Welcome'])
    const rewritten = host.port().readValue(TRIGGER_TARGET, '{{ModId}}_Intro_Trigger') as { Actions: string[] }
    expect(rewritten.Actions).toEqual(['AddMail Current {{ModId}}_Welcome tomorrow'])
  })

  it('deletes a letter and all of its triggers in one batch per asset', () => {
    const host = mountMailDraft()

    host.port().stageValues(TRIGGER_TARGET, { '{{ModId}}_Intro_Trigger': null })
    host.port().stageValue(MAIL_TARGET, '{{ModId}}_Intro', null)

    expect(host.port().listEntries(MAIL_TARGET)).toEqual([])
    // Trigger entries not bound to the letter survive the delete.
    expect(host.port().listEntries(TRIGGER_TARGET)).toEqual(['Unrelated'])
  })

  it('leaves entries it cannot parse as AddMail untouched', () => {
    const host = mountMailDraft()
    const raw = host.port().readValue(TRIGGER_TARGET, 'Unrelated')

    expect(triggerDraftFromEntry('Unrelated', raw)).toBeNull()
    host.port().stageValue(MAIL_TARGET, '{{ModId}}_Intro', 'Rewritten!')
    expect(host.port().readValue(TRIGGER_TARGET, 'Unrelated')).toEqual(raw)
  })
})
