import { Play } from 'lucide-react'
import { isValidElement, memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  getNexusModsBbcodeTextContent,
  parseNexusModsBbcode,
  type NexusModsBbcodeElementNode,
  type NexusModsBbcodeNode,
} from '@shared/infra/game-formats/nexusmods-bbcode'

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

function sanitizeClassName(value: string | undefined) {
  const className = value?.trim()
  if (!className || className.length > 120 || !/^[\w\s-]+$/u.test(className)) {
    return null
  }

  return className
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .join(' ')
}

function classList(value: string | undefined): string[] {
  const className = sanitizeClassName(value)
  return className ? className.split(/\s+/u) : []
}

function hasClass(value: string | undefined, name: string) {
  return classList(value).includes(name)
}

function adaptColor(value: string, isDark: boolean): string {
  void isDark
  return value
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

function decodeUrlEntities(value: string): string {
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&#0*39;/giu, "'")
    .replace(/&#x0*27;/giu, "'")
}

function sanitizeUrl(value: string | undefined, allowDataUri = false) {
  const rawHref = value?.trim()
  if (!rawHref) {
    return null
  }

  if (allowDataUri && /^data:image\/[\w+.-]+;base64,/iu.test(rawHref)) {
    return rawHref
  }

  const href = decodeUrlEntities(rawHref)

  if (href.startsWith('#')) {
    return href
  }

  const lowerHref = href.toLowerCase()
  if (lowerHref === 'http:' || lowerHref === 'https:' || lowerHref === 'http://' || lowerHref === 'https://') {
    return href
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

function NexusModsBbcodeImage({ src, alt, width, height }: { src: string; alt: string; width?: string; height?: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return null
  }

  return (
    <img src={src} alt={alt} width={width} height={height} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  )
}

function renderEmbedButton(href: string, key: string) {
  const hostname = (() => {
    try {
      return new URL(href).hostname.replace(/^www\./u, '')
    } catch {
      return href
    }
  })()

  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-panel-hover)] hover:text-[var(--text-primary)]"
    >
      <Play className="h-3.5 w-3.5 fill-current" />
      <span>{hostname}</span>
    </a>
  )
}

function hasBlockOrItemDescendant(nodes: NexusModsBbcodeNode[]): boolean {
  return nodes.some(
    (node) =>
      node.type === 'element' &&
      (node.tag === 'item' ||
        node.tag === 'list' ||
        node.tag === 'quote' ||
        node.tag === 'spoiler' ||
        node.tag === 'code' ||
        node.tag === 'center' ||
        node.tag === 'left' ||
        node.tag === 'right' ||
        node.tag === 'justify' ||
        node.tag === 'div' ||
        node.tag === 'hr' ||
        hasBlockOrItemDescendant(node.children)),
  )
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
  options: { block?: boolean; preserveEmptySpacing?: boolean; className?: string } = {},
) {
  if (!hasSubstantiveRenderedContent(children)) {
    if (hasSpacingRenderedContent(children)) {
      return children
    }

    return options.preserveEmptySpacing ? renderSoftSpacer(key) : null
  }

  const blockClassName = options.className ? `nexusmods-bbcode-block ${options.className}` : 'nexusmods-bbcode-block'

  if (options.block || hasRenderedBlockContent(children)) {
    return (
      <div key={key} className={blockClassName} style={style}>
        {children}
      </div>
    )
  }

  return Object.keys(style).length > 0 || options.className ? (
    <span key={key} className={options.className} style={style}>
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

  const normalized = decoded.replace(/[\u00A0\uFEFF]/gu, ' ').replace(/[^\S\r\n]+/gu, ' ')
  const parts = normalized.split(/\r?\n/u)

  return parts.flatMap((part, index) => {
    const nodes: ReactNode[] = []
    const collapsed = part.replace(/[^\S\r\n]+/gu, ' ')
    const hasContent = collapsed.trim().length > 0
    const text = hasContent ? collapsed : ''

    if (text) {
      nodes.push(
        options.wrapHorizontalRule && isHorizontalRuleText(text) ? (
          <span key={`${keyPrefix}-text-${index}`} className="nexusmods-bbcode-line">
            {text}
          </span>
        ) : (
          text
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

    if (node.type === 'img' || node.type === 'hr' || node.type === 'a' || node.type === NexusModsBbcodeImage) {
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

function stripTrailingLineBreaks(nodes: NexusModsBbcodeNode[]): NexusModsBbcodeNode[] {
  let endIndex = nodes.length
  while (endIndex > 0) {
    const node = nodes[endIndex - 1]
    if (node?.type === 'element' && node.tag === 'br') {
      endIndex -= 1
    } else if (node?.type === 'text' && node.value.trim().length === 0) {
      endIndex -= 1
    } else {
      break
    }
  }

  const result = nodes.slice(0, endIndex)
  const lastNode = result[result.length - 1]
  if (lastNode?.type === 'text') {
    const trimmed = lastNode.value.replace(/[\r\n]+[\t ]*$/u, '')
    if (trimmed !== lastNode.value) {
      result[result.length - 1] = { ...lastNode, value: trimmed }
    }
  }
  return result
}

function stripTrailingLineBreaksDeep(nodes: NexusModsBbcodeNode[]): NexusModsBbcodeNode[] {
  const result = stripTrailingLineBreaks(nodes)
  const lastNode = result[result.length - 1]
  if (lastNode?.type === 'element' && canSplitNodeAcrossSourceLines(lastNode)) {
    const strippedChildren = stripTrailingLineBreaksDeep(lastNode.children)
    if (strippedChildren !== lastNode.children) {
      result[result.length - 1] = { ...lastNode, children: strippedChildren }
    }
  }
  return result
}

function useColorScheme() {
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'))
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

function renderSectionHeading(node: NexusModsBbcodeElementNode, key: string, isDark: boolean) {
  return (
    <span key={key} className="nexusmods-bbcode-section-heading">
      {renderNodes(stripTrailingLineBreaksDeep(node.children), key, false, isDark)}
    </span>
  )
}

function renderAlignmentLines(node: NexusModsBbcodeElementNode, key: string, allowSectionHeadings: boolean, isDark: boolean) {
  const lines = splitSourceLines(node.children)
  if (lines.length <= 1) {
    return renderNodes(node.children, key, allowSectionHeadings, isDark)
  }

  return lines.map((line, index) =>
    renderLine(
      `${key}-line-${index}`,
      renderNodes(line, `${key}-line-${index}`, allowSectionHeadings, isDark, { wrapHorizontalRule: false }),
    ),
  )
}

function renderElement(node: NexusModsBbcodeElementNode, key: string, allowSectionHeadings: boolean, isDark: boolean): ReactNode {
  const children = renderNodes(node.children, key, allowSectionHeadings, isDark)

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
      return renderSectionHeading(node, key, isDark)
    }

    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    return <em key={key}>{children}</em>
  }

  if (node.tag === 'u') {
    if (allowSectionHeadings && isFurnitureSectionHeading(node)) {
      return renderSectionHeading(node, key, isDark)
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
    const rawColor = sanitizeColor(node.attrs.color)
    const adaptedColor = rawColor == null ? null : adaptColor(rawColor, isDark)
    return renderStyledContainer(adaptedColor == null ? {} : { color: adaptedColor }, children, key, {
      block: node.attrs.block === 'true' || hasBlockChildren(node.children),
      preserveEmptySpacing: hasSourceLineBreak(node.children),
      className: adaptedColor == null ? undefined : 'nexusmods-bbcode-color',
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
    if (hasBlockOrItemDescendant(node.children)) {
      return (
        <span key={key}>
          [url={node.attrs.href}]{children}
        </span>
      )
    }

    const textHref = getNexusModsBbcodeTextContent(node.children)
    const fallbackHref = /^https?:\/\//iu.test(textHref.trim()) ? sanitizeUrl(textHref) : null
    const href = sanitizeUrl(node.attrs.href ?? textHref) ?? fallbackHref

    if (href == null) {
      if (!hasSubstantiveRenderedContent(children)) {
        return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
      }

      return <a key={key}>{children}</a>
    }

    if (!hasSubstantiveRenderedContent(children)) {
      return <a key={key} href={href} target="_blank" rel="noreferrer" />
    }

    return (
      <a key={key} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  }

  if (node.tag === 'img') {
    const src = sanitizeUrl(node.attrs.src ?? getNexusModsBbcodeTextContent(node.children), true)
    if (src == null) {
      return <span key={key}>{children}</span>
    }

    const width = /^(?:\d+|\d+px)$/i.test(node.attrs.width ?? '') ? node.attrs.width : undefined
    const height = /^(?:\d+|\d+px)$/i.test(node.attrs.height ?? '') ? node.attrs.height : undefined
    const alt = getNexusModsBbcodeTextContent(node.children)

    return (
      <div key={key} className="nexusmods-bbcode-img-wrapper">
        <NexusModsBbcodeImage src={src} alt={alt} width={width} height={height} />
      </div>
    )
  }

  if (node.tag === 'iframe') {
    const src = sanitizeUrl(node.attrs.src)
    if (src == null) {
      return null
    }

    return renderEmbedButton(src, key)
  }

  if (node.tag === 'youtube') {
    const videoId = getNexusModsBbcodeTextContent(node.children).trim()
    if (!videoId) {
      return null
    }

    const href = sanitizeUrl(`https://www.youtube.com/watch?v=${videoId}`)
    if (href == null) {
      return null
    }

    return renderEmbedButton(href, key)
  }

  if (node.tag === 'center' || node.tag === 'left' || node.tag === 'right' || node.tag === 'justify') {
    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    return (
      <div key={key} className={`nexusmods-bbcode-align-${node.tag}`}>
        {renderAlignmentLines(node, key, allowSectionHeadings, isDark)}
      </div>
    )
  }

  if (node.tag === 'div') {
    const className = node.attrs.class

    if (hasClass(className, 'bbc_spoiler_show')) {
      return null
    }

    if (hasClass(className, 'bbc_spoiler_content')) {
      return (
        <div key={key} className="nexusmods-bbcode-spoiler-content">
          {children}
        </div>
      )
    }

    if (hasClass(className, 'bbc_spoiler')) {
      const contentIndex = node.children.findIndex(
        (child) => child.type === 'element' && child.tag === 'div' && hasClass(child.attrs.class, 'bbc_spoiler_content'),
      )

      const spoilerChildren =
        contentIndex >= 0
          ? (node.children[contentIndex] as NexusModsBbcodeElementNode).children
          : node.children.filter(
              (child) => !(child.type === 'element' && child.tag === 'div' && hasClass(child.attrs.class, 'bbc_spoiler_show')),
            )

      const spoilerContent = renderNodes(spoilerChildren, `${key}-spoiler`, allowSectionHeadings, isDark)
      if (!hasSubstantiveRenderedContent(spoilerContent)) {
        return hasSourceLineBreak(spoilerChildren) || hasSpacingRenderedContent(spoilerContent) ? renderSoftSpacer(key) : null
      }

      return (
        <details key={key} className="nexusmods-bbcode-spoiler">
          <summary>{node.attrs.title || 'Spoiler'}</summary>
          <div>{spoilerContent}</div>
        </details>
      )
    }

    if (!hasSubstantiveRenderedContent(children)) {
      return hasSourceLineBreak(node.children) || hasSpacingRenderedContent(children) ? renderSoftSpacer(key) : null
    }

    if (hasClass(className, 'line')) {
      return <hr key={key} />
    }

    if (hasClass(className, 'img-wrapper')) {
      return (
        <div key={key} className="nexusmods-bbcode-img-wrapper">
          {children}
        </div>
      )
    }

    if (hasClass(className, 'youtube_container')) {
      return (
        <div key={key} className="nexusmods-bbcode-youtube-container">
          {children}
        </div>
      )
    }

    if (hasClass(className, 'container') || hasClass(className, 'mod_description_container') || hasClass(className, 'condensed')) {
      return <>{children}</>
    }

    const sanitizedClassName = sanitizeClassName(className)
    if (hasBlockChildren(node.children)) {
      return (
        <div key={key} className={sanitizedClassName ? `nexusmods-bbcode-div ${sanitizedClassName}` : 'nexusmods-bbcode-div'}>
          {children}
        </div>
      )
    }

    return (
      <span
        key={key}
        className={sanitizedClassName ? `nexusmods-bbcode-div ${sanitizedClassName}` : 'nexusmods-bbcode-div'}
        style={{ display: 'inline-block' }}
      >
        {children}
      </span>
    )
  }

  if (node.tag === 'list') {
    const listChildren = node.children.filter(
      (child) => !(child.type === 'element' && child.tag === 'br') && !(child.type === 'text' && child.value.trim().length === 0),
    )
    const listContent = renderNodes(listChildren, key, allowSectionHeadings, isDark)

    const ordered = node.attrs.list === '1' || node.attrs.list?.toLowerCase() === 'decimal'
    return ordered ? (
      <ol key={key} className="nexusmods-bbcode-list nexusmods-bbcode-list-ordered">
        {listContent}
      </ol>
    ) : (
      <ul key={key} className="nexusmods-bbcode-list nexusmods-bbcode-list-bulleted">
        {listContent}
      </ul>
    )
  }

  if (node.tag === 'item') {
    const itemChildren = stripTrailingLineBreaksDeep(node.children)
    return (
      <li key={key} className="nexusmods-bbcode-list-item">
        {renderNodes(itemChildren, key, allowSectionHeadings, isDark)}
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
    if (nodes.length === 0 || countTrailingLineBreaks(nodes) >= 2) {
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
  isDark: boolean,
  options: { wrapHorizontalRule?: boolean } = { wrapHorizontalRule: true },
): ReactNode[] {
  const renderedNodes: ReactNode[] = []

  nodes.forEach((node, index) => {
    const key = `${keyPrefix}-${index}`
    if (allowSectionHeadings && isSectionHeadingNode(node)) {
      removeDanglingHeadingPrefix(renderedNodes)
    }

    if (node.type === 'text') {
      const prevNode = nodes[index - 1]
      const nextNode = nodes[index + 1]
      const prevIsBr = prevNode?.type === 'element' && prevNode.tag === 'br'
      const nextIsBr = nextNode?.type === 'element' && nextNode.tag === 'br'
      const value = prevIsBr || nextIsBr ? node.value.replace(/\r?\n/gu, ' ') : node.value
      appendRenderedNodes(renderedNodes, renderText(value, key, options))
      return
    }

    if (isStandaloneLineBlockNode(node, nodes[index + 1])) {
      appendRenderedNode(
        renderedNodes,
        renderElement({ ...node, attrs: { ...node.attrs, block: 'true' } }, key, allowSectionHeadings, isDark),
      )
      return
    }

    appendRenderedNode(renderedNodes, renderElement(node, key, allowSectionHeadings, isDark))
  })

  return renderedNodes
}

export const NexusModsBbcode = memo(function NexusModsBbcode({ source }: NexusModsBbcodeProps) {
  const document = useMemo(() => parseNexusModsBbcode(source), [source])
  const isDark = useColorScheme()

  return <div className="nexusmods-bbcode">{renderNodes(document.children, 'bbcode', true, isDark)}</div>
})
