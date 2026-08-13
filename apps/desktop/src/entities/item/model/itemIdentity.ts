import type { ItemKind } from './itemTypes'

const PINYIN_INITIAL_BOUNDARIES = [
  ['芭', 'b'],
  ['擦', 'c'],
  ['搭', 'd'],
  ['蛾', 'e'],
  ['发', 'f'],
  ['噶', 'g'],
  ['哈', 'h'],
  ['击', 'j'],
  ['喀', 'k'],
  ['垃', 'l'],
  ['妈', 'm'],
  ['拿', 'n'],
  ['哦', 'o'],
  ['啪', 'p'],
  ['期', 'q'],
  ['然', 'r'],
  ['撒', 's'],
  ['塌', 't'],
  ['挖', 'w'],
  ['昔', 'x'],
  ['压', 'y'],
  ['匝', 'z'],
] as const

function getPinyinInitial(char: string) {
  const lower = char.toLowerCase()
  if (/[a-z0-9]/u.test(lower)) {
    return lower
  }

  if (!/[\u4e00-\u9fff]/u.test(char)) {
    return ''
  }

  for (let index = PINYIN_INITIAL_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [boundary, initial] = PINYIN_INITIAL_BOUNDARIES[index]
    if (char.localeCompare(boundary, 'zh-CN') >= 0) {
      return initial
    }
  }

  return 'a'
}

function buildInitialism(value: string | null | undefined) {
  const text = value?.trim() ?? ''
  if (!text) {
    return ''
  }

  const parts = text.split(/[\s\-_/\\()]+/u).filter(Boolean)
  const latinInitials = parts.map((part) => part[0]?.toLowerCase() ?? '').join('')
  const cjkInitials = Array.from(text)
    .map((char) => getPinyinInitial(char))
    .join('')

  return [latinInitials, cjkInitials].filter(Boolean).join(' ')
}

export function buildItemSearchAliases(...values: Array<string | null | undefined>) {
  return values
    .flatMap((value) => {
      const trimmed = value?.trim() ?? ''
      if (!trimmed) {
        return []
      }

      const compact = trimmed.replace(/[\s\-_/\\()]+/gu, '').toLowerCase()
      const initialism = buildInitialism(trimmed)
      return [compact, initialism].filter(Boolean)
    })
    .join(' ')
    .toLowerCase()
}

export function getQualifiedItemId(kind: ItemKind, itemId: string) {
  const normalizedId = itemId.trim()
  switch (kind) {
    case 'object':
      return `(O)${normalizedId}`
    case 'big-craftable':
      return `(BC)${normalizedId}`
    case 'weapon':
      return `(W)${normalizedId}`
    case 'tool':
      return `(T)${normalizedId}`
    case 'shirt':
      return `(S)${normalizedId}`
    case 'pants':
      return `(P)${normalizedId}`
    case 'trinket':
      return `(TR)${normalizedId}`
    case 'hat':
      return `(H)${normalizedId}`
    case 'boots':
      return `(B)${normalizedId}`
    case 'furniture':
      return `(F)${normalizedId}`
  }
}

export function normalizeQualifiedItemId(value: string | null | undefined, fallbackKind: ItemKind = 'object') {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }

  if (/^\([A-Za-z]+\).+/u.test(trimmed)) {
    return trimmed
  }

  return getQualifiedItemId(fallbackKind, trimmed)
}

export function getItemKindLabel(kind: ItemKind) {
  switch (kind) {
    case 'object':
      return 'Object'
    case 'big-craftable':
      return 'Big Craftable'
    case 'weapon':
      return 'Weapon'
    case 'tool':
      return 'Tool'
    case 'shirt':
      return 'Shirt'
    case 'pants':
      return 'Pants'
    case 'trinket':
      return 'Trinket'
    case 'hat':
      return 'Hat'
    case 'boots':
      return 'Boots'
    case 'furniture':
      return 'Furniture'
  }
}
