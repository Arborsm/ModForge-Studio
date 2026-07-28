export type MailItemPair = { itemId: string; count: number | null }

/**
 * Typed model for a `%item …%%` mail command (wiki: Modding:Mail data).
 * `object`, `bigobject`, `furniture`, and `tools` are deprecated but still parsed and preserved;
 * unrecognized forms round-trip verbatim through `unknown`.
 */
export type MailAttachment =
  | { kind: 'id'; items: MailItemPair[] }
  | { kind: 'object'; items: MailItemPair[] }
  | { kind: 'bigobject'; ids: string[] }
  | { kind: 'furniture'; ids: string[] }
  | { kind: 'tools'; tools: string[] }
  | { kind: 'money'; min: number | null; max: number | null }
  | { kind: 'quest'; questId: string; autoAdd: boolean }
  | { kind: 'cookingRecipe'; recipeKey: string | null }
  | { kind: 'craftingRecipe'; recipeKey: string }
  | { kind: 'conversationTopic'; topicId: string; days: number | null }
  | { kind: 'specialOrder'; orderId: string; immediately: boolean }
  | { kind: 'itemRecovery' }
  | { kind: 'unknown'; body: string }

export type MailAttachmentKind = MailAttachment['kind']

/** Valid `%item tools` type names; invalid types are ignored by the game. */
export const MAIL_TOOL_TYPES = ['Axe', 'Hoe', 'Can', 'Pickaxe', 'Scythe'] as const

/** Attachment kinds the wiki marks as deprecated since 1.6. */
export const DEPRECATED_ATTACHMENT_KINDS: readonly MailAttachmentKind[] = ['object', 'bigobject', 'furniture', 'tools']

const INTEGER_PATTERN = /^-?\d+$/u

function parseIntegerToken(token: string | undefined): number | null {
  if (token === undefined || !INTEGER_PATTERN.test(token)) {
    return null
  }
  return Number.parseInt(token, 10)
}

function parseItemPairs(args: string[]): MailItemPair[] {
  const items: MailItemPair[] = []
  for (let index = 0; index < args.length; index += 1) {
    const itemId = args[index]!
    const count = parseIntegerToken(args[index + 1])
    if (count !== null) {
      index += 1
    }
    items.push({ itemId, count })
  }
  return items
}

/**
 * Parses the payload between `%item` and `%%` into a typed attachment.
 * Mirrors the game's greedy token scan: after each item id, a following integer is its count.
 */
export function parseMailAttachmentBody(body: string): MailAttachment {
  const tokens = body.trim().split(/\s+/u).filter(Boolean)
  const [kind, ...args] = tokens
  switch (kind) {
    case 'id':
    case 'object':
      return { kind, items: parseItemPairs(args) }
    case 'bigobject':
    case 'furniture':
      return { kind, ids: args }
    case 'tools':
      return { kind, tools: args }
    case 'money':
      return { kind, min: parseIntegerToken(args[0]), max: args.length > 1 ? parseIntegerToken(args[1]) : null }
    case 'quest':
      return { kind, questId: args[0] ?? '', autoAdd: args[1]?.toLowerCase() === 'true' }
    case 'cookingRecipe':
      return { kind, recipeKey: args[0] ?? null }
    case 'craftingRecipe':
      return { kind, recipeKey: args[0] ?? '' }
    case 'conversationTopic':
      return { kind, topicId: args[0] ?? '', days: parseIntegerToken(args[1]) }
    case 'specialOrder':
      return { kind, orderId: args[0] ?? '', immediately: args[1]?.toLowerCase() === 'true' }
    case 'itemRecovery':
      return { kind }
    default:
      return { kind: 'unknown', body: body.trim() }
  }
}

function serializeArgs(attachment: MailAttachment): string[] {
  switch (attachment.kind) {
    case 'id':
    case 'object':
      return [
        attachment.kind,
        ...attachment.items.flatMap((item) => (item.count === null ? [item.itemId] : [item.itemId, String(item.count)])),
      ]
    case 'bigobject':
    case 'furniture':
      return [attachment.kind, ...attachment.ids]
    case 'tools':
      return [attachment.kind, ...attachment.tools]
    case 'money':
      return [
        'money',
        ...(attachment.min === null ? [] : [String(attachment.min)]),
        ...(attachment.max === null ? [] : [String(attachment.max)]),
      ]
    case 'quest':
      return ['quest', attachment.questId, ...(attachment.autoAdd ? ['true'] : [])]
    case 'cookingRecipe':
      return ['cookingRecipe', ...(attachment.recipeKey ? [attachment.recipeKey] : [])]
    case 'craftingRecipe':
      return ['craftingRecipe', attachment.recipeKey]
    case 'conversationTopic':
      return ['conversationTopic', attachment.topicId, String(attachment.days ?? 0)]
    case 'specialOrder':
      return ['specialOrder', attachment.orderId, ...(attachment.immediately ? ['true'] : [])]
    case 'itemRecovery':
      return ['itemRecovery']
    case 'unknown':
      return [attachment.body]
  }
}

/** Serializes a typed attachment into the canonical `%item <args> %%` form used by vanilla data. */
export function serializeMailAttachment(attachment: MailAttachment): string {
  return `%item ${serializeArgs(attachment)
    .filter((token) => token.length > 0)
    .join(' ')} %%`
}
