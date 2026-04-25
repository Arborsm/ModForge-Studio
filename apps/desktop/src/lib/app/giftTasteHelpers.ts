export type GiftTasteBuckets = {
  love: string[]
  like: string[]
  neutral: string[]
  dislike: string[]
  hate: string[]
}

function parseGiftTasteTokens(value: string | null | undefined, tokenIndex: number) {
  if (!value) {
    return []
  }

  const segments = value.split('/')
  const bucket = segments[tokenIndex]?.trim() ?? ''
  return bucket ? bucket.split(/\s+/u).filter(Boolean) : []
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
    love: giftTasteEntries.Universal_Love?.split(/\s+/u).filter(Boolean) ?? [],
    hate: giftTasteEntries.Universal_Hate?.split(/\s+/u).filter(Boolean) ?? [],
    like: giftTasteEntries.Universal_Like?.split(/\s+/u).filter(Boolean) ?? [],
    dislike: giftTasteEntries.Universal_Dislike?.split(/\s+/u).filter(Boolean) ?? [],
    neutral: giftTasteEntries.Universal_Neutral?.split(/\s+/u).filter(Boolean) ?? [],
  }
}

export function buildNpcGiftTasteBuckets(rawValue: string | null | undefined): GiftTasteBuckets {
  return {
    love: parseGiftTasteTokens(rawValue, 1),
    like: parseGiftTasteTokens(rawValue, 3),
    dislike: parseGiftTasteTokens(rawValue, 5),
    hate: parseGiftTasteTokens(rawValue, 7),
    neutral: parseGiftTasteTokens(rawValue, 9),
  }
}
