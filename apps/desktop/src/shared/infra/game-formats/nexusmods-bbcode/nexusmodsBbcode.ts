export type NexusModsBbcodeTag =
  | 'b'
  | 'i'
  | 'u'
  | 's'
  | 'color'
  | 'size'
  | 'font'
  | 'url'
  | 'img'
  | 'iframe'
  | 'youtube'
  | 'center'
  | 'left'
  | 'right'
  | 'justify'
  | 'div'
  | 'list'
  | 'item'
  | 'quote'
  | 'spoiler'
  | 'code'
  | 'br'
  | 'hr'

export type NexusModsBbcodeTextNode = {
  type: 'text'
  value: string
}

export type NexusModsBbcodeElementNode = {
  type: 'element'
  tag: NexusModsBbcodeTag
  attrs: Record<string, string>
  children: NexusModsBbcodeNode[]
}

export type NexusModsBbcodeNode = NexusModsBbcodeTextNode | NexusModsBbcodeElementNode

export type NexusModsBbcodeDocument = {
  type: 'document'
  children: NexusModsBbcodeNode[]
}

type StackFrame = NexusModsBbcodeDocument | NexusModsBbcodeElementNode
type ParsedHtmlToken =
  | {
      supported: true
      closing: boolean
      selfClosing: boolean
      tag: NexusModsBbcodeTag
      closingTags: NexusModsBbcodeTag[]
      attrs: Record<string, string>
    }
  | {
      supported: false
    }

const supportedTags = new Set<string>([
  'b',
  'i',
  'u',
  's',
  'strike',
  'color',
  'size',
  'font',
  'url',
  'img',
  'iframe',
  'youtube',
  'center',
  'left',
  'right',
  'justify',
  'div',
  'list',
  'quote',
  'spoiler',
  'code',
  'br',
  'hr',
])

const htmlTagMap: Record<string, NexusModsBbcodeTag> = {
  a: 'url',
  b: 'b',
  blockquote: 'quote',
  br: 'br',
  del: 's',
  em: 'i',
  hr: 'hr',
  i: 'i',
  iframe: 'iframe',
  img: 'img',
  li: 'item',
  ol: 'list',
  s: 's',
  strike: 's',
  strong: 'b',
  u: 'u',
  ul: 'list',
}

function normalizeTag(tag: string): NexusModsBbcodeTag | null {
  const lowerTag = tag.toLowerCase()
  if (lowerTag === '*') {
    return 'item'
  }

  if (lowerTag === 'strike') {
    return 's'
  }

  if (lowerTag === 'line') {
    return 'hr'
  }

  return supportedTags.has(lowerTag) ? (lowerTag as NexusModsBbcodeTag) : null
}

function readBbcodeAttribute(rawAttributes: string, name: string) {
  const attributePattern = new RegExp(`\\b${name}\\s*=\\s*([^,\\s\\]]+)`, 'i')
  return rawAttributes.match(attributePattern)?.[1]
}

function createAttributes(tag: NexusModsBbcodeTag, value: string | undefined, valueMode: '=' | 'attributes' | undefined = '=') {
  const attrs: Record<string, string> = {}
  const trimmedValue = value?.trim()
  if (!trimmedValue) {
    return attrs
  }

  if (valueMode === 'attributes') {
    if (tag === 'img') {
      const width = readBbcodeAttribute(trimmedValue, 'width')
      const height = readBbcodeAttribute(trimmedValue, 'height')
      if (width != null) {
        attrs.width = width
      }
      if (height != null) {
        attrs.height = height
      }
    }

    return attrs
  }

  if (tag === 'url') {
    attrs.href = trimmedValue
  } else if (tag === 'img') {
    attrs.src = trimmedValue
  } else if (tag === 'quote') {
    attrs.cite = trimmedValue
  } else if (tag === 'spoiler') {
    attrs.title = trimmedValue
  } else {
    attrs[tag] = trimmedValue
  }

  return attrs
}

function readHtmlAttribute(rawAttributes: string, name: string) {
  const attributePattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i')
  const match = rawAttributes.match(attributePattern)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? undefined
}

function readHtmlStyleProperty(rawAttributes: string, name: string) {
  const style = readHtmlAttribute(rawAttributes, 'style')
  if (style == null) {
    return undefined
  }

  const propertyPattern = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i')
  return style.match(propertyPattern)?.[1]?.trim()
}

function createHtmlFontToken(rawAttributes: string): Pick<ParsedHtmlToken & { supported: true }, 'tag' | 'attrs' | 'closingTags'> {
  const color = readHtmlAttribute(rawAttributes, 'color') ?? readHtmlStyleProperty(rawAttributes, 'color')
  if (color != null) {
    return { tag: 'color', attrs: { color }, closingTags: ['font', 'color', 'size'] }
  }

  const size = readHtmlAttribute(rawAttributes, 'size') ?? readHtmlStyleProperty(rawAttributes, 'font-size')
  if (size != null) {
    return { tag: 'size', attrs: { size }, closingTags: ['font', 'color', 'size'] }
  }

  const fontFamily = readHtmlAttribute(rawAttributes, 'face') ?? readHtmlStyleProperty(rawAttributes, 'font-family')
  if (fontFamily != null) {
    return { tag: 'font', attrs: { font: fontFamily }, closingTags: ['font', 'color', 'size'] }
  }

  return { tag: 'font', attrs: {}, closingTags: ['font', 'color', 'size'] }
}

function createHtmlDivToken(rawAttributes: string): Pick<ParsedHtmlToken & { supported: true }, 'tag' | 'attrs' | 'closingTags'> {
  const align = readHtmlAttribute(rawAttributes, 'align')?.trim().toLowerCase()
  if (align === 'center' || align === 'right' || align === 'justify') {
    return { tag: align, attrs: {}, closingTags: ['center', 'left', 'right', 'justify'] }
  }

  if (align === 'left') {
    return { tag: 'left', attrs: {}, closingTags: ['center', 'left', 'right', 'justify'] }
  }

  return { tag: 'div', attrs: createHtmlAttributes('div', rawAttributes), closingTags: ['div'] }
}

function createHtmlTokenForTag(
  rawTag: string,
  rawAttributes: string,
): Pick<ParsedHtmlToken & { supported: true }, 'tag' | 'attrs' | 'closingTags'> | null {
  const lowerTag = rawTag.toLowerCase()
  if (lowerTag === 'font') {
    return createHtmlFontToken(rawAttributes)
  }

  if (lowerTag === 'div') {
    return createHtmlDivToken(rawAttributes)
  }

  const tag = htmlTagMap[lowerTag]
  if (tag == null) {
    return null
  }

  if (lowerTag === 'ol') {
    return { tag, attrs: { list: '1' }, closingTags: [tag] }
  }

  if (lowerTag === 'ul') {
    const className = readHtmlAttribute(rawAttributes, 'class')?.toLowerCase() ?? ''
    const isOrdered = className.includes('content_list_ordered')
    return { tag, attrs: isOrdered ? { list: '1' } : createHtmlAttributes(tag, rawAttributes), closingTags: [tag] }
  }

  return { tag, attrs: createHtmlAttributes(tag, rawAttributes), closingTags: [tag] }
}

function createHtmlAttributes(tag: NexusModsBbcodeTag, rawAttributes: string): Record<string, string> {
  if (tag === 'url') {
    const href = readHtmlAttribute(rawAttributes, 'href')
    return href == null ? {} : { href }
  }

  if (tag === 'img') {
    const src = readHtmlAttribute(rawAttributes, 'src')
    return src == null ? {} : { src }
  }

  if (tag === 'iframe') {
    const src = readHtmlAttribute(rawAttributes, 'src')
    return src == null ? {} : { src }
  }

  if (tag === 'quote') {
    const cite = readHtmlAttribute(rawAttributes, 'cite')
    return cite == null ? {} : { cite }
  }

  if (tag === 'div') {
    const className = readHtmlAttribute(rawAttributes, 'class')
    return className == null ? {} : { class: className }
  }

  return {}
}

function parseHtmlToken(rawToken: string): ParsedHtmlToken {
  const match = rawToken.match(/^<\s*(\/)?\s*([a-zA-Z][\w:-]*)([^<>]*?)(\/)?\s*>$/)
  if (match == null) {
    return { supported: false }
  }

  const [, closingSlash, rawTag, rawAttributes, selfClosingSlash] = match
  const token = createHtmlTokenForTag(rawTag, rawAttributes)
  if (token == null) {
    return { supported: false }
  }

  const isVoidTag = token.tag === 'br' || token.tag === 'hr' || token.tag === 'img' || token.tag === 'iframe'
  return {
    supported: true,
    closing: Boolean(closingSlash),
    selfClosing: isVoidTag || Boolean(selfClosingSlash),
    tag: token.tag,
    closingTags: token.closingTags,
    attrs: token.attrs,
  }
}

function appendText(parent: StackFrame, value: string) {
  if (value.length > 0) {
    const previous = parent.children.at(-1)
    if (previous?.type === 'text') {
      previous.value += value
    } else {
      parent.children.push({ type: 'text', value })
    }
  }
}

function topOf(stack: StackFrame[]) {
  return stack[stack.length - 1]!
}

function closeOpenListItem(stack: StackFrame[]) {
  const top = topOf(stack)
  if (stack.length > 1 && top.type === 'element' && top.tag === 'item') {
    stack.pop()
  }
}

function closeMatchingTag(stack: StackFrame[], tags: NexusModsBbcodeTag | readonly NexusModsBbcodeTag[]) {
  const closingTags = Array.isArray(tags) ? tags : [tags]
  const matchingIndex = stack.findLastIndex((frame) => frame.type === 'element' && closingTags.includes(frame.tag))
  if (matchingIndex <= 0) {
    return false
  }

  stack.splice(matchingIndex)
  return true
}

export function parseNexusModsBbcode(source: string): NexusModsBbcodeDocument {
  const document: NexusModsBbcodeDocument = { type: 'document', children: [] }
  const stack: StackFrame[] = [document]
  const tokenPattern = /\[(\/)?([a-zA-Z*][\w-]*|\*)(?:(=|\s+)([^\]]*))?\]|<\/?\s*[a-zA-Z][\w:-]*(?:\s+[^<>]*)?\s*\/?>/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(source)) != null) {
    const [rawToken, closingSlash, rawTag, rawValueMode, rawValue] = match
    appendText(topOf(stack), source.slice(cursor, match.index))
    cursor = match.index + rawToken.length

    if (rawTag == null) {
      const htmlToken = parseHtmlToken(rawToken)
      if (!htmlToken.supported) {
        continue
      }

      if (htmlToken.closing) {
        closeMatchingTag(stack, htmlToken.closingTags)
        continue
      }

      const element: NexusModsBbcodeElementNode = {
        type: 'element',
        tag: htmlToken.tag,
        attrs: htmlToken.attrs,
        children: [],
      }
      topOf(stack).children.push(element)

      if (!htmlToken.selfClosing) {
        stack.push(element)
      }

      continue
    }

    const tag = normalizeTag(rawTag)
    if (tag == null) {
      appendText(topOf(stack), rawToken)
      continue
    }

    if (closingSlash) {
      if (!closeMatchingTag(stack, tag) && tag === 'item') {
        appendText(topOf(stack), rawToken)
      }
      continue
    }

    if (tag === 'item') {
      closeOpenListItem(stack)
    }

    const element: NexusModsBbcodeElementNode = {
      type: 'element',
      tag,
      attrs: createAttributes(tag, rawValue, rawValueMode === '=' ? '=' : rawValueMode == null ? undefined : 'attributes'),
      children: [],
    }
    topOf(stack).children.push(element)

    if (tag !== 'hr' && tag !== 'br') {
      stack.push(element)
    }
  }

  appendText(topOf(stack), source.slice(cursor))
  return document
}

export function getNexusModsBbcodeTextContent(nodes: NexusModsBbcodeNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return node.value
      }

      return getNexusModsBbcodeTextContent(node.children)
    })
    .join('')
}

export type NexusModsBbcodeTextSegment = {
  id: string
  start: number
  end: number
  text: string
}

/** Locates visible text spans while leaving BBCode/HTML tokens and embedded media untouched. */
export function extractNexusModsBbcodeTextSegments(source: string): NexusModsBbcodeTextSegment[] {
  parseNexusModsBbcode(source)
  const tokenPattern = /\[(\/)?([a-zA-Z*][\w-]*|\*)(?:(=|\s+)([^\]]*))?\]|<\/?\s*[a-zA-Z][\w:-]*(?:\s+[^<>]*)?\s*\/?>/g
  const blockedTags: string[] = []
  const segments: NexusModsBbcodeTextSegment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  const append = (end: number) => {
    const text = source.slice(cursor, end)
    if (!blockedTags.length && /[\p{L}\p{N}]/u.test(text) && !/^\s*https?:\/\//iu.test(text)) {
      segments.push({ id: `segment-${segments.length}`, start: cursor, end, text })
    }
  }

  while ((match = tokenPattern.exec(source)) != null) {
    append(match.index)
    const raw = match[0]
    const name = (match[2] ?? raw.match(/^<\/?\s*([\w:-]+)/u)?.[1] ?? '').toLowerCase()
    const closing = Boolean(match[1]) || /^<\s*\//u.test(raw)
    if (['code', 'img', 'iframe', 'youtube'].includes(name)) {
      if (closing) {
        const index = blockedTags.lastIndexOf(name)
        if (index >= 0) blockedTags.splice(index, 1)
      } else if (!(name === 'img' && /^<\s*img\b/iu.test(raw)) && !/^<[^>]+\/>$/u.test(raw)) {
        blockedTags.push(name)
      }
    }
    cursor = match.index + raw.length
  }
  append(source.length)
  return segments
}

/** Replaces translated spans from right to left so original offsets remain stable. */
export function applyNexusModsBbcodeTextTranslations(
  source: string,
  segments: NexusModsBbcodeTextSegment[],
  translations: ReadonlyMap<string, string>,
) {
  return [...segments].reverse().reduce((value, segment) => {
    const translated = translations.get(segment.id)
    return translated == null ? value : `${value.slice(0, segment.start)}${translated}${value.slice(segment.end)}`
  }, source)
}
