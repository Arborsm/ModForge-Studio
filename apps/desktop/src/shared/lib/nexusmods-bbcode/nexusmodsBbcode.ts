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
  'hr',
])

function normalizeTag(tag: string): NexusModsBbcodeTag | null {
  const lowerTag = tag.toLowerCase()
  if (lowerTag === '*') {
    return 'item'
  }

  if (lowerTag === 'strike') {
    return 's'
  }

  return supportedTags.has(lowerTag) ? lowerTag as NexusModsBbcodeTag : null
}

function createAttributes(tag: NexusModsBbcodeTag, value: string | undefined) {
  const attrs: Record<string, string> = {}
  const trimmedValue = value?.trim()
  if (!trimmedValue) {
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

  stack.length = matchingIndex
  return true
}

export function parseNexusModsBbcode(source: string): NexusModsBbcodeDocument {
  const document: NexusModsBbcodeDocument = { type: 'document', children: [] }
  const stack: StackFrame[] = [document]
  const tokenPattern = /\[(\/)?([a-zA-Z*][\w-]*|\*)(?:=([^\]]*))?\]/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(source)) != null) {
    const [rawToken, closingSlash, rawTag, rawValue] = match
    appendText(topOf(stack), source.slice(cursor, match.index))
    cursor = match.index + rawToken.length

    const tag = normalizeTag(rawTag)
    if (tag == null) {
      appendText(topOf(stack), rawToken)
      continue
    }

    if (closingSlash) {
      if (!closeMatchingTag(stack, tag)) {
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
      attrs: createAttributes(tag, rawValue),
      children: [],
    }
    topOf(stack).children.push(element)

    if (tag !== 'hr') {
      stack.push(element)
    }
  }

  appendText(topOf(stack), source.slice(cursor))
  return document
}

export function getNexusModsBbcodeTextContent(nodes: NexusModsBbcodeNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text') {
      return node.value
    }

    return getNexusModsBbcodeTextContent(node.children)
  }).join('')
}
