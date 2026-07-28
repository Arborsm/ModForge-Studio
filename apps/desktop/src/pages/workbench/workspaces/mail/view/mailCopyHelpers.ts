import type { MailEditorCopy } from '@locales/model/workbench'
import type { MailAttachment, MailValidationIssue } from '../entities/mail'

/** Fills `{key}` placeholders in a locale template. */
export function fillTemplate(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template)
}

/** Human-readable chip label for an attachment, used by the editor and the letter preview. */
export function formatAttachmentChip(attachment: MailAttachment, copy: MailEditorCopy['attachments']): string {
  switch (attachment.kind) {
    case 'id':
    case 'object':
      return fillTemplate(copy.chipIdTemplate, {
        items: attachment.items.map((item) => (item.count === null ? item.itemId : `${item.itemId}×${item.count}`)).join(', '),
      })
    case 'bigobject':
    case 'furniture':
      return fillTemplate(copy.chipIdTemplate, { items: attachment.ids.join(', ') })
    case 'tools':
      return fillTemplate(copy.chipToolsTemplate, {
        tools: attachment.tools.map((tool) => copy.toolNames[tool as keyof typeof copy.toolNames] ?? tool).join(', '),
      })
    case 'money':
      return attachment.max === null
        ? fillTemplate(copy.chipMoneyTemplate, { min: attachment.min ?? 0 })
        : fillTemplate(copy.chipMoneyRangeTemplate, { min: attachment.min ?? 0, max: attachment.max })
    case 'quest':
      return fillTemplate(attachment.autoAdd ? copy.chipQuestAutoTemplate : copy.chipQuestTemplate, { id: attachment.questId })
    case 'cookingRecipe':
      return attachment.recipeKey ? fillTemplate(copy.chipCookingRecipeTemplate, { key: attachment.recipeKey }) : copy.chipCookingRecipe
    case 'craftingRecipe':
      return fillTemplate(copy.chipCraftingRecipeTemplate, { key: attachment.recipeKey })
    case 'conversationTopic':
      return fillTemplate(copy.chipTopicTemplate, { id: attachment.topicId, days: attachment.days ?? 0 })
    case 'specialOrder':
      return fillTemplate(copy.chipOrderTemplate, { id: attachment.orderId })
    case 'itemRecovery':
      return copy.chipItemRecovery
    case 'unknown':
      return fillTemplate(copy.chipUnknownTemplate, { body: attachment.body })
  }
}

/** Localized message for a validation issue. */
export function formatValidationIssue(issue: MailValidationIssue, copy: MailEditorCopy['validation']): string {
  const detail = issue.detail ?? ''
  switch (issue.code) {
    case 'emptyBody':
      return copy.emptyBody
    case 'mailIdMissing':
      return copy.mailIdMissing
    case 'invalidMailId':
      return copy.invalidMailId
    case 'duplicateMailId':
      return copy.duplicateMailId
    case 'missingModIdPrefix':
      return copy.missingModIdPrefix
    case 'reservedMailId':
      return fillTemplate(copy.reservedMailIdTemplate, { detail })
    case 'unknownLetterBg':
      return fillTemplate(copy.unknownLetterBgTemplate, { detail })
    case 'malformedAttachment':
      return fillTemplate(copy.malformedAttachmentTemplate, { detail })
    case 'deprecatedAttachment':
      return fillTemplate(copy.deprecatedAttachmentTemplate, { detail })
    case 'attachmentItemMissing':
      return copy.attachmentItemMissing
    case 'moneyAmountMissing':
      return copy.moneyAmountMissing
    case 'moneyRangeInvalid':
      return copy.moneyRangeInvalid
    case 'questIdMissing':
      return copy.questIdMissing
    case 'craftingRecipeKeyMissing':
      return copy.craftingRecipeKeyMissing
    case 'cookingRecipeKeyConvention':
      return copy.cookingRecipeKeyConvention
    case 'conversationTopicInvalid':
      return copy.conversationTopicInvalid
    case 'toolsInvalid':
      return fillTemplate(copy.toolsInvalidTemplate, { detail })
    case 'noDeliveryTrigger':
      return copy.noDeliveryTrigger
    case 'triggerMissingId':
      return copy.triggerMissingId
    case 'duplicateTriggerId':
      return fillTemplate(copy.duplicateTriggerIdTemplate, { detail })
    case 'triggerMissingEvent':
      return fillTemplate(copy.triggerMissingEventTemplate, { detail })
    case 'deliveryNeverShown':
      return copy.deliveryNeverShown
    case 'deliveryHostOnlyMismatch':
      return fillTemplate(copy.deliveryHostOnlyMismatchTemplate, { detail })
  }
}
