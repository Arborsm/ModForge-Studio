import { DEPRECATED_ATTACHMENT_KINDS, MAIL_TOOL_TYPES, type MailAttachment } from './attachments'
import { MAX_VANILLA_LETTER_BG_INDEX } from './catalogs'
import { getVanillaBackgroundIndex, type MailLetterDraft } from './mailString'
import type { MailTriggerDraft } from './triggerEntries'

export type MailValidationSeverity = 'error' | 'warning'

export type MailValidationCode =
  | 'emptyBody'
  | 'mailIdMissing'
  | 'invalidMailId'
  | 'duplicateMailId'
  | 'missingModIdPrefix'
  | 'reservedMailId'
  | 'unknownLetterBg'
  | 'malformedAttachment'
  | 'deprecatedAttachment'
  | 'attachmentItemMissing'
  | 'moneyAmountMissing'
  | 'moneyRangeInvalid'
  | 'questIdMissing'
  | 'craftingRecipeKeyMissing'
  | 'cookingRecipeKeyConvention'
  | 'conversationTopicInvalid'
  | 'toolsInvalid'
  | 'noDeliveryTrigger'
  | 'triggerMissingId'
  | 'duplicateTriggerId'
  | 'triggerMissingEvent'
  | 'deliveryNeverShown'
  | 'deliveryHostOnlyMismatch'

export type MailValidationIssue = {
  code: MailValidationCode
  severity: MailValidationSeverity
  /** Raw fragment the issue refers to (attachment payload, index, id, …) for message templates. */
  detail?: string
}

/** Allowed mail id characters: game-safe identifier chars plus `{{ModId}}` braces. */
const MAIL_ID_PATTERN = /^[A-Za-z0-9_.\-{}]+$/u

/** CP token prefix recommended for unique mod mail ids. */
export const MOD_ID_PREFIX = '{{ModId}}_'

function issue(code: MailValidationCode, severity: MailValidationSeverity, detail?: string): MailValidationIssue {
  return detail === undefined ? { code, severity } : { code, severity, detail }
}

function validateAttachment(attachment: MailAttachment, mailId: string): MailValidationIssue[] {
  const issues: MailValidationIssue[] = []
  if (DEPRECATED_ATTACHMENT_KINDS.includes(attachment.kind)) {
    issues.push(issue('deprecatedAttachment', 'warning', attachment.kind))
  }
  switch (attachment.kind) {
    case 'unknown':
      issues.push(issue('malformedAttachment', 'warning', attachment.body))
      break
    case 'id':
    case 'object':
      if (attachment.items.length === 0 || attachment.items.some((item) => !item.itemId.trim())) {
        issues.push(issue('attachmentItemMissing', 'error'))
      }
      break
    case 'bigobject':
    case 'furniture':
      if (attachment.ids.length === 0) {
        issues.push(issue('attachmentItemMissing', 'error'))
      }
      break
    case 'tools': {
      const invalid = attachment.tools.filter((tool) => !MAIL_TOOL_TYPES.some((known) => known === tool))
      if (attachment.tools.length === 0 || invalid.length > 0) {
        issues.push(issue('toolsInvalid', 'warning', invalid.join(' ')))
      }
      break
    }
    case 'money':
      if (attachment.min === null) {
        issues.push(issue('moneyAmountMissing', 'error'))
      } else if (attachment.max !== null && attachment.max <= attachment.min) {
        issues.push(issue('moneyRangeInvalid', 'warning'))
      }
      break
    case 'quest':
      if (!attachment.questId.trim()) {
        issues.push(issue('questIdMissing', 'error'))
      }
      break
    case 'craftingRecipe':
      if (!attachment.recipeKey.trim()) {
        issues.push(issue('craftingRecipeKeyMissing', 'error'))
      }
      break
    case 'cookingRecipe':
      if (!attachment.recipeKey && !mailId.includes('Cooking')) {
        issues.push(issue('cookingRecipeKeyConvention', 'warning'))
      }
      break
    case 'conversationTopic':
      if (!attachment.topicId.trim() || attachment.days === null || attachment.days < 0) {
        issues.push(issue('conversationTopicInvalid', 'error'))
      }
      break
    default:
      break
  }
  return issues
}

export type MailLetterValidationInput = {
  mailId: string
  draft: MailLetterDraft
  /** Every project mail id including this letter's own, used for duplicate detection. */
  allMailIds: string[]
  /** Delivery triggers bound to this letter. */
  triggers: MailTriggerDraft[]
  /** Ids of every Data/TriggerActions entry in the project, used for duplicate detection. */
  allTriggerIds: string[]
  /** Measured frame count of the letter background sheet, or null when unavailable. */
  letterBgFrameCount: number | null
}

/**
 * Checks that the letter has at least one delivery path a player can actually
 * walk. Beyond the structural checks on each rule, two configurations parse and
 * load fine yet never put the letter in front of anyone:
 *
 * - every rule uses `received`, which only flags the mail as already seen, so
 *   the letter never enters a mailbox;
 * - a `HostOnly` rule delivering to `Current`, where the only player who runs
 *   the action is the host, so a farmhand can never receive it.
 */
function validateDelivery(input: MailLetterValidationInput): MailValidationIssue[] {
  const issues: MailValidationIssue[] = []

  if (input.triggers.length === 0) {
    issues.push(issue('noDeliveryTrigger', 'warning'))
    return issues
  }

  for (const trigger of input.triggers) {
    if (!trigger.id.trim()) {
      issues.push(issue('triggerMissingId', 'error'))
    } else if (input.allTriggerIds.filter((candidate) => candidate === trigger.id).length > 1) {
      issues.push(issue('duplicateTriggerId', 'error', trigger.id))
    }
    if (!trigger.trigger.trim()) {
      issues.push(issue('triggerMissingEvent', 'error', trigger.id))
    }
    if (trigger.hostOnly && trigger.target === 'Current') {
      issues.push(issue('deliveryHostOnlyMismatch', 'warning', trigger.id))
    }
  }

  if (input.triggers.every((trigger) => trigger.deliveryType === 'received')) {
    issues.push(issue('deliveryNeverShown', 'warning'))
  }

  return issues
}

/** Validates one letter plus its delivery triggers; returns issues ordered errors-first. */
export function validateMailLetter(input: MailLetterValidationInput): MailValidationIssue[] {
  const issues: MailValidationIssue[] = []
  const mailId = input.mailId

  if (!mailId.trim()) {
    issues.push(issue('mailIdMissing', 'error'))
  } else {
    if (!MAIL_ID_PATTERN.test(mailId)) {
      issues.push(issue('invalidMailId', 'error', mailId))
    }
    if (input.allMailIds.filter((candidate) => candidate === mailId).length > 1) {
      issues.push(issue('duplicateMailId', 'error', mailId))
    }
    if (!mailId.startsWith(MOD_ID_PREFIX)) {
      issues.push(issue('missingModIdPrefix', 'warning'))
    }
    if (mailId.includes('Cooking') || mailId.includes('passOut')) {
      issues.push(issue('reservedMailId', 'warning', mailId.includes('Cooking') ? 'Cooking' : 'passOut'))
    }
  }

  if (!input.draft.body.trim()) {
    issues.push(issue('emptyBody', 'error'))
  }

  const vanillaIndex = getVanillaBackgroundIndex(input.draft)
  if (vanillaIndex !== null) {
    const beyondSheet = input.letterBgFrameCount !== null && vanillaIndex >= input.letterBgFrameCount
    if (vanillaIndex < 0 || vanillaIndex > MAX_VANILLA_LETTER_BG_INDEX || beyondSheet) {
      issues.push(issue('unknownLetterBg', 'warning', String(vanillaIndex)))
    }
  }

  for (const attachment of input.draft.attachments) {
    issues.push(...validateAttachment(attachment.attachment, mailId))
  }

  issues.push(...validateDelivery(input))

  return issues.sort((left, right) => (left.severity === right.severity ? 0 : left.severity === 'error' ? -1 : 1))
}

/** Counts issues per severity for compact status badges. */
export function summarizeIssues(issues: MailValidationIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((entry) => entry.severity === 'error').length,
    warnings: issues.filter((entry) => entry.severity === 'warning').length,
  }
}
