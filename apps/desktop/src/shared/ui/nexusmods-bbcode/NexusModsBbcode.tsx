import { memo, useMemo, type CSSProperties, type ReactNode } from 'react'
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

function renderInlineStyle(style: CSSProperties, children: ReactNode, key: string) {
  return Object.keys(style).length > 0 ? <span key={key} style={style}>{children}</span> : <span key={key}>{children}</span>
}

function renderText(value: string, keyPrefix: string, suppressLeadingIndentBreak = false): ReactNode[] {
  const parts = value.split(/(\uFEFF[\uFEFF\s]*)/u)
  let indentRun = 0
  const nodes: ReactNode[] = []

  parts.forEach((part, index) => {
    if (part.length === 0) {
      return
    }

    if (/^\uFEFF/u.test(part)) {
      const indentLevel = Math.min(part.match(/\uFEFF/gu)?.length ?? 1, 3)
      indentRun = indentLevel
      if (!suppressLeadingIndentBreak || nodes.some((node) => typeof node !== 'string' || node.trim().length > 0)) {
        nodes.push(<br key={`${keyPrefix}-indent-break-${index}`} />)
      }
      nodes.push(
        <span
          key={`${keyPrefix}-indent-${index}`}
          className={`nexusmods-bbcode-indent nexusmods-bbcode-indent-${indentRun}`}
          aria-hidden="true"
        />,
      )
      return
    }

    indentRun = 0
    nodes.push(part)
  })

  return nodes
}

function isFurnitureSectionHeading(node: NexusModsBbcodeElementNode) {
  return getNexusModsBbcodeTextContent(node.children).trim().startsWith('ꕥ')
}

function renderSectionHeading(node: NexusModsBbcodeElementNode, key: string) {
  return (
    <span key={key} className="nexusmods-bbcode-section-heading">
      {renderNodes(node.children, key, false)}
    </span>
  )
}

function renderElement(node: NexusModsBbcodeElementNode, key: string, allowSectionHeadings: boolean): ReactNode {
  const children = renderNodes(node.children, key, allowSectionHeadings)

  if (node.tag === 'b') {
    return <strong key={key}>{children}</strong>
  }

  if (node.tag === 'i') {
    if (allowSectionHeadings && isFurnitureSectionHeading(node)) {
      return renderSectionHeading(node, key)
    }

    return <em key={key}>{children}</em>
  }

  if (node.tag === 'u') {
    if (allowSectionHeadings && isFurnitureSectionHeading(node)) {
      return renderSectionHeading(node, key)
    }

    return <span key={key} className="nexusmods-bbcode-underline">{children}</span>
  }

  if (node.tag === 's') {
    return <del key={key}>{children}</del>
  }

  if (node.tag === 'color') {
    const color = sanitizeColor(node.attrs.color)
    return renderInlineStyle(color == null ? {} : { color }, children, key)
  }

  if (node.tag === 'size') {
    const fontSize = sanitizeSize(node.attrs.size)
    return renderInlineStyle(fontSize == null ? {} : { fontSize }, children, key)
  }

  if (node.tag === 'font') {
    const fontFamily = sanitizeFontFamily(node.attrs.font)
    return renderInlineStyle(fontFamily == null ? {} : { fontFamily }, children, key)
  }

  if (node.tag === 'url') {
    const href = sanitizeUrl(node.attrs.href ?? getNexusModsBbcodeTextContent(node.children))
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
    return src == null ? <span key={key}>{children}</span> : <img key={key} src={src} alt={getNexusModsBbcodeTextContent(node.children)} loading="lazy" />
  }

  if (node.tag === 'center' || node.tag === 'left' || node.tag === 'right' || node.tag === 'justify') {
    return <div key={key} className={`nexusmods-bbcode-align-${node.tag}`}>{children}</div>
  }

  if (node.tag === 'list') {
    const ordered = node.attrs.list === '1' || node.attrs.list?.toLowerCase() === 'decimal'
    return ordered
      ? <ol key={key} className="nexusmods-bbcode-list nexusmods-bbcode-list-ordered">{children}</ol>
      : <ul key={key} className="nexusmods-bbcode-list nexusmods-bbcode-list-bulleted">{children}</ul>
  }

  if (node.tag === 'item') {
    return <li key={key} className="nexusmods-bbcode-list-item">{children}</li>
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
    return <pre key={key}><code>{getNexusModsBbcodeTextContent(node.children)}</code></pre>
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
      nodes.splice(index, 1)
      continue
    }

    const cleaned = node.replace(/[ \t\u00A0\uFEFF]*-[ \t\u00A0\uFEFF]*$/u, '')
    if (cleaned !== node) {
      if (cleaned.length > 0) {
        nodes[index] = cleaned
      } else {
        nodes.splice(index, 1)
      }
    }

    return
  }
}

function renderNodes(nodes: NexusModsBbcodeNode[], keyPrefix: string, allowSectionHeadings = true): ReactNode[] {
  const renderedNodes: ReactNode[] = []
  let previousNodeWasSectionHeading = false

  nodes.forEach((node, index) => {
    const key = `${keyPrefix}-${index}`
    if (allowSectionHeadings && isSectionHeadingNode(node)) {
      removeDanglingHeadingPrefix(renderedNodes)
    }

    if (node.type === 'text') {
      renderedNodes.push(...renderText(node.value, key, previousNodeWasSectionHeading))
      previousNodeWasSectionHeading = false
      return
    }

    const sectionHeading = allowSectionHeadings && isSectionHeadingNode(node)
    renderedNodes.push(renderElement(node, key, allowSectionHeadings))
    previousNodeWasSectionHeading = sectionHeading
  })

  return renderedNodes
}

export const NexusModsBbcode = memo(function NexusModsBbcode({ source }: NexusModsBbcodeProps) {
  const document = useMemo(() => parseNexusModsBbcode(source), [source])

  return (
    <div className="nexusmods-bbcode">
      {renderNodes(document.children, 'bbcode')}
    </div>
  )
})
