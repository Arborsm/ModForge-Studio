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
  | 'center'
  | 'left'
  | 'right'
  | 'justify'
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
  'center',
  'left',
  'right',
  'justify',
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
  img: 'img',
  s: 's',
  strike: 's',
  strong: 'b',
  u: 'u',
}

function normalizeTag(tag: string): NexusModsBbcodeTag | null {
  const lowerTag = tag.toLowerCase()
  if (lowerTag === '*') {
    return 'item'
  }

  if (lowerTag === 'strike') {
    return 's'
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

function createHtmlAttributes(tag: NexusModsBbcodeTag, rawAttributes: string): Record<string, string> {
  if (tag === 'url') {
    const href = readHtmlAttribute(rawAttributes, 'href')
    return href == null ? {} : { href }
  }

  if (tag === 'img') {
    const src = readHtmlAttribute(rawAttributes, 'src')
    return src == null ? {} : { src }
  }

  if (tag === 'quote') {
    const cite = readHtmlAttribute(rawAttributes, 'cite')
    return cite == null ? {} : { cite }
  }

  return {}
}

function parseHtmlToken(rawToken: string): ParsedHtmlToken {
  const match = rawToken.match(/^<\s*(\/)?\s*([a-zA-Z][\w:-]*)([^<>]*?)(\/)?\s*>$/)
  if (match == null) {
    return { supported: false }
  }

  const [, closingSlash, rawTag, rawAttributes, selfClosingSlash] = match
  const tag = htmlTagMap[rawTag.toLowerCase()]
  if (tag == null) {
    return { supported: false }
  }

  const isVoidTag = tag === 'br' || tag === 'hr' || tag === 'img'
  return {
    supported: true,
    closing: Boolean(closingSlash),
    selfClosing: isVoidTag || Boolean(selfClosingSlash),
    tag,
    attrs: createHtmlAttributes(tag, rawAttributes),
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

function hasListAncestor(stack: StackFrame[]) {
  return stack.some((frame) => frame.type === 'element' && frame.tag === 'list')
}

function closeMatchingTag(stack: StackFrame[], tag: NexusModsBbcodeTag) {
  const matchingIndex = stack.findLastIndex((frame) => frame.type === 'element' && frame.tag === tag)
  if (matchingIndex <= 0) {
    return false
  }

  if (matchingIndex === stack.length - 1) {
    stack.pop()
  } else {
    stack.splice(matchingIndex, 1)
  }

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
        closeMatchingTag(stack, htmlToken.tag)
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
      if (!hasListAncestor(stack)) {
        appendText(topOf(stack), rawToken)
        continue
      }

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
