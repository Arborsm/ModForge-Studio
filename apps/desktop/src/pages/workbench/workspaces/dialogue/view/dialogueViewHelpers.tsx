import type { DialogueEditorCopy } from '@locales/model/workbench'
import { formatCopyTemplate } from '@shared/lib/helper'
import type { DialogueKeyMode, DialogueScriptWarning } from '@entities/dialogue'

/** Returns the localized label for a dialogue key family. */
export function getKeyModeLabel(copy: DialogueEditorCopy, mode: DialogueKeyMode): string {
  switch (mode) {
    case 'daily':
      return copy.keyModeDaily
    case 'date':
      return copy.keyModeDate
    case 'hearts':
      return copy.keyModeHearts
    case 'location':
      return copy.keyModeLocation
    case 'introduction':
      return copy.keyModeIntroduction
    case 'custom':
      return copy.keyModeCustom
  }
}

/** Returns the localized message for a script validation warning. */
export function getWarningMessage(copy: DialogueEditorCopy, warning: DialogueScriptWarning): string {
  switch (warning.code) {
    case 'unknown-command':
      return formatCopyTemplate(copy.warningUnknownCommandTemplate, { token: warning.detail })
    case 'unterminated-question':
      return copy.warningUnterminatedQuestion
    case 'orphan-response':
      return copy.warningOrphanResponse
    case 'malformed-response':
      return copy.warningMalformedResponse
    case 'empty-page':
      return copy.warningEmptyPage
    case 'unbalanced-gender-switch':
      return copy.warningUnbalancedGenderSwitch
  }
}
