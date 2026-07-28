export type MailTriggerTarget = 'Current' | 'Host' | 'All'

/** `AddMail` delivery types (wiki: Modding:Trigger actions). `all` is parsed for completeness. */
export type MailDeliveryType = 'now' | 'tomorrow' | 'received' | 'all'

/** Vanilla trigger names selectable in the delivery editor; custom triggers stay free text. */
export const MAIL_TRIGGER_EVENTS = ['DayStarted', 'DayEnding', 'LocationChanged'] as const

export const MAIL_TRIGGER_TARGETS: readonly MailTriggerTarget[] = ['Current', 'Host', 'All']

export const MAIL_DELIVERY_TYPES: readonly MailDeliveryType[] = ['tomorrow', 'now', 'received', 'all']

/**
 * Editable view of one Data/TriggerActions entry that delivers a mail letter.
 * Unrecognized actions and entry fields are preserved so saving never drops data.
 */
export type MailTriggerDraft = {
  /** Entry Id; also the Entries key used by Content Patcher. */
  id: string
  trigger: string
  mailId: string
  target: MailTriggerTarget
  deliveryType: MailDeliveryType
  /** Game state query; empty string means no condition. */
  condition: string
  /** True (game default) marks the entry applied after it runs, preventing repeat delivery. */
  markActionApplied: boolean
  hostOnly: boolean
  /** Other action strings in the entry, preserved verbatim after the AddMail action. */
  extraActions: string[]
  /** Entry fields outside the edited set (CustomFields, SkipPermanentlyCondition, …), preserved. */
  extraFields: Record<string, unknown>
}

/** Splits a trigger action string into arguments, honoring quotes and backslash escapes. */
export function tokenizeActionString(value: string): string[] {
  const tokens: string[] = []
  let current = ''
  let hasToken = false
  let inQuotes = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!
    if (inQuotes && char === '\\' && index + 1 < value.length) {
      current += value[index + 1]
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      hasToken = true
      continue
    }
    if (!inQuotes && /\s/u.test(char)) {
      if (hasToken) {
        tokens.push(current)
        current = ''
        hasToken = false
      }
      continue
    }
    current += char
    hasToken = true
  }
  if (hasToken) {
    tokens.push(current)
  }
  return tokens
}

function normalizeTarget(token: string | undefined): MailTriggerTarget | null {
  const match = MAIL_TRIGGER_TARGETS.find((target) => target.toLowerCase() === token?.toLowerCase())
  return match ?? null
}

function normalizeDeliveryType(token: string | undefined): MailDeliveryType | null {
  if (token === undefined) {
    return 'tomorrow'
  }
  const match = MAIL_DELIVERY_TYPES.find((type) => type === token.toLowerCase())
  return match ?? null
}

export type ParsedAddMailAction = {
  target: MailTriggerTarget
  mailId: string
  deliveryType: MailDeliveryType
}

/** Parses an `AddMail <player> <mail ID> [type]` action; returns null for anything else. */
export function parseAddMailAction(action: string): ParsedAddMailAction | null {
  const tokens = tokenizeActionString(action)
  if (tokens[0]?.toLowerCase() !== 'addmail' || tokens.length < 3 || tokens.length > 4) {
    return null
  }
  const target = normalizeTarget(tokens[1])
  const deliveryType = normalizeDeliveryType(tokens[3])
  const mailId = tokens[2]!
  if (!target || !deliveryType || !mailId) {
    return null
  }
  return { target, mailId, deliveryType }
}

/** Builds the canonical `AddMail` action string with an explicit delivery type. */
export function buildAddMailAction(parsed: ParsedAddMailAction): string {
  return `AddMail ${parsed.target} ${parsed.mailId} ${parsed.deliveryType}`
}

const EDITED_ENTRY_FIELDS = new Set(['Id', 'Trigger', 'Action', 'Actions', 'Condition', 'MarkActionApplied', 'HostOnly'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectEntryActions(entry: Record<string, unknown>): string[] {
  const single = typeof entry['Action'] === 'string' ? [entry['Action']] : []
  const list = Array.isArray(entry['Actions']) ? entry['Actions'].filter((action): action is string => typeof action === 'string') : []
  return [...single, ...list]
}

/**
 * Maps a raw Data/TriggerActions entry to an editable draft. Returns null when the entry has no
 * cleanly parseable AddMail action; such entries are preserved untouched instead of edited.
 */
export function triggerDraftFromEntry(entryKey: string, rawEntry: unknown): MailTriggerDraft | null {
  if (!isRecord(rawEntry)) {
    return null
  }
  const actions = collectEntryActions(rawEntry)
  const addMailIndex = actions.findIndex((action) => parseAddMailAction(action) !== null)
  if (addMailIndex < 0) {
    return null
  }
  const addMail = parseAddMailAction(actions[addMailIndex]!)!
  const extraFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawEntry)) {
    if (!EDITED_ENTRY_FIELDS.has(key)) {
      extraFields[key] = value
    }
  }
  return {
    id: typeof rawEntry['Id'] === 'string' ? rawEntry['Id'] : entryKey,
    trigger: typeof rawEntry['Trigger'] === 'string' ? rawEntry['Trigger'] : '',
    mailId: addMail.mailId,
    target: addMail.target,
    deliveryType: addMail.deliveryType,
    condition: typeof rawEntry['Condition'] === 'string' ? rawEntry['Condition'] : '',
    markActionApplied: typeof rawEntry['MarkActionApplied'] === 'boolean' ? rawEntry['MarkActionApplied'] : true,
    hostOnly: rawEntry['HostOnly'] === true,
    extraActions: actions.filter((_, index) => index !== addMailIndex),
    extraFields,
  }
}

/** Serializes a draft into the raw Data/TriggerActions entry shape used by CP `Entries`. */
export function triggerDraftToEntry(draft: MailTriggerDraft): Record<string, unknown> {
  const condition = draft.condition.trim()
  return {
    ...draft.extraFields,
    Id: draft.id,
    Trigger: draft.trigger,
    Actions: [buildAddMailAction(draft), ...draft.extraActions],
    ...(condition ? { Condition: condition } : {}),
    ...(draft.markActionApplied ? {} : { MarkActionApplied: false }),
    ...(draft.hostOnly ? { HostOnly: true } : {}),
  }
}
