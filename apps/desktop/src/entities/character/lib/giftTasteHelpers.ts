/**
 * `Data/NPCGiftTastes` parsing and formatting.
 *
 * One NPC row is a ten-slot, slash-delimited string that alternates a reaction
 * dialogue line and a space-delimited item token list, in the fixed order
 * love / like / dislike / hate / neutral. The universal rows
 * (`Universal_Love`, …) are a bare token list instead.
 *
 * Both the read-only browser and the character authoring page go through this
 * module: the browser resolves tokens into gift groups, the editor round-trips
 * a row through `parseNpcGiftTasteEntry` / `serializeNpcGiftTasteEntry`.
 */

export type GiftTasteBuckets = {
  love: string[]
  like: string[]
  neutral: string[]
  dislike: string[]
  hate: string[]
}

/** The five taste kinds in the slot order the game writes them. */
export const GIFT_TASTE_KINDS = ['love', 'like', 'dislike', 'hate', 'neutral'] as const

export type GiftTasteKind = (typeof GIFT_TASTE_KINDS)[number]

/** One taste of one NPC: the reaction line plus the tokens that trigger it. */
export type NpcGiftTasteSection = {
  reaction: string
  items: string[]
}

/** Editable view of one `Data/NPCGiftTastes` NPC row. */
export type NpcGiftTasteEntry = Record<GiftTasteKind, NpcGiftTasteSection>

/** Number of slash-delimited slots the game expects in an NPC row. */
export const NPC_GIFT_TASTE_SLOT_COUNT = GIFT_TASTE_KINDS.length * 2

/** The `Universal_*` rows, which hold a bare token list rather than slots. */
export const UNIVERSAL_GIFT_TASTE_KEYS = [
  'Universal_Love',
  'Universal_Like',
  'Universal_Neutral',
  'Universal_Dislike',
  'Universal_Hate',
] as const

/** Whether an entry key addresses a universal row instead of one NPC. */
export function isUniversalGiftTasteKey(entryKey: string): boolean {
  return UNIVERSAL_GIFT_TASTE_KEYS.some((key) => key.toLowerCase() === entryKey.trim().toLowerCase())
}

/** Splits a space-delimited token list, dropping empty runs. */
export function parseGiftTasteTokenList(value: string | null | undefined): string[] {
  return value ? value.split(/\s+/u).filter(Boolean) : []
}

function slotAt(segments: readonly string[], index: number): string {
  return segments[index]?.trim() ?? ''
}

function readSection(raw: unknown): NpcGiftTasteSection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }
  const source = raw as Record<string, unknown>
  const reaction = typeof source['reaction'] === 'string' ? source['reaction'] : ''
  const items = Array.isArray(source['items']) ? source['items'].filter((item): item is string => typeof item === 'string') : []
  return { reaction, items }
}

/**
 * Reads one NPC row into its five reaction/items sections.
 *
 * Accepts both the on-disk row string and an already-parsed entry, so a live
 * editor can validate what the author is typing before it is serialized back
 * into a slash-delimited row.
 */
export function parseNpcGiftTasteEntry(raw: unknown): NpcGiftTasteEntry {
  const entry = {} as NpcGiftTasteEntry
  if (typeof raw !== 'string') {
    const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    for (const kind of GIFT_TASTE_KINDS) {
      entry[kind] = readSection(source[kind]) ?? { reaction: '', items: [] }
    }
    return entry
  }

  const segments = raw.split('/')
  GIFT_TASTE_KINDS.forEach((kind, index) => {
    entry[kind] = {
      reaction: slotAt(segments, index * 2),
      items: parseGiftTasteTokenList(slotAt(segments, index * 2 + 1)),
    }
  })
  return entry
}

/**
 * Writes the ten slots back. Slots are always emitted even when empty, because
 * the game indexes them positionally and a short row shifts every later taste.
 */
export function serializeNpcGiftTasteEntry(entry: NpcGiftTasteEntry): string {
  return GIFT_TASTE_KINDS.flatMap((kind) => [entry[kind].reaction.trim(), entry[kind].items.join(' ')]).join('/')
}

/** An empty row, used when the author adds an NPC that has no tastes yet. */
export function createEmptyNpcGiftTasteEntry(): NpcGiftTasteEntry {
  const entry = {} as NpcGiftTasteEntry
  for (const kind of GIFT_TASTE_KINDS) {
    entry[kind] = { reaction: '', items: [] }
  }
  return entry
}

export function parseQualifiedGiftTasteObjectId(token: string) {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  const qualifiedObjectMatch = /^\(O\)(.+)$/iu.exec(trimmed)
  if (qualifiedObjectMatch) {
    return qualifiedObjectMatch[1]?.trim() || null
  }

  return trimmed
}

export function normalizeContextTag(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeTagFragment(value: string) {
  return value.trim().toLowerCase().replaceAll("'", '').replace(/\s+/gu, '_')
}

export function buildUniversalGiftTasteBuckets(giftTasteEntries: Record<string, string>): GiftTasteBuckets {
  return {
    love: parseGiftTasteTokenList(giftTasteEntries.Universal_Love),
    hate: parseGiftTasteTokenList(giftTasteEntries.Universal_Hate),
    like: parseGiftTasteTokenList(giftTasteEntries.Universal_Like),
    dislike: parseGiftTasteTokenList(giftTasteEntries.Universal_Dislike),
    neutral: parseGiftTasteTokenList(giftTasteEntries.Universal_Neutral),
  }
}

export function buildNpcGiftTasteBuckets(rawValue: string | null | undefined): GiftTasteBuckets {
  const entry = parseNpcGiftTasteEntry(rawValue)
  return {
    love: entry.love.items,
    like: entry.like.items,
    dislike: entry.dislike.items,
    hate: entry.hate.items,
    neutral: entry.neutral.items,
  }
}
