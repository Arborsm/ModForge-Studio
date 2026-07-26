export type StardewI18nNode = { kind: 'literal'; value: string } | { kind: 'text'; id: string; value: string }

export type StardewI18nTemplate = {
  nodes: StardewI18nNode[]
  textNodes: Array<Extract<StardewI18nNode, { kind: 'text' }>>
}

const SPECIAL_PERCENT_TOKENS = [
  '%firstnameletter',
  '%secretsanta',
  '%favorite',
  '%spouse',
  '%season',
  '%kid1',
  '%kid2',
  '%place',
  '%year',
  '%name',
  '%band',
  '%book',
  '%farm',
  '%pet',
  '%adj',
  '%noun',
  '%fork',
].sort((left, right) => right.length - left.length)

const DIALOGUE_COMMANDS = ['$action', '$query', '$e', '$b', '$k', '$1', '$c', '$t', '$q', '$r', '$p', '$d', '$y']

const PLACEHOLDER_PATTERN = /\{\{[^{}\r\n]+\}\}|\{[A-Za-z0-9_.-]+(?::[^{}\r\n]+)?\}|%(?:\d+\$)?[sdif]\b|\$\d+/gu

function terminatedCommandLength(value: string, command: string): number {
  if (!value.startsWith(command)) return 0
  const end = value.indexOf('%%', command.length)
  return end < 0 ? 0 : end + 2
}

function revealTasteLength(value: string): number {
  const prefix = '%revealtaste'
  if (!value.startsWith(prefix)) return 0
  const payload = value.slice(prefix.length)
  const end = payload.search(/[\s#%${^*]/u)
  const token = payload.slice(0, end < 0 ? payload.length : end)
  if (!token) return 0
  if (token.startsWith(':')) {
    const fields = token.slice(1).split(':')
    if (fields.length === 2 && fields.every((field) => field.trim())) return prefix.length + token.length
    return 0
  }
  const digit = token.search(/\d/u)
  if (digit <= 0) return 0
  return /^\d+$/u.test(token.slice(digit)) ? prefix.length + token.length : 0
}

function customFormatLength(value: string): number {
  if (!value.startsWith('[')) return 0
  const end = value.indexOf(']')
  if (end < 0) return 0
  const fields = value.slice(1, end).trim().split(/\s+/u).filter(Boolean)
  const valid =
    (fields[0] === 'textcolor' && fields.length >= 2) ||
    (fields[0] === 'letterbg' &&
      (fields.length === 1 ||
        fields.length >= 4 ||
        (fields.length === 2 && /^[-+]?\d+$/u.test(fields[1] ?? '')) ||
        (fields.length === 3 && /^[-+]?\d+$/u.test(fields[2] ?? ''))))
  return valid ? end + 1 : 0
}

function namedPercentTokenLength(value: string): number {
  for (const token of SPECIAL_PERCENT_TOKENS) {
    if (!value.startsWith(token)) continue
    const next = value[token.length]
    if (!next || !/[A-Za-z0-9_]/u.test(next)) return token.length
  }
  return 0
}

function dialogueCommandLength(value: string, segmentStart: boolean): number {
  if (!segmentStart) return 0
  const command = DIALOGUE_COMMANDS.find((candidate) => {
    if (!value.startsWith(candidate)) return false
    const next = value[candidate.length]
    return !next || /[\s#|']/u.test(next)
  })
  if (!command) return 0
  if (command === '$b' || command === '$e' || command === '$k') return command.length
  const end = value.indexOf('#', command.length)
  return end < 0 ? value.length : end
}

function controlLength(value: string, segmentStart: boolean, lineStart: boolean): number {
  if (value.startsWith('{{')) {
    const end = value.indexOf('}}')
    return end < 0 ? 0 : end + 2
  }
  const compositePlaceholder = value.match(/^\{[A-Za-z0-9_.-]+(?::[^{}\r\n]+)?\}/u)?.[0]
  if (compositePlaceholder) return compositePlaceholder.length
  for (const marker of ['||', '#$b#', '#$e#', '$b#', '$e#', '[#]', '${', '}$', '\r\n', '\n', '\r']) {
    if (value.startsWith(marker)) return marker.length
  }
  const formatLength = customFormatLength(value)
  if (formatLength) return formatLength
  const actionLength = terminatedCommandLength(value, '%action')
  if (actionLength) return actionLength
  const itemLength = terminatedCommandLength(value, '%item')
  if (itemLength) return itemLength
  const revealLength = revealTasteLength(value)
  if (revealLength) return revealLength
  const printfPlaceholder = value.match(/^%(?:\d+\$)?[sdif]/u)?.[0]
  if (printfPlaceholder && !/[A-Za-z0-9_]/u.test(value[printfPlaceholder.length] ?? '')) {
    return printfPlaceholder.length
  }
  const percentLength = namedPercentTokenLength(value)
  if (percentLength) return percentLength
  const dialogueLength = dialogueCommandLength(value, segmentStart)
  if (dialogueLength) return dialogueLength
  if (value[0] === '^' || value[0] === '¦' || value[0] === '@' || value[0] === '#' || value[0] === '|') return 1
  if (lineStart && /^\*\s?/u.test(value)) return value.startsWith('* ') ? 2 : 1
  if (/^\\[nrt]/u.test(value)) return 2
  const positional = value.match(/^\$\d+/u)?.[0]
  if (positional) return positional.length
  if (value.startsWith('$neutral') && !/[A-Za-z0-9_]/u.test(value['$neutral'.length] ?? '')) return '$neutral'.length
  const emotion = value.match(/^\$[hHsSuUlLaA]/u)?.[0]
  if (emotion && !/[A-Za-z0-9_]/u.test(value[emotion.length] ?? '')) return emotion.length
  return 0
}

/** Returns placeholders whose spelling and multiplicity must survive translation. */
export function stardewI18nPlaceholders(value: string): string[] {
  return Array.from(value.matchAll(PLACEHOLDER_PATTERN), (match) => match[0])
}

function appendText(nodes: StardewI18nNode[], value: string, nextId: () => string) {
  if (!value) return
  const leading = value.match(/^\s+/u)?.[0] ?? ''
  const trailing = value.match(/\s+$/u)?.[0] ?? ''
  const text = value.slice(leading.length, value.length - trailing.length)
  if (leading) nodes.push({ kind: 'literal', value: leading })
  if (text && /[\p{L}\p{N}]/u.test(text)) nodes.push({ kind: 'text', id: nextId(), value: text })
  else if (text) nodes.push({ kind: 'literal', value: text })
  if (trailing) nodes.push({ kind: 'literal', value: trailing })
}

/** Parses a Stardew i18n value into lossless protocol and translatable text nodes. */
export function parseStardewI18n(value: string): StardewI18nTemplate {
  if (/^!image\s+[-+]?\d+\s*$/u.test(value)) {
    const node = { kind: 'literal' as const, value }
    return { nodes: [node], textNodes: [] }
  }
  const nodes: StardewI18nNode[] = []
  let textStart = 0
  let cursor = 0
  let textIndex = 0
  let quickResponseEnd = -1
  const nextId = () => `part:${textIndex++}`
  while (cursor < value.length) {
    if (quickResponseEnd < 0) {
      const quickPrefix = value.slice(cursor).match(/^\$y\s+'/u)?.[0]
      if (quickPrefix && (cursor === 0 || value[cursor - 1] === '#')) {
        const segmentEnd = value.indexOf('#', cursor + quickPrefix.length)
        const limit = segmentEnd < 0 ? value.length : segmentEnd
        const quoteEnd = value.lastIndexOf("'", limit - 1)
        if (quoteEnd >= cursor + quickPrefix.length) {
          appendText(nodes, value.slice(textStart, cursor), nextId)
          nodes.push({ kind: 'literal', value: quickPrefix })
          cursor += quickPrefix.length
          textStart = cursor
          quickResponseEnd = quoteEnd
          continue
        }
      }
    }
    if (quickResponseEnd >= 0 && cursor === quickResponseEnd) {
      appendText(nodes, value.slice(textStart, cursor), nextId)
      nodes.push({ kind: 'literal', value: "'" })
      cursor += 1
      textStart = cursor
      quickResponseEnd = -1
      continue
    }
    if (quickResponseEnd >= 0 && (value[cursor] === '_' || value[cursor] === '*')) {
      appendText(nodes, value.slice(textStart, cursor), nextId)
      nodes.push({ kind: 'literal', value: value[cursor] ?? '' })
      cursor += 1
      textStart = cursor
      continue
    }
    const previous = value[cursor - 1]
    const segmentStart = cursor === 0 || previous === '#'
    const lineStart = segmentStart || previous === '^' || previous === '¦' || previous === '\n' || previous === '\r'
    const length = controlLength(value.slice(cursor), segmentStart, lineStart)
    if (!length) {
      cursor += Array.from(value.slice(cursor))[0]?.length ?? 1
      continue
    }
    appendText(nodes, value.slice(textStart, cursor), nextId)
    nodes.push({ kind: 'literal', value: value.slice(cursor, cursor + length) })
    cursor += length
    textStart = cursor
  }
  appendText(nodes, value.slice(textStart), nextId)
  return { nodes, textNodes: nodes.filter((node): node is Extract<StardewI18nNode, { kind: 'text' }> => node.kind === 'text') }
}

/** Rebuilds a complete i18n value while preserving every literal protocol node. */
export function applyStardewI18nTranslations(template: StardewI18nTemplate, translations: ReadonlyMap<string, string>): string {
  return template.nodes.map((node) => (node.kind === 'literal' ? node.value : (translations.get(node.id) ?? node.value))).join('')
}
