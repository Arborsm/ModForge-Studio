import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { collectRequiredFiles } from '@test/sourceScan'

const TEST_SOURCE_EXCLUDE_DIRS = /(?:^|\/)src\/(tests|test)\//
const SCANNED_ROOTS = ['src/app', 'src/pages', 'src/widgets', 'src/features', 'src/entities'] as const
type Violation = { file: string; line: number; rule: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'; source: string }

function sourcePath(...segments: string[]) {
  return resolve(process.cwd(), ...segments)
}

function collectSourceFiles(rootPath: string) {
  return collectRequiredFiles(rootPath, {
    extensions: ['.ts', '.tsx'],
    excludePath: TEST_SOURCE_EXCLUDE_DIRS,
  })
}

/** Removes comments and string/template contents while preserving line/column positions. */
function maskSource(source: string) {
  let masked = ''
  let mode: 'code' | 'lineComment' | 'blockComment' | 'single' | 'double' | 'template' = 'code'
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? ''
    const next = source[index + 1] ?? ''

    if (mode === 'lineComment') {
      masked += character === '\n' ? '\n' : ' '
      if (character === '\n') mode = 'code'
      continue
    }
    if (mode === 'blockComment') {
      masked += character === '\n' ? '\n' : ' '
      if (character === '*' && next === '/') {
        masked += ' '
        index += 1
        mode = 'code'
      }
      continue
    }
    if (mode === 'single' || mode === 'double' || mode === 'template') {
      masked += character === '\n' ? '\n' : ' '
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (
        (mode === 'single' && character === "'") ||
        (mode === 'double' && character === '"') ||
        (mode === 'template' && character === '`')
      )
        mode = 'code'
      continue
    }

    if (character === '/' && next === '/') {
      masked += '  '
      index += 1
      mode = 'lineComment'
    } else if (character === '/' && next === '*') {
      masked += '  '
      index += 1
      mode = 'blockComment'
    } else if (character === "'") {
      masked += ' '
      mode = 'single'
    } else if (character === '"') {
      masked += ' '
      mode = 'double'
    } else if (character === '`') {
      masked += ' '
      mode = 'template'
    } else {
      masked += character
    }
  }
  return masked
}

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split('\n').length
}

const EXEMPT_PATTERN = /observability-exempt:\s*\S/

/** An exemption comment only covers the violation on the same line or the line directly below it. */

function matchingBrace(masked: string, openingIndex: number) {
  let depth = 0
  for (let index = openingIndex; index < masked.length; index += 1) {
    if (masked[index] === '{') depth += 1
    if (masked[index] === '}' && --depth === 0) return index
  }
  return -1
}

function scanFile(file: string, source: string): Violation[] {
  const masked = maskSource(source)
  const lines = source.split('\n')
  const violations: Violation[] = []
  const usedExemptLines = new Set<number>()
  const add = (rule: Violation['rule'], index: number) => {
    const line = lineNumber(source, index)
    const exemptLine = [line - 2, line - 1].find((offset) => Boolean(lines[offset] && EXEMPT_PATTERN.test(lines[offset])))
    if (exemptLine !== undefined) usedExemptLines.add(exemptLine + 1)
    else violations.push({ file, line, rule, source: lines[line - 1]?.trim() ?? '' })
  }

  for (const match of masked.matchAll(/\bconsole\.(log|info|debug|warn|error)\s*\(/g)) add('R1', match.index ?? 0)

  for (const match of masked.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
    const opening = (match.index ?? 0) + match[0].lastIndexOf('{')
    const closing = matchingBrace(masked, opening)
    if (closing < 0) continue
    const bodyRaw = masked.slice(opening + 1, closing)
    const body = bodyRaw.trim()
    if (!body) add('R2', match.index ?? 0)
    if (/\bpublish\w*\s*\(/.test(body) && !/\bappEvent\s*\(/.test(body)) {
      const publishOffset = bodyRaw.search(/\bpublish\w*\s*\(/)
      add('R3', opening + 1 + publishOffset)
    }
    if (/\breturn\s+(null|undefined|\[\]|\{\})/.test(body) && !/\bappEvent\s*\(/.test(body)) {
      const returnOffset = bodyRaw.search(/\breturn\s+(null|undefined|\[\]|\{\})/)
      add('R5', opening + 1 + returnOffset)
    }
  }

  for (const match of masked.matchAll(/\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(undefined|null|\[\]|\{\})\s*\)/g)) {
    add('R2', match.index ?? 0)
  }

  // Comment-only `.catch(() => {})` bodies are silent too; comments are masked to whitespace.
  for (const match of masked.matchAll(/\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*\}/g)) {
    add('R2', match.index ?? 0)
  }

  // R6: notifications must flow through the appEvent builder so log + notify stay
  // unified; raw publishNotification calls in business layers bypass that pipeline.
  // useNotificationPublisher / writeDebugLog are the removed ad-hoc channels and
  // must not reappear in business layers either.
  for (const match of masked.matchAll(/\b(publishNotification|useNotificationPublisher|writeDebugLog)\s*\(/g)) add('R6', match.index ?? 0)

  // R4: an exemption comment that suppresses no violation is stale noise and must be removed.
  lines.forEach((value, index) => {
    const line = index + 1
    if (EXEMPT_PATTERN.test(value) && !usedExemptLines.has(line)) {
      violations.push({ file, line, rule: 'R4', source: value.trim() })
    }
  })
  return violations
}

function formatViolations(violations: Violation[]) {
  return violations.length === 0 ? [] : violations.map(({ file, line, rule, source }) => `${file}:${line} ${rule} ${source}`).sort()
}

describe('observability adoption', () => {
  it('blocks business-layer observability bypasses and silent error handling', async () => {
    const files = (await Promise.all(SCANNED_ROOTS.map((root) => collectSourceFiles(sourcePath(root))))).flat()
    const violations = (
      await Promise.all(
        files.map(async (filePath) => {
          const source = await readFile(filePath, 'utf8')
          const file = relative(sourcePath(), filePath).replaceAll('\\', '/')
          return scanFile(file, source)
        }),
      )
    ).flat()

    expect(formatViolations(violations), `Observability violations:\n${formatViolations(violations).join('\n')}`).toEqual([])
  }, 30000)
})
