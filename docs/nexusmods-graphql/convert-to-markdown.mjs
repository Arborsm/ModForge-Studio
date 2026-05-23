import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_URL = 'https://graphql.nexusmods.com/'

const CODE_BLOCK_PATTERN = /<pre>\s*<code(?:\s+class="([^"]*)")?>([\s\S]*?)<\/code>\s*<\/pre>/gi
const TABLE_PATTERN = /<table[\s\S]*?<\/table>/gi
const SECTION_PATTERN = /<section id="(query|mutation|definition)-([^"]+)"[^>]*>[\s\S]*?<\/section>/gi
const GENERATED_PATHS = [
  '00-introduction.md',
  'SUMMARY.md',
  'queries',
  'mutations',
  'types',
  'markdown',
  'index.html',
  'images',
  'javascripts',
  'stylesheets',
]

const HTML_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['#39', "'"],
  ['nbsp', ' '],
  ['#160', ' '],
  ['mdash', '-'],
  ['ndash', '-'],
  ['rsquo', "'"],
  ['lsquo', "'"],
  ['rdquo', '"'],
  ['ldquo', '"'],
])

/**
 * Converts the captured SpectaQL HTML snapshot into Markdown file descriptors.
 *
 * The converter intentionally targets the generated Nexus Mods SpectaQL shape:
 * one introduction block plus query, mutation, and definition sections.
 */
export function convertSnapshotToMarkdownFiles(html) {
  const title = textFromHtml(matchFirst(html, /<h1 class="doc-heading">([\s\S]*?)<\/h1>/i)) || 'Nexus Mods API v2 Reference'
  const sections = collectSections(html)
  const files = []

  const introductionHtml = extractIntroductionHtml(html)
  files.push({
    path: '00-introduction.md',
    content: normalizeMarkdown(`# ${title}\n\n${htmlToMarkdown(introductionHtml, 'root')}`),
  })

  for (const section of sections) {
    const group = section.kind === 'query' ? 'queries' : section.kind === 'mutation' ? 'mutations' : 'types'
    const heading = extractSectionHeading(section.html) || section.name
    const body = removeSectionChrome(section.html)
    files.push({
      path: `${group}/${safeFileName(heading)}.md`,
      content: normalizeMarkdown(`# ${heading}\n\n${htmlToMarkdown(body, group)}`),
    })
  }

  files.push({
    path: 'SUMMARY.md',
    content: buildSummary(title, sections),
  })

  return files
}

export function cleanFetchedHtml(html) {
  return html
    .replace(/\s*<!-- Cloudflare Pages Analytics -->[\s\S]*?<\/script><\/body>/i, '\n  </body>')
    .replace(
      /<p class="contact-email"><a href="\/cdn-cgi\/l\/email-protection#[^"]+"><span class="__cf_email__"[^>]*>\[email&#160;protected\]<\/span><\/a><\/p>/i,
      '<p class="contact-email"><a href="mailto:support+api@nexusmods.com">support+api@nexusmods.com</a></p>',
    )
}

export async function fetchSnapshotHtml(fetchImpl = fetch) {
  const response = await fetchImpl(SOURCE_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'ModForge Studio docs snapshot converter',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${response.status}`)
  }

  return cleanFetchedHtml(await response.text())
}

export function cleanGeneratedMarkdown(rootDir = ROOT_DIR, fsImpl = fs) {
  for (const relativePath of GENERATED_PATHS) {
    fsImpl.rmSync(path.join(rootDir, relativePath), { recursive: true, force: true })
  }
}

function collectSections(html) {
  return [...html.matchAll(SECTION_PATTERN)].map((match) => ({
    kind: match[1],
    name: decodeHtml(match[2]),
    html: match[0],
  }))
}

function extractIntroductionHtml(html) {
  const start = html.search(/<div id="introduction"[\s>]/i)
  if (start < 0) {
    return ''
  }

  const end = html.search(/<h1 id="group-Operations-Queries"/i)
  return html.slice(start, end > start ? end : undefined)
}

function extractSectionHeading(sectionHtml) {
  return (
    textFromHtml(matchFirst(sectionHtml, /<h2[^>]*>\s*<code>([\s\S]*?)<\/code>\s*<\/h2>/i)) ||
    textFromHtml(matchFirst(sectionHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/i))
  )
}

function removeSectionChrome(sectionHtml) {
  return sectionHtml
    .replace(/<div class="(?:operation|definition)-group-name">[\s\S]*?<\/div>/i, '')
    .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '')
    .replace(/^<section[^>]*>/i, '')
    .replace(/<\/section>$/i, '')
}

function htmlToMarkdown(html, sourceGroup) {
  const codeBlocks = []
  const tables = []

  let markdown = html.replace(CODE_BLOCK_PATTERN, (_match, className = '', codeHtml) => {
    const language = languageFromClass(className)
    const code = decodeHtml(stripTags(codeHtml)).trim()
    const token = `\n\n@@CODE_BLOCK_${codeBlocks.length}@@\n\n`
    codeBlocks.push(`\`\`\`${language}\n${code}\n\`\`\``)
    return token
  })

  markdown = markdown.replace(TABLE_PATTERN, (tableHtml) => {
    const token = `\n\n@@TABLE_${tables.length}@@\n\n`
    tables.push(tableToMarkdown(tableHtml, sourceGroup))
    return token
  })

  markdown = markdown
    .replace(/<blockquote[^>]*>/gi, '\n\n')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_match, text) => `\n\n## ${inlineMarkdown(text, sourceGroup)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_match, text) => `\n\n### ${inlineMarkdown(text, sourceGroup)}\n\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_match, text) => `\n\n#### ${inlineMarkdown(text, sourceGroup)}\n\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_match, text) => `\n\n## ${inlineMarkdown(text, sourceGroup)}\n\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, text) => `\n\n${inlineMarkdown(text, sourceGroup)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, text) => `\n- ${inlineMarkdown(text, sourceGroup)}`)
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  markdown = decodeHtml(markdown)

  for (let index = 0; index < codeBlocks.length; index += 1) {
    markdown = markdown.replace(`@@CODE_BLOCK_${index}@@`, codeBlocks[index])
  }

  for (let index = 0; index < tables.length; index += 1) {
    markdown = markdown.replace(`@@TABLE_${index}@@`, tables[index])
  }

  return markdown
}

function inlineMarkdown(html, sourceGroup) {
  return decodeHtml(
    html
      .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => {
        const text = inlineMarkdown(label, sourceGroup).replace(/^`([^`]+)`$/, '$1')
        return `[${text}](${linkTarget(href, sourceGroup)})`
      })
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, code) => `\`${decodeHtml(stripTags(code)).trim()}\``)
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function tableToMarkdown(tableHtml, sourceGroup) {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cellMatch) =>
        inlineMarkdown(cellMatch[1], sourceGroup).replace(/\|/g, '\\|'),
      ),
    )
    .filter((row) => row.length > 0)

  if (rows.length === 0) {
    return ''
  }

  const columnCount = Math.max(...rows.map((row) => row.length))
  const paddedRows = rows.map((row) => [...row, ...Array.from({ length: columnCount - row.length }, () => '')])
  const header = paddedRows[0]
  const separator = Array.from({ length: columnCount }, () => '---')
  const body = paddedRows.slice(1)

  return [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n')
}

function linkTarget(href, sourceGroup) {
  if (!href.startsWith('#')) {
    return href
  }

  const id = href.slice(1)
  const match = /^(query|mutation|definition)-(.+)$/.exec(id)
  if (!match) {
    return href
  }

  const group = match[1] === 'query' ? 'queries' : match[1] === 'mutation' ? 'mutations' : 'types'
  const target = `${group}/${safeFileName(decodeHtml(match[2]))}.md`
  return sourceGroup === 'root' ? target : `../${target}`
}

function buildSummary(title, sections) {
  const groups = [
    ['Queries', 'query', 'queries'],
    ['Mutations', 'mutation', 'mutations'],
    ['Types', 'definition', 'types'],
  ]

  const lines = [`# ${title} Markdown Summary`, '', '- [Introduction](00-introduction.md)']

  for (const [heading, kind, directory] of groups) {
    lines.push('', `## ${heading}`, '')
    for (const section of sections.filter((item) => item.kind === kind)) {
      const name = extractSectionHeading(section.html) || section.name
      lines.push(`- [${name}](${directory}/${safeFileName(name)}.md)`)
    }
  }

  return `${lines.join('\n')}\n`
}

function writeFiles(files, outputDir) {
  cleanGeneratedMarkdown(outputDir)

  for (const file of files) {
    const fullPath = path.join(outputDir, file.path)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, file.content, 'utf8')
  }
}

function safeFileName(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-')
}

function languageFromClass(className) {
  const match = /language-([a-z0-9_-]+)/i.exec(className)
  return match ? match[1].toLowerCase() : ''
}

function textFromHtml(html) {
  return inlineMarkdown(html ?? '', 'root').replace(/^`|`$/g, '')
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '')
}

function decodeHtml(value) {
  return value.replace(/&([a-zA-Z0-9#]+);/g, (match, entity) => {
    if (HTML_ENTITIES.has(entity)) {
      return HTML_ENTITIES.get(entity)
    }

    if (entity.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }

    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }

    return match
  })
}

function normalizeMarkdown(markdown) {
  return `${markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`
}

function matchFirst(value, pattern) {
  return pattern.exec(value)?.[1] ?? ''
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await fetchSnapshotHtml()
  const files = convertSnapshotToMarkdownFiles(html)
  writeFiles(files, ROOT_DIR)
  console.log(`Wrote ${files.length} Markdown files to ${path.relative(process.cwd(), ROOT_DIR)}`)
}
