import { isValidElement, memo, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  getNexusModsBbcodeTextContent,
  parseNexusModsBbcode,
  type NexusModsBbcodeElementNode,
  type NexusModsBbcodeNode,
} from '@shared/lib/nexusmods-bbcode'

type NexusModsBbcodeProps = {
  source: string
}

const safeNamedColors = new Set([
  'black',
  'blue',
  'brown',
  'cyan',
  'gray',
  'green',
  'grey',
  'lime',
  'magenta',
  'navy',
  'orange',
  'pink',
  'purple',
  'red',
  'silver',
  'teal',
  'transparent',
  'violet',
  'white',
  'yellow',
])

const sizeScale: Record<string, string> = {
  '1': '0.78em',
  '2': '0.92em',
  '3': '1.08em',
  '4': '1.22em',
  '5': '1.38em',
  '6': '1.56em',
  '7': '1.78em',
}

function sanitizeColor(value: string | undefined) {
  const color = value?.trim()
  if (!color) {
    return null
  }

  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
    return color
  }

  const lowerColor = color.toLowerCase()
  return safeNamedColors.has(lowerColor) ? lowerColor : null
}

function sanitizeFontFamily(value: string | undefined) {
  const family = value?.trim()
  if (!family || family.length > 80 || !/^[\w\s"',.-]+$/.test(family)) {
    return null
  }

  return family
}

function sanitizeSize(value: string | undefined) {
  const size = value?.trim()
  if (!size) {
    return null
  }

  if (sizeScale[size]) {
    return sizeScale[size]
  }

  const numericSize = Number(size)
  if (Number.isFinite(numericSize) && numericSize >= 8 && numericSize <= 48) {
    return `${numericSize}px`
  }

  return null
}

function sanitizeUrl(value: string | undefined) {
  const href = value?.trim()
  if (!href) {
    return null
  }

  try {
    const url = new URL(href, 'https://www.nexusmods.com')
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href
    }
  } catch {
    return null
  }

  return null
}

function renderSoftSpacer(key: string) {
  return <span key={key} className="nexusmods-bbcode-soft-spacer" aria-hidden="true" />
}

function renderLine(key: string, children: ReactNode[]) {
  return (
    <span key={key} className="nexusmods-bbcode-line">
      {children}
    </span>
  )
}

function NexusModsBbcodeImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return null
  }

  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

function isHorizontalRuleText(value: string) {
  return /^-{6,}$/u.test(value.trim())
}

function hasBlockChildren(nodes: NexusModsBbcodeNode[]): boolean {
  return nodes.some(
    (node) =>
      node.type === 'element' &&
      (node.tag === 'center' ||
        node.tag === 'left' ||
        node.tag === 'right' ||
        node.tag === 'justify' ||
        node.tag === 'list' ||
        node.tag === 'quote' ||
        node.tag === 'spoiler' ||
        node.tag === 'code' ||
        node.tag === 'hr' ||
        hasBlockChildren(node.children)),
  )
}

function canSplitNodeAcrossSourceLines(node: NexusModsBbcodeElementNode) {
  return (
    node.tag === 'b' ||
    node.tag === 'i' ||
    node.tag === 'u' ||
    node.tag === 's' ||
    node.tag === 'color' ||
    node.tag === 'size' ||
    node.tag === 'font' ||
    node.tag === 'url'
  )
}

function hasSubstantiveSourceContent(nodes: NexusModsBbcodeNode[]) {
  return (
    getNexusModsBbcodeTextContent(nodes).trim().length > 0 ||
    nodes.some((node) => node.type === 'element' && (node.tag === 'img' || node.tag === 'hr'))
  )
}

function splitSourceLines(nodes: NexusModsBbcodeNode[]): NexusModsBbcodeNode[][] {
  const lines: NexusModsBbcodeNode[][] = [[]]

  const appendToCurrentLine = (node: NexusModsBbcodeNode) => {
    lines[lines.length - 1]?.push(node)
  }

  const startNextLine = () => {
    lines.push([])
  }

  nodes.forEach((node) => {
    if (node.type === 'text' && /\r?\n/u.test(node.value)) {
      const textLines = node.value.split(/\r?\n/u)
      textLines.forEach((textLine, index) => {
        if (textLine.trim()) {
          appendToCurrentLine({ ...node, value: textLine })
        }

        if (index < textLines.length - 1) {
          startNextLine()
        }
      })
      return
    }

    if (node.type === 'element' && node.tag === 'br') {
      startNextLine()
      return
    }

    if (node.type === 'element' && canSplitNodeAcrossSourceLines(node) && hasSourceLineBreak(node.children)) {
      const childLines = splitSourceLines(node.children)
      childLines.forEach((childLine, index) => {
        if (hasSubstantiveSourceContent(childLine)) {
          appendToCurrentLine({ ...node, children: childLine })
        }

        if (index < childLines.length - 1) {
          startNextLine()
        }
      })
      return
    }

    appendToCurrentLine(node)
  })

  return lines.filter(hasSubstantiveSourceContent)
}

function isStandaloneLineBlockNode(node: NexusModsBbcodeNode, nextNode: NexusModsBbcodeNode | undefined) {
  if (node.type !== 'element') {
    return false
  }

  const text = getNexusModsBbcodeTextContent(node.children).trim()
  if (!text || text.length > 80 || !/[:：]$/u.test(text)) {
    return false
  }

  return startsWithLineBlockBoundary(nextNode)
}

function startsWithLineBlockBoundary(node: NexusModsBbcodeNode | undefined): boolean {
  if (node == null || node.type !== 'element') {
    return false
  }

  if (node.tag === 'br' || node.tag === 'list') {
    return true
  }

  if (node.tag !== 'font' && node.tag !== 'size' && node.tag !== 'color') {
    return false
  }

  return node.children.some((child) => {
    if (child.type === 'text') {
      return child.value.trim().length === 0
    }

    return startsWithLineBlockBoundary(child)
  })
}

function hasRenderedBlockContent(node: ReactNode): boolean {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(hasRenderedBlockContent)
  }

  if (!isValidElement(node)) {
    return false
  }

  if (
    node.type === 'div' ||
    node.type === 'ul' ||
    node.type === 'ol' ||
    node.type === 'blockquote' ||
    node.type === 'details' ||
    node.type === 'pre'
  ) {
    return true
  }

  return hasRenderedBlockContent((node.props as { children?: ReactNode }).children)
}

function renderStyledContainer(
  style: CSSProperties,
  children: ReactNode,
  key: string,
  options: { block?: boolean; preserveEmptySpacing?: boolean } = {},
) {
  if (!hasSubstantiveRenderedContent(children)) {
    if (hasSpacingRenderedContent(children)) {
      return children
    }

    return options.preserveEmptySpacing ? renderSoftSpacer(key) : null
  }

  if (options.block || hasRenderedBlockContent(children)) {
    return (
      <div key={key} className="nexusmods-bbcode-block" style={style}>
        {children}
      </div>
    )
  }

  return Object.keys(style).length > 0 ? (
    <span key={key} style={style}>
      {children}
    </span>
  ) : (
    <span key={key}>{children}</span>
  )
}

function renderText(
  value: string,
  keyPrefix: string,
  options: { wrapHorizontalRule?: boolean } = { wrapHorizontalRule: true },
): ReactNode[] {
  const decoded = value
    .replace(/&#(?:0*92|x0*5c);/giu, '\\')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&apos;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
  const parts = decoded
    .replace(/[\u00A0\uFEFF]/gu, ' ')
    .split(/\r?\n/u)
    .map((part) => part.replace(/[^\S\r\n]+/gu, ' ').trim())

  return parts.flatMap((part, index) => {
    const nodes: ReactNode[] = []
    if (part) {
      nodes.push(
        options.wrapHorizontalRule && isHorizontalRuleText(part) ? (
          <span key={`${keyPrefix}-text-${index}`} className="nexusmods-bbcode-line">
            {part}
          </span>
        ) : (
          part
        ),
      )
    }

    if (index < parts.length - 1) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />)
    }

    return nodes
  })
}

function hasSubstantiveRenderedContent(node: ReactNode): boolean {
  if (node == null || typeof node === 'boolean') {
    return false
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim().length > 0
  }

  if (Array.isArray(node)) {
    return node.some(hasSubstantiveRenderedContent)
  }

  if (isValidElement(node)) {
    if (node.type === 'br') {
      return false
    }

    if (node.type === 'img' || node.type === 'hr' || node.type === NexusModsBbcodeImage) {
      return true
    }

    return hasSubstantiveRenderedContent((node.props as { children?: ReactNode }).children)
  }

  return true
}

function hasSpacingRenderedContent(node: ReactNode): boolean {
  if (node == null || typeof node === 'boolean') {
    return false
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return false
  }

  if (Array.isArray(node)) {
    return node.some(hasSpacingRenderedContent)
  }

  if (isValidElement(node)) {
    if (node.type === 'br') {
      return true
    }

    const props = node.props as { children?: ReactNode; className?: string }
    if (props.className?.split(/\s+/u).includes('nexusmods-bbcode-soft-spacer')) {
      return true
    }

    return hasSpacingRenderedContent(props.children)
  }

  return false
}

function isFurnitureSectionHeading(node: NexusModsBbcodeElementNode) {
  return getNexusModsBbcodeTextContent(node.children).trim().startsWith('ꕥ')
}

function hasSourceLineBreak(nodes: NexusModsBbcodeNode[]): boolean {
  return nodes.some((node) => node.type === 'element' && (node.tag === 'br' || hasSourceLineBreak(node.children)))
}

function renderSectionHeading(node: NexusModsBbcodeElementNode, key: string) {
  return (
    <span key={key} className="nexusmods-bbcode-section-heading">
      {renderNodes(node.children, key, false)}
    </span>
  )
}

function renderAlignmentLines(node: NexusModsBbcodeElementNode, key: string, allowSectionHeadings: boolean) {
  const lines = splitSourceLines(node.children)
  if (lines.length <= 1) {
    return renderNodes(node.children, key, allowSectionHeadings)
  }

  return lines.map((line, index) =>
    renderLine(`${key}-line-${index}`, renderNodes(line, `${key}-line-${index}`, allowSectionHeadings, { wrapHorizontalRule: false })),
  )
}

function renderElement(node: NexusModsBbcodeElementNode, key: string, allowSectionHeadings: boolean): ReactNode {
  const children = renderNodes(node.children, key, allowSectionHeadings)

  if (node.tag === 'b') {
    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    if (node.attrs.block === 'true') {
      return (
        <div key={key} className="nexusmods-bbcode-block">
          <strong>{children}</strong>
        </div>
      )
    }

    return <strong key={key}>{children}</strong>
  }

  if (node.tag === 'i') {
    if (allowSectionHeadings && isFurnitureSectionHeading(node)) {
      return renderSectionHeading(node, key)
    }

    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    return <em key={key}>{children}</em>
  }

  if (node.tag === 'u') {
    if (allowSectionHeadings && isFurnitureSectionHeading(node)) {
      return renderSectionHeading(node, key)
    }

    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    return (
      <span key={key} className="nexusmods-bbcode-underline">
        {children}
      </span>
    )
  }

  if (node.tag === 's') {
    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    return <del key={key}>{children}</del>
  }

  if (node.tag === 'color') {
    const color = sanitizeColor(node.attrs.color)
    return renderStyledContainer(color == null ? {} : { color }, children, key, {
      block: node.attrs.block === 'true' || hasBlockChildren(node.children),
      preserveEmptySpacing: hasSourceLineBreak(node.children),
    })
  }

  if (node.tag === 'size') {
    const fontSize = sanitizeSize(node.attrs.size)
    return renderStyledContainer(fontSize == null ? {} : { fontSize }, children, key, {
      block: node.attrs.block === 'true' || hasBlockChildren(node.children),
      preserveEmptySpacing: hasSourceLineBreak(node.children),
    })
  }

  if (node.tag === 'font') {
    const fontFamily = sanitizeFontFamily(node.attrs.font)
    return renderStyledContainer(fontFamily == null ? {} : { fontFamily }, children, key, {
      block: node.attrs.block === 'true' || hasBlockChildren(node.children),
      preserveEmptySpacing: hasSourceLineBreak(node.children),
    })
  }

  if (node.tag === 'url') {
    const href = sanitizeUrl(node.attrs.href ?? getNexusModsBbcodeTextContent(node.children))
    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    if (href == null) {
      return <span key={key}>{children}</span>
    }

    return (
      <a key={key} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }

  if (node.tag === 'img') {
    const src = sanitizeUrl(node.attrs.src ?? getNexusModsBbcodeTextContent(node.children))
    return src == null ? (
      <span key={key}>{children}</span>
    ) : (
      <NexusModsBbcodeImage key={key} src={src} alt={getNexusModsBbcodeTextContent(node.children)} />
    )
  }

  if (node.tag === 'center' || node.tag === 'left' || node.tag === 'right' || node.tag === 'justify') {
    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    return (
      <div key={key} className={`nexusmods-bbcode-align-${node.tag}`}>
        {renderAlignmentLines(node, key, allowSectionHeadings)}
      </div>
    )
  }

  if (node.tag === 'list') {
    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    const ordered = node.attrs.list === '1' || node.attrs.list?.toLowerCase() === 'decimal'
    return ordered ? (
      <ol key={key} className="nexusmods-bbcode-list nexusmods-bbcode-list-ordered">
        {children}
      </ol>
    ) : (
      <ul key={key} className="nexusmods-bbcode-list nexusmods-bbcode-list-bulleted">
        {children}
      </ul>
    )
  }

  if (node.tag === 'item') {
    return (
      <li key={key} className="nexusmods-bbcode-list-item">
        {children}
      </li>
    )
  }

  if (node.tag === 'quote') {
    return <blockquote key={key}>{children}</blockquote>
  }

  if (node.tag === 'spoiler') {
    return (
      <details key={key} className="nexusmods-bbcode-spoiler">
        <summary>{node.attrs.title || 'Spoiler'}</summary>
        <div>{children}</div>
      </details>
    )
  }

  if (node.tag === 'code') {
    return (
      <pre key={key}>
        <code>{getNexusModsBbcodeTextContent(node.children)}</code>
      </pre>
    )
  }

  if (node.tag === 'br') {
    return <br key={key} />
  }

  return <hr key={key} />
}

function isSectionHeadingNode(node: NexusModsBbcodeNode) {
  return node.type === 'element' && (node.tag === 'i' || node.tag === 'u') && isFurnitureSectionHeading(node)
}

function removeDanglingHeadingPrefix(nodes: ReactNode[]) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (typeof node !== 'string') {
      break
    }

    if (node.trim().length === 0) {
      void nodes.splice(index, 1)
      continue
    }

    const cleaned = node.replace(/[ \t\u00A0\uFEFF]*-[ \t\u00A0\uFEFF]*$/u, '')
    if (cleaned !== node) {
      if (cleaned.length > 0) {
        nodes[index] = cleaned
      } else {
        void nodes.splice(index, 1)
      }
    }

    return
  }
}

function isLineBreakNode(node: ReactNode) {
  return isValidElement(node) && node.type === 'br'
}

function countTrailingLineBreaks(nodes: ReactNode[]) {
  let count = 0
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (!isLineBreakNode(node)) {
      return count
    }

    count += 1
  }

  return count
}

function appendRenderedNode(nodes: ReactNode[], node: ReactNode) {
  if (node == null || typeof node === 'boolean') {
    return
  }

  if (isLineBreakNode(node)) {
    if (nodes.length === 0 || countTrailingLineBreaks(nodes) >= 1) {
      return
    }
  }

  nodes.push(node)
}

function appendRenderedNodes(nodes: ReactNode[], nextNodes: ReactNode[]) {
  nextNodes.forEach((node) => appendRenderedNode(nodes, node))
}

function renderNodes(
  nodes: NexusModsBbcodeNode[],
  keyPrefix: string,
  allowSectionHeadings = true,
  options: { wrapHorizontalRule?: boolean } = { wrapHorizontalRule: true },
): ReactNode[] {
  const renderedNodes: ReactNode[] = []

  nodes.forEach((node, index) => {
    const key = `${keyPrefix}-${index}`
    if (allowSectionHeadings && isSectionHeadingNode(node)) {
      removeDanglingHeadingPrefix(renderedNodes)
    }

    if (node.type === 'text') {
      appendRenderedNodes(renderedNodes, renderText(node.value, key, options))
      return
    }

    if (isStandaloneLineBlockNode(node, nodes[index + 1])) {
      appendRenderedNode(renderedNodes, renderElement({ ...node, attrs: { ...node.attrs, block: 'true' } }, key, allowSectionHeadings))
      return
    }

    appendRenderedNode(renderedNodes, renderElement(node, key, allowSectionHeadings))
  })

  return renderedNodes
}

export const NexusModsBbcode = memo(function NexusModsBbcode({ source }: NexusModsBbcodeProps) {
  const document = useMemo(() => parseNexusModsBbcode(source), [source])

  return <div className="nexusmods-bbcode">{renderNodes(document.children, 'bbcode')}</div>
})
