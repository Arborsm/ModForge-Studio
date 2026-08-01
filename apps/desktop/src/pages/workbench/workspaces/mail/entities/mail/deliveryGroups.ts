/**
 * Delivery layering of project letters for the editor's left rail.
 *
 * A letter's id says nothing about when the player receives it — that lives in
 * the `Data/TriggerActions` entry whose `AddMail` action names the letter. An
 * alphabetical rail therefore hides the one grouping an author reasons about,
 * so the rail is grouped by delivery method instead.
 */

import type { MailTriggerDraft } from './triggerEntries'

/** Delivery method of a letter, derived from the trigger entries bound to it. */
export type MailDeliveryGroupId = 'dayStarted' | 'dayEnding' | 'locationChanged' | 'customTrigger' | 'noTrigger'

/**
 * Groups from the most common delivery method down to letters that cannot be
 * delivered yet, which close the list because they are the ones needing work.
 */
export const MAIL_DELIVERY_GROUP_ORDER: readonly MailDeliveryGroupId[] = [
  'dayStarted',
  'dayEnding',
  'locationChanged',
  'customTrigger',
  'noTrigger',
]

const VANILLA_GROUP_BY_TRIGGER: Record<string, MailDeliveryGroupId> = {
  daystarted: 'dayStarted',
  dayending: 'dayEnding',
  locationchanged: 'locationChanged',
}

function groupForTrigger(trigger: string): MailDeliveryGroupId {
  return VANILLA_GROUP_BY_TRIGGER[trigger.trim().toLowerCase()] ?? 'customTrigger'
}

/**
 * Classifies a letter by the triggers that deliver it. A letter with several
 * triggers lands in the earliest group of `MAIL_DELIVERY_GROUP_ORDER`, so it
 * appears once, under the delivery method that fires first in a normal day.
 */
export function classifyMailDelivery(triggers: readonly MailTriggerDraft[]): MailDeliveryGroupId {
  let best: MailDeliveryGroupId = 'noTrigger'
  let bestRank = MAIL_DELIVERY_GROUP_ORDER.length

  for (const trigger of triggers) {
    const group = groupForTrigger(trigger.trigger)
    const rank = MAIL_DELIVERY_GROUP_ORDER.indexOf(group)
    if (rank < bestRank) {
      best = group
      bestRank = rank
    }
  }

  return best
}

/** One project letter as the rail renders it. */
export type MailLetterSummary = {
  mailId: string
  /** Collection title of the letter, or null when it has none. */
  title: string | null
  /** Plain body excerpt used by the resource-library preview card. */
  bodyPreview: string
  errors: number
  warnings: number
  deliveryGroup: MailDeliveryGroupId
}

export type MailDeliveryGroup = {
  id: MailDeliveryGroupId
  /** Position in `MAIL_DELIVERY_GROUP_ORDER`; 0 is delivered earliest in a day. */
  rank: number
  letters: MailLetterSummary[]
}

/**
 * Buckets letters into rail sections in delivery order, keeping the letters of
 * a group in the order the patch stores them. Empty groups are dropped so the
 * rail never renders a bare heading.
 */
export function buildMailDeliveryGroups(letters: readonly MailLetterSummary[]): MailDeliveryGroup[] {
  return MAIL_DELIVERY_GROUP_ORDER.flatMap((id, rank) => {
    const groupLetters = letters.filter((letter) => letter.deliveryGroup === id)
    return groupLetters.length === 0 ? [] : [{ id, rank, letters: groupLetters }]
  })
}
